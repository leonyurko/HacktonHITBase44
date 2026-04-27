import { getAccessToken } from './auth';

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) || 'http://localhost:8000';

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers: { ...(await authHeaders()) },
  });
  if (!r.ok) throw new ApiError(r.status, `GET ${path} failed`, await r.json().catch(() => null));
  return r.json();
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new ApiError(r.status, `POST ${path} failed`, await r.json().catch(() => null));
  return r.json();
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new ApiError(r.status, `PATCH ${path} failed`, await r.json().catch(() => null));
  return r.json();
}

export async function apiDelete<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new ApiError(r.status, `DELETE ${path} failed`, await r.json().catch(() => null));
  return r.json();
}

export async function apiUpload<T>(
  path: string,
  formData: FormData,
): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { ...(await authHeaders()) },
    body: formData,
  });
  if (!r.ok) throw new ApiError(r.status, `POST ${path} failed`, await r.json().catch(() => null));
  return r.json();
}

/**
 * SSE (Server-Sent Events) streaming POST.
 * Browsers can't POST with EventSource, so we implement SSE parsing over fetch().
 */
export async function* sseStream(
  path: string,
  body: unknown,
): AsyncGenerator<{ event: string; data: string }> {
  const r = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(await authHeaders()),
    },
    body: JSON.stringify(body),
  });
  if (!r.ok || !r.body) {
    throw new ApiError(r.status, `SSE ${path} failed`);
  }
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const evt of events) {
      const lines = evt.split('\n');
      let event = 'message';
      let data = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) event = line.slice(7).trim();
        else if (line.startsWith('data: ')) data += line.slice(6);
      }
      if (data) yield { event, data };
    }
  }
}

/** Streamed audio fetch: POSTs JSON, returns Blob of audio. */
export async function apiPostAudio(path: string, body: unknown): Promise<Blob> {
  const r = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new ApiError(r.status, `POST ${path} failed`);
  return r.blob();
}
