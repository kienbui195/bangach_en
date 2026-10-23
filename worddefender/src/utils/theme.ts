import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'wd_theme';
const listeners = new Set<() => void>();

const readStored = (): Theme => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
};

let current: Theme = readStored();

const apply = (theme: Theme) => {
  document.documentElement.classList.toggle('light', theme === 'light');
};

apply(current);

export const toggleTheme = () => {
  current = current === 'light' ? 'dark' : 'light';
  apply(current);
  try {
    localStorage.setItem(STORAGE_KEY, current);
  } catch {
    // bỏ qua nếu storage bị chặn
  }
  listeners.forEach((l) => l());
};

export const useTheme = (): Theme =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current
  );
