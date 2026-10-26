import { useQuery } from '@tanstack/react-query';
import { NavLink, useParams } from 'react-router';
import { api, type GameMeta, SUPPORTED_CONTRACTS } from './api';
import { ResourceTable } from './ResourceTable';
import { SingletonForm } from './SingletonForm';
import { ErrorBox } from './ui';

/** Trang một game: menu bảng và bảng đầu tiên dựng hoàn toàn từ hợp đồng của game (E4: sai phiên bản thì không dựng). */
export function GamePage() {
  const { key = '', resource } = useParams();
  const meta = useQuery({ queryKey: ['meta', key], queryFn: () => api<GameMeta>(`/games/${key}/admin/meta`) });

  if (meta.isLoading) return <div className="text-slate-500">Đang đọc hợp đồng của game…</div>;
  if (meta.error) return <ErrorBox error={meta.error} />;
  const m = meta.data!;
  if (!SUPPORTED_CONTRACTS.includes(m.contractVersion)) {
    return (
      <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Game dùng hợp đồng phiên bản {m.contractVersion}, dashboard chỉ hỗ trợ {SUPPORTED_CONTRACTS.join(', ')}. Không dựng được bảng.
      </div>
    );
  }
  const current = m.resources.find((r) => r.key === resource) ?? m.resources[0];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{m.game.name}</h1>
        <div className="text-xs text-slate-500">Phiên bản {m.game.version} · hợp đồng v{m.contractVersion}</div>
      </div>
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {m.resources.map((r) => (
          <NavLink
            key={r.key}
            to={`/g/${key}/${r.key}`}
            className={({ isActive }) => `-mb-px border-b-2 px-3 py-2 text-sm ${isActive || (!resource && r === m.resources[0]) ? 'border-indigo-600 font-semibold text-indigo-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
          >
            {r.label}
          </NavLink>
        ))}
      </div>
      {current && (current.kind === 'singleton' ? <SingletonForm key={current.key} gameKey={key} resource={current} /> : <ResourceTable key={current.key} gameKey={key} resource={current} />)}
    </div>
  );
}
