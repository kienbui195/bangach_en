import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type FieldMeta, type ListResult, type ResourceMeta } from './api';
import { ImportPanel } from './ImportPanel';
import { RecordForm } from './RecordForm';
import { btn, btnDanger, btnPrimary, Card, ErrorBox, input } from './ui';

type Rec = Record<string, unknown>;

function cell(f: FieldMeta, v: unknown) {
  if (v === null || v === undefined || v === '') return <span className="text-slate-300">—</span>;
  if (f.type === 'bool') return v ? 'Có' : 'Không';
  if (f.type === 'datetime') return new Date(String(v)).toLocaleString('vi-VN');
  if (f.type === 'json') return <span className="font-mono text-xs">{JSON.stringify(v).slice(0, 60)}…</span>;
  const s = String(v);
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
}

/** Máy chủ game có thể trả kèm `message` (vd. khôi phục ghi tên bản tự sao lưu); không có thì dùng câu mặc định. */
const resultMessage = (r: unknown) => {
  const m = (r as { message?: unknown } | null)?.message;
  return typeof m === 'string' && m ? m : undefined;
};

/** US-04: bảng dựng từ hợp đồng: tìm, lọc, sắp xếp, phân trang, thêm, sửa, xóa. */
export function ResourceTable({ gameKey, resource }: { gameKey: string; resource: ResourceMeta }) {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<string>('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Rec | 'new' | null>(null);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState('');

  const columns = resource.fields.filter((f) => f.list);
  const filterFields = resource.fields.filter((f) => f.filter && f.type === 'enum');
  const hasSearch = resource.fields.some((f) => f.search);

  const params = new URLSearchParams({ page: String(page), pageSize: '25' });
  if (search) params.set('q', search);
  if (sort) params.set('sort', sort);
  for (const [k, v] of Object.entries(filters)) if (v) params.set(`filter[${k}]`, v);

  const list = useQuery({
    queryKey: ['rows', gameKey, resource.key, params.toString()],
    queryFn: () => api<ListResult>(`/games/${gameKey}/admin/${resource.key}?${params}`),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['rows', gameKey, resource.key] });
  /** Thao tác như khôi phục đổi dữ liệu của mọi bảng, nên làm mới cả game. */
  const refreshAll = () => qc.invalidateQueries({ queryKey: ['rows', gameKey] });
  const remove = useMutation({
    mutationFn: (id: unknown) => api(`/games/${gameKey}/admin/${resource.key}/${String(id)}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });

  /** US-07: thao tác riêng của game trên một bản ghi (duyệt, từ chối...). */
  const act = useMutation({
    mutationFn: ({ id, name, note }: { id: unknown; name: string; note?: string; label: string }) => api(`/games/${gameKey}/admin/${resource.key}/${String(id)}/actions/${name}`, { method: 'POST', body: { note } }),
    onSuccess: (r, v) => {
      setNotice(resultMessage(r) ?? `Đã thực hiện: ${v.label}`);
      return refreshAll();
    },
  });
  /** Thao tác trên cả tài nguyên (ví dụ "Sao lưu ngay"). */
  const actAll = useMutation({
    mutationFn: ({ name }: { name: string; label: string }) => api(`/games/${gameKey}/admin/${resource.key}/actions/${name}`, { method: 'POST', body: {} }),
    onSuccess: (r, v) => {
      setNotice(resultMessage(r) ?? `Đã thực hiện: ${v.label}`);
      return refreshAll();
    },
  });
  const exportFile = useMutation({
    mutationFn: async (format: 'csv' | 'json') => {
      const p = new URLSearchParams({ format });
      if (search) p.set('q', search);
      for (const [k, v] of Object.entries(filters)) if (v) p.set(`filter[${k}]`, v);
      const out = await api<{ filename: string; content: string }>(`/games/${gameKey}/admin/${resource.key}/export?${p}`);
      const blob = new Blob([out.content], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = out.filename;
      a.click();
      URL.revokeObjectURL(a.href);
    },
  });
  const tableActions = resource.actions.filter((a) => a.target === 'resource');
  const rowActions = (row: Rec) => resource.actions.filter((a) => a.target !== 'resource' && (!a.when || String(row[a.when.field]) === a.when.equals));

  const toggleSort = (name: string) => setSort(sort === `${name}:asc` ? `${name}:desc` : `${name}:asc`);
  const pageCount = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;

  if (importing) {
    return (
      <ImportPanel
        gameKey={gameKey}
        resource={resource}
        onClose={(changed) => {
          setImporting(false);
          if (changed) refresh();
        }}
      />
    );
  }

  if (editing) {
    return (
      <Card className="space-y-3">
        <div className="font-semibold">{editing === 'new' ? `Thêm: ${resource.label}` : `Sửa: ${resource.label} #${String(editing[resource.primaryKey])}`}</div>
        <RecordForm
          gameKey={gameKey}
          resource={resource}
          record={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            refresh();
          }}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        {hasSearch && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setSearch(q);
            }}
          >
            <input className={`${input} w-56`} placeholder="Tìm…" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className={btn}>Tìm</button>
          </form>
        )}
        {filterFields.map((f) => (
          <select
            key={f.name}
            className={`${input} w-auto`}
            value={filters[f.name] ?? ''}
            onChange={(e) => {
              setPage(1);
              setFilters({ ...filters, [f.name]: e.target.value });
            }}
            aria-label={`Lọc theo ${f.label}`}
          >
            <option value="">{f.label}: tất cả</option>
            {f.enum?.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ))}
        <div className="flex-1" />
        {tableActions.map((a) => (
          <button
            key={a.name}
            className={btnPrimary}
            disabled={actAll.isPending}
            onClick={() => (!a.confirm || confirm(a.confirm)) && actAll.mutate({ name: a.name, label: a.label })}
          >
            {actAll.isPending && actAll.variables?.name === a.name ? 'Đang chạy…' : a.label}
          </button>
        ))}
        {resource.import && <button className={btn} onClick={() => setImporting(true)}>Nhập file</button>}
        {resource.allowExport !== false && (
          <>
            <button className={btn} disabled={exportFile.isPending} onClick={() => exportFile.mutate('csv')}>Xuất CSV</button>
            <button className={btn} disabled={exportFile.isPending} onClick={() => exportFile.mutate('json')}>Xuất JSON</button>
          </>
        )}
        {resource.allowCreate && <button className={btnPrimary} onClick={() => setEditing('new')}>Thêm</button>}
      </div>

      <ErrorBox error={list.error ?? remove.error ?? act.error ?? actAll.error ?? exportFile.error} />
      {notice && !(act.error || actAll.error) && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              {columns.map((f) => (
                <th key={f.name} className="px-3 py-2 font-semibold whitespace-nowrap">
                  {f.sortable || f.list ? (
                    <button onClick={() => toggleSort(f.name)} className="hover:text-indigo-700">
                      {f.label} {sort.startsWith(`${f.name}:`) ? (sort.endsWith('asc') ? '▲' : '▼') : ''}
                    </button>
                  ) : f.label}
                </th>
              ))}
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.data?.items.map((row) => (
              <tr key={String(row[resource.primaryKey])} className="hover:bg-slate-50">
                {columns.map((f) => <td key={f.name} className="px-3 py-2 align-top">{cell(f, row[f.name])}</td>)}
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {rowActions(row).map((a) => (
                    <span key={a.name}>
                      <button
                        className={btn}
                        disabled={act.isPending}
                        onClick={() => {
                          if (a.confirm && !confirm(a.confirm)) return;
                          let note: string | undefined;
                          if (a.needsNote) {
                            const n = prompt(`${a.label}: ghi chú (có thể để trống)`);
                            if (n === null) return;
                            note = n;
                          }
                          act.mutate({ id: row[resource.primaryKey], name: a.name, note, label: a.label });
                        }}
                      >
                        {a.label}
                      </button>{' '}
                    </span>
                  ))}
                  {resource.allowEdit !== false && <button className={btn} onClick={() => setEditing(row)}>Sửa</button>}{' '}
                  {resource.allowDelete && (
                    <button className={btnDanger} onClick={() => confirm('Xóa bản ghi này? Không hoàn tác được.') && remove.mutate(row[resource.primaryKey])}>Xóa</button>
                  )}
                </td>
              </tr>
            ))}
            {list.data?.items.length === 0 && (
              <tr><td colSpan={columns.length + 1} className="px-3 py-6 text-center text-slate-500">Không có bản ghi nào.</td></tr>
            )}
            {list.isLoading && <tr><td colSpan={columns.length + 1} className="px-3 py-6 text-center text-slate-500">Đang tải…</td></tr>}
          </tbody>
        </table>
      </div>

      {list.data && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <div>{list.data.total} bản ghi · trang {list.data.page}/{pageCount}</div>
          <div className="flex gap-2">
            <button className={btn} disabled={page <= 1} onClick={() => setPage(page - 1)}>Trước</button>
            <button className={btn} disabled={page >= pageCount} onClick={() => setPage(page + 1)}>Sau</button>
          </div>
        </div>
      )}
    </div>
  );
}
