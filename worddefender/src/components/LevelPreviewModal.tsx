import React, { useState } from 'react';
import { AlertTriangle, BookOpen, Play, Volume2, X } from 'lucide-react';
import { LevelConfig, WordItem } from '../types/game';
import { soundManager } from '../utils/audio';
import { posLabel } from '../utils/wordLabel';
import { canReport } from '../utils/wordReport';
import { ReportWordModal } from './ReportWordModal';

interface LevelPreviewModalProps {
  level: LevelConfig;
  words: WordItem[];
  knownWords: Set<string>; // từ đã học (chữ thường), để đánh dấu từ mới
  onStart: () => void;
  onCancel: () => void;
}

/** Xem trước các từ sẽ xuất hiện trong màn: học trước, rồi luyện cách viết qua việc chơi. */
export const LevelPreviewModal: React.FC<LevelPreviewModalProps> = ({ level, words, knownWords, onStart, onCancel }) => {
  const newCount = words.filter((w) => !knownWords.has(w.word.toLowerCase())).length;
  // Từ nào sai (chính tả, nghĩa, phiên âm, giọng đọc) thì người chơi báo ngay tại đây
  const [reporting, setReporting] = useState<WordItem | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border-2 border-slate-700/80 rounded-2xl sm:rounded-3xl px-3.5 pt-4 pb-3.5 sm:p-6 max-w-lg w-full shadow-2xl relative overflow-hidden flex flex-col h-[min(92dvh,640px)]">
        <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500" />

        <div className="shrink-0 mt-1 mb-2.5 flex items-start gap-3">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 bg-cyan-500/15 text-cyan-300 border border-cyan-400/30">
            <BookOpen className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base sm:text-xl font-black text-slate-100 font-display leading-tight">
              Màn {level.levelNumber}: học trước khi chơi
            </h2>
            <p className="text-[11px] sm:text-sm text-slate-300 mt-0.5 leading-snug">
              {words.length} từ sẽ xuất hiện{newCount > 0 ? `, ${newCount} từ mới` : ''}. Đọc, nghe rồi nhớ cách viết, vào chơi sẽ gõ lại các chữ bị che.
            </p>
          </div>
        </div>

        <ul className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1 mb-2.5">
          {words.map((w) => {
            const isNew = !knownWords.has(w.word.toLowerCase());
            const pos = posLabel(w);
            return (
              <li
                key={w.id}
                className="flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-950/60 px-2.5 py-1.5 sm:py-2"
              >
                <button
                  type="button"
                  onClick={() => soundManager.speak(w.word, w.audioUrl)}
                  title="Nghe phát âm"
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg shrink-0 flex items-center justify-center bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/30 active:scale-95 transition-all cursor-pointer"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className="font-extrabold text-sm sm:text-base text-slate-100 capitalize">{w.word}</span>
                    {pos && <span className="text-[10px] sm:text-xs font-bold text-amber-300 italic">{pos}</span>}
                    {isNew && (
                      <span className="text-[8px] sm:text-[9px] leading-none px-1 py-0.5 rounded bg-amber-400 text-slate-950 font-bold uppercase">Mới</span>
                    )}
                  </div>
                  <div className="text-[11px] sm:text-xs text-slate-400 font-mono truncate">{w.phonetic}</div>
                </div>
                <div className="text-xs sm:text-sm font-semibold text-slate-200 text-right max-w-[40%] leading-tight">{w.meaning}</div>
                {canReport() && (
                  <button
                    type="button"
                    onClick={() => setReporting(w)}
                    title="Báo từ này sai"
                    className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-slate-500 hover:text-amber-300 hover:bg-amber-500/10 active:scale-95 transition-all cursor-pointer"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        <div className="shrink-0 flex gap-1.5 sm:gap-2 pt-2.5 border-t border-slate-800">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 min-w-0 py-2.5 px-3 rounded-xl font-semibold text-xs sm:text-sm flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 active:scale-95 transition-all cursor-pointer"
          >
            <X className="w-4 h-4 shrink-0" />
            <span>Hủy</span>
          </button>
          <button
            type="button"
            onClick={onStart}
            className="flex-[2] min-w-0 py-2.5 px-3 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all cursor-pointer"
          >
            <Play className="w-4 h-4 shrink-0" />
            <span>Bắt đầu</span>
          </button>
        </div>
      </div>

      {reporting && <ReportWordModal word={reporting} onClose={() => setReporting(null)} />}
    </div>
  );
};
