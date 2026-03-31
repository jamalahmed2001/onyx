// Simple structured logger with verbose mode support.
// Use setVerbose(true) to enable debug output (via --verbose or -v flag).

let _verbose = false;

export function setVerbose(v: boolean): void {
  _verbose = v;
}

export const log = {
  info: (...args: unknown[]): void => { console.log('[gzos]', ...args); },
  debug: (...args: unknown[]): void => { if (_verbose) console.log('[gzos:debug]', ...args); },
  warn: (...args: unknown[]): void => { console.warn('[gzos:warn]', ...args); },
  error: (...args: unknown[]): void => { console.error('[gzos:error]', ...args); },
};
