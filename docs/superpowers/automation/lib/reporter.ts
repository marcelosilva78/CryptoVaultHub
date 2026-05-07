import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';

interface StepResult {
  phase: string;
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP' | 'WARN';
  message?: string;
  durationMs: number;
  evidence?: Record<string, unknown>;
}

class Reporter {
  private results: StepResult[] = [];
  private currentPhase = 'init';
  private startedAt = Date.now();
  private evidenceDir = path.join(process.cwd(), 'evidence', new Date().toISOString().replace(/[:.]/g, '-'));

  banner(text: string) {
    console.log('\n' + chalk.bold.cyan('━'.repeat(80)));
    console.log(chalk.bold.cyan('  ' + text));
    console.log(chalk.bold.cyan('━'.repeat(80)) + '\n');
  }

  phase(name: string) {
    this.currentPhase = name;
    console.log('\n' + chalk.bold.yellow('▌ ' + name));
    console.log(chalk.dim('─'.repeat(80)));
  }

  info(msg: string) {
    console.log(chalk.dim('   • ' + msg));
  }

  highlight(label: string, value: string) {
    console.log(chalk.bold('   ➤ ' + label + ': ') + chalk.cyan(value));
  }

  async step<T>(name: string, fn: () => Promise<T>, opts: { skipOnFail?: boolean } = {}): Promise<T | undefined> {
    const t0 = Date.now();
    process.stdout.write(chalk.dim('   ▸ ') + name + ' ... ');
    try {
      const result = await fn();
      const dur = Date.now() - t0;
      console.log(chalk.green('PASS') + chalk.dim(` (${dur}ms)`));
      this.results.push({ phase: this.currentPhase, name, status: 'PASS', durationMs: dur });
      return result;
    } catch (err: any) {
      const dur = Date.now() - t0;
      console.log(chalk.red('FAIL') + chalk.dim(` (${dur}ms)`));
      console.log(chalk.red('     → ' + (err?.message ?? String(err))));
      if (err?.response?.data) console.log(chalk.red('     → response: ') + JSON.stringify(err.response.data).slice(0, 300));
      this.results.push({
        phase: this.currentPhase,
        name,
        status: 'FAIL',
        message: err?.message ?? String(err),
        durationMs: dur,
      });
      if (!opts.skipOnFail) throw err;
      return undefined;
    }
  }

  warn(name: string, message: string) {
    console.log(chalk.yellow('   ⚠ ' + name + ': ') + chalk.dim(message));
    this.results.push({ phase: this.currentPhase, name, status: 'WARN', message, durationMs: 0 });
  }

  skip(name: string, reason: string) {
    console.log(chalk.gray('   ⊘ ' + name + ': ') + chalk.dim(reason));
    this.results.push({ phase: this.currentPhase, name, status: 'SKIP', message: reason, durationMs: 0 });
  }

  saveEvidence(filename: string, content: string | Buffer) {
    if (!fs.existsSync(this.evidenceDir)) fs.mkdirSync(this.evidenceDir, { recursive: true });
    const fp = path.join(this.evidenceDir, filename);
    fs.writeFileSync(fp, content);
    return fp;
  }

  evidenceDirPath(): string {
    if (!fs.existsSync(this.evidenceDir)) fs.mkdirSync(this.evidenceDir, { recursive: true });
    return this.evidenceDir;
  }

  hasFailures(): boolean {
    return this.results.some((r) => r.status === 'FAIL');
  }

  summary() {
    const totalDur = Date.now() - this.startedAt;
    const passed = this.results.filter((r) => r.status === 'PASS').length;
    const failed = this.results.filter((r) => r.status === 'FAIL').length;
    const warned = this.results.filter((r) => r.status === 'WARN').length;
    const skipped = this.results.filter((r) => r.status === 'SKIP').length;

    console.log('\n' + chalk.bold.cyan('━'.repeat(80)));
    console.log(chalk.bold.cyan('  Summary'));
    console.log(chalk.bold.cyan('━'.repeat(80)));
    console.log(`   ${chalk.green('PASS')}: ${passed}`);
    console.log(`   ${chalk.red('FAIL')}: ${failed}`);
    console.log(`   ${chalk.yellow('WARN')}: ${warned}`);
    console.log(`   ${chalk.gray('SKIP')}: ${skipped}`);
    console.log(`   Total time: ${(totalDur / 1000).toFixed(1)}s`);
    console.log(`   Evidence: ${this.evidenceDir}`);

    // Save markdown report
    const md = this.toMarkdown(passed, failed, warned, skipped, totalDur);
    this.saveEvidence('report.md', md);
    console.log(chalk.dim(`   Report saved: ${path.join(this.evidenceDir, 'report.md')}`));

    if (failed > 0) {
      console.log('\n' + chalk.red.bold('  ✘ Homologation FAILED — see failures above and report.md'));
    } else {
      console.log('\n' + chalk.green.bold('  ✔ Homologation PASSED'));
    }
    console.log(chalk.bold.cyan('━'.repeat(80)) + '\n');
  }

  fatal(err: unknown) {
    console.log(chalk.red.bold('\n FATAL: '), err);
  }

  private toMarkdown(p: number, f: number, w: number, s: number, dur: number): string {
    const lines: string[] = [];
    lines.push('# CryptoVaultHub Homologation Report');
    lines.push(`**Date:** ${new Date().toISOString()}`);
    lines.push(`**Duration:** ${(dur / 1000).toFixed(1)}s`);
    lines.push('');
    lines.push(`| Status | Count |`);
    lines.push(`|---|---|`);
    lines.push(`| PASS | ${p} |`);
    lines.push(`| FAIL | ${f} |`);
    lines.push(`| WARN | ${w} |`);
    lines.push(`| SKIP | ${s} |`);
    lines.push('');

    const phases = [...new Set(this.results.map((r) => r.phase))];
    for (const phase of phases) {
      lines.push(`## ${phase}`);
      lines.push('');
      lines.push(`| Step | Status | Time | Note |`);
      lines.push(`|---|---|---|---|`);
      for (const r of this.results.filter((x) => x.phase === phase)) {
        const note = (r.message ?? '').replace(/\|/g, '\\|').slice(0, 200);
        lines.push(`| ${r.name} | ${r.status} | ${r.durationMs}ms | ${note} |`);
      }
      lines.push('');
    }
    return lines.join('\n');
  }
}

export const reporter = new Reporter();
