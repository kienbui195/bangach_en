import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api, ApiError, type ResourceMeta } from './api';
import { btn, btnPrimary, Card, ErrorBox } from './ui';

interface Report {
  dryRun: boolean;
  willCreate: number;
  willUpdate: number;
  unchanged: number;
  rejected: { row: number; field: string; message: string }[];
  ignoredColumns: string[];
  previewToken?: string;
}

/** US-05: nhập CSV/JSON. Luôn chạy thử trước; chỉ ghi khi đã xem báo cáo và xác nhận (BR18). */
export function ImportPanel({ gameKey, resource, onClose }: { gameKey: string; resource: ResourceMeta; onClose: (changed: boolean) => void }) {
  const [file, setFile] = useState<{ name: string; format: 'csv' | 'json'; content: string } | null>(null);
  const [dry, setDry] = useState<Report | null>(null);
  const [done, setDone] = useState<Report | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const base = `/games/${gameKey}/admin/${resource.key}/import`;

  const preview = useMutation({
    mutationFn: () => api<Report>(`${base}?dryRun=true`, { method: 'POST', body: { format: file!.format, content: file!.content } }),
    onSuccess: setDry,
  });
  const write = useMutation({
    mutationFn: () => api<Report>(`${base}?dryRun=false`, { method: 'POST', body: { format: file!.format, content: file!.content, previewToken: dry!.previewToken } }),
    onSuccess: setDone,
  });

  const pick = async (f: File | undefined) => {
    setDry(null);
    setDone(null);
    setReadError(null);
    preview.reset();
    write.reset();
    if (!f) return setFile(null);
    const lower = f.name.toLowerCase();
    if (!lower.endsWith('.csv') && !lower.endsWith('.json')) {
      setFile(null);
      return setReadError('Chỉ nhận file .csv hoặc .json');
    }
    setFile({ name: f.name, format: lower.endsWith('.json') ? 'json' : 'csv', content: await f.text() });
  };

  const rep = done ?? dry;
  const canWrite = !!dry && !done && dry.willCreate + dry.willUpdate > 0;

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="font-semibold">Nhập dữ liệu: {resource.label}</div>
        <button className={btn} onClick={() => onClose(!!done)}>{done ? 'Xong' : 'Đóng'}</button>
      </div>
      <p className="text-sm text-slate-600">
        File CSV hoặc JSON, tối đa 5.000 dòng và 5MB, mã hóa UTF-8. Khóa đối chiếu: <span className="font-mono">{resource.import?.matchKey}</span> (dòng trùng khóa sẽ cập nhật, không nhân đôi).
        Hệ thống luôn chạy thử trước và chỉ ghi khi bạn xác nhận.
      </p>
      <input type="file" accept=".csv,.json" onChange={(e) => pick(e.target.files?.[0])} className="block text-sm" />
      {readError && <div className="text-sm text-rose-700">{readError}</div>}
      {file && !done && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-600">{file.name}</span>
          <button className={btnPrimary} disabled={preview.isPending} onClick={() => preview.mutate()}>{preview.isPending ? 'Đang chạy thử…' : 'Chạy thử'}</button>
        </div>
      )}
      <ErrorBox error={preview.error ?? write.error} />
      {write.error instanceof ApiError && write.error.status === 422 && (
        <button className={btn} onClick={() => preview.mutate()}>Chạy thử lại</button>
      )}

      {rep && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              [done ? 'Đã thêm mới' : 'Sẽ thêm mới', rep.willCreate],
              [done ? 'Đã cập nhật' : 'Sẽ cập nhật', rep.willUpdate],
              ['Không đổi', rep.unchanged],
              ['Bị từ chối', rep.rejected.length],
            ].map(([label, n]) => (
              <div key={String(label)} className="rounded-lg border border-slate-200 p-3 text-center">
                <div className="text-2xl font-bold text-slate-900">{n}</div>
                <div className="text-xs text-slate-600">{label}</div>
              </div>
            ))}
          </div>
          {rep.ignoredColumns.length > 0 && <div className="text-xs text-slate-500">Cột không dùng (bỏ qua): {rep.ignoredColumns.join(', ')}</div>}
          {rep.rejected.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-rose-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-rose-50 text-rose-900"><tr><th className="px-3 py-1.5">Dòng</th><th className="px-3 py-1.5">Trường</th><th className="px-3 py-1.5">Lý do</th></tr></thead>
                <tbody className="divide-y divide-rose-100">
                  {rep.rejected.slice(0, 100).map((r, i) => (
                    <tr key={i}><td className="px-3 py-1.5 font-mono">{r.row}</td><td className="px-3 py-1.5">{r.field}</td><td className="px-3 py-1.5">{r.message}</td></tr>
                  ))}
                </tbody>
              </table>
              {rep.rejected.length > 100 && <div className="px-3 py-1.5 text-xs text-rose-800">… và {rep.rejected.length - 100} dòng nữa.</div>}
            </div>
          )}
          {canWrite && (
            <div className="space-y-1">
              {rep.rejected.length > 0 && <div className="text-sm text-amber-800">Các dòng bị từ chối sẽ được bỏ qua; chỉ phần hợp lệ được ghi. Muốn nhập đủ thì sửa file rồi chạy thử lại.</div>}
              <button className={btnPrimary} disabled={write.isPending} onClick={() => write.mutate()}>{write.isPending ? 'Đang ghi…' : `Ghi ${rep.willCreate + rep.willUpdate} dòng vào dữ liệu`}</button>
            </div>
          )}
          {done && <div className="text-sm text-emerald-700">Đã ghi xong, mọi thay đổi nằm trong một giao dịch.</div>}
        </div>
      )}
    </Card>
  );
}
