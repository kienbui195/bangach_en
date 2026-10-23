import { WordItem } from '../types/game';

/**
 * Gửi báo lỗi một từ lên CMS. Người chơi chỉ tạo được bản ghi chờ duyệt (collection
 * word-report); nội dung thật chỉ đổi khi admin duyệt trong dashboard, lúc đó lifecycle
 * bên CMS mới ghi đè vào từ vựng.
 */
const CMS_URL = ((import.meta.env.VITE_CMS_URL as string | undefined) ?? '').replace(/\/$/, '');
const KEY_REPORTER = 'wd_reporter_key';
const MAX_AUDIO_BYTES = 2 * 1024 * 1024; // khớp sizeLimit của CMS

export type ReportField = 'headword' | 'displayForm' | 'meaningVi' | 'phonetic' | 'example' | 'audio';

export const REPORT_FIELD_LABELS: Record<ReportField, string> = {
  headword: 'Từ tiếng Anh viết sai',
  displayForm: 'Cách hiển thị của từ',
  meaningVi: 'Nghĩa tiếng Việt sai',
  phonetic: 'Phiên âm sai',
  example: 'Câu ví dụ sai',
  audio: 'Phát âm sai (gửi file đọc)',
};

export const canReport = () => Boolean(CMS_URL);

/** Khóa ẩn danh để nhận ra các báo lỗi của cùng một người; chưa có tài khoản nên lưu máy. */
const reporterKey = (): string => {
  try {
    const saved = localStorage.getItem(KEY_REPORTER);
    if (saved) return saved;
    const key = `guest_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
    localStorage.setItem(KEY_REPORTER, key);
    return key;
  } catch {
    return 'guest';
  }
};

/** Giá trị hiện tại của trường đang báo, để admin đối chiếu mà không phải mở lại từ vựng. */
export const currentValueOf = (word: WordItem, field: ReportField): string => {
  switch (field) {
    case 'headword':
    case 'displayForm':
      return word.word;
    case 'meaningVi':
      return word.meaning;
    case 'phonetic':
      return word.phonetic;
    case 'example':
      return word.example ?? '';
    case 'audio':
      return '(giọng đọc do máy tổng hợp)';
  }
};

const uploadAudio = async (file: File): Promise<number> => {
  if (!file.type.startsWith('audio/')) throw new Error('Chỉ nhận file âm thanh.');
  if (file.size > MAX_AUDIO_BYTES) throw new Error('File quá 2MB, hãy thu ngắn lại.');
  const form = new FormData();
  form.append('files', file);
  const res = await fetch(`${CMS_URL}/api/upload`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Tải file lên thất bại (HTTP ${res.status})`);
  const uploaded = await res.json();
  const id = Array.isArray(uploaded) ? uploaded[0]?.id : uploaded?.id;
  if (!id) throw new Error('Tải file lên thất bại: máy chủ không trả về file.');
  return id;
};

export interface ReportInput {
  word: WordItem;
  field: ReportField;
  suggestedValue?: string;
  audioFile?: File | null;
  note?: string;
}

export const sendWordReport = async ({ word, field, suggestedValue, audioFile, note }: ReportInput) => {
  if (!CMS_URL) throw new Error('Chưa cấu hình máy chủ nội dung nên không gửi được.');
  if (field === 'audio' && !audioFile) throw new Error('Hãy chọn file âm thanh trước khi gửi.');
  if (field !== 'audio' && !suggestedValue?.trim()) throw new Error('Hãy nhập nội dung đề xuất.');

  const data: Record<string, unknown> = {
    headword: word.id.toLowerCase(),
    field,
    currentValue: currentValueOf(word, field),
    suggestedValue: field === 'audio' ? null : suggestedValue?.trim(),
    note: note?.trim() || null,
    reporterKey: reporterKey(),
  };
  if (audioFile) data.suggestedAudio = await uploadAudio(audioFile);

  const res = await fetch(`${CMS_URL}/api/word-reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gửi thất bại (HTTP ${res.status}). ${body.slice(0, 120)}`);
  }
};
