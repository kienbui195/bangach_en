import React from 'react';
import { Laptop, Smartphone, Keyboard, Sparkles } from 'lucide-react';

interface DevicePromptModalProps {
  isOpen: boolean;
  onSelect: (device: 'keyboard' | 'touch', enableVirtualKb: boolean) => void;
}

export const DevicePromptModal: React.FC<DevicePromptModalProps> = ({
  isOpen,
  onSelect,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border-2 border-cyan-500/50 shadow-[0_0_35px_rgba(6,182,212,0.3)] rounded-3xl p-6 sm:p-8 max-w-lg w-full text-center relative overflow-hidden">
        {/* Glow accent */}
        <div className="absolute -top-16 -right-16 w-36 h-36 bg-cyan-500/20 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-36 h-36 bg-blue-500/20 rounded-full blur-2xl pointer-events-none" />

        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-400/30 text-cyan-400 mb-4 shadow-inner">
          <Sparkles className="w-7 h-7 animate-pulse" />
        </div>

        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-wide mb-2 font-display">
          Chọn Thiết Bị Trải Nghiệm
        </h2>
        <p className="text-slate-300 text-sm sm:text-base mb-6 leading-relaxed">
          WordDefender hoạt động mượt mà trên cả máy tính xoay ngang và điện thoại xoay dọc. Hãy chọn chế độ phù hợp với thiết bị của bạn:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {/* Laptop / PC */}
          <button
            onClick={() => onSelect('keyboard', false)}
            className="group relative flex flex-col items-center justify-between p-5 rounded-2xl bg-slate-800/80 border-2 border-slate-700 hover:border-cyan-400 hover:bg-slate-800 transition-all hover:scale-[1.02] active:scale-95 text-left cursor-pointer"
          >
            <div className="w-12 h-12 rounded-xl bg-cyan-500/20 text-cyan-300 flex items-center justify-center mb-3 group-hover:bg-cyan-500 group-hover:text-slate-950 transition-colors">
              <Laptop className="w-6 h-6" />
            </div>
            <div className="text-center">
              <div className="font-bold text-slate-100 text-base mb-1">Máy tính / Laptop</div>
              <div className="text-xs text-slate-400 leading-normal">
                Dùng bàn phím vật lý gõ trực tiếp chữ A-Z siêu tốc
              </div>
            </div>
            <div className="mt-3 text-xs font-semibold text-cyan-400 flex items-center gap-1">
              <Keyboard className="w-3.5 h-3.5" /> Phím cứng
            </div>
          </button>

          {/* Smartphone / Tablet */}
          <button
            onClick={() => onSelect('touch', true)}
            className="group relative flex flex-col items-center justify-between p-5 rounded-2xl bg-slate-800/80 border-2 border-slate-700 hover:border-amber-400 hover:bg-slate-800 transition-all hover:scale-[1.02] active:scale-95 text-left cursor-pointer"
          >
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center mb-3 group-hover:bg-amber-400 group-hover:text-slate-950 transition-colors">
              <Smartphone className="w-6 h-6" />
            </div>
            <div className="text-center">
              <div className="font-bold text-slate-100 text-base mb-1">Điện thoại / Tablet</div>
              <div className="text-xs text-slate-400 leading-normal">
                Bật bàn phím ảo hiển thị trên màn hình cảm ứng
              </div>
            </div>
            <div className="mt-3 text-xs font-semibold text-amber-400 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> Bàn phím ảo
            </div>
          </button>
        </div>

        <p className="text-xs text-slate-400 italic">
          * Bạn luôn có thể bật/tắt bàn phím ảo bất kỳ lúc nào bằng biểu tượng phím trên thanh công cụ.
        </p>
      </div>
    </div>
  );
};
