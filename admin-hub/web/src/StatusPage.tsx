import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { Badge, Card, ErrorBox, fmtUptime } from './ui';

interface Status {
  hub: { db: string };
  games: { key: string; name: string; state: 'ok' | 'unreachable' | 'error'; version?: string; uptimeSec?: number; rssMb?: number; db?: string; message?: string }[];
}

/** US-08: trạng thái các game, tự làm mới mỗi 30 giây. Chỉ xem, không có nút bật/tắt (BR29). */
export function StatusPage() {
  const q = useQuery({ queryKey: ['status'], queryFn: () => api<Status>('/games/status'), refetchInterval: 30_000 });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Trạng thái hệ thống</h1>
        <button className="text-sm text-indigo-700 hover:underline" onClick={() => q.refetch()}>Làm mới</button>
      </div>
      <ErrorBox error={q.error} />
      {q.data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Card>
            <div className="flex items-center justify-between">
              <div className="font-semibold">MySQL (hub)</div>
              <Badge tone={q.data.hub.db === 'up' ? 'green' : 'red'}>{q.data.hub.db === 'up' ? 'Đang chạy' : 'Lỗi'}</Badge>
            </div>
          </Card>
          {q.data.games.map((g) => (
            <Card key={g.key}>
              <div className="flex items-center justify-between">
                <div className="font-semibold">{g.name}</div>
                <Badge tone={g.state === 'ok' ? 'green' : 'red'}>{g.state === 'ok' ? 'Đang chạy' : g.state === 'unreachable' ? 'Không phản hồi' : 'Lỗi'}</Badge>
              </div>
              <div className="mt-2 space-y-0.5 text-sm text-slate-600">
                {g.version && <div>Phiên bản: {g.version}</div>}
                {g.uptimeSec !== undefined && <div>Đã chạy: {fmtUptime(g.uptimeSec)}</div>}
                {g.rssMb !== undefined && <div>RAM tiến trình: {g.rssMb} MB</div>}
                {g.db && <div>Database: {g.db === 'up' ? 'bình thường' : 'lỗi'}</div>}
                {g.message && <div className="text-rose-700">{g.message}</div>}
              </div>
            </Card>
          ))}
          {q.data.games.length === 0 && <Card className="text-sm text-slate-600">Chưa nối game nào. Vào "Quản lý game" để thêm.</Card>}
        </div>
      )}
    </div>
  );
}
