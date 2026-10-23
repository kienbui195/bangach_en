import React, { useEffect, useState } from 'react';
import { Maximize, Minimize } from 'lucide-react';
import { isFullscreenActive, isFullscreenSupported, isStandalone, toggleFullscreen } from '../utils/fullscreen';

interface FullscreenButtonProps {
  className?: string;
}

const BASE_CLASS =
  'p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white border border-slate-700 transition-colors cursor-pointer';

/** Nút phóng to toàn màn hình. Ẩn khi đã chạy như ứng dụng; trên iPhone chỉ hiện hướng dẫn ẩn thanh công cụ của Safari. */
export const FullscreenButton: React.FC<FullscreenButtonProps> = ({ className = BASE_CLASS }) => {
  const [active, setActive] = useState(isFullscreenActive());
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    const onChange = () => setActive(isFullscreenActive());
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  if (isStandalone()) return null;

  const supported = isFullscreenSupported();
  const onClick = () => (supported ? toggleFullscreen() : setShowHint((v) => !v));

  return (
    <span className="relative inline-flex">
      <button
        onClick={onClick}
        title={active ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
        aria-label={active ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
        className={className}
      >
        {active ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
      </button>
      {showHint && (
        <div
          onClick={() => setShowHint(false)}
          className="fixed z-[60] left-3 right-3 top-16 sm:left-auto sm:right-4 sm:w-80 p-3 rounded-xl bg-slate-900 border border-cyan-500/50 shadow-2xl text-xs text-slate-200 leading-relaxed"
        >
          iPhone không cho trang web tự phóng to. Trên Safari, bấm <b>aA</b> ở thanh địa chỉ (cài đặt trang) hoặc nút{' '}
          <b>Chia sẻ</b>, rồi chọn <b>Ẩn thanh công cụ</b> để chơi gần toàn màn hình. Chạm vào thanh địa chỉ nhỏ ở mép
          trên để hiện lại.
        </div>
      )}
    </span>
  );
};
