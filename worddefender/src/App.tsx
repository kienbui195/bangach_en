import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GAME_STAGES } from './data/stages';
import { LevelConfig, MatchStats, LearnedWordRecord, WordItem } from './types/game';
import {
  LevelProgress,
  loadGameData,
  saveCompletedLevel,
  saveLearnedWords,
  setStoredDevice,
  setStoredVirtualKeyboard,
} from './utils/storage';
import { soundManager } from './utils/audio';
import { StageMap } from './components/StageMap';
import { onContentUpdated } from './config/remoteContent';
import { SubjectPicker } from './components/SubjectPicker';
import { GameArena } from './components/GameArena';
import { ScoreRankModal } from './components/ScoreRankModal';
import { PostMatchModal } from './components/PostMatchModal';
import { VocabularyNotebook } from './components/VocabularyNotebook';
import { DevicePromptModal } from './components/DevicePromptModal';
import { LevelPreviewModal } from './components/LevelPreviewModal';
import { CountdownOverlay } from './components/CountdownOverlay';
import { buildWordDeck } from './utils/wordDeck';
import { matchStars } from './utils/scoring';

type AppView = 'subjects' | 'map' | 'game' | 'notebook';

export default function App() {
  // Mở app là chọn chủ đề trước; 'map' là bản đồ màn của chủ đề đã chọn
  const [currentView, setCurrentView] = useState<AppView>('subjects');
  const [currentStageId, setCurrentStageId] = useState<number>(1);
  const [, setContentVersion] = useState<number>(0); // đổi khi nội dung CMS vừa làm mới, để vẽ lại theo bản mới
  const [unlockedLevelId, setUnlockedLevelId] = useState<number>(101);
  const [completedLevels, setCompletedLevels] = useState<Record<number, LevelProgress>>({});
  const [learnedWords, setLearnedWords] = useState<LearnedWordRecord[]>([]);

  const [selectedLevel, setSelectedLevel] = useState<LevelConfig | null>(null);
  // Sổ từ vựng mở được từ cả trang chủ đề lẫn bản đồ màn; nhớ chỗ để quay lại đúng nơi
  const [notebookFrom, setNotebookFrom] = useState<AppView>('subjects');
  const [postMatchStats, setPostMatchStats] = useState<MatchStats | null>(null);
  const [showRank, setShowRank] = useState<boolean>(false); // bước xem điểm + hạng trước modal tổng kết
  const [matchId, setMatchId] = useState<number>(0); // đổi mỗi lần bắt đầu/chơi lại để remount GameArena
  // Bước chuẩn bị trước khi vào màn: xem trước từ (preview) rồi đếm ngược (countdown)
  const [preview, setPreview] = useState<{ level: LevelConfig; deck: WordItem[]; known: Set<string> } | null>(null);
  const [countdown, setCountdown] = useState(false);
  const [deck, setDeck] = useState<WordItem[] | undefined>(undefined);

  // Settings
  const currentStage = GAME_STAGES.find((s) => s.id === currentStageId) ?? GAME_STAGES[0];

  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [showVirtualKeyboard, setShowVirtualKeyboard] = useState<boolean>(false);
  const [showDeviceModal, setShowDeviceModal] = useState<boolean>(false);

  useEffect(() => onContentUpdated(() => setContentVersion((v) => v + 1)), []);

  // Load initial data on mount
  useEffect(() => {
    const data = loadGameData();
    setCurrentStageId(data.unlockedStage || 1);
    setUnlockedLevelId(data.unlockedLevel || 101);
    setCompletedLevels(data.completedLevels || {});
    setLearnedWords(data.learnedWords || []);
    setSoundEnabled(data.soundEnabled);
    soundManager.setSoundEnabled(data.soundEnabled);
    soundManager.setSpeechEnabled(data.speechEnabled);

    // Auto-detect or ask device on first run
    if (!data.preferredDevice) {
      // Check if touch device
      const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      if (isTouch) {
        setShowVirtualKeyboard(true);
      }
      setShowDeviceModal(true);
    } else {
      setShowVirtualKeyboard(data.showVirtualKeyboard);
    }
  }, []);

  const handleSelectDevice = (device: 'keyboard' | 'touch', enableVirtualKb: boolean) => {
    setStoredDevice(device, enableVirtualKb);
    setShowVirtualKeyboard(enableVirtualKb);
    setShowDeviceModal(false);
  };

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundManager.setSoundEnabled(next);
    localStorage.setItem('wd_sound_enabled', next ? 'true' : 'false');
  };

  const handleToggleVirtualKeyboard = () => {
    const next = !showVirtualKeyboard;
    setShowVirtualKeyboard(next);
    setStoredVirtualKeyboard(next);
  };

  // Chọn màn: bốc sẵn bộ từ rồi cho người chơi xem trước; chỉ vào chơi sau khi bấm Bắt đầu và đếm ngược
  const handleStartLevel = (level: LevelConfig) => {
    const known = new Set<string>(loadGameData().learnedWords.map((w: { word: string }) => w.word.toLowerCase()));
    setPostMatchStats(null);
    // Bộ từ không lặp, nên màn nào pool ít từ hơn targetCount thì số từ phải phá giảm theo bộ thật.
    const deck = buildWordDeck(level.wordPool, level.targetCount, known);
    setPreview({ level: { ...level, targetCount: deck.length }, deck, known });
  };

  const handleBeginCountdown = () => setCountdown(true);

  const handleCancelPreview = () => {
    setPreview(null);
    setCountdown(false);
    setSelectedLevel(null);
    setCurrentView('map');
  };

  const previewRef = useRef(preview);
  previewRef.current = preview;

  const handleCountdownDone = useCallback(() => {
    const p = previewRef.current;
    setCountdown(false);
    setPreview(null);
    if (!p) return;
    setSelectedLevel(p.level);
    setDeck(p.deck);
    setMatchId((id) => id + 1);
    setCurrentView('game');
  }, []);

  const handleFinishMatch = (stats: MatchStats) => {
    setPostMatchStats(stats);
    setShowRank(stats.isVictory);

    if (stats.isVictory && selectedLevel) {
      // Find next level ID
      const allLevels = GAME_STAGES.flatMap((s) => s.levels);
      const currentIndex = allLevels.findIndex((l) => l.id === selectedLevel.id);
      const nextLevel = currentIndex !== -1 && currentIndex + 1 < allLevels.length ? allLevels[currentIndex + 1] : null;

      const stars = matchStars(stats.heartsRemaining, stats.accuracy);

      // Bản ghi trả về đã gộp kỷ lục cũ với ván vừa chơi; dùng luôn để bản đồ màn hiện số mới
      // ngay, không phụ thuộc vào việc đọc lại localStorage.
      const merged = saveCompletedLevel(
        selectedLevel.id,
        nextLevel ? nextLevel.id : null,
        stars,
        stats.accuracy,
        stats.wpm,
        stats.score
      );

      if (nextLevel && nextLevel.id > unlockedLevelId) {
        setUnlockedLevelId(nextLevel.id);
        if (nextLevel.stageId > currentStageId) {
          setCurrentStageId(nextLevel.stageId);
        }
      }

      const levelId = selectedLevel.id;
      setCompletedLevels((prev) => ({ ...prev, [levelId]: merged }));
    }

    // Save learned words
    if (stats.learnedWords.length > 0) {
      const updatedWords = saveLearnedWords(stats.learnedWords);
      setLearnedWords(updatedWords);
    }
  };

  // Find next level
  const getNextLevel = (): LevelConfig | null => {
    if (!selectedLevel) return null;
    const allLevels = GAME_STAGES.flatMap((s) => s.levels);
    const currentIndex = allLevels.findIndex((l) => l.id === selectedLevel.id);
    if (currentIndex !== -1 && currentIndex + 1 < allLevels.length) {
      return allLevels[currentIndex + 1];
    }
    return null;
  };

  const nextLevel = getNextLevel();

  const handlePlayNextLevel = () => {
    if (nextLevel) {
      handleStartLevel(nextLevel);
    }
  };

  const handleRetryCurrentLevel = () => {
    if (selectedLevel) {
      handleStartLevel(selectedLevel);
    }
  };

  const handleRefreshLearnedWords = useCallback(() => {
    const data = loadGameData();
    setLearnedWords(data.learnedWords || []);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans select-none">
      {/* Device Selection Modal */}
      <DevicePromptModal
        isOpen={showDeviceModal}
        onSelect={handleSelectDevice}
      />

      {/* Main View Router */}
      {currentView === 'subjects' && (
        <SubjectPicker
          stages={GAME_STAGES}
          unlockedLevelId={unlockedLevelId}
          completedLevels={completedLevels}
          learnedCount={learnedWords.length}
          onSelectSubject={(id) => {
            setCurrentStageId(id);
            setCurrentView('map');
          }}
          onOpenNotebook={() => {
            setNotebookFrom('subjects');
            setCurrentView('notebook');
          }}
        />
      )}

      {currentView === 'map' && currentStage && (
        <StageMap
          stage={currentStage}
          unlockedLevelId={unlockedLevelId}
          completedLevels={completedLevels}
          learnedCount={learnedWords.length}
          onBackToSubjects={() => setCurrentView('subjects')}
          onSelectLevel={handleStartLevel}
          onOpenNotebook={() => {
            setNotebookFrom('map');
            setCurrentView('notebook');
          }}
          onOpenDevicePrompt={() => setShowDeviceModal(true)}
          soundEnabled={soundEnabled}
          onToggleSound={handleToggleSound}
        />
      )}

      {currentView === 'game' && selectedLevel && (
        <GameArena
          key={matchId}
          level={selectedLevel}
          deck={deck}
          onFinishMatch={handleFinishMatch}
          onExit={() => {
            setCurrentView('map');
            setSelectedLevel(null);
          }}
          soundEnabled={soundEnabled}
          onToggleSound={handleToggleSound}
          showVirtualKeyboard={showVirtualKeyboard}
          onToggleVirtualKeyboard={handleToggleVirtualKeyboard}
        />
      )}

      {currentView === 'notebook' && (
        <VocabularyNotebook
          learnedWords={learnedWords}
          onBack={() => setCurrentView(notebookFrom)}
          onRefreshWords={handleRefreshLearnedWords}
        />
      )}

      {preview && !countdown && (
        <LevelPreviewModal
          level={preview.level}
          words={preview.deck}
          knownWords={preview.known}
          onStart={handleBeginCountdown}
          onCancel={handleCancelPreview}
        />
      )}
      {preview && countdown && <CountdownOverlay onDone={handleCountdownDone} />}

      {/* Post Match Modal */}
      {postMatchStats && showRank && (
        <ScoreRankModal stats={postMatchStats} onContinue={() => setShowRank(false)} />
      )}
      {postMatchStats && !showRank && (
        <PostMatchModal
          stats={postMatchStats}
          hasNextLevel={!!nextLevel}
          onNextLevel={handlePlayNextLevel}
          onRetry={handleRetryCurrentLevel}
          onReturnToMap={() => {
            setPostMatchStats(null);
            setCurrentView('map');
            setSelectedLevel(null);
          }}
          onOpenNotebook={() => {
            setPostMatchStats(null);
            setNotebookFrom('map');
            setCurrentView('notebook');
          }}
        />
      )}
    </div>
  );
}
