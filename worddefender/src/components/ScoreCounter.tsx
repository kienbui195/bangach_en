import React, { useEffect, useRef, useState } from 'react';

export interface ScoreGain {
  id: number;
  amount: number;
}

interface ScoreCounterProps {
  score: number;
  gain: ScoreGain | null;
}

export const ScoreCounter: React.FC<ScoreCounterProps> = ({ score, gain }) => {
  const [display, setDisplay] = useState(score);
  const fromRef = useRef(score);

  // Số điểm hiển thị chạy dần lên điểm mới thay vì nhảy đột ngột
  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    const duration = 600;
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const value = Math.round(from + (score - from) * (1 - Math.pow(1 - p, 3)));
      fromRef.current = value;
      setDisplay(value);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [score]);

  return (
    <div className="relative pl-3 ml-1 border-l border-slate-700">
      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 leading-none">Điểm</div>
      <span
        key={gain ? `n${gain.id}` : 'idle'}
        className={`inline-block origin-left font-black font-mono text-xl sm:text-2xl leading-tight bg-gradient-to-r from-amber-400 via-rose-500 to-fuchsia-500 bg-clip-text text-transparent ${
          gain ? 'animate-scorePop' : ''
        }`}
      >
        {display.toLocaleString('vi-VN')}
      </span>
      {gain && (
        <span
          key={`g${gain.id}`}
          className="absolute left-full ml-2 top-3 text-sm sm:text-base font-black text-emerald-500 whitespace-nowrap animate-scoreFloat pointer-events-none"
        >
          +{gain.amount.toLocaleString('vi-VN')}
        </span>
      )}
    </div>
  );
};
