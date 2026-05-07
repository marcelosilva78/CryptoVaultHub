#!/usr/bin/env tsx
/**
 * promote-evidence.ts
 *
 * Pega a evidência mais recente da homologação (api-canonical-reference.md +
 * run.sh + report.md) e copia para o local canônico da documentação:
 *
 *   evidence/<latest>/api-canonical-reference.md
 *     → docs/superpowers/api-reference/curl-examples.md
 *
 *   evidence/<latest>/run.sh
 *     → docs/superpowers/api-reference/replay.sh
 *
 *   evidence/<latest>/report.md
 *     → docs/superpowers/api-reference/last-homolog-report.md
 *
 * Uso:
 *   pnpm promote                    # usa a evidência mais recente
 *   pnpm promote -- evidence/2026-05-07T...  # usa uma específica
 */

import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(process.cwd(), '../../..');
const TARGET_DIR = path.join(REPO_ROOT, 'docs/superpowers/api-reference');
const AUTOMATION_DIR = process.cwd();
const EVIDENCE_DIR = path.join(AUTOMATION_DIR, 'evidence');

function findLatestEvidence(): string | null {
  if (!fs.existsSync(EVIDENCE_DIR)) return null;
  const subs = fs.readdirSync(EVIDENCE_DIR)
    .map((d) => path.join(EVIDENCE_DIR, d))
    .filter((p) => fs.statSync(p).isDirectory())
    .sort();
  return subs.pop() ?? null;
}

function main() {
  const arg = process.argv[2];
  const source = arg ? path.resolve(arg) : findLatestEvidence();

  if (!source || !fs.existsSync(source)) {
    console.error('No evidence directory found. Run `pnpm homolog` first or pass an explicit path.');
    process.exit(1);
  }

  console.log(`Promoting evidence from: ${source}`);

  if (!fs.existsSync(TARGET_DIR)) fs.mkdirSync(TARGET_DIR, { recursive: true });

  const promotions: Array<[string, string]> = [
    ['api-canonical-reference.md', 'curl-examples.md'],
    ['run.sh', 'replay.sh'],
    ['report.md', 'last-homolog-report.md'],
    ['curl-log-detailed.md', 'curl-log-detailed.md'],
  ];

  for (const [src, dst] of promotions) {
    const srcPath = path.join(source, src);
    const dstPath = path.join(TARGET_DIR, dst);
    if (!fs.existsSync(srcPath)) {
      console.warn(`  skip ${src} (not found in evidence dir)`);
      continue;
    }
    fs.copyFileSync(srcPath, dstPath);
    if (src.endsWith('.sh')) fs.chmodSync(dstPath, 0o755);
    console.log(`  ✓ ${src} → docs/superpowers/api-reference/${dst}`);
  }

  // Write a small INDEX.md that explains what's in the folder
  const index = [
    '# API Reference — CryptoVaultHub Client API',
    '',
    `Last updated: ${new Date().toISOString().slice(0, 10)} (from \`automation/${path.relative(AUTOMATION_DIR, source)}\`).`,
    '',
    '## Files',
    '- [`curl-examples.md`](./curl-examples.md) — canonical curl reference for every endpoint exercised by the homologation suite.',
    '- [`curl-log-detailed.md`](./curl-log-detailed.md) — full chronological log with attempts and adaptation notes.',
    '- [`replay.sh`](./replay.sh) — standalone bash script that reproduces the entire flow.',
    '- [`last-homolog-report.md`](./last-homolog-report.md) — PASS/FAIL summary of the most recent run.',
    '',
    '## How to regenerate',
    '```bash',
    'cd docs/superpowers/automation',
    'pnpm homolog                # run the suite',
    'pnpm promote                # copy latest evidence into this folder',
    '```',
    '',
    '## Postman collection',
    'See [`../postman/`](../postman/) for the importable Postman collection. The endpoint shapes there should match the curl examples here.',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(TARGET_DIR, 'README.md'), index);
  console.log(`  ✓ wrote README.md index`);

  console.log('');
  console.log('Done. Review the changes:');
  console.log(`  git status docs/superpowers/api-reference/`);
  console.log(`  git diff docs/superpowers/api-reference/curl-examples.md`);
}

main();
