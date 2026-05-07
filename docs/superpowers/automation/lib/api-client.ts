import axios, { AxiosInstance, AxiosError } from 'axios';

export class CvhApiClient {
  private http: AxiosInstance;

  constructor(baseUrl: string, apiKey: string) {
    this.http = axios.create({
      baseURL: baseUrl,
      timeout: 30_000,
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      validateStatus: () => true,
    });
  }

  private async req<T>(method: string, path: string, body?: unknown, params?: unknown): Promise<T> {
    const res = await this.http.request({ method, url: path, data: body, params });
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
}
