import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api } from './api';
import { btn, btnDanger, btnPrimary, Card, ErrorBox, Field, input } from './ui';

interface GameRow {
  key: string;
  name: string;
  baseUrl: string;
  contractVersion: number | null;
}

/** US-09: nối game mới bằng địa chỉ trong mạng Docker và token dịch vụ; đổi token; gỡ game. */
export function GamesPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['games'], queryFn: () => api<GameRow[]>('/games') });
  const [form, setForm] = useState({ gameKey: '', name: '', baseUrl: 'http://', token: '' });
  const [rotating, setRotating] = useState<string | null>(null);
  const [newToken, setNewToken] = useState('');

  const refresh = () => qc.invalidateQueries({ queryKey: ['games'] });
  const add = useMutation({
    mutationFn: () => api('/games', { method: 'POST', body: form }),
    onSuccess: () => {
      setForm({ gameKey: '', name: '', baseUrl: 'http://', token: '' });
      refresh();
    },
  });
  const rotate = useMutation({
    mutationFn: (key: string) => api(`/games/${key}/token`, { method: 'PUT', body: { token: newToken } }),
    onSuccess: () => {
      setRotating(null);
      setNewToken('');
      refresh();
    },
  });
  const remove = useMutation({ mutationFn: (key: string) => api(`/games/${key}`, { method: 'DELETE' }), onSuccess: refresh });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    add.mutate();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Quản lý game</h1>
      <Card className="space-y-3">
        <div className="font-semibold">Nối game mới</div>
        <form onSubmit={submit} className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Khóa game" hint="Chữ thường, số, gạch ngang. Ví dụ: worddefender">
            <input className={input} value={form.gameKey} onChange={(e) => setForm({ ...form, gameKey: e.target.value })} />
          </Field>
          <Field label="Tên hiển thị">
            <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Địa chỉ trong mạng Docker" hint="Ví dụ: http://worddefender-api:3000 (không có đường dẫn)">
            <input className={input} value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} />
          </Field>
          <Field label="Token dịch vụ" hint="Tối thiểu 32 ký tự. Lưu mã hóa, không hiện lại.">
            <input className={input} type="password" value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} autoComplete="off" />
          </Field>
          <div className="md:col-span-2 space-y-2">
            <ErrorBox error={add.error} />
            <button className={btnPrimary} disabled={add.isPending}>{add.isPending ? 'Đang kiểm tra hợp đồng…' : 'Nối game'}</button>
          </div>
        </form>
      </Card>

      <Card className="space-y-3">
        <div className="font-semibold">Game đã nối</div>
        <ErrorBox error={list.error ?? remove.error} />
        {list.data?.length === 0 && <div className="text-sm text-slate-600">Chưa có game nào.</div>}
        {list.data?.map((g) => (
          <div key={g.key} className="rounded-lg border border-slate-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-medium">{g.name} <span className="font-mono text-xs text-slate-500">{g.key}</span></div>
                <div className="text-xs text-slate-500">{g.baseUrl} · hợp đồng v{g.contractVersion}</div>
              </div>
              <div className="flex gap-2">
                <button className={btn} onClick={() => setRotating(rotating === g.key ? null : g.key)}>Đổi token</button>
                <button className={btnDanger} onClick={() => confirm(`Gỡ "${g.name}" khỏi dashboard? Dữ liệu của game không bị xóa.`) && remove.mutate(g.key)}>Gỡ</button>
              </div>
            </div>
            {rotating === g.key && (
              <form
                className="mt-3 flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  rotate.mutate(g.key);
                }}
              >
                <div className="min-w-64 flex-1">
                  <Field label="Token mới">
                    <input className={input} type="password" value={newToken} onChange={(e) => setNewToken(e.target.value)} autoComplete="off" />
                  </Field>
                </div>
                <button className={btnPrimary} disabled={rotate.isPending}>Lưu</button>
              </form>
            )}
            {rotating === g.key && <div className="mt-2"><ErrorBox error={rotate.error} /></div>}
          </div>
        ))}
      </Card>
    </div>
  );
}
