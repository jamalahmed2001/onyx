import fs from 'fs';
import path from 'path';

const IGNORE = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', 'coverage',
  '.cache', '__pycache__', '.tox', 'venv', '.venv', 'vendor',
  'tmp', 'temp', '.turbo', '.gzos-backups',
]);

// Source-like directory names to prioritize at depth 1
const SOURCE_DIRS = new Set([
  'src', 'app', 'lib', 'packages', 'services', 'api', 'components',
  'pages', 'routes', 'models', 'controllers', 'server', 'client',
  'backend', 'frontend', 'core', 'shared', 'utils', 'hooks', 'store',
  'test', 'tests', 'spec', '__tests__', 'scripts', 'config', 'prisma',
]);

// Key config files always shown at root regardless of depth
const ROOT_CONFIG_FILES = new Set([
  'package.json', 'tsconfig.json', 'Cargo.toml', 'go.mod', 'pyproject.toml',
  'Makefile', 'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
  '.env.example', 'prisma', 'next.config.js', 'next.config.ts',
  'vite.config.ts', 'webpack.config.js', 'jest.config.ts', 'jest.config.js',
]);

const SOURCE_EXTENSIONS = /\.(ts|tsx|js|jsx|py|go|rs|java|rb|cs|json|yaml|yml|toml|md|prisma|sql|graphql|proto)$/;

/**
 * Scan a repo and return a concise file tree.
 * Depth: 3 levels. Max: 150 lines. Shows file sizes for substantial files.
 */
export function scanRepoFiles(repoPath: string): string {
  if (!repoPath || !fs.existsSync(repoPath)) return '(repo path not available)';

  const lines: string[] = [];

  function walk(dir: string, depth: number, prefix: string) {
    if (depth > 3) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    const dirs  = entries.filter(e => e.isDirectory() && !IGNORE.has(e.name) && !e.name.startsWith('.')).sort((a, b) => a.name.localeCompare(b.name));
    const files = entries.filter(e => e.isFile() && !e.name.startsWith('.') && !e.name.startsWith('._')).sort((a, b) => a.name.localeCompare(b.name));

    // At depth 1, prioritize source-like dirs
    const showDirs = depth === 1
      ? dirs.filter(d => SOURCE_DIRS.has(d.name))
      : dirs;

    // Show source files with sensible limits per depth
    const fileLimit = depth <= 2 ? 15 : 25;
    const showFiles = files.filter(f => SOURCE_EXTENSIONS.test(f.name)).slice(0, fileLimit);

    for (const d of showDirs) {
      lines.push(`${prefix}${d.name}/`);
      walk(path.join(dir, d.name), depth + 1, prefix + '  ');
    }
    for (const f of showFiles) {
      // Show line count for substantial files (helps LLM understand what's significant)
      let sizeSuffix = '';
      try {
        const content = fs.readFileSync(path.join(dir, f.name), 'utf8');
        const lineCount = content.split('\n').length;
        if (lineCount > 100) sizeSuffix = ` (${lineCount} lines)`;
      } catch { /* skip size */ }
      lines.push(`${prefix}${f.name}${sizeSuffix}`);
    }
  }

  // Always show key config files at root
  try {
    const rootEntries = fs.readdirSync(repoPath, { withFileTypes: true });
    for (const e of rootEntries) {
      if (e.isFile() && ROOT_CONFIG_FILES.has(e.name)) {
        lines.push(e.name);
      }
    }
  } catch { /* skip */ }

  walk(repoPath, 1, '');

  if (lines.length === 0) return '(no source files found in repo)';
  return lines.slice(0, 150).join('\n');
}

/**
 * Validate that file paths referenced in a plan block actually exist in the repo.
 * Returns list of paths that were referenced but don't exist (and aren't marked as new).
 */
export function validatePlanFilePaths(planBlock: string, repoPath: string): string[] {
  if (!repoPath || !fs.existsSync(repoPath)) return [];

  const missing: string[] = [];
  const fileRefPattern = /\*\*Files?:\*\*\s*(.+)/g;
  let match: RegExpExecArray | null;

  while ((match = fileRefPattern.exec(planBlock)) !== null) {
    const fileList = match[1]!;
    // Split on commas, extract backtick-wrapped paths
    const paths = fileList.match(/`([^`]+)`/g)?.map(p => p.replace(/`/g, '').trim()) ?? [];

    for (const filePath of paths) {
      // Skip paths explicitly marked as new
      if (/\(new\s*(file)?\)/i.test(fileList)) continue;
      // Skip glob patterns
      if (filePath.includes('*')) continue;
      // Check existence
      const abs = path.resolve(repoPath, filePath);
      if (!fs.existsSync(abs)) {
        missing.push(filePath);
      }
    }
  }

  return [...new Set(missing)]; // deduplicate
}
