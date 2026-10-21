async function parseJson(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

export class SakuraApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function sakuraFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/sakura${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const data = await parseJson(res);
  if (!res.ok) {
    const message =
      (data && (data.error || data.message)) || `Sakura request failed (${res.status})`;
    throw new SakuraApiError(String(message), res.status);
  }
  return data as T;
}

export const sakuraApi = {
  session: () =>
    sakuraFetch<{ authenticated: boolean; autoLogin?: boolean; warning?: string; error?: string }>(
      "/auth/session",
    ),
  login: (phone: string, password: string) =>
    sakuraFetch<{ ok: boolean; user: unknown }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ phone, password }),
    }),
  logout: () => sakuraFetch<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  get: <T>(path: string) => sakuraFetch<T>(path),
  post: <T>(path: string, body: unknown) =>
    sakuraFetch<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    sakuraFetch<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: <T>(path: string) => sakuraFetch<T>(path, { method: "DELETE" }),
};
