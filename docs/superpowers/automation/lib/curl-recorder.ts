import fs from 'node:fs';
import path from 'node:path';

const REDACT_HEADERS = ['x-api-key', 'authorization', 'cookie'];
const REDACT_BODY_KEYS = ['password', 'mnemonic', 'secret', 'apiKey', 'totpCode', 'X-2FA-Code'];

interface AttemptRecord {
  status: number;
  durationMs: number;
  bodyExcerpt: string;
  responseHeaders?: Record<string, string>;
  error?: string;
}

interface RequestRecord {
  step: string;
  method: string;
  url: string;
  baseUrl: string;
  path: string;
  headers: Record<string, string>;
  body?: unknown;
  attempts: AttemptRecord[];
  ts: string;
  notes: string[];
}

export class CurlRecorder {
  private records: RequestRecord[] = [];
  private currentStep = 'unnamed';

  setStep(label: string) {
    this.currentStep = label;
  }

  beforeRequest(req: { method: string; baseUrl: string; path: string; headers: Record<string, string>; body?: unknown }): RequestRecord {
    const rec: RequestRecord = {
      step: this.currentStep,
      method: req.method.toUpperCase(),
      url: req.baseUrl.replace(/\/+$/, '') + (req.path.startsWith('/') ? req.path : '/' + req.path),
      baseUrl: req.baseUrl,
      path: req.path,
      headers: { ...req.headers },
      body: req.body,
      attempts: [],
      ts: new Date().toISOString(),
      notes: [],
    };
    this.records.push(rec);
    return rec;
  }

  afterRequest(rec: RequestRecord, res: { status: number; durationMs: number; data: unknown; headers?: Record<string, string>; error?: string }) {
    rec.attempts.push({
      status: res.status,
      durationMs: res.durationMs,
      bodyExcerpt: stringify(res.data).slice(0, 500),
      responseHeaders: filterResponseHeaders(res.headers ?? {}),
      error: res.error,
    });
  }

  addNote(note: string) {
    const last = this.records[this.records.length - 1];
    if (last) last.notes.push(note);
  }

  /** Build a single copy-pasteable curl with secrets redacted. */
  toCurl(rec: RequestRecord, opts: { redact: boolean } = { redact: true }): string {
    const lines: string[] = [];
    lines.push(`curl -X ${rec.method} '${rec.url}' \\`);
    for (const [k, v] of Object.entries(rec.headers)) {
      if (k.toLowerCase() === 'content-length') continue;
      const value = opts.redact && REDACT_HEADERS.includes(k.toLowerCase()) ? `'<${k.toUpperCase().replace(/-/g, '_')}>'` : `'${v}'`;
      lines.push(`  -H '${k}: ${value.replace(/^'|'$/g, '')}' \\`);
    }
    if (rec.body !== undefined && rec.body !== null) {
      const bodyStr = typeof rec.body === 'string' ? rec.body : JSON.stringify(opts.redact ? redactBody(rec.body) : rec.body);
      lines.push(`  -d '${bodyStr.replace(/'/g, "'\\''")}'`);
    } else {
      // remove trailing backslash from previous line
      const last = lines[lines.length - 1];
      if (last.endsWith(' \\')) lines[lines.length - 1] = last.slice(0, -2);
    }
    return lines.join('\n');
  }

  /** Detailed chronological log: every step, every request, every attempt + response. */
  toDetailedMarkdown(): string {
    const out: string[] = [];
    out.push(`# Curl Log — Detailed`);
    out.push(`Run started ${this.records[0]?.ts ?? new Date().toISOString()}.`);
    out.push('');
    out.push(`Total requests: ${this.records.length}.`);
    out.push('');

    let lastStep = '';
    for (const rec of this.records) {
      if (rec.step !== lastStep) {
        out.push(`## ${rec.step}`);
        out.push('');
        lastStep = rec.step;
      }
      out.push(`### ${rec.method} ${rec.path}`);
      out.push('');
      out.push('```bash');
      out.push(this.toCurl(rec, { redact: true }));
      out.push('```');
      out.push('');
      if (rec.notes.length > 0) {
        out.push(`**Notes:**`);
        for (const n of rec.notes) out.push(`- ${n}`);
        out.push('');
      }
      out.push(`**Attempts:** ${rec.attempts.length}`);
      out.push('');
      for (let i = 0; i < rec.attempts.length; i++) {
        const a = rec.attempts[i];
        out.push(`#### Attempt ${i + 1} → ${a.status} (${a.durationMs}ms)`);
        if (a.error) out.push(`Error: ${a.error}`);
        out.push('');
        out.push('```json');
        out.push(a.bodyExcerpt);
        out.push('```');
        out.push('');
      }
      out.push('---');
      out.push('');
    }
    return out.join('\n');
  }

