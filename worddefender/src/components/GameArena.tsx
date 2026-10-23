import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  LevelConfig,
  WordItem,
  FallingBrick,
  LandedBrick,
  BulletProjectile,
  Particle,
  DustCloud,
  MatchStats,
  CompletedWordPopup,
} from '../types/game';
import { soundManager } from '../utils/audio';
import { ThemeToggle } from './ThemeToggle';
import { ScoreCounter, ScoreGain } from './ScoreCounter';
import { calculateWordScore } from '../utils/scoring';
import { GAME_RULES } from '../config/gameRules';
import {
  computeLevelPace,
  comboLength,
  spawnColumnCount,
  getFailedAttempts,
  loadTypingProfile,
  recordLevelResult,
  recordTypingSamples,
} from '../utils/pace';
import { buildWordDeck } from '../utils/wordDeck';
import { HeartIcon } from './HeartIcon';
import { FullscreenButton } from './FullscreenButton';
import { posLabel } from '../utils/wordLabel';
import { loadGameData } from '../utils/storage';
import { VirtualKeyboard } from './VirtualKeyboard';
import {
  Flame,
  Volume2,
  VolumeX,
  Pause,
  Play,
  RotateCcw,
  Home,
  Keyboard as KeyboardIcon,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';

interface GameArenaProps {
  level: LevelConfig;
  deck?: WordItem[]; // bộ từ đã chọn sẵn (đã cho người chơi xem trước); không có thì tự bốc
  onFinishMatch: (stats: MatchStats) => void;
  onExit: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  showVirtualKeyboard: boolean;
  onToggleVirtualKeyboard: () => void;
}

const SPAWN_MIN_GAP_Y = 15; // % từ trên: gạch mới chỉ ra khi gạch trước đã rơi qua mức này (chừa chỗ cho nhãn nghĩa)
const GROUND_Y = 94; // % from top: mặt đất mỏng để gạch có quãng đường rơi dài, người chơi có thời gian gõ
const DANGER_LINE_Y = 72; // % from top ("vạch quy định")
const CANNON_POS = { x: 50, y: GROUND_Y + 1 }; // % coords
const CELL_PX = 22; // bề rộng một ô chữ khi thoải mái chỗ (chữ ≈ 17px, đủ to để đọc phần gợi ý)
const CELL_PX_MIN = 12; // co tới mức này cho từ dài trên màn hẹp, nhỏ hơn nữa thì không đọc nổi

/** Ô chữ co lại nếu từ dài hơn chỗ trống của sân, để gạch không tràn ra ngoài màn hình. */
const cellSizeFor = (len: number, fieldW: number) => {
  const usable = Math.max(120, fieldW - 2 * EDGE_MARGIN_PX - BRICK_PAD_PX * 2 - BRICK_BORDER_PX * 2);
  return Math.max(CELL_PX_MIN, Math.min(CELL_PX, Math.floor(usable / Math.max(1, len))));
};
const BRICK_PAD_PX = 4; // padding 2 đầu
const BRICK_BORDER_PX = 2;
const EDGE_MARGIN_PX = 4; // khoảng cách tối thiểu từ gạch (và nhãn nghĩa) tới mép sân

// Nhãn nghĩa tiếng Việt dưới gạch có thể rộng hơn gạch; ước lượng để giữ cả hai nằm trong sân
const labelWidthPx = (label: string) => Math.min(220, label.length * 6.5 + 20);

const brickLabel = (w: WordItem) => (posLabel(w) ? `${posLabel(w)} · ${w.meaning}` : w.meaning);

/** Giới hạn x (% từ trái) sao cho gạch và nhãn nghĩa nằm trọn trong sân rộng fieldW px. */
const clampBrickX = (x: number, widthPx: number, label: string, fieldW: number) => {
  const footprint = Math.max(widthPx, labelWidthPx(label));
  const marginPct = (((footprint - widthPx) / 2 + EDGE_MARGIN_PX) / fieldW) * 100;
  const widthPct = (widthPx / fieldW) * 100;
  const min = marginPct;
  const max = Math.max(min, 100 - widthPct - marginPct);
  return Math.min(Math.max(x, min), max);
};

/** Gạch đang ngắm: gần mặt đất nhất trong số chưa bị bỏ qua bằng Tab; bỏ qua hết thì tính lại từ đầu. */
const pickTargetIndex = (bricks: FallingBrick[], skipped: Set<string>) => {
  const lowest = (usable: (b: FallingBrick) => boolean) =>
    bricks.reduce((best, b, i) => (usable(b) && (best === -1 || b.y > bricks[best].y) ? i : best), -1);
  const idx = lowest((b) => !skipped.has(b.id));
  if (idx !== -1) return idx;
  skipped.clear();
  return lowest(() => true);
};

export const GameArena: React.FC<GameArenaProps> = ({
  level,
  deck,
  onFinishMatch,
  onExit,
  soundEnabled,
  onToggleSound,
  showVirtualKeyboard,
  onToggleVirtualKeyboard,
}) => {
  // Game states
  const [hearts, setHearts] = useState<number>(GAME_RULES.hearts.max);
  const heartsRef = useRef<number>(GAME_RULES.hearts.max);
  const [combo, setCombo] = useState(0);
  const comboRef = useRef(0);
  // Nhịp và bộ từ của ván tính một lần khi vào màn: hồ sơ gõ + số lần thất bại + 60/40 mới/ôn
  const paceRef = useRef(
    computeLevelPace(level, loadTypingProfile(showVirtualKeyboard ? 'touch' : 'keyboard'), getFailedAttempts(level.id))
  );
  const knownWordsRef = useRef(new Set<string>(loadGameData().learnedWords.map((w: { word: string }) => w.word.toLowerCase())));
  const deckRef = useRef<WordItem[]>(deck ? [...deck] : buildWordDeck(level.wordPool, level.targetCount, knownWordsRef.current));
  // Bộ từ không lặp nên có thể ngắn hơn targetCount khi pool thiếu từ; mục tiêu của màn bám theo bộ thật.
  const targetCountRef = useRef(deckRef.current.length);
  const targetCount = targetCountRef.current;
  const comboNeeded = comboLength(targetCount);
  const typingRef = useRef({ reaction: [] as number[], perChar: [] as number[] });
  const lastKeyAtRef = useRef<Record<string, number>>({}); // phím đúng gần nhất của từng gạch
  const [destroyedCount, setDestroyedCount] = useState(0);
  const [score, setScore] = useState(0);
  const [scoreGain, setScoreGain] = useState<ScoreGain | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [activeWordPopup, setActiveWordPopup] = useState<CompletedWordPopup | null>(null);

  // Statistics trackers
  const statsRef = useRef({
    totalSpawned: 0,
    totalDestroyed: 0,
    totalKeystrokes: 0,
    correctKeystrokes: 0,
    startTime: Date.now(),
    wordTimes: [] as number[],
    lastWordCompleteTime: Date.now(),
    learnedWords: [] as WordItem[],
    score: 0,
  });

  // Entities
  const [fallingBricks, setFallingBricks] = useState<FallingBrick[]>([]);
  const fallingRef = useRef<FallingBrick[]>([]);
  const skippedRef = useRef<Set<string>>(new Set());
  const [, setSwitchTick] = useState(0);
  fallingRef.current = fallingBricks;
  const [landedBricks, setLandedBricks] = useState<LandedBrick[]>([]);
  const [bullets, setBullets] = useState<BulletProjectile[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [dustClouds, setDustClouds] = useState<DustCloud[]>([]);
  const [muzzleFlash, setMuzzleFlash] = useState(false);

  // Animation frame & timer refs
  const animFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(Date.now());
  const lastSpawnTimeRef = useRef<number>(Date.now());
  const arenaRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const fieldSizeRef = useRef({ w: 800, h: 500 }); // px, dùng đổi px <-> % và tính góc súng
  const finishedRef = useRef(false);
  const pxToPct = (px: number) => (px / fieldSizeRef.current.w) * 100;
  const [fieldSize, setFieldSize] = useState({ w: 800, h: 500 });

  useEffect(() => {
    const el = fieldRef.current;
    if (!el) return;
    const update = () => {
      const size = { w: el.clientWidth || 800, h: el.clientHeight || 500 };
      fieldSizeRef.current = size;
      setFieldSize(size);
      // Gạch lưu x theo %; khi sân đổi kích thước (xoay màn hình, resize) kéo lại cho nằm trọn trong sân
      setFallingBricks((prev) =>
        prev.map((b) => ({ ...b, x: clampBrickX(b.x, b.widthPx, brickLabel(b.wordItem), size.w) }))
      );
      setLandedBricks((prev) =>
        prev.map((b) => ({ ...b, x: clampBrickX(b.x, b.widthPx, '', size.w) }))
      );
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Helpers to prepare a word with blanks
  const createBrick = useCallback(
    (wordItem: WordItem, existing: FallingBrick[] = []): FallingBrick | null => {
      const word = wordItem.word.toLowerCase();
      const len = word.length;

      // Chỉ che chữ cái: từ nối như "follow up" hay "stand-up" có dấu cách và gạch ngang mà
      // bàn phím của game không gõ được, nên những ký tự đó luôn hiện sẵn.
      const typableIndices = word.split('').flatMap((c, i) => (/[a-z]/i.test(c) ? [i] : []));
      const typableLen = typableIndices.length;

      const [ratioLo, ratioHi] = paceRef.current.blankRatio;
      let blanksNeeded = Math.round(typableLen * (ratioLo + Math.random() * (ratioHi - ratioLo)));
      if (blanksNeeded >= typableLen) blanksNeeded = typableLen - 1;
      if (blanksNeeded < 1) blanksNeeded = 1;

      // Pick distinct indices to blank out
      const shuffledIndices = [...typableIndices].sort(() => 0.5 - Math.random());
      const blankIndices = new Set(shuffledIndices.slice(0, blanksNeeded));

      const slots = word.split('').map((char, idx) => ({
        char,
        isBlank: blankIndices.has(idx),
        isFilled: !blankIndices.has(idx),
        userInput: undefined,
        hasError: false,
      }));

      // Find first blank slot
      const firstBlank = slots.findIndex((s) => s.isBlank);

      // Brick vừa khít từ: len * CELL + padding 2 đầu + viền
      const cellPx = cellSizeFor(len, fieldSizeRef.current.w);
      const widthPx = len * cellPx + BRICK_PAD_PX * 2 + BRICK_BORDER_PX * 2;
      const fieldW = fieldSizeRef.current.w;
      const minX = clampBrickX(0, widthPx, brickLabel(wordItem), fieldW);
      const maxX = clampBrickX(100, widthPx, brickLabel(wordItem), fieldW);
      // Gạch mới chỉ ra ở cột chưa có gạch nào (tính cả bề rộng nhãn nghĩa); hết cột trống thì hoãn.
      // Số cột theo bề rộng sân: màn dọc hẹp ít cột hơn để mỗi cột vẫn đủ chỗ một viên gạch.
      const footprintPx = Math.max(widthPx, labelWidthPx(brickLabel(wordItem)));
      const columns = spawnColumnCount(fieldW);
      const colW = fieldW / columns;
      const coverOf = (leftPct: number, wPx: number, fPx: number) => {
        const cx = (leftPct / 100) * fieldW + wPx / 2;
        return [Math.floor((cx - fPx / 2) / colW), Math.floor((cx + fPx / 2 - 1) / colW)];
      };
      // Cột chỉ bị coi là bận khi gạch trong đó còn nằm gần đỉnh sân; rơi quá một thân gạch
      // (kể cả chỗ cho nhãn nghĩa) là cột trống trở lại, nên một cột xếp được nhiều gạch.
      const taken = new Set<number>();
      existing
        .filter((b) => b.y < SPAWN_MIN_GAP_Y)
        .forEach((b) => {
          const [c0, c1] = coverOf(b.x, b.widthPx, Math.max(b.widthPx, labelWidthPx(brickLabel(b.wordItem))));
          for (let c = Math.max(0, c0); c <= Math.min(columns - 1, c1); c++) taken.add(c);
        });
      const lanes = Array.from({ length: columns }, (_, i) => i).sort(() => Math.random() - 0.5);
      let x = -1;
      for (const lane of lanes) {
        const centerPx = (lane + 0.5) * colW;
        const cand = Math.min(maxX, Math.max(minX, ((centerPx - widthPx / 2) / fieldW) * 100));
        const [c0, c1] = coverOf(cand, widthPx, footprintPx);
        let free = true;
        for (let c = Math.max(0, c0); c <= Math.min(columns - 1, c1); c++) if (taken.has(c)) free = false;
        if (free) {
          x = cand;
          break;
        }
      }
      if (x < 0) return null;
      const height = 7;
      const speed = ((GROUND_Y - height + 10) / paceRef.current.fallDurationSec); // cùng tốc độ: gạch sau không đuổi kịp gạch trước nên không chồng lên nhau

      return {
        id: `brick_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        wordItem,
        x,
        y: -10, // starts above top
        widthPx,
        cellPx,
        height, // % height
        speed,
        slots,
        currentBlankIndex: firstBlank,
        status: 'falling',
        isNearGround: false,
        age: 0,
        fallDuration: paceRef.current.stdFallDurationSec, // thời gian rơi chuẩn (chưa nhân hỗ trợ) để điểm tốc độ so sánh được
        mistakes: 0,
      };
    },
    [level]
  );

  // Hearts/combo qua ref để dùng được trong vòng lặp game
  const addHearts = (delta: number) => {
    const next = Math.min(GAME_RULES.hearts.max, Math.max(0, heartsRef.current + delta));
    heartsRef.current = next;
    setHearts(next);
    return next;
  };

  // Identify active target brick: brick closest to player/ground
  const getActiveTargetBrick = (bricks: FallingBrick[]): FallingBrick | null =>
    bricks[pickTargetIndex(bricks, skippedRef.current)] ?? null;

  // Tab: bỏ gạch đang ngắm, chuyển sang gạch gần mặt đất kế tiếp; hết gạch để chuyển thì quay vòng lại
  const handleSwitchTarget = useCallback(() => {
    if (isPaused) return;
    const bricks = fallingRef.current;
    const cur = bricks[pickTargetIndex(bricks, skippedRef.current)];
    if (!cur) return;
    skippedRef.current.add(cur.id);
    setSwitchTick((n) => n + 1);
  }, [isPaused]);

  const activeTarget = getActiveTargetBrick(fallingBricks);

  // Cannon angle calculation pointing to active target brick
  const getCannonAngle = () => {
    if (!activeTarget) return 0;
    const targetCenterX = activeTarget.x + pxToPct(activeTarget.widthPx) / 2;
    const targetCenterY = activeTarget.y + activeTarget.height / 2;

    // Đổi % sang px để góc đúng với tỉ lệ thật của sân chơi
    const dx = ((targetCenterX - CANNON_POS.x) / 100) * fieldSize.w;
    const dy = ((targetCenterY - CANNON_POS.y) / 100) * fieldSize.h; // âm vì viên gạch ở phía trên

    // 0 deg = thẳng đứng lên trên
    const deg = Math.atan2(dx, -dy) * (180 / Math.PI);
    return Math.max(-80, Math.min(80, deg));
  };

  const cannonAngle = getCannonAngle();

  // Create explosion particles when a brick shatters
  const spawnExplosion = (x: number, y: number, color: string = '#38bdf8') => {
    const newParticles: Particle[] = [];
    const colors = [color, '#ffffff', '#fbbf24', '#34d399', '#f472b6'];

    for (let i = 0; i < 28; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 25 + 10;
      newParticles.push({
        id: `p_${Date.now()}_${i}`,
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 6 + 3,
        alpha: 1,
        life: 0.8 + Math.random() * 0.4,
      });
    }

    setParticles((prev) => [...prev, ...newParticles]);
  };

  // Create dust cloud when brick impacts ground
  const spawnDustCloud = (x: number, y: number) => {
    const cloud: DustCloud = {
      id: `dust_${Date.now()}_${Math.random()}`,
      x,
      y,
      radius: 12,
      alpha: 0.9,
    };
    setDustClouds((prev) => [...prev, cloud]);
  };

  // Complete game match handler (win or lose)
  const finishGame = useCallback(
    (isVictory: boolean, currentHearts: number) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      recordTypingSamples(typingRef.current.reaction, typingRef.current.perChar);
      recordLevelResult(level.id, isVictory);
      const durationSeconds = Math.max(1, (Date.now() - statsRef.current.startTime) / 1000);
      const totalChars = statsRef.current.correctKeystrokes;
      const cpm = Math.round((totalChars / durationSeconds) * 60);
      const wpm = Math.round(cpm / 5);
      const accuracy =
        statsRef.current.totalKeystrokes > 0
          ? Math.round((statsRef.current.correctKeystrokes / statsRef.current.totalKeystrokes) * 100)
          : 0;

      const avgTime =
        statsRef.current.wordTimes.length > 0
          ? statsRef.current.wordTimes.reduce((a, b) => a + b, 0) / statsRef.current.wordTimes.length
          : durationSeconds / Math.max(1, statsRef.current.totalDestroyed);

      const matchStats: MatchStats = {
        levelNumber: level.levelNumber,
        stageNumber: level.stageId,
        isVictory,
        totalSpawned: statsRef.current.totalSpawned,
        totalDestroyed: statsRef.current.totalDestroyed,
        targetCount,
        totalKeystrokes: statsRef.current.totalKeystrokes,
        correctKeystrokes: statsRef.current.correctKeystrokes,
        accuracy,
        durationSeconds: Math.round(durationSeconds),
        averageTimePerWord: Number(avgTime.toFixed(1)),
        wpm,
        cpm,
        heartsRemaining: currentHearts,
        score: statsRef.current.score,
        learnedWords: statsRef.current.learnedWords,
        newWordIds: statsRef.current.learnedWords
          .filter((w) => !knownWordsRef.current.has(w.word.toLowerCase()))
          .map((w) => w.id),
      };

      onFinishMatch(matchStats);
    },
    [level, onFinishMatch]
  );

  // Key press processor (both physical & virtual keyboards)
  const handleInputChar = useCallback(
    (charInput: string) => {
      if (isPaused) return;
      const char = charInput.toLowerCase();
      if (!/^[a-z]$/.test(char)) return;

      statsRef.current.totalKeystrokes += 1;

      // Find current target brick
      setFallingBricks((prevBricks) => {
        if (prevBricks.length === 0) return prevBricks;

        // Sort descending by Y to find the lowest/nearest
        const targetIndex = pickTargetIndex(prevBricks, skippedRef.current);

        const target = prevBricks[targetIndex];
        if (!target) return prevBricks;

        const blankIdx = target.currentBlankIndex;
        if (blankIdx === -1 || blankIdx >= target.slots.length) return prevBricks;

        const currentSlot = target.slots[blankIdx];
        const expectedChar = currentSlot.char.toLowerCase();

        // Target center for cannon projectile
        const targetCenterX = target.x + pxToPct(target.widthPx) / 2;
        const targetCenterY = target.y + target.height / 2;

        if (char === expectedChar) {
          // CORRECT INPUT
          statsRef.current.correctKeystrokes += 1;
          {
            // Mẫu cho hồ sơ gõ: phản xạ (tới phím đầu của gạch) và khoảng cách giữa hai phím đúng
            const keyAt = Date.now();
            const prevKeyAt = lastKeyAtRef.current[target.id];
            if (prevKeyAt === undefined) {
              const becameTargetAt = Math.max(statsRef.current.lastWordCompleteTime, keyAt - target.age * 1000);
              typingRef.current.reaction.push(keyAt - becameTargetAt);
            } else {
              typingRef.current.perChar.push(keyAt - prevKeyAt);
            }
            lastKeyAtRef.current[target.id] = keyAt;
          }
          soundManager.playLetterSuccess();
          soundManager.playShot();

          // Cannon muzzle flash
          setMuzzleFlash(true);
          setTimeout(() => setMuzzleFlash(false), 120);

          // Spawn laser bullet projectile
          const bulletId = `bullet_${Date.now()}`;
          setBullets((prev) => [
            ...prev,
            {
              id: bulletId,
              startX: CANNON_POS.x,
              startY: CANNON_POS.y,
              targetX: targetCenterX,
              targetY: targetCenterY,
              currentX: CANNON_POS.x,
              currentY: CANNON_POS.y,
              char: char.toUpperCase(),
              progress: 0,
            },
          ]);

          // Update the slot as filled
          const updatedSlots = [...target.slots];
          updatedSlots[blankIdx] = {
            ...currentSlot,
            isFilled: true,
            userInput: char,
            hasError: false,
          };

          // Find next blank slot in this brick
          const nextBlankIdx = updatedSlots.findIndex(
            (s, idx) => idx > blankIdx && s.isBlank && !s.isFilled
          );

          const isFullySolved = nextBlankIdx === -1;

          if (isFullySolved) {
            // BRICK DESTROYED!
            soundManager.playExplode();
            spawnExplosion(targetCenterX, targetCenterY, '#10b981');

            // Record word completion time & learned word
            const now = Date.now();
            const timeForThisWord = (now - statsRef.current.lastWordCompleteTime) / 1000;
            statsRef.current.wordTimes.push(timeForThisWord);
            statsRef.current.lastWordCompleteTime = now;
            statsRef.current.totalDestroyed += 1;
            statsRef.current.learnedWords.push(target.wordItem);

            // Điểm: độ dài + số chữ khuyết quyết định điểm trần; vỡ càng sớm và càng ít sai thì nhân càng cao
            const breakdown = calculateWordScore({
              wordLength: target.slots.length,
              blanks: target.slots.filter((sl) => sl.isBlank).length,
              elapsedSec: target.age,
              expectedFallSec: target.fallDuration,
              mistakes: target.mistakes,
              difficulty: level.difficulty,
            });
            statsRef.current.score += breakdown.total;
            setScore(statsRef.current.score);
            setScoreGain({ id: now, amount: breakdown.total });

            // Pronounce word & show popup banner ("khi viên gạch vỡ sẽ hiển thị lại từ đó + nghĩa phía dưới + âm phát ra...")
            soundManager.speak(target.wordItem.word, target.wordItem.audioUrl);
            setActiveWordPopup({
              wordItem: target.wordItem,
              x: targetCenterX,
              y: Math.max(15, targetCenterY - 6),
              timestamp: now,
            });

            delete lastKeyAtRef.current[target.id];

            // Combo: đủ số từ liên tiếp không để gạch chạm đất thì thưởng tim ngẫu nhiên; tim đầy thì giữ combo cho lần sau
            comboRef.current += 1;
            if (comboRef.current >= comboNeeded && heartsRef.current < GAME_RULES.hearts.max) {
              const rewards = GAME_RULES.hearts.comboReward;
              addHearts(rewards[Math.floor(Math.random() * rewards.length)]);
              comboRef.current = 0;
            }
            setCombo(comboRef.current);

            const nextDestroyedCount = destroyedCount + 1;
            setDestroyedCount(nextDestroyedCount);

            // Check if level target reached!
            if (nextDestroyedCount >= targetCount) {
              setTimeout(() => {
                finishGame(true, heartsRef.current);
              }, 600);
            }

            // Remove destroyed brick
            return prevBricks.filter((_, idx) => idx !== targetIndex);
          } else {
            // Still has remaining blanks to fill
            const updatedBrick: FallingBrick = {
              ...target,
              slots: updatedSlots,
              currentBlankIndex: nextBlankIdx,
              status: 'targeted',
            };
            const copy = [...prevBricks];
            copy[targetIndex] = updatedBrick;
            return copy;
          }
        } else {
          // WRONG INPUT - Shake and show blinking red 'x'
          soundManager.playWrong();
          const updatedSlots = [...target.slots];
          updatedSlots[blankIdx] = {
            ...currentSlot,
            hasError: true,
          };

          // Reset error animation after short pulse
          setTimeout(() => {
            setFallingBricks((curr) =>
              curr.map((b) => {
                if (b.id === target.id) {
                  const resetSlots = b.slots.map((s, idx) =>
                    idx === blankIdx ? { ...s, hasError: false } : s
                  );
                  return { ...b, slots: resetSlots };
                }
                return b;
              })
            );
          }, 350);

          const copy = [...prevBricks];
          copy[targetIndex] = {
            ...target,
            slots: updatedSlots,
            shakeTime: Date.now(),
            mistakes: target.mistakes + 1,
          };
          return copy;
        }
      });
    },
    [destroyedCount, isPaused, level, finishGame, comboNeeded]
  );

  // Physical keyboard listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        handleSwitchTarget();
      } else if (e.key === 'Escape') {
        setIsPaused((prev) => !prev);
      } else if (/^[a-zA-Z]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        handleInputChar(e.key);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleInputChar, handleSwitchTarget]);

  // Auto-fade word completion popup
  useEffect(() => {
    if (!activeWordPopup) return;
    const timer = setTimeout(() => {
      setActiveWordPopup(null);
    }, 1800);
    return () => clearTimeout(timer);
  }, [activeWordPopup]);

  // Main game physics loop
  useEffect(() => {
    lastTimeRef.current = Date.now();
    lastSpawnTimeRef.current = Date.now();

    const loop = () => {
      const now = Date.now();
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.1); // delta in seconds
      lastTimeRef.current = now;

      if (!isPaused && !finishedRef.current) {
        // 1. Giữ sân luôn đủ số gạch của màn: phá xong hoặc để rơi một viên là bù ngay viên mới.
        // Không còn nhịp "cứ N giây một gạch" — độ khó nằm ở số gạch cùng lúc (đọc qua ref vì
        // vòng lặp không chạy lại theo state).
        const live = fallingRef.current;
        if (
          live.length < paceRef.current.maxConcurrent &&
          deckRef.current.length > 0 &&
          now - lastSpawnTimeRef.current > GAME_RULES.pace.refillMinGapMs
        ) {
          const newBrick = createBrick(deckRef.current[0], live);
          if (newBrick) {
            deckRef.current.shift();
            lastSpawnTimeRef.current = now;
            statsRef.current.totalSpawned += 1;
            fallingRef.current = [...live, newBrick];
            setFallingBricks((prev) => [...prev, newBrick]);
          }
        }

        // 2. Update bullets progress
        setBullets((prevBullets) => {
          return prevBullets
            .map((b) => {
              const nextProgress = b.progress + dt * 5; // travels quickly
              return {
                ...b,
                progress: nextProgress,
                currentX: b.startX + (b.targetX - b.startX) * Math.min(1, nextProgress),
                currentY: b.startY + (b.targetY - b.startY) * Math.min(1, nextProgress),
              };
            })
            .filter((b) => b.progress < 1);
        });

        // 3. Update particles
        setParticles((prevParticles) => {
          return prevParticles
            .map((p) => ({
              ...p,
              x: p.x + p.vx * dt,
              y: p.y + p.vy * dt,
              vy: p.vy + 20 * dt, // gravity
              alpha: Math.max(0, p.alpha - dt / p.life),
            }))
            .filter((p) => p.alpha > 0);
        });

        // 4. Update dust clouds
        setDustClouds((prevDust) => {
          return prevDust
            .map((d) => ({
              ...d,
              radius: d.radius + dt * 25,
              alpha: Math.max(0, d.alpha - dt * 1.5),
            }))
            .filter((d) => d.alpha > 0);
        });

        // 5. Update falling bricks positions and ground / stack collisions
        setFallingBricks((prevBricks) => {
          const survivingBricks: FallingBrick[] = [];

          prevBricks.forEach((brick) => {
            const nextY = brick.y + brick.speed * dt;

            // Find collision floor: ground line or top of any landed brick beneath it
            let collisionFloorY = GROUND_Y;

            landedBricks.forEach((lb) => {
              // Check horizontal overlap
              const overlapsX =
                brick.x + pxToPct(brick.widthPx) > lb.x && brick.x < lb.x + pxToPct(lb.widthPx);
              if (overlapsX && lb.y < collisionFloorY) {
                collisionFloorY = Math.min(collisionFloorY, lb.y);
              }
            });

            // Near ground warning check (approaching within 12% of collision floor)
            const isNear = collisionFloorY - (nextY + brick.height) < 12;

            if (nextY + brick.height >= collisionFloorY) {
              // BRICK HIT GROUND OR STACK!
              soundManager.playThud();
              spawnDustCloud(brick.x + pxToPct(brick.widthPx) / 2, collisionFloorY);

              // Player loses 1 heart
              const nextHearts = addHearts(-GAME_RULES.hearts.lossPerMiss);
              if (nextHearts <= 0) finishGame(false, 0);

              // Từ chưa phá được quay lại hàng đợi để màn vẫn đủ số từ cần phá; combo về 0
              deckRef.current.push(brick.wordItem);
              delete lastKeyAtRef.current[brick.id];
              comboRef.current = 0;
              setCombo(0);

              // Becomes a solid red rock brick stacked at collision point
              const landedHeight = brick.height;
              const landedY = collisionFloorY - landedHeight;

              setLandedBricks((prevLanded) => {
                const updatedLanded = [
                  ...prevLanded,
                  {
                    id: `landed_${Date.now()}_${Math.random()}`,
                    x: brick.x,
                    y: landedY,
                    widthPx: brick.widthPx,
                    height: landedHeight,
                    color: '#e11d48', // rose/red
                  },
                ];

                // Check Danger Line breach! ("Nếu gạch vượt quá vạch quy định thì đều thua")
                if (landedY <= DANGER_LINE_Y) {
                  finishGame(false, heartsRef.current);
                }

                return updatedLanded;
              });

              // Brick does not continue falling
            } else {
              survivingBricks.push({
                ...brick,
                y: nextY,
                age: brick.age + dt,
                isNearGround: isNear,
              });
            }
          });

          return survivingBricks;
        });
      }

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [
    isPaused,
    level,
    destroyedCount,
    createBrick,
    landedBricks,
    finishGame,
  ]);

  // Initial spawn on level start
  useEffect(() => {
    const initialBrick = createBrick(deckRef.current.shift()!)!;
    initialBrick.y = 5; // start immediately visible
    setFallingBricks([initialBrick]);
    statsRef.current.totalSpawned = 1;
    statsRef.current.startTime = Date.now();
    statsRef.current.lastWordCompleteTime = Date.now();
  }, [level, createBrick]);

  const controlButtonClass =
    'p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white border border-slate-700 transition-colors cursor-pointer';
  const fullscreenButton = <FullscreenButton className={controlButtonClass} />;
  const soundButton = (
    <button
      onClick={onToggleSound}
      title={soundEnabled ? 'Tắt âm thanh' : 'Bật âm thanh'}
      className={controlButtonClass}
    >
      {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
    </button>
  );

  return (
    <div
      ref={arenaRef}
      className="fixed inset-0 w-full bg-slate-950 overflow-hidden flex flex-col justify-between select-none touch-none"
    >
      {/* Background Starfield & Neon Grid */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0284c70a_1px,transparent_1px),linear-gradient(to_bottom,#0284c70a_1px,transparent_1px)] bg-[size:3rem_3rem] pointer-events-none" />

      {/* TOP HUD BAR - matching user sketch: "Màn 1 - mục tiêu 0/50, 3 trái tim" */}
      <div className="relative z-30 w-full px-2 py-2 sm:px-6 sm:py-3 gap-2 bg-slate-950/85 backdrop-blur-md border-b border-slate-800 flex items-center justify-between">
        {/* Left: Level & Progress */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            onClick={onExit}
            title="Thoát về màn hình chọn bài"
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors shrink-0"
          >
            <Home className="w-4 h-4" />
          </button>

          <div className="whitespace-nowrap">
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm font-black text-cyan-400 font-display">
                Màn {level.levelNumber}
              </span>
              <span className="text-xs text-slate-400 font-medium hidden sm:inline">
                - {level.title.split(':')[1] || level.title}
              </span>
            </div>
            <div className="text-xs sm:text-sm font-extrabold text-white font-mono flex items-center gap-1.5">
              <span className="hidden sm:inline">Mục tiêu:</span>
              <span className="text-cyan-300">
                {destroyedCount} / {targetCount}
              </span>
            </div>
          </div>

          <ScoreCounter score={score} gain={scoreGain} />
        </div>

        {/* Center: tim (tối đa 3, mất/được 1/2 tim) và combo */}
        <div className="flex flex-col sm:flex-row items-center gap-0.5 sm:gap-1.5 bg-slate-900/90 px-2 py-0.5 sm:px-3 sm:py-1.5 rounded-xl sm:rounded-full border border-slate-800 shadow-inner shrink-0">
          <div className="flex items-center gap-0.5 sm:gap-1.5">
          {Array.from({ length: GAME_RULES.hearts.max }, (_, i) => i + 1).map((h) => {
            const fill = Math.max(0, Math.min(1, hearts - (h - 1))); // 0, 0.5 hoặc 1
            return <HeartIcon key={h} fill={fill} className="w-3.5 h-3.5 sm:w-6 sm:h-6 drop-shadow-[0_0_4px_rgba(244,63,94,0.5)]" />;
          })}
          </div>
          <span
            className="sm:ml-1 sm:pl-1.5 sm:border-l border-slate-700 flex items-center gap-0.5 text-[10px] sm:text-xs font-bold text-amber-300 tabular-nums"
            title="Combo: phá liên tiếp đủ số từ mà không để gạch chạm đất sẽ được thưởng tim"
          >
            <Flame className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            <span className="hidden sm:inline">Combo</span> {combo}/{comboNeeded}
          </span>
        </div>

        {/* Right: Quick Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Virtual keyboard toggle */}
          <button
            onClick={onToggleVirtualKeyboard}
            title={showVirtualKeyboard ? 'Tắt bàn phím ảo' : 'Bật bàn phím ảo'}
            className={`p-2 rounded-xl border transition-all ${
              showVirtualKeyboard
                ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-md shadow-amber-400/20'
                : 'bg-slate-800 text-slate-400 hover:text-white border-slate-700'
            }`}
          >
            <KeyboardIcon className="w-4 h-4" />
          </button>

          {/* Trên điện thoại ba nút này nằm trong menu tạm dừng cho đỡ chật header */}
          <div className="hidden sm:flex items-center gap-2">
            <ThemeToggle />
            {fullscreenButton}
            {soundButton}
          </div>

          {/* Pause button */}
          <button
            onClick={() => setIsPaused(!isPaused)}
            title={isPaused ? 'Tiếp tục' : 'Tạm dừng'}
            className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white border border-slate-700 transition-colors"
          >
            {isPaused ? <Play className="w-4 h-4 text-emerald-400" /> : <Pause className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* MAIN GAME FIELD */}
      <div ref={fieldRef} className="relative flex-1 w-full overflow-hidden">
        {/* DANGER LINE ("Vạch quy định" in sketch) */}
        <div
          className="absolute left-0 right-0 z-10 pointer-events-none flex items-center justify-between px-4"
          style={{ top: `${DANGER_LINE_Y}%` }}
        >
          <div className="w-full border-t-2 border-dashed border-rose-500/70 shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
          <div className="absolute right-4 -top-3.5 px-2 py-0.5 rounded bg-rose-950/90 border border-rose-500/60 text-rose-400 text-[10px] font-bold flex items-center gap-1 uppercase tracking-wider">
            <AlertTriangle className="w-3 h-3" />
            Vạch nguy hiểm
          </div>
        </div>

        {/* AIMING TRAJECTORY LINE TO TARGET BRICK ("Đường đạn") */}
        {activeTarget && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
            <line
              x1={`${CANNON_POS.x}%`}
              y1={`${CANNON_POS.y}%`}
              x2={`${activeTarget.x + pxToPct(activeTarget.widthPx) / 2}%`}
              y2={`${activeTarget.y + activeTarget.height / 2}%`}
              stroke="rgba(234, 179, 8, 0.35)"
              strokeWidth="2"
              strokeDasharray="4 4"
            />
          </svg>
        )}

        {/* BULLET PROJECTILES */}
        {bullets.map((b) => (
          <div
            key={b.id}
            className="absolute z-25 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{
              left: `${b.currentX}%`,
              top: `${b.currentY}%`,
            }}
          >
            <div className="w-5 h-5 rounded-full bg-cyan-300 text-slate-950 font-black text-[11px] flex items-center justify-center shadow-[0_0_12px_#38bdf8] border border-white animate-pulse">
              {b.char}
            </div>
          </div>
        ))}

        {/* EXPLOSION PARTICLES */}
        {particles.map((p) => (
          <div
            key={p.id}
            className="absolute pointer-events-none rounded-full z-25"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              backgroundColor: p.color,
              opacity: p.alpha,
              boxShadow: `0 0 6px ${p.color}`,
              transform: 'translate(-50%, -50%)',
            }}
          />
        ))}

        {/* DUST CLOUDS ON GROUND IMPACT ("bụi tung mù mịt") */}
        {dustClouds.map((d) => (
          <div
            key={d.id}
            className="absolute pointer-events-none rounded-full bg-slate-400/40 blur-md z-15"
            style={{
              left: `${d.x}%`,
              top: `${d.y}%`,
              width: `${d.radius * 2}px`,
              height: `${d.radius * 1.2}px`,
              opacity: d.alpha,
              transform: 'translate(-50%, -50%)',
            }}
          />
        ))}

        {/* FALLING BRICKS ("các viên gạch chứa từ khuyết thiếu") */}
        {fallingBricks.map((brick) => {
          const isTarget = activeTarget?.id === brick.id;
          const isWarning = brick.isNearGround;

          return (
            <div
              key={brick.id}
              className={`absolute z-20 rounded-lg flex items-center justify-center transition-transform backdrop-blur-sm shadow-xl ${
                brick.shakeTime && Date.now() - brick.shakeTime < 300 ? 'animate-shake' : ''
              } ${
                isTarget
                  ? 'border-2 border-amber-400 bg-amber-950/80 shadow-[0_0_20px_rgba(251,191,36,0.6)] ring-2 ring-amber-300/40'
                  : isWarning
                  ? 'border-2 border-rose-500 bg-rose-950/80 shadow-[0_0_15px_rgba(244,63,94,0.7)] animate-pulse'
                  : 'border-2 border-cyan-400 bg-cyan-950/70 shadow-[0_0_12px_rgba(6,182,212,0.4)]'
              }`}
              style={{
                left: `${brick.x}%`,
                top: `${brick.y}%`,
                width: `${brick.widthPx}px`,
                minHeight: '40px',
                padding: `0 ${BRICK_PAD_PX}px`,
              }}
            >
              {/* Gợi ý nghĩa tiếng Việt: cùng một mẫu chữ (vd "_ _ t") có thể khớp nhiều từ, nghĩa giúp xác định đúng từ */}
              <div
                className={`absolute left-1/2 -translate-x-1/2 top-full mt-1 px-2 py-0.5 rounded-full whitespace-nowrap text-[11px] font-bold pointer-events-none border ${
                  isTarget
                    ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-md'
                    : 'bg-slate-900/80 text-slate-200 border-slate-700'
                }`}
              >
                {brickLabel(brick.wordItem)}
              </div>

              {/* Letters display */}
              <div className="flex items-center justify-center">
                {brick.slots.map((slot, sIdx) => {
                  const isCurrentBlank = isTarget && brick.currentBlankIndex === sIdx;

                  if (!slot.isBlank) {
                    // Given anchor letter
                    return (
                      <span
                        key={sIdx}
                        style={{ width: brick.cellPx, fontSize: brick.cellPx * 0.8 }}
                        className="font-mono font-bold text-center text-slate-100"
                      >
                        {slot.char}
                      </span>
                    );
                  }

                  if (slot.isFilled) {
                    // User correctly filled letter
                    return (
                      <span
                        key={sIdx}
                        style={{ width: brick.cellPx, fontSize: brick.cellPx * 0.8 }}
                        className="font-mono font-extrabold text-center text-emerald-300 border-b-2 border-emerald-400 animate-fadeIn"
                      >
                        {slot.userInput}
                      </span>
                    );
                  }

                  // Missing Blank slot
                  return (
                    <span
                      key={sIdx}
                      style={{ width: brick.cellPx, fontSize: brick.cellPx * 0.8 }}
                      className={`font-mono font-extrabold text-base rounded transition-all text-center ${
                        slot.hasError
                          ? 'text-rose-500 bg-rose-500/20 border-b-2 border-rose-500 animate-shake'
                          : isCurrentBlank
                          ? 'text-amber-300 bg-amber-400/20 border-b-2 border-amber-400 animate-pulse ring-1 ring-amber-400/50'
                          : 'text-cyan-300/80 border-b-2 border-cyan-400/60'
                      }`}
                    >
                      {slot.hasError ? 'x' : '_'}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* LANDED RED ROCK BRICKS STACKING UP ("tường gạch màu đỏ chồng lên") */}
        {landedBricks.map((brick) => (
          <div
            key={brick.id}
            className="absolute z-15 rounded-md border-2 border-rose-700 bg-gradient-to-t from-rose-950 to-rose-900 shadow-md flex items-center justify-center"
            style={{
              left: `${brick.x}%`,
              top: `${brick.y}%`,
              width: `${brick.widthPx}px`,
              height: `${brick.height}%`,
            }}
          >
            {/* Texture marks on rock */}
            <div className="w-full h-full opacity-30 flex items-center justify-around pointer-events-none">
              <div className="w-1.5 h-1.5 bg-rose-400 rounded-full" />
              <div className="w-2 h-1 bg-rose-400 rounded-sm" />
            </div>
          </div>
        ))}

        {/* WORD COMPLETION SUCCESS POPUP BANNER ("hiển thị lại từ đó + nghĩa phía dưới + âm phát ra...") */}
        {activeWordPopup && (
          <div
            className="absolute z-40 -translate-x-1/2 pointer-events-none w-max transition-all duration-300 animate-bounce"
            style={{
              left: `${activeWordPopup.x}%`,
              top: `${activeWordPopup.y}%`,
            }}
          >
            <div className="bg-slate-900/95 border-2 border-emerald-400 shadow-[0_0_25px_rgba(52,211,153,0.7)] rounded-xl px-2.5 py-1.5 text-center backdrop-blur-md">
              <div className="flex items-center justify-center gap-1.5">
                <span className="font-extrabold text-base text-emerald-300 capitalize font-display">
                  {activeWordPopup.wordItem.word}
                </span>
              </div>
              <div className="text-xs font-bold text-white mt-0.5">
                {brickLabel(activeWordPopup.wordItem)}
              </div>
            </div>
          </div>
        )}

        {/* GROUND SURFACE ("Khu này là mặt đất ban đầu") */}
        <div
          className="absolute left-0 right-0 bottom-0 z-20 pointer-events-none border-t-4 border-slate-700 bg-gradient-to-b from-slate-800 to-slate-950"
          style={{ top: `${GROUND_Y}%` }}
        >
          {/* Ground surface pattern */}
          <div className="w-full h-1 bg-cyan-500/40" />
        </div>

        {/* PLAYER CANNON OBJECT ("Object người chơi, cái nhô ra là khẩu súng") */}
        {/* Gốc toạ độ = CANNON_POS; nòng súng xoay quanh điểm này, cùng điểm xuất phát của đạn */}
        <div
          className="absolute z-30 pointer-events-none"
          style={{ left: `${CANNON_POS.x}%`, top: `${CANNON_POS.y}%` }}
        >
          {/* Rotating Cannon Barrel */}
          <div
            className="absolute w-2 h-7 -left-1 -top-7 bg-gradient-to-t from-slate-400 to-cyan-400 rounded-t-md shadow-md border-x border-slate-900 transition-transform duration-75"
            style={{ transformOrigin: '50% 100%', transform: `rotate(${cannonAngle}deg)` }}
          >
            {/* Muzzle Flash sparks on shot */}
            {muzzleFlash && (
              <div className="absolute -top-3 -left-1.5 w-5 h-5 rounded-full bg-cyan-300 blur-sm animate-ping pointer-events-none" />
            )}
          </div>

          {/* Cannon Turret Base & Dome */}
          <div className="absolute -left-4 -top-4 w-8 h-4 rounded-t-full bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 border-2 border-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.6)] flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_6px_#38bdf8]" />
          </div>
        </div>
      </div>

      {/* VIRTUAL KEYBOARD DOCK (Desktop / Mobile touch toggleable) */}
      {showVirtualKeyboard && (
        <div className="relative z-40 w-full bg-slate-950/95 border-t border-slate-800">
          <VirtualKeyboard
            onKeyPress={handleInputChar}
            onSwitchTarget={handleSwitchTarget}
            onToggleHide={onToggleVirtualKeyboard}
          />
        </div>
      )}

      {/* PAUSE MODAL OVERLAY */}
      {isPaused && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border-2 border-slate-700 rounded-3xl p-6 sm:p-8 max-w-sm w-full text-center shadow-2xl">
            <h3 className="text-2xl font-black text-white mb-2">TRÒ CHƠI TẠM DỪNG</h3>
            <p className="text-xs text-slate-400 mb-4">Nghỉ tay một chút và chuẩn bị tiếp tục!</p>

            {/* Điện thoại: các nút phụ chuyển từ header vào đây */}
            <div className="flex sm:hidden justify-center gap-2 mb-5">
              <ThemeToggle />
              {fullscreenButton}
              {soundButton}
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => setIsPaused(false)}
                className="py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer shadow-lg shadow-cyan-500/20"
              >
                <Play className="w-4 h-4" />
                <span>Tiếp tục chơi</span>
              </button>

              <button
                onClick={onExit}
                className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Home className="w-4 h-4" />
                <span>Về màn hình chọn bài</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
