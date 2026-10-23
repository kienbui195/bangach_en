import React, { useState } from 'react';
import { AlertTriangle, Check, Upload, X } from 'lucide-react';
import { WordItem } from '../types/game';
import { REPORT_FIELD_LABELS, ReportField, currentValueOf, sendWordReport } from '../utils/wordReport';

interface ReportWordModalProps {
  word: WordItem;
  onClose: () => void;
}

const FIELDS = Object.keys(REPORT_FIELD_LABELS) as ReportField[];

/** Báo từ sai và đề xuất sửa. Đề xuất vào hàng chờ, admin duyệt thì nội dung mới đổi. */
export const ReportWordModal: React.FC<ReportWordModalProps> = ({ word, onClose }) => {
  const [field, setField] = useState<ReportField>('meaningVi');
  const [suggested, setSuggested] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState('');

  const isAudio = field === 'audio';

  const submit = async () => {
    setError('');
    setState('sending');
    try {
      await sendWordReport({ word, field, suggestedValue: suggested, audioFile: file, note });
      setState('done');
      setTimeout(onClose, 1600);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Có lỗi xảy ra');
      setState('idle');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border-2 border-slate-700/80 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="flex items-start gap-3 p-4 border-b border-slate-800">
          <div className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center bg-amber-500/15 text-amber-300 border border-amber-400/30">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-black text-slate-100 leading-tight">Báo từ này bị sai</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              <span className="font-bold text-slate-200 capitalize">{word.word}</span> · {word.meaning}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {state === 'done' ? (
          <div className="p-8 flex flex-col items-center gap-2 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-500/15 text-emerald-300 flex items-center justify-center">
              <Check className="w-6 h-6" />
            </div>
            <p className="font-bold text-slate-100">Đã gửi, cảm ơn bạn!</p>
            <p className="text-xs text-slate-400">Đề xuất sẽ được xem lại trước khi áp dụng.</p>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            <div>
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wide">Sai ở đâu</label>
              <select
                value={field}
                onChange={(e) => {
                  setField(e.target.value as ReportField);
                  setSuggested('');
                  setFile(null);
                }}
                className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-100 cursor-pointer"
              >
                {FIELDS.map((f) => (
                  <option key={f} value={f}>
                    {REPORT_FIELD_LABELS[f]}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-xl bg-slate-950/60 border border-slate-800 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-500 font-bold">Hiện tại</div>
              <div className="text-sm text-slate-300 break-words">{currentValueOf(word, field) || '(trống)'}</div>
            </div>

            {isAudio ? (
              <div>
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wide">File đọc đề xuất</label>
                <label className="mt-1 flex items-center gap-2 rounded-xl border border-dashed border-slate-700 px-3 py-3 text-sm text-slate-300 hover:border-cyan-400/60 cursor-pointer transition-colors">
                  <Upload className="w-4 h-4 text-cyan-300 shrink-0" />
                  <span className="truncate">{file ? file.name : 'Chọn file âm thanh (tối đa 2MB)'}</span>
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
            ) : (
              <div>
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wide">Sửa thành</label>
                <input
                  value={suggested}
                  onChange={(e) => setSuggested(e.target.value)}
                  placeholder="Nhập nội dung đúng"
                  className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600"
                />
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wide">Ghi chú (không bắt buộc)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="Giải thích thêm nếu cần"
                className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 resize-none"
              />
            </div>

            {error && <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-slate-700 text-slate-300 font-bold text-sm hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button
                onClick={submit}
                disabled={state === 'sending'}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-sm hover:brightness-110 disabled:opacity-50 transition-all cursor-pointer"
              >
                {state === 'sending' ? 'Đang gửi…' : 'Gửi đề xuất'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
