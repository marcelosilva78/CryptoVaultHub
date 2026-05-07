import axios, { AxiosInstance, AxiosError } from 'axios';
import { curlRecorder } from './curl-recorder.js';

export class CvhApiClient {
  private http: AxiosInstance;
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.http = axios.create({
      baseURL: baseUrl,
      timeout: 30_000,
      // NOTE: Content-Type is set per-request (only when there's a body).
      // Setting it unconditionally on GETs triggers WAF rejection (403) at the edge.
      headers: { 'X-API-Key': apiKey, 'Accept': '*/*', 'User-Agent': 'cvh-homologation/1.0' },
      validateStatus: () => true,
    });
  }

  private async req<T>(method: string, path: string, body?: unknown, params?: unknown): Promise<T> {
    const fullPath = params ? `${path}?${new URLSearchParams(params as Record<string, string>).toString()}` : path;
    const headers: Record<string, string> = {
      'X-API-Key': this.apiKey,
      'Accept': '*/*',
      'User-Agent': 'cvh-homologation/1.0',
    };
    const requestHeaders: Record<string, string> = { ...headers };
    if (body !== undefined && body !== null) {
      headers['Content-Type'] = 'application/json';
      requestHeaders['Content-Type'] = 'application/json';
    }
    const rec = curlRecorder.beforeRequest({
      method,
      baseUrl: this.baseUrl,
      path: fullPath,
      headers,
      body,
    });

    const t0 = Date.now();
    const res = await this.http.request({ method, url: path, data: body, params, headers: requestHeaders });
    const dur = Date.now() - t0;

    curlRecorder.afterRequest(rec, {
      status: res.status,
      durationMs: dur,
      data: res.data,
      headers: Object.fromEntries(Object.entries(res.headers ?? {}).map(([k, v]) => [k, String(v)])),
    });

    if (res.status >= 400) {
      const e = new Error(`${method} ${path} → ${res.status} ${JSON.stringify(res.data).slice(0, 200)}`) as AxiosError;
      (e as any).response = res;
      throw e;
    }
    return res.data as T;
  }

  get<T>(path: string, params?: Record<string, unknown>) { return this.req<T>('GET', path, undefined, params); }
  post<T>(path: string, body?: unknown) { return this.req<T>('POST', path, body); }
  patch<T>(path: string, body?: unknown) { return this.req<T>('PATCH', path, body); }
  put<T>(path: string, body?: unknown) { return this.req<T>('PUT', path, body); }
  delete<T>(path: string) { return this.req<T>('DELETE', path); }

  // Polling helper — tries `pred` repeatedly until it returns a truthy value or timeout.
  async pollUntil<T>(
    pred: () => Promise<T | null | undefined>,
    opts: { timeoutMs: number; intervalMs?: number; label?: string } = { timeoutMs: 60_000 },
  ): Promise<T> {
    const interval = opts.intervalMs ?? 5_000;
    const deadline = Date.now() + opts.timeoutMs;
    let attempt = 0;
    while (Date.now() < deadline) {
      attempt++;
      const v = await pred().catch(() => null);
      if (v) return v;
      await new Promise((r) => setTimeout(r, interval));
    }
    throw new Error(`${opts.label ?? 'pollUntil'} timed out after ${opts.timeoutMs}ms (${attempt} attempts)`);
  }

  /** Add a free-form note to the last request recorded — visible in evidence/curl-log-detailed.md. */
  noteLastRequest(note: string) {
    curlRecorder.addNote(note);
  }
}
