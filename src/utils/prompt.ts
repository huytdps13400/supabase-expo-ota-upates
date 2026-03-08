/**
 * Simple interactive prompts using Node.js built-in readline.
 * No external dependencies required.
 */

import * as readline from 'readline';

function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Ask a question and return the answer.
 */
export async function askQuestion(
  question: string,
  defaultValue?: string
): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface();
    const suffix = defaultValue ? ` (${defaultValue})` : '';
    rl.question(`  ${question}${suffix}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

/**
 * Ask a yes/no confirmation question.
 */
export async function askConfirm(
  question: string,
  defaultYes = true
): Promise<boolean> {
  const suffix = defaultYes ? ' (Y/n)' : ' (y/N)';
  const answer = await askQuestion(`${question}${suffix}`);
  if (!answer) return defaultYes;
  return answer.toLowerCase().startsWith('y');
}

/**
 * Ask user to select from a list of options.
 */
export async function askSelect(
  question: string,
  options: string[],
  defaultIndex = 0
): Promise<string> {
  console.log(`  ${question}`);
  options.forEach((opt, i) => {
    const marker = i === defaultIndex ? '>' : ' ';
    console.log(`    ${marker} ${i + 1}. ${opt}`);
  });
  const answer = await askQuestion(
    `Choose (1-${options.length})`,
    String(defaultIndex + 1)
  );
  const idx = parseInt(answer, 10) - 1;
  return options[idx] ?? options[defaultIndex]!;
}

/**
 * Check if stdin is an interactive terminal.
 */
export function isInteractive(): boolean {
  return process.stdin.isTTY === true;
}
