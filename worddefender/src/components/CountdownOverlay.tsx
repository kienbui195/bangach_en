import React, { useEffect, useState } from 'react';

interface CountdownOverlayProps {
  from?: number;
  onDone: () => void;
}

/** Đếm ngược 3, 2, 1 rồi "Bắt đầu!" trước khi vào màn chơi. */
export const CountdownOverlay: React.FC<CountdownOverlayProps> = ({ from = 3, onDone }) => {
  const [n, setN] = useState(from);

  useEffect(() => {
    const t = setTimeout(() => (n > 0 ? setN(n - 1) : onDone()), n > 0 ? 900 : 600);
    return () => clearTimeout(t);
  }, [n, onDone]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md">
      <div
        key={n}
        className="text-8xl sm:text-9xl font-black font-display bg-gradient-to-r from-cyan-400 via-blue-500 to-fuchsia-500 bg-clip-text text-transparent animate-[countPop_0.9s_ease-out]"
      >
        {n > 0 ? n : 'Start!'}
      </div>
    </div>
  );
};
