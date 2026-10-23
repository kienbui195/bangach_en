import React, { useEffect } from 'react';
import { MatchStats, WordItem } from '../types/game';
import { Trophy, RotateCcw, ArrowRight, Home, Volume2, Target, Zap, Clock, CheckCircle2, XCircle, Star, BookOpen } from 'lucide-react';
import { soundManager } from '../utils/audio';
import confetti from 'canvas-confetti';
import { matchStars } from '../utils/scoring';

interface PostMatchModalProps {
  stats: MatchStats | null;
  onNextLevel?: () => void;
  onRetry: () => void;
  onReturnToMap: () => void;
  onOpenNotebook: () => void;
  hasNextLevel: boolean;
}

export const PostMatchModal: React.FC<PostMatchModalProps> = ({
  stats,
  onNextLevel,
  onRetry,
  onReturnToMap,
  onOpenNotebook,
  hasNextLevel,
}) => {
  if (!stats) return null;

  const isWin = stats.isVictory;

  useEffect(() => {
    if (isWin) {
      soundManager.playVictory();
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch (e) {
        // ignore
      }
    } else {
      soundManager.playGameOver();
    }
  }, [isWin]);

  // Bảng tổng kết hiện số sao của CHÍNH ván vừa chơi (không phải kỷ lục đã lưu), tính bằng
  // đúng công thức mà chỗ lưu tiến độ dùng.
  const earnedStars = isWin ? matchStars(stats.accuracy, stats.heartsRemaining) : 0;

  const statCell = (icon: React.ReactNode, tone: string, label: string, value: React.ReactNode) => (
    <div className="flex items-center gap-2 min-w-0">
      <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0 ${tone}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[10px] sm:text-[11px] text-slate-400 font-medium whitespace-nowrap truncate">{label}</div>
        <div className="text-[13px] sm:text-base font-extrabold leading-tight whitespace-nowrap">{value}</div>
      </div>
    </div>
  );

  const actionBase =
    'flex-1 min-w-0 py-2 sm:py-3 px-2 sm:px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer whitespace-nowrap';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border-2 border-slate-700/80 rounded-2xl sm:rounded-3xl px-3.5 pt-5 pb-3.5 sm:p-7 max-w-lg w-full shadow-2xl relative overflow-hidden flex flex-col h-[min(92dvh,640px)]">
        {/* Decorative ambient header */}
        <div
          className={`absolute top-0 left-0 right-0 h-2 sm:h-3 ${
            isWin ? 'bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-500' : 'bg-gradient-to-r from-rose-500 to-orange-500'
          }`}
        />

        {/* Trạng thái: icon cạnh tiêu đề trên điện thoại, xếp dọc từ màn sm */}
        <div className="shrink-0 mt-1 mb-2.5 sm:mb-4 flex sm:block items-center gap-3 sm:text-center">
          <div
            className={`inline-flex items-center justify-center w-11 h-11 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl sm:mb-2 shadow-lg shrink-0 ${
              isWin
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-400/30'
                : 'bg-rose-500/20 text-rose-400 border border-rose-400/30'
            }`}
          >
            {isWin ? <Trophy className="w-6 h-6 sm:w-8 sm:h-8" /> : <XCircle className="w-6 h-6 sm:w-8 sm:h-8" />}
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="text-base sm:text-3xl font-black text-white font-display leading-tight">
              {isWin ? 'VƯỢT ẢI THÀNH CÔNG!' : 'THỬ THÁCH THẤT BẠI'}
            </h2>
            <p className="text-[11px] sm:text-sm text-slate-300 mt-0.5 sm:mt-1 leading-snug">
              {isWin ? `Bạn đã hoàn thành Màn ${stats.levelNumber}` : 'Gạch đã tràn hoặc hết tim. Rèn luyện và phục thù nhé!'}
            </p>
          </div>

          {isWin && (
            <div className="flex justify-center items-center gap-0.5 sm:gap-2 sm:mt-3 shrink-0">
              {[1, 2, 3].map((st) => (
                <Star
                  key={st}
                  className={`w-5 h-5 sm:w-7 sm:h-7 transition-all ${
                    st <= earnedStars
                      ? 'text-amber-400 fill-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.8)]'
                      : 'text-slate-700 fill-slate-800'
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Tổng điểm của ván */}
        <div className="shrink-0 mb-2 sm:mb-3 rounded-xl sm:rounded-2xl border border-amber-400/30 bg-amber-400/10 px-3 sm:px-4 py-1.5 sm:py-2 flex items-center justify-between">
          <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-300">Tổng điểm</span>
          <span className="text-xl sm:text-2xl font-black font-mono bg-gradient-to-r from-amber-400 via-rose-500 to-fuchsia-500 bg-clip-text text-transparent">
            {stats.score.toLocaleString('vi-VN')}
          </span>
        </div>

        {/* Số liệu ván chơi */}
        <div className="shrink-0 bg-slate-950/60 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 border border-slate-800/80 mb-2.5 sm:mb-4 grid grid-cols-2 gap-x-2 gap-y-2.5 sm:gap-3 text-left">
          {statCell(<Target className="w-4 h-4 sm:w-5 sm:h-5" />, 'bg-cyan-500/10 text-cyan-400', 'Gạch phá / Rơi', <span className="text-white">{stats.totalDestroyed} / {stats.totalSpawned}</span>)}
          {statCell(<CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />, 'bg-emerald-500/10 text-emerald-400', 'Chính xác', <span className="text-emerald-400">{stats.accuracy}%</span>)}
          {statCell(<Zap className="w-4 h-4 sm:w-5 sm:h-5" />, 'bg-amber-500/10 text-amber-400', 'Tốc độ gõ', <span className="text-amber-300">{stats.wpm} WPM</span>)}
          {statCell(<Clock className="w-4 h-4 sm:w-5 sm:h-5" />, 'bg-indigo-500/10 text-indigo-400', 'TB mỗi từ', <span className="text-indigo-300">{stats.averageTimePerWord.toFixed(1)}s</span>)}
        </div>

        {/* Từ đã tiếp thu: chỉ vùng tag này cuộn */}
        <div className="flex-1 min-h-0 flex flex-col mb-2.5">
          {stats.learnedWords.length > 0 ? (
            <>
              <div className="flex items-center justify-between mb-1.5 shrink-0">
                <span className="text-[11px] sm:text-xs font-bold text-slate-300 uppercase tracking-wide flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
                  Từ đã tiếp thu ({stats.learnedWords.length})
                </span>
              </div>
              <div className="flex flex-wrap content-start gap-1 sm:gap-1.5 flex-1 min-h-[52px] overflow-y-auto pr-1">
                {stats.learnedWords.map((item) => {
                  const isNew = stats.newWordIds.includes(item.id);
                  return (
                    <span
                      key={item.id}
                      className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full border text-[11px] sm:text-xs font-bold capitalize flex items-center gap-1 ${
                        isNew
                          ? 'bg-amber-400/15 border-amber-400/50 text-amber-300'
                          : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
                      }`}
                    >
                      {item.word}
                      {isNew && (
                        <span className="text-[8px] sm:text-[9px] leading-none px-1 py-0.5 rounded bg-amber-400 text-slate-950 uppercase">Mới</span>
                      )}
                    </span>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>

        {/* Nút hành động: lưới 2 cột, nhãn ngắn trên điện thoại */}
        <div className="shrink-0 mt-auto flex flex-col gap-1.5 sm:gap-2 pt-2.5 border-t border-slate-800">
          <div className="flex gap-1.5 sm:gap-2">
            {isWin && hasNextLevel && onNextLevel && (
              <button
                onClick={onNextLevel}
                className={`${actionBase} bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black shadow-lg shadow-emerald-500/20`}
              >
                <span>Ải tiếp theo</span>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </button>
            )}
            <button
              onClick={onRetry}
              className={`${actionBase} ${
                !isWin
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/20 font-black'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
              }`}
            >
              <RotateCcw className="w-4 h-4 shrink-0" />
              <span>{isWin ? 'Chơi lại' : 'Thử lại ngay'}</span>
            </button>
          </div>

          <div className="flex gap-1.5 sm:gap-2">
            <button
              onClick={onReturnToMap}
              className={`${actionBase} font-semibold bg-slate-800/80 hover:bg-slate-700 text-slate-300`}
            >
              <Home className="w-4 h-4 shrink-0" />
              <span>Chọn bài</span>
            </button>
            {stats.learnedWords.length > 0 && (
              <button
                onClick={onOpenNotebook}
                className={`${actionBase} font-semibold bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-800 text-cyan-300`}
              >
                <BookOpen className="w-4 h-4 shrink-0" />
                <span>Ôn từ vựng</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
