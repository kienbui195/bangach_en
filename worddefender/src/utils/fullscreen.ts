type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };

const doc = () => document as FsDoc;

/** Safari iPhone không cho phóng to trang web; iPad, Android và máy tính thì có. */
export const isFullscreenSupported = () =>
  typeof document !== 'undefined' &&
  !!(document.documentElement.requestFullscreen || (document.documentElement as FsEl).webkitRequestFullscreen);

/** Đang chạy như ứng dụng đã thêm vào màn hình chính (không có thanh trình duyệt). */
export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const isFullscreenActive = () => !!(document.fullscreenElement || doc().webkitFullscreenElement);

export const toggleFullscreen = async () => {
  const el = document.documentElement as FsEl;
  try {
    if (isFullscreenActive()) {
      await (document.exitFullscreen?.() ?? doc().webkitExitFullscreen?.());
    } else {
      await (el.requestFullscreen?.({ navigationUI: 'hide' }) ?? el.webkitRequestFullscreen?.());
    }
  } catch {
    /* trình duyệt từ chối: bỏ qua */
  }
};
