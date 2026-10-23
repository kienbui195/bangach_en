import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme, toggleTheme } from '../utils/theme';

export const ThemeToggle: React.FC = () => {
  const theme = useTheme();
  return (
    <button
      onClick={toggleTheme}
      title={theme === 'light' ? 'Chuyển sang giao diện tối' : 'Chuyển sang giao diện sáng'}
      className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors cursor-pointer"
    >
      {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-amber-300" />}
    </button>
  );
};
