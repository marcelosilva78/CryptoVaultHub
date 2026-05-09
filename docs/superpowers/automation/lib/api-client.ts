import axios, { AxiosInstance, AxiosError } from 'axios';
import http from 'node:http';
import https from 'node:https';
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
      headers: {
        'X-API-Key': apiKey,
        'Accept': '*/*',
        // 'br' (Brotli) in Accept-Encoding intermittently triggers 404 from
        // the edge router (Traefik) when keep-alive sockets are reused; force
        // gzip/deflate only.
        'Accept-Encoding': 'gzip, deflate',
        'User-Agent': 'cvh-homologation/1.0',
      },
      // Disable keep-alive to avoid stuck-socket 404s from the edge router.
      // The validation suite is short-lived; the perf hit is negligible.
      httpAgent: new http.Agent({ keepAlive: false }),
      httpsAgent: new https.Agent({ keepAlive: false }),
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

    // Retry on transient edge artifacts:
    //   - 404 with text/plain "404 page not found\n" → Traefik route miss during re-discovery
    //   - 502 Bad Gateway → upstream warm-up / restart in progress
    //   - 503/504 → similar gateway transients
    // Real Nest 404s are application/json with our envelope, so they don't match.
    let res: any;
    let lastEdgeMiss: any;
    const EDGE_RETRIES = 6;
    for (let attempt = 0; attempt < EDGE_RETRIES; attempt++) {
      const t0 = Date.now();
      res = await this.http.request({ method, url: path, data: body, params, headers: requestHeaders });
      const dur = Date.now() - t0;
      curlRecorder.afterRequest(rec, {
        status: res.status,
        durationMs: dur,
        data: res.data,
        headers: Object.fromEntries(Object.entries(res.headers ?? {}).map(([k, v]) => [k, String(v)])),
      });
      // AxiosHeaders supports either getter; try both.
      const headersObj = res.headers ?? {};
      const ctRaw = (typeof headersObj.get === 'function' ? headersObj.get('content-type') : headersObj['content-type']) ?? '';
      const ct = String(ctRaw).toLowerCase();
      const dataStr = typeof res.data === 'string' ? res.data : String(res.data ?? '');
      const isTraefikMiss = res.status === 404 && (ct.startsWith('text/plain') || dataStr.startsWith('404 page not found'));
      const isGatewayTransient = res.status === 502 || res.status === 503 || res.status === 504;
      if (!isTraefikMiss && !isGatewayTransient) break;
      if (process.env.CVH_DEBUG_RETRIES === '1') {
        console.error(`  [retry ${attempt + 1}/${EDGE_RETRIES}] ${method} ${path} → ${res.status} (ct=${ct})`);
      }
      lastEdgeMiss = res;
      // Backoff: 500ms, 1s, 2s, 4s, 8s, cap at 8s
      const delay = Math.min(500 * Math.pow(2, attempt), 8_000);
      await new Promise((r) => setTimeout(r, delay));
    }
    if (lastEdgeMiss && res === lastEdgeMiss) {
      const e = new Error(`${method} ${path} → ${res.status} after ${EDGE_RETRIES} edge retries (gateway flapping)`) as AxiosError;
      (e as any).response = res;
      throw e;
    }

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
