// Shared config loading — single source of truth for all API routes.

import { readFileSync } from 'fs';
import { join } from 'path';

const CFG_PATH = join(process.cwd(), '..', 'onyx.config.json');

export function getConfigPath(): string {
  return CFG_PATH;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function readConfig(): any {
  try {
    return JSON.parse(readFileSync(CFG_PATH, 'utf-8'));
  } catch {
    return {};
  }
}
