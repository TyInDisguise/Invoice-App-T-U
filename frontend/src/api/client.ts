/** Minimal typed fetch wrapper.
 *
 * Auth is cookie-based (HttpOnly access_token + refresh_token set by the
 * backend). We always send `credentials: 'include'` so the browser ships
 * cookies on cross-origin dev (Vite 5173 → FastAPI 8000).
 */

export interface ApiError extends Error {
  status: number
  payload: unknown
}

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000').replace(
  /\/$/,
  '',
)

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    credentials: 'include',
    headers: body
      ? { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }
      : init?.headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    ...init,
  })

  if (res.status === 204) return undefined as T

  const text = await res.text()
  const payload = text ? JSON.parse(text) : undefined

  if (!res.ok) {
    const err = new Error(
      (payload && typeof payload === 'object' && 'detail' in payload
        ? String(payload.detail)
        : `HTTP ${res.status}`),
    ) as ApiError
    err.status = res.status
    err.payload = payload
    throw err
  }
  return payload as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
  raw: (path: string) =>
    fetch(`${BASE_URL}${path}`, { credentials: 'include' }),
}
