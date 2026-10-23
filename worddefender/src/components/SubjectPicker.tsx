import React from 'react';
import { BookOpen, ChevronRight, Lock, Star, Trophy } from 'lucide-react';
import { StageConfig } from '../types/game';
import { LevelProgress } from '../utils/storage';
import { stageProgress, subjectName } from '../utils/stageLabel';
import { ThemeToggle } from './ThemeToggle';
import { FullscreenButton } from './FullscreenButton';

interface SubjectPickerProps {
  stages: StageConfig[];
  unlockedLevelId: number;
  completedLevels: Record<number, LevelProgress>;
  learnedCount: number;
  onSelectSubject: (stageId: number) => void;
  onOpenNotebook: () => void;
}

/**
 * Trang chính: chọn chủ đề trước khi vào bản đồ màn.
 * Mỗi chủ đề hiện ứng với một chặng trong dữ liệu; muốn đổi chủ đề phải quay về đây.
 */
export const SubjectPicker: React.FC<SubjectPickerProps> = ({
  stages,
  unlockedLevelId,
  completedLevels,
  learnedCount,
  onSelectSubject,
  onOpenNotebook,
}) => {
  const totalScore = Object.values(completedLevels).reduce((sum, p) => sum + (p.bestScore ?? 0), 0);

  return (
    <div className="min-h-dvh w-full bg-slate-950 text-slate-100 flex flex-col items-center px-4 py-6">
      <header className="w-full max-w-5xl flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-3xl font-black font-display bg-gradient-to-r from-cyan-300 via-blue-400 to-indigo-400 bg-clip-text text-transparent">
            WordDefender
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">Chọn chủ đề để bắt đầu học</p>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div
            title="Tổng điểm cao nhất của các màn"
            className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 font-bold text-xs sm:text-sm"
          >
            <Trophy className="w-4 h-4" />
            <span>{totalScore.toLocaleString('vi-VN')}</span>
          </div>
          <button
            onClick={onOpenNotebook}
            className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-full bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 font-bold text-xs sm:text-sm transition-all hover:scale-105 active:scale-95 cursor-pointer"
          >
            <BookOpen className="w-4 h-4" />
            <span>
              <span className="hidden sm:inline">Sổ Từ Vựng </span>({learnedCount})
            </span>
          </button>
          <ThemeToggle />
          <FullscreenButton />
        </div>
      </header>

      <div className="w-full max-w-5xl mt-6 sm:mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {stages.map((stage) => {
          const progress = stageProgress(stage, completedLevels);
          const firstLevel = [...stage.levels].sort((a, b) => a.levelNumber - b.levelNumber)[0];
          // Chủ đề mở khi màn đầu của nó đã mở khóa; tiến độ cũ lưu theo id màn nên không mất.
          const isUnlocked = Boolean(firstLevel) && firstLevel.id <= unlockedLevelId;
          const percent = progress.total ? Math.round((progress.cleared / progress.total) * 100) : 0;

          return (
            <button
              key={stage.id}
              type="button"
              onClick={() => isUnlocked && onSelectSubject(stage.id)}
              disabled={!isUnlocked}
              className={`group text-left rounded-2xl border p-5 transition-all ${
                isUnlocked
                  ? 'bg-slate-900/80 border-slate-700 hover:border-cyan-400/60 hover:bg-slate-900 hover:scale-[1.02] active:scale-[0.99] cursor-pointer shadow-xl'
                  : 'bg-slate-900/40 border-slate-800 opacity-60 cursor-not-allowed'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-11 h-11 rounded-xl shrink-0 flex items-center justify-center text-slate-950 font-black text-lg"
                  style={{ backgroundColor: stage.themeColor }}
                >
                  {isUnlocked ? subjectName(stage).charAt(0) : <Lock className="w-5 h-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <h2 className="font-extrabold text-base sm:text-lg text-slate-100 leading-tight">
                      {subjectName(stage)}
                    </h2>
                    {isUnlocked && (
                      <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-300 transition-colors shrink-0" />
                    )}
                  </div>
                  <p className="text-xs sm:text-sm text-slate-400 mt-1 leading-snug">{stage.description}</p>
                </div>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                  <span>
                    {progress.cleared}/{progress.total} màn
                  </span>
                  <span className="flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 text-amber-400" />
                    {progress.stars}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${percent}%`, backgroundColor: stage.themeColor }}
                  />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {stages.length === 0 && (
        <p className="mt-16 text-slate-400 text-sm">Chưa có chủ đề nào. Thêm nội dung trong CMS rồi tải lại trang.</p>
      )}
    </div>
  );
};
