import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NavLink, Navigate, Outlet, Route, Routes } from 'react-router';
import { api, ApiError } from './api';
import { LoginPage, SetupPage } from './AuthPages';
import { GamePage } from './GamePage';
import { GamesPage } from './GamesPage';
import { PasswordPage } from './PasswordPage';
import { StatusPage } from './StatusPage';

const link = ({ isActive }: { isActive: boolean }) => `block rounded-md px-3 py-2 text-sm ${isActive ? 'bg-indigo-50 font-semibold text-indigo-700' : 'text-slate-700 hover:bg-slate-50'}`;

function Layout({ username }: { username: string }) {
  const qc = useQueryClient();
  const games = useQuery({ queryKey: ['games'], queryFn: () => api<{ key: string; name: string }[]>('/games') });
  const logout = useMutation({ mutationFn: () => api('/auth/logout', { method: 'POST' }), onSuccess: () => { qc.clear(); window.location.assign('/'); } });
  return (
    <div className="flex min-h-screen">
      <aside className="fixed hidden h-screen w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-4 md:block">
        <div className="mb-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-indigo-600">chungcake69</div>
          <div className="text-lg font-bold text-slate-900">Hub quản trị</div>
        </div>
        <nav className="space-y-1">
          <NavLink to="/" end className={link}>Trạng thái</NavLink>
          <div className="px-3 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Game</div>
          {games.data?.map((g) => <NavLink key={g.key} to={`/g/${g.key}`} className={link}>{g.name}</NavLink>)}
          <NavLink to="/games" className={link}>Quản lý game</NavLink>
          <div className="px-3 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Tài khoản</div>
          <NavLink to="/password" className={link}>Đổi mật khẩu</NavLink>
        </nav>
        <div className="mt-6 border-t border-slate-200 pt-3 text-sm text-slate-600">
          <div className="mb-2">Đăng nhập: <strong>{username}</strong></div>
          <button className="text-indigo-700 hover:underline" onClick={() => logout.mutate()}>Đăng xuất</button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-6 md:ml-64 md:p-10">
        <Outlet />
      </main>
    </div>
  );
}

/** Cổng vào: chưa có tài khoản thì trang thiết lập; chưa đăng nhập thì trang đăng nhập; còn lại là dashboard. */
export function App() {
  const status = useQuery({ queryKey: ['auth-status'], queryFn: () => api<{ needsSetup: boolean }>('/auth/status') });
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ username: string }>('/auth/me'),
    enabled: status.data?.needsSetup === false,
  });

  if (status.isLoading) return <div className="p-10 text-slate-500">Đang tải…</div>;
  if (status.error) return <div className="p-10 text-rose-700">Không nối được máy chủ dashboard.</div>;
  if (status.data?.needsSetup) return <SetupPage />;
  if (me.isLoading) return <div className="p-10 text-slate-500">Đang tải…</div>;
  if (me.error instanceof ApiError && me.error.status === 401) return <LoginPage />;
  if (!me.data) return <div className="p-10 text-rose-700">Không kiểm tra được phiên đăng nhập.</div>;

  return (
    <Routes>
      <Route element={<Layout username={me.data.username} />}>
        <Route index element={<StatusPage />} />
        <Route path="games" element={<GamesPage />} />
        <Route path="g/:key/:resource?" element={<GamePage />} />
        <Route path="password" element={<PasswordPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
