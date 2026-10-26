import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type ResourceMeta } from './api';
import { RecordForm } from './RecordForm';
import { Card, ErrorBox } from './ui';

/** Tài nguyên chỉ có một bản ghi (luật chơi): mở thẳng form sửa, không có danh sách, không thêm hay xóa. */
export function SingletonForm({ gameKey, resource }: { gameKey: string; resource: ResourceMeta }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['single', gameKey, resource.key], queryFn: () => api<Record<string, unknown>>(`/games/${gameKey}/admin/${resource.key}`) });
  return (
    <Card className="space-y-3">
      {resource.description && <p className="text-sm text-slate-600">{resource.description}</p>}
      <ErrorBox error={q.error} />
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
