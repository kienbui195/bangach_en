import { useMutation } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api, ApiError, type FieldMeta, type ResourceMeta } from './api';
import { btn, btnPrimary, ErrorBox, Field, input } from './ui';

type Rec = Record<string, unknown>;

const toInput = (f: FieldMeta, v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (f.type === 'json') return JSON.stringify(v, null, 2);
  return String(v);
};

/** Chuyển giá trị trên form về kiểu theo hợp đồng. Chuỗi rỗng nghĩa là để trống. */
function toValue(f: FieldMeta, s: string): { ok: true; value: unknown } | { ok: false; message: string } {
  if (s === '') return { ok: true, value: null };
  switch (f.type) {
    case 'int':
    case 'decimal': {
      const n = Number(s);
      return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, message: 'Phải là số' };
    }
    case 'bool':
      return { ok: true, value: s === 'true' };
    case 'json':
      try {
        return { ok: true, value: JSON.parse(s) };
      } catch {
        return { ok: false, message: 'JSON không hợp lệ' };
      }
    default:
      return { ok: true, value: s };
  }
}

/** Form dựng từ danh sách trường của hợp đồng. Chỉ gửi trường đã đổi khi sửa, kèm `updatedAt` để kiểm xung đột. */
export function RecordForm({ gameKey, resource, record, onDone, onCancel }: { gameKey: string; resource: ResourceMeta; record: Rec | null; onDone: () => void; onCancel: () => void }) {
  const editing = record !== null;
  const fields = resource.fields.filter((f) => !f.readonly);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.name, toInput(f, record?.[f.name])])));
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: () => {
      const body: Rec = {};
      const errs: Record<string, string> = {};
      for (const f of fields) {
        const original = toInput(f, record?.[f.name]);
        if (editing && values[f.name] === original) continue;
        const r = toValue(f, values[f.name]);
        if (!r.ok) errs[f.name] = r.message;
        else if (!(r.value === null && !editing)) body[f.name] = r.value;
      }
      if (Object.keys(errs).length > 0) {
        setLocalErrors(errs);
        return Promise.reject(new Error('Có trường nhập sai, xem thông báo cạnh từng trường'));
      }
      setLocalErrors({});
      if (editing) body.updatedAt = record.updatedAt;
      const base = `/games/${gameKey}/admin/${resource.key}`;
      return editing ? api(`${base}${resource.kind === 'singleton' ? '' : `/${String(record[resource.primaryKey])}`}`, { method: 'PUT', body }) : api(base, { method: 'POST', body });
    },
    onSuccess: onDone,
  });

  // Lỗi của game theo từng trường; khóa lồng nhau (ví dụ rules.hearts.khongCo) hiện kèm đường dẫn ở trường cha.
  const serverErrors: Record<string, string> = {};
  if (save.error instanceof ApiError) {
    for (const f of fields) {
      const own = save.error.fields.filter((e) => e.name === f.name || e.name.startsWith(`${f.name}.`));
      if (own.length > 0) serverErrors[f.name] = own.map((e) => (e.name === f.name ? e.message : `${e.name}: ${e.message}`)).join('; ');
    }
  }
  const conflict = save.error instanceof ApiError && save.error.status === 409;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {fields.map((f) => {
          const err = localErrors[f.name] ?? serverErrors[f.name];
          const common = { value: values[f.name], onChange: (e: React.ChangeEvent<any>) => setValues({ ...values, [f.name]: e.target.value }) };
          const label = f.label + (f.required ? ' *' : '');
          let control;
          if (f.type === 'text' || f.type === 'json') control = <textarea className={`${input} font-mono`} rows={f.type === 'json' ? 6 : 3} {...common} />;
          else if (f.type === 'enum')
            control = (
              <select className={input} {...common}>
                <option value="">{f.required ? '— chọn —' : '(để trống)'}</option>
                {f.enum?.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            );
          else if (f.type === 'bool')
            control = (
              <select className={input} {...common}>
                <option value="">(để trống)</option>
                <option value="true">Có</option>
                <option value="false">Không</option>
              </select>
            );
          else control = <input className={input} type={f.type === 'int' || f.type === 'decimal' ? 'number' : 'text'} step={f.type === 'decimal' ? 'any' : undefined} maxLength={f.maxLength} {...common} />;
          return (
            <div key={f.name} className={f.type === 'text' || f.type === 'json' ? 'md:col-span-2' : ''}>
              <Field label={label} error={err} hint={f.hint}>{control}</Field>
            </div>
          );
        })}
      </div>
      {conflict && <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">{save.error?.message} Bấm "Hủy" rồi mở lại bản ghi để lấy bản mới nhất.</div>}
      {!conflict && <ErrorBox error={save.error} />}
      <div className="flex gap-2">
        <button className={btnPrimary} disabled={save.isPending}>{save.isPending ? 'Đang lưu…' : 'Lưu'}</button>
        <button type="button" className={btn} onClick={onCancel}>Hủy</button>
      </div>
    </form>
  );
}
