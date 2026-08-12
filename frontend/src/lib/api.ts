const BASE = "";

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      const body = await res.json();
      msg = body.error || body.message || msg;
    } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T = any>(p: string) => request<T>(p),
  post: <T = any>(p: string, body?: unknown) =>
    request<T>(p, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  del: <T = any>(p: string) => request<T>(p, { method: "DELETE" }),
};

export function exportUrl(type: string, format: string, nicheId?: string) {
  const p = new URLSearchParams({ type, format });
  if (nicheId) p.set("niche_id", nicheId);
  return `${BASE}/api/export?${p.toString()}`;
}