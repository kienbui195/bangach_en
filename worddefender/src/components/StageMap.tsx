import React, { useEffect, useRef } from 'react';
import { LevelConfig, StageConfig } from '../types/game';
import { ThemeToggle } from './ThemeToggle';
import { FullscreenButton } from './FullscreenButton';
import { LevelProgress } from '../utils/storage';
import { Lock, Star, Flag, Trophy, BookOpen, Volume2, VolumeX, Sparkles, ArrowLeft } from 'lucide-react';
import { soundManager } from '../utils/audio';
import { subjectName } from '../utils/stageLabel';

interface StageMapProps {
  /** Chủ đề đang xem; đổi chủ đề phải quay về trang chọn chủ đề chứ không chuyển ngang. */
  stage: StageConfig;
  unlockedLevelId: number;
  completedLevels: Record<number, LevelProgress>;
  learnedCount: number;
  onBackToSubjects: () => void;
  onSelectLevel: (level: LevelConfig) => void;
  onOpenNotebook: () => void;
  onOpenDevicePrompt: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
}

export const StageMap: React.FC<StageMapProps> = ({
  stage: currentStage,
  unlockedLevelId,
  completedLevels,
  learnedCount,
  onBackToSubjects,
  onSelectLevel,
  onOpenNotebook,
  onOpenDevicePrompt,
  soundEnabled,
  onToggleSound,
}) => {
  // We want to render from Màn 1 at bottom to Màn Cuối at top, like the sketch!
  // Reverse order for vertical stacking (Màn Cuối at top, Màn 1 at bottom)
  const levelsAscending = [...currentStage.levels].sort((a, b) => a.levelNumber - b.levelNumber);
  const levelsDescending = [...levelsAscending].reverse();

  // Find current active/highest unlocked level in this stage
  const highestUnlockedInStage = levelsAscending.reduce((prev, curr) => {
    return curr.id <= unlockedLevelId ? curr : prev;
  }, levelsAscending[0]);

  // Vào bản đồ là tự cuộn tới màn hiện tại (nơi có lá cờ), khỏi phải kéo từ Màn 1 lên
  const currentNodeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => currentNodeRef.current?.scrollIntoView({ block: 'center' }));
    return () => cancelAnimationFrame(id);
  }, [currentStage.id]);

  // Total stars earned
  const totalStars = Object.values(completedLevels).reduce((acc, curr) => acc + (curr.stars || 0), 0);
  const totalScore = Object.values(completedLevels).reduce((acc, curr) => acc + (curr.bestScore || 0), 0);

  // Zigzag x-offsets for the map nodes (e.g. left, right, center, left, right)
  const getNodeOffsetClass = (levelNum: number) => {
    const cycle = levelNum % 4;
    switch (cycle) {
      case 1:
        return 'translate-x-0'; // center-ish
      case 2:
        return 'translate-x-12 sm:translate-x-20 lg:translate-x-48'; // right
      case 3:
        return '-translate-x-12 sm:-translate-x-20 lg:-translate-x-48'; // left
      case 0:
        return 'translate-x-8 sm:translate-x-12 lg:translate-x-24'; // mild right
      default:
        return 'translate-x-0';
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-start pt-[73px] pb-16 selection:bg-cyan-500 selection:text-white relative overflow-x-clip">
      {/* Background ambient decorative grid */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-950 to-slate-950 pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b15_1px,transparent_1px),linear-gradient(to_bottom,#1e293b15_1px,transparent_1px)] bg-[size:4rem_4rem] pointer-events-none" />

      {/* Top Header Bar */}
      <header className="fixed top-0 inset-x-0 w-full px-3 sm:px-8 py-3 sm:py-4 gap-2 flex items-center justify-between z-30 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-md">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/20 font-black text-xl text-white">
            W
          </div>
          <div className="hidden min-[500px]:block min-w-0">
            <h1 className="text-lg sm:text-xl font-extrabold tracking-tight bg-gradient-to-r from-cyan-400 via-blue-300 to-indigo-300 bg-clip-text text-transparent">
              WordDefender
            </h1>
            <p className="text-xs text-slate-400 hidden md:block">Bắn gạch phá vỡ giới hạn từ vựng</p>
          </div>
        </div>

        {/* Action badges */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {/* Star total */}
          <div className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 font-bold text-xs sm:text-sm">
            <Star className="w-4 h-4 fill-amber-400" />
            <span>{totalStars}</span>
          </div>

          {/* Tổng điểm cá nhân (cộng điểm cao nhất của từng màn) */}
          <div title="Tổng điểm cao nhất của các màn" className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 font-bold text-xs sm:text-sm">
            <Trophy className="w-4 h-4" />
            <span>{totalScore.toLocaleString('vi-VN')}</span>
          </div>

          {/* Sổ tay từ vựng & Ôn tập */}
          <button
            onClick={onOpenNotebook}
            className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-full bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 font-bold text-xs sm:text-sm transition-all hover:scale-105 active:scale-95 shadow-md shadow-cyan-500/10 cursor-pointer"
          >
            <BookOpen className="w-4 h-4" />
            <span><span className="hidden sm:inline">Sổ Từ Vựng </span>({learnedCount})</span>
          </button>

          <ThemeToggle />

          <FullscreenButton />

          {/* Sound toggle */}
          <button
            onClick={onToggleSound}
            title={soundEnabled ? 'Tắt âm thanh' : 'Bật âm thanh'}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
          </button>
        </div>
      </header>

      {/* Tên chủ đề đang chơi; muốn đổi chủ đề thì quay về trang chọn chủ đề */}
      <div className="sticky top-[73px] z-20 w-full max-w-3xl px-4 pt-6 pb-1">
        <div className="flex items-center gap-2 w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-2 shadow-xl backdrop-blur-md">
          <button
            onClick={onBackToSubjects}
            title="Chọn chủ đề khác"
            className="flex items-center gap-1 px-2.5 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="hidden sm:inline text-xs font-bold">Chủ đề</span>
          </button>

          <div className="text-center flex-1 min-w-0 px-1">
            <div className="text-xs font-bold uppercase tracking-widest text-cyan-400">Chủ đề</div>
            <div className="font-extrabold text-sm sm:text-base text-slate-100 truncate">
              {subjectName(currentStage)}
            </div>
          </div>

          {/* giữ chỗ cân đối với nút bên trái */}
          <div className="w-[42px] sm:w-[88px] shrink-0" />
        </div>
      </div>

      <p className="text-xs text-slate-400 text-center mt-1 max-w-md px-4 z-10">
        {currentStage.description}
      </p>

      {/* Main Map Canvas - Vertical Path like Sketch */}
      <div className="w-full max-w-5xl px-4 mt-8 z-10 flex flex-col items-center relative">
        <div className="w-full relative flex flex-col items-center py-6 px-4 bg-slate-900/40 rounded-3xl border border-slate-800/60 shadow-2xl backdrop-blur-sm">
          {/* Dotted path connecting the levels */}
          <div className="absolute top-16 bottom-16 left-1/2 -translate-x-1/2 w-0.5 border-l-2 border-dashed border-cyan-500/30 pointer-events-none z-0" />

          {/* Level Nodes (descending from Màn Cuối to Màn 1) */}
          <div className="flex flex-col gap-10 sm:gap-14 w-full items-center z-10 py-4">
            {levelsDescending.map((level) => {
              const isUnlocked = level.id <= unlockedLevelId;
              const isCurrentFlag = level.id === highestUnlockedInStage.id;
              const progress = completedLevels[level.id];
              const isBoss = level.difficulty === 'boss';
              const offsetClass = getNodeOffsetClass(level.levelNumber);

              return (
                <div
                  key={level.id}
                  ref={isCurrentFlag ? currentNodeRef : undefined}
                  className={`relative flex flex-col items-center transition-all ${offsetClass}`}
                >
                  {/* Flag indicator on current target level (like in user's sketch: 'lá cờ mốc hiện tại') */}
                  {isCurrentFlag && (
                    <div className="absolute -top-10 sm:-top-11 flex flex-col items-center animate-bounce z-20 pointer-events-none">
                      <div className="flex items-center gap-1 whitespace-nowrap px-2.5 py-1 rounded-md bg-amber-400 text-slate-950 font-black text-xs shadow-lg shadow-amber-400/40 border border-amber-300">
                        <Flag className="w-3.5 h-3.5 fill-slate-950" />
                        <span>MỐC HIỆN TẠI</span>
                      </div>
                      <div className="w-0.5 h-3 bg-amber-400" />
                    </div>
                  )}

                  {/* Level node button */}
                  <button
                    disabled={!isUnlocked}
                    onClick={() => onSelectLevel(level)}
                    className={`group relative flex flex-col items-center justify-center transition-all duration-300 rounded-full cursor-pointer ${
                      isBoss
                        ? 'w-24 h-14 sm:w-28 sm:h-16'
                        : 'w-20 h-12 sm:w-24 sm:h-14'
                    } ${
                      !isUnlocked
                        ? 'bg-slate-800/60 border-2 border-slate-700/60 text-slate-500 cursor-not-allowed opacity-60'
                        : isCurrentFlag
                        ? 'bg-gradient-to-b from-cyan-500 to-blue-600 border-2 border-cyan-300 text-white shadow-[0_0_25px_rgba(6,182,212,0.6)] ring-4 ring-cyan-500/30 hover:scale-105 active:scale-95'
                        : progress
                        ? 'bg-gradient-to-b from-slate-800 to-slate-900 border-2 border-emerald-400/70 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.3)] hover:scale-105 active:scale-95'
                        : 'bg-slate-800 border-2 border-cyan-500/50 text-slate-200 hover:scale-105 active:scale-95'
                    }`}
                  >
                    {/* Boss skull/crown icon or level badge */}
                    {isBoss ? (
                      <div className="flex items-center gap-1">
                        <Trophy className="w-3.5 h-3.5 text-amber-300" />
                        <span className="font-extrabold text-xs sm:text-sm tracking-wide">
                          {level.title.split(':')[0]}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 font-bold text-xs sm:text-sm">
                        {!isUnlocked && <Lock className="w-3.5 h-3.5 mr-0.5" />}
                        <span>{level.title.split(':')[0]}</span>
                      </div>
                    )}

                    {/* Target requirement tag: không lặp từ nên pool thiếu thì hiện số từ thật */}
                    <div className="text-[10px] opacity-80 font-mono">
                      {Math.min(level.targetCount, new Set(level.wordPool.map((w) => w.word.toLowerCase())).size)} từ
                    </div>

                    {/* Stars earned under the node */}
                    {progress && (
                      <div className="absolute -bottom-3 flex items-center gap-0.5 bg-slate-950/90 px-1.5 py-0.5 rounded-full border border-slate-700 shadow-md">
                        {[1, 2, 3].map((s) => (
                          <Star
                            key={s}
                            className={`w-3 h-3 ${
                              s <= (progress.stars || 0)
                                ? 'text-amber-400 fill-amber-400'
                                : 'text-slate-600'
                            }`}
                          />
                        ))}
                      </div>
                    )}
                  </button>

                  {/* Level details tooltip/caption */}
                  <div className={`${progress ? 'mt-4' : 'mt-2'} text-center pointer-events-none`}>
                    <span className="text-[11px] font-medium text-slate-400 block">
                      {level.subtitle}
                    </span>
                    {progress?.bestScore ? (
                      <span className="text-xs font-black text-amber-400 block mt-0.5">
                        Điểm cao nhất: {progress.bestScore.toLocaleString('vi-VN')}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom controls / settings */}
        <div className="w-full flex items-center justify-between mt-6 px-2">
          <button
            onClick={onOpenDevicePrompt}
            className="text-xs text-slate-400 hover:text-cyan-300 underline underline-offset-4 flex items-center gap-1.5 transition-colors"
          >
            Đổi loại thiết bị (Bàn phím ảo/cứng)
          </button>

          <button
            onClick={onOpenNotebook}
            className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5" />
            Luyện tập & Ôn bài
          </button>
        </div>
      </div>
    </div>
  );
};
