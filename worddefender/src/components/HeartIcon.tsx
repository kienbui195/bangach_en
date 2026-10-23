import React, { useId } from 'react';

interface HeartIconProps {
  fill: number; // 0 (rỗng) đến 1 (đầy); 0.5 là nửa tim
  className?: string;
}

// Trái tim vẽ bằng SVG thuần (vector, nét sắc ở mọi mức phóng to); nửa tim cắt bằng clipPath theo chiều ngang
const HEART_PATH =
  'M16 28.2C15.5 28.2 15 28 14.6 27.6C8.2 21.8 3.2 17.4 3.2 11.6C3.2 7.2 6.5 4 10.4 4C12.7 4 14.8 5.1 16 6.9C17.2 5.1 19.3 4 21.6 4C25.5 4 28.8 7.2 28.8 11.6C28.8 17.4 23.8 21.8 17.4 27.6C17 28 16.5 28.2 16 28.2Z';

export const HeartIcon: React.FC<HeartIconProps> = ({ fill, className }) => {
  const clipId = useId();
  const f = Math.max(0, Math.min(1, fill));
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          <rect x="0" y="0" width={32 * f} height="32" />
        </clipPath>
      </defs>
      <path d={HEART_PATH} fill="#cbd5e1" fillOpacity="0.35" stroke="#94a3b8" strokeOpacity="0.6" strokeWidth="1.6" strokeLinejoin="round" />
      {f > 0 && (
        <g clipPath={`url(#${clipId})`}>
          <path d={HEART_PATH} fill="#f43f5e" stroke="#e11d48" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M9.5 9.2C10.4 7.9 11.9 7.4 13 8" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.8" strokeLinecap="round" fill="none" />
        </g>
      )}
    </svg>
  );
};
