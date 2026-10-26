import { useMutation } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api } from './api';
import { btnPrimary, Card, ErrorBox, Field, input } from './ui';

export function PasswordPage() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', again: '' });
  const [localError, setLocalError] = useState<string | null>(null);
  const change = useMutation({
    mutationFn: () => api('/auth/password', { method: 'POST', body: { currentPassword: form.currentPassword, newPassword: form.newPassword } }),
    onSuccess: () => setForm({ currentPassword: '', newPassword: '', again: '' }),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (form.newPassword !== form.again) return setLocalError('Hai lần nhập mật khẩu mới không khớp');
    change.mutate();
  };
  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-xl font-bold text-slate-900">Đổi mật khẩu</h1>
      <Card>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Mật khẩu hiện tại"><input className={input} type="password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} autoComplete="current-password" /></Field>
          <Field label="Mật khẩu mới" hint="Tối thiểu 16 ký tự, tối đa 128, nhận mọi ký tự."><input className={input} type="password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} autoComplete="new-password" /></Field>
          <Field label="Nhập lại mật khẩu mới"><input className={input} type="password" value={form.again} onChange={(e) => setForm({ ...form, again: e.target.value })} autoComplete="new-password" /></Field>
          <ErrorBox error={localError ?? change.error} />
          {change.isSuccess && <div className="text-sm text-emerald-700">Đã đổi mật khẩu. Các phiên đăng nhập khác đã bị hủy.</div>}
          <button className={btnPrimary} disabled={change.isPending}>Đổi mật khẩu</button>
        </form>
      </Card>
    </div>
  );
}
