import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type ResourceMeta } from './api';
import { RecordForm } from './RecordForm';
import { btn, Card, ErrorBox, input } from './ui';

/** Tài nguyên chỉ có một bản ghi (luật chơi): mở thẳng form sửa, không có danh sách, không thêm hay xóa. */
export function SingletonForm({ gameKey, resource }: { gameKey: string; resource: ResourceMeta }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['single', gameKey, resource.key], queryFn: () => api<Record<string, unknown>>(`/games/${gameKey}/admin/${resource.key}`) });
  const [option, setOption] = useState<Record<string, string>>({});
  const act = useMutation({
    mutationFn: (name: string) => api(`/games/${gameKey}/admin/${resource.key}/actions/${name}`, { method: 'POST', body: { updatedAt: q.data?.updatedAt, option: option[name] ?? '' } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['single', gameKey, resource.key] }),
  });
  const actions = resource.actions.filter((a) => a.target === 'resource');
  return (
    <Card className="space-y-3">
      {resource.description && <p className="text-sm text-slate-600">{resource.description}</p>}
      {actions.map((a) => (
        <div key={a.name} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <span className="text-sm font-medium text-slate-700">{a.label}:</span>
          {a.options && (
            <select className={`${input} w-auto`} value={option[a.name] ?? ''} onChange={(e) => setOption({ ...option, [a.name]: e.target.value })}>
              {a.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
          <button className={btn} disabled={act.isPending || !q.data} onClick={() => confirm(`${a.label}? Giá trị đang chỉnh ở nhóm đã chọn sẽ mất.`) && act.mutate(a.name)}>
            {a.label}
          </button>
        </div>
      ))}
      <ErrorBox error={q.error ?? act.error} />
      {q.data && (
        <RecordForm
          key={String(q.data.updatedAt)}
          gameKey={gameKey}
          resource={resource}
          record={q.data}
          onCancel={() => q.refetch()}
          onDone={() => qc.invalidateQueries({ queryKey: ['single', gameKey, resource.key] })}
        />
      )}
    </Card>
  );
}
