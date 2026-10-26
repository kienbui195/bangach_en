export interface FieldError {
  name: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public fields: FieldError[] = [],
  ) {
    super(message);
  }
}

/** Mọi lệnh đi qua /api của hub. Lệnh ghi luôn gửi JSON (hub kiểm Origin và kiểu nội dung). */
export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: method === 'GET' ? undefined : { 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(opts.body ?? {}),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const e = data?.error;
    const message = e?.message ?? (Array.isArray(data?.message) ? data.message.join(', ') : data?.message) ?? `Lỗi ${res.status}`;
    throw new ApiError(res.status, message, e?.code, e?.fields ?? []);
  }
  return data as T;
}

export interface FieldMeta {
  name: string;
  label: string;
  type: 'string' | 'text' | 'int' | 'decimal' | 'bool' | 'enum' | 'datetime' | 'json' | 'file';
  required?: boolean;
  unique?: boolean;
  readonly?: boolean;
  list?: boolean;
  filter?: boolean;
  search?: boolean;
  sortable?: boolean;
  maxLength?: number;
  enum?: string[];
  hint?: string;
}

export interface ActionMeta {
  name: string;
  label: string;
  when?: { field: string; equals: string };
  needsNote?: boolean;
}

export interface ResourceMeta {
  key: string;
  label: string;
  kind: 'collection' | 'singleton';
  primaryKey: string;
  fields: FieldMeta[];
  allowCreate: boolean;
  allowDelete: boolean;
  actions: ActionMeta[];
  import?: { formats: string[]; matchKey: string };
  description?: string;
}

export interface GameMeta {
  game: { key: string; name: string; version: string };
  contractVersion: number;
  resources: ResourceMeta[];
}

export interface ListResult {
  items: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
}

export const SUPPORTED_CONTRACTS = [1];
