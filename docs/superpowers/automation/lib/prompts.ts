import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import chalk from 'chalk';

export async function pressEnter(message: string): Promise<void> {
  const rl = readline.createInterface({ input, output });
  console.log('\n' + chalk.bold.magenta('━'.repeat(80)));
  console.log(chalk.bold.magenta('  AÇÃO DO USUÁRIO'));
  console.log(chalk.bold.magenta('━'.repeat(80)));
  console.log(chalk.bold.white(message));
  console.log(chalk.bold.magenta('━'.repeat(80)));
  await rl.question(chalk.bold.yellow('\n  Pressione ENTER para continuar... '));
  rl.close();
}

export async function askText(message: string, validator?: (s: string) => string | null): Promise<string> {
  const rl = readline.createInterface({ input, output });
  console.log('\n' + chalk.bold.magenta('━'.repeat(80)));
  console.log(chalk.bold.magenta('  ENTRADA DO USUÁRIO'));
  console.log(chalk.bold.magenta('━'.repeat(80)));
  console.log(chalk.bold.white(message));
  console.log(chalk.bold.magenta('━'.repeat(80)));
  while (true) {
    const answer = (await rl.question(chalk.bold.yellow('\n  > '))).trim();
    if (validator) {
      const err = validator(answer);
      if (err) {
        console.log(chalk.red('  ✘ ' + err));
        continue;
      }
    } else if (!answer) {
      console.log(chalk.red('  ✘ Resposta vazia, tente novamente.'));
      continue;
    }
    rl.close();
    return answer;
  }
}

export function isEvmAddress(s: string): string | null {
  if (!/^0x[a-fA-F0-9]{40}$/.test(s)) return 'Endereço EVM inválido — deve ser 0x seguido de 40 hex chars';
  return null;
}