  /** Canonical API reference: one entry per logical operation with the *successful* curl + response sample. */
  toCanonicalReference(): string {
    const out: string[] = [];
    out.push(`# CryptoVaultHub Client API — Canonical Reference`);
    out.push(`Generated from a successful homologation run on ${new Date().toISOString().slice(0, 10)}.`);
    out.push('');
    out.push(`## How to use`);
    out.push('');
    out.push('Each operation below shows:');
    out.push('- The **request** as a copy-pasteable `curl` (secrets redacted as `<X_API_KEY>` etc.).');
    out.push('- A **sample response** with the actual status code we observed during homologation.');
    out.push('- **Notes** for any quirks we hit and how we adapted the call.');
    out.push('');
    out.push('Replace placeholders before running:');
    out.push('- `<X_API_KEY>` — your client API key (Sidebar → API Keys)');
    out.push('- IDs (e.g. `:chainId`, `:projectId`) — values for your account');
    out.push('');
    out.push('---');
    out.push('');

    // Group by step name; show the final/successful attempt
    const byStep = new Map<string, RequestRecord[]>();
    for (const rec of this.records) {
      if (!byStep.has(rec.step)) byStep.set(rec.step, []);
      byStep.get(rec.step)!.push(rec);
    }

    for (const [step, recs] of byStep) {
      // Pick the most-recent successful one if any, else the last
      const successful = [...recs].reverse().find((r) => r.attempts.some((a) => a.status >= 200 && a.status < 400));
      const rec = successful ?? recs[recs.length - 1];
      const lastAttempt = rec.attempts[rec.attempts.length - 1];
      const ok = lastAttempt && lastAttempt.status >= 200 && lastAttempt.status < 400;

      out.push(`## ${step}`);
      out.push('');
      out.push(`**Endpoint:** \`${rec.method} ${rec.path}\``);
      out.push('');
      out.push(`### Request`);
      out.push('```bash');
      out.push(this.toCurl(rec, { redact: true }));
      out.push('```');
      out.push('');
      out.push(`### Sample response (HTTP ${lastAttempt?.status ?? 'n/a'}${ok ? ' OK' : ' — see notes'})`);
      out.push('```json');
      out.push(lastAttempt?.bodyExcerpt ?? '(no response)');
      out.push('```');
      out.push('');
      if (rec.notes.length > 0 || !ok) {
        out.push(`### Notes`);
        for (const n of rec.notes) out.push(`- ${n}`);
        if (!ok && lastAttempt?.error) out.push(`- ⚠ Last attempt errored: ${lastAttempt.error}`);
        out.push('');
      }
      out.push('---');
      out.push('');
    }
    return out.join('\n');
  }

  /** Standalone bash script that reproduces the full flow. */
  toBashScript(): string {
    const out: string[] = [];
    out.push('#!/usr/bin/env bash');
    out.push('# Auto-generated from a CryptoVaultHub homologation run.');
    out.push('# Fill in your API key + values, then run with `bash <this-file>`.');
    out.push('set -euo pipefail');
    out.push('');
    out.push(': "${CVH_API_KEY:?Set CVH_API_KEY before running}"');
    out.push(': "${BASE_URL:=https://api.vaulthub.live/client/v1}"');
    out.push('');

    let lastStep = '';
    for (const rec of this.records) {
      if (rec.step !== lastStep) {
        out.push('');
        out.push(`# ─── ${rec.step} ───`);
        lastStep = rec.step;
      }
      out.push('echo ">>> ' + rec.step + ' :: ' + rec.method + ' ' + rec.path + '"');
      const lines: string[] = [];
      lines.push(`curl -sS -X ${rec.method} "$BASE_URL${rec.path}" \\`);
      lines.push(`  -H "X-API-Key: $CVH_API_KEY" \\`);
      const otherHeaders = Object.entries(rec.headers).filter(([k]) =>
        !['x-api-key', 'authorization', 'host', 'content-length', 'connection', 'accept-encoding', 'user-agent'].includes(k.toLowerCase()),
      );
      for (const [k, v] of otherHeaders) {
        lines.push(`  -H '${k}: ${v}' \\`);
      }
      if (rec.body !== undefined && rec.body !== null) {
        const bodyStr = typeof rec.body === 'string' ? rec.body : JSON.stringify(redactBody(rec.body));
        lines.push(`  -d '${bodyStr.replace(/'/g, "'\\''")}'`);
      } else {
        const last = lines[lines.length - 1];
        if (last.endsWith(' \\')) lines[lines.length - 1] = last.slice(0, -2);
      }
      out.push(lines.join('\n'));
      out.push('echo');
    }
    return out.join('\n');
  }

  writeArtifacts(evidenceDir: string) {
    if (!fs.existsSync(evidenceDir)) fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(path.join(evidenceDir, 'curl-log-detailed.md'), this.toDetailedMarkdown(), 'utf-8');
    fs.writeFileSync(path.join(evidenceDir, 'api-canonical-reference.md'), this.toCanonicalReference(), 'utf-8');
    fs.writeFileSync(path.join(evidenceDir, 'run.sh'), this.toBashScript(), 'utf-8');
    fs.chmodSync(path.join(evidenceDir, 'run.sh'), 0o755);
  }

  hasAdaptationNotes(): boolean {
    return this.records.some((r) => r.notes.length > 0);
  }
}

function stringify(x: unknown): string {
  if (x === null || x === undefined) return '';
  if (typeof x === 'string') return x;
  try { return JSON.stringify(x, null, 2); } catch { return String(x); }
}

function filterResponseHeaders(h: Record<string, string>): Record<string, string> {
  const keep: Record<string, string> = {};
  for (const k of ['content-type', 'x-trace-id', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-webhook-signature']) {
    if (h[k]) keep[k] = h[k];
  }
  return keep;
}

function redactBody(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  if (Array.isArray(body)) return body.map(redactBody);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (REDACT_BODY_KEYS.some((rk) => k.toLowerCase() === rk.toLowerCase())) {
      out[k] = `<${k.toUpperCase()}>`;
    } else if (v && typeof v === 'object') {
      out[k] = redactBody(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export const curlRecorder = new CurlRecorder();
