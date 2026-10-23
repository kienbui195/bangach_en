import React, { useMemo } from 'react';
import { Trophy, ArrowRight, Crown } from 'lucide-react';
import { MatchStats } from '../types/game';
import { buildFakeLeaderboard } from '../utils/leaderboard';

interface ScoreRankModalProps {
  stats: MatchStats;
  onContinue: () => void;
}

export const ScoreRankModal: React.FC<ScoreRankModalProps> = ({ stats, onContinue }) => {
  const board = useMemo(() => buildFakeLeaderboard(stats.score), [stats.score]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border-2 border-slate-700/80 rounded-2xl sm:rounded-3xl px-3.5 pt-5 pb-3.5 sm:p-7 max-w-md w-full shadow-2xl relative overflow-hidden flex flex-col max-h-[92dvh]">
        <div className="absolute top-0 left-0 right-0 h-2 sm:h-3 bg-gradient-to-r from-amber-400 via-rose-500 to-fuchsia-500" />

        <div className="text-center mt-2">
          <div className="inline-flex items-center justify-center w-11 h-11 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl mb-1 sm:mb-2 bg-amber-500/20 text-amber-400 border border-amber-400/30 shadow-xl">
            <Trophy className="w-6 h-6 sm:w-8 sm:h-8" />
          </div>
          <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Điểm Màn {stats.levelNumber}</div>
          <div className="text-4xl sm:text-5xl font-black font-mono bg-gradient-to-r from-amber-400 via-rose-500 to-fuchsia-500 bg-clip-text text-transparent animate-scorePop">
            {stats.score.toLocaleString('vi-VN')}
          </div>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 sm:mt-2">
            Hạng <span className="font-black text-amber-400">#{board.playerRank}</span> trong{' '}
            <span className="font-bold text-white">{board.totalPlayers}</span> người đã vượt màn này
          </p>
        </div>

        <div className="mt-3 sm:mt-4 flex-1 min-h-0 overflow-y-auto rounded-2xl border border-slate-800 divide-y divide-slate-800">
          {board.entries.map((e) => (
            <div
              key={e.rank}
              className={`flex items-center gap-2 sm:gap-3 px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm ${
                e.isPlayer ? 'bg-amber-400/15 font-black text-white' : 'text-slate-300'
              }`}
            >
              <span className="w-7 text-center font-mono font-bold">
                {e.rank === 1 ? <Crown className="w-4 h-4 text-amber-400 inline" /> : `#${e.rank}`}
              </span>
              <span className="flex-1 truncate">{e.name}{e.isPlayer && ' (bạn)'}</span>
              <span className="font-mono">{e.score.toLocaleString('vi-VN')}</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-500 mt-2 text-center">Bảng xếp hạng mẫu, chưa kết nối máy chủ.</p>

        <button
          onClick={onContinue}
          className="mt-3 sm:mt-4 py-2.5 sm:py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 active:scale-95 transition-all cursor-pointer"
        >
          <span>Tiếp tục</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
