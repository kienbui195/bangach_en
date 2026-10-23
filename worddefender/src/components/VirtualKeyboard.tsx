import React from 'react';
import { EyeOff, ChevronsRight } from 'lucide-react';

interface VirtualKeyboardProps {
  onKeyPress: (char: string) => void;
  onSwitchTarget: () => void;
  onToggleHide?: () => void;
  activeChar?: string | null;
}

const KEYBOARD_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
];

export const VirtualKeyboard: React.FC<VirtualKeyboardProps> = ({
  onKeyPress,
  onSwitchTarget,
  onToggleHide,
  activeChar,
}) => {
  return (
    <div className="w-full max-w-2xl mx-auto px-2 pb-2 pt-1 select-none pointer-events-auto">
      <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-2xl p-2 sm:p-3 shadow-2xl flex flex-col gap-1.5 sm:gap-2">
        {/* Row 1 */}
        <div className="flex justify-center gap-1 sm:gap-1.5 w-full">
          {KEYBOARD_ROWS[0].map((letter) => {
            const isTarget = activeChar && activeChar.toUpperCase() === letter;
            return (
              <button
                key={letter}
                type="button"
                onClick={() => onKeyPress(letter)}
                className={`flex-1 max-w-[48px] h-10 sm:h-12 rounded-lg font-bold text-base sm:text-lg flex items-center justify-center transition-all active:scale-95 shadow-md ${
                  isTarget
                    ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300 ring-offset-1 ring-offset-slate-900 font-extrabold animate-pulse'
                    : 'bg-slate-800 text-slate-100 hover:bg-slate-700 active:bg-cyan-500 active:text-white border border-slate-700'
                }`}
              >
                {letter}
              </button>
            );
          })}
        </div>

        {/* Row 2 */}
        <div className="flex justify-center gap-1 sm:gap-1.5 w-full px-2 sm:px-4">
          {KEYBOARD_ROWS[1].map((letter) => {
            const isTarget = activeChar && activeChar.toUpperCase() === letter;
            return (
              <button
                key={letter}
                type="button"
                onClick={() => onKeyPress(letter)}
                className={`flex-1 max-w-[48px] h-10 sm:h-12 rounded-lg font-bold text-base sm:text-lg flex items-center justify-center transition-all active:scale-95 shadow-md ${
                  isTarget
                    ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300 ring-offset-1 ring-offset-slate-900 font-extrabold animate-pulse'
                    : 'bg-slate-800 text-slate-100 hover:bg-slate-700 active:bg-cyan-500 active:text-white border border-slate-700'
                }`}
              >
                {letter}
              </button>
            );
          })}
        </div>

        {/* Row 3 */}
        <div className="flex justify-center gap-1 sm:gap-1.5 w-full">
          {onToggleHide && (
            <button
              type="button"
              onClick={onToggleHide}
              title="Ẩn bàn phím ảo"
              className="px-2.5 sm:px-3 h-10 sm:h-12 rounded-lg bg-slate-800/80 hover:bg-slate-700 active:scale-95 text-slate-400 hover:text-slate-200 border border-slate-700 flex items-center justify-center transition-all"
            >
              <EyeOff className="w-4 h-4" />
            </button>
          )}

          {KEYBOARD_ROWS[2].map((letter) => {
            const isTarget = activeChar && activeChar.toUpperCase() === letter;
            return (
              <button
                key={letter}
                type="button"
                onClick={() => onKeyPress(letter)}
                className={`flex-1 max-w-[48px] h-10 sm:h-12 rounded-lg font-bold text-base sm:text-lg flex items-center justify-center transition-all active:scale-95 shadow-md ${
                  isTarget
                    ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300 ring-offset-1 ring-offset-slate-900 font-extrabold animate-pulse'
                    : 'bg-slate-800 text-slate-100 hover:bg-slate-700 active:bg-cyan-500 active:text-white border border-slate-700'
                }`}
              >
                {letter}
              </button>
            );
          })}

          <button
            type="button"
            onClick={onSwitchTarget}
            title="Tab: bỏ gạch đang ngắm, chuyển sang gạch kế tiếp"
            className="flex-1 max-w-[62px] h-10 sm:h-12 rounded-lg bg-cyan-900/40 hover:bg-cyan-900/70 text-cyan-300 active:bg-cyan-600 active:text-white border border-cyan-700/60 flex items-center justify-center gap-0.5 text-[11px] font-bold transition-all active:scale-95"
          >
            Tab
            <ChevronsRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
