import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api, ApiError } from './api';
import { btnPrimary, Card, ErrorBox, Field, input } from './ui';

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md space-y-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-indigo-600">chungcake69 · Hub quản trị</div>
          <h1 className="mt-1 text-xl font-bold text-slate-900">{title}</h1>
        </div>
        {children}
      </Card>
    </div>
  );
}

/** Đăng nhập hai bước: mật khẩu, rồi mã 6 số từ Google Authenticator. */
export function LoginPage() {
  const qc = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');

  const step1 = useMutation({
    mutationFn: () => api<{ challenge: string }>('/auth/login', { method: 'POST', body: { username, password } }),
    onSuccess: (r) => {
      setChallenge(r.challenge);
      setPassword('');
    },
  });
  const step2 = useMutation({
    mutationFn: () => api('/auth/totp', { method: 'POST', body: { challenge, code } }),
    onSuccess: () => qc.invalidateQueries(),
    onError: (e) => {
      if (e instanceof ApiError && e.status === 401 && /đăng nhập/i.test(e.message)) setChallenge(null);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    (challenge ? step2 : step1).mutate();
  };

  return (
    <Shell title={challenge ? 'Nhập mã Google Authenticator' : 'Đăng nhập'}>
      <form onSubmit={submit} className="space-y-3">
        {!challenge ? (
          <>
            <Field label="Tên đăng nhập">
              <input className={input} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus />
            </Field>
            <Field label="Mật khẩu">
              <input className={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </Field>
          </>
        ) : (
          <Field label="Mã 6 số trong ứng dụng" hint="Mã đổi mỗi 30 giây, mỗi mã chỉ dùng một lần.">
            <input className={input} inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoComplete="one-time-code" autoFocus />
          </Field>
        )}
        <ErrorBox error={step1.error ?? step2.error} />
        <button className={btnPrimary} disabled={step1.isPending || step2.isPending}>
          {challenge ? 'Xác nhận' : 'Tiếp tục'}
        </button>
      </form>
    </Shell>
  );
}

/** Thiết lập lần đầu: chỉ hiện khi chưa có tài khoản nào hoạt động. */
export function SetupPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ setupToken: '', username: '', password: '', again: '' });
  const [qr, setQr] = useState<{ qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const begin = useMutation({
    mutationFn: () => api<{ qr: string; secret: string }>('/setup/begin', { method: 'POST', body: { setupToken: form.setupToken, username: form.username, password: form.password } }),
    onSuccess: setQr,
  });
  const confirm = useMutation({
    mutationFn: () => api('/setup/confirm', { method: 'POST', body: { username: form.username, code } }),
    onSuccess: () => qc.invalidateQueries(),
  });

  const onBegin = (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (form.password !== form.again) return setLocalError('Hai lần nhập mật khẩu không khớp');
    begin.mutate();
  };

  if (qr) {
    return (
      <Shell title="Quét mã QR bằng Google Authenticator">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            confirm.mutate();
          }}
        >
          <img src={qr.qr} alt="Mã QR Google Authenticator" className="mx-auto h-48 w-48" />
          <p className="text-center text-xs text-slate-500">
            Không quét được? Nhập tay khóa: <span className="font-mono select-all">{qr.secret}</span>
          </p>
          <Field label="Mã 6 số hiện trong ứng dụng" hint="Tài khoản chỉ được kích hoạt sau khi nhập đúng mã đầu tiên.">
            <input className={input} inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />
          </Field>
          <ErrorBox error={confirm.error} />
          <button className={btnPrimary} disabled={confirm.isPending}>Kích hoạt tài khoản</button>
        </form>
      </Shell>
    );
  }

  return (
    <Shell title="Tạo tài khoản admin">
      <p className="text-sm text-slate-600">
        Chưa có tài khoản nào. Mã thiết lập nằm trong file <span className="font-mono">hub.setup-token</span> trên VPS (thư mục bí mật). Trang này tự đóng vĩnh viễn sau khi tạo xong.
      </p>
      <form onSubmit={onBegin} className="space-y-3">
        <Field label="Mã thiết lập">
          <input className={input} value={form.setupToken} onChange={(e) => setForm({ ...form, setupToken: e.target.value })} autoComplete="off" autoFocus />
        </Field>
        <Field label="Tên đăng nhập" hint="3 đến 64 ký tự: chữ, số, dấu chấm, gạch dưới, gạch ngang.">
          <input className={input} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="username" />
        </Field>
        <Field label="Mật khẩu" hint="Tối thiểu 16 ký tự, nhận mọi ký tự. Nên dùng mật khẩu do Bitwarden sinh.">
          <input className={input} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
        </Field>
        <Field label="Nhập lại mật khẩu">
          <input className={input} type="password" value={form.again} onChange={(e) => setForm({ ...form, again: e.target.value })} autoComplete="new-password" />
        </Field>
        <ErrorBox error={localError ?? begin.error} />
        <button className={btnPrimary} disabled={begin.isPending}>Tiếp tục</button>
      </form>
    </Shell>
  );
}
