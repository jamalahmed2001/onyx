import fs from 'fs';
import path from 'path';
import glob from 'fast-glob';

const CONFIG_PATH = path.resolve(process.cwd(), 'onyx.config.json');
const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const vaultRoot = cfg.vault_root;
const projectsGlob = cfg.projects_glob;

const IGNORE = [
  '**/.git/**',
  '**/node_modules/**',
  '**/dist/**',
  '**/.trash/**',
  '**/_Archive/**',
  '**/.obsidian/**',
];

function extractWikilinksFromString(raw) {
  const out = [];
  raw.replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g, (_m, target) => {
    const t = String(target ?? '').trim();
    if (t) out.push(t);
    return _m;
  });
  return out;
}

function readText(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function safeParseCanvas(raw, filePath) {
  try {
    const json = JSON.parse(raw);
    if (!json || typeof json !== 'object') return { nodes: [], edges: [] };
    const nodes = Array.isArray(json.nodes) ? json.nodes : [];
    const edges = Array.isArray(json.edges) ? json.edges : [];
    return { nodes, edges };
  } catch {
    return { nodes: [], edges: [] };
  }
}

function canvasOutgoingTargets(canvasJson) {
  const out = [];
  for (const n of canvasJson.nodes ?? []) {
    if (n && typeof n === 'object') {
      if (typeof n.file === 'string' && n.file.trim()) out.push(n.file.trim());
      if (typeof n.text === 'string' && n.text.trim()) out.push(...extractWikilinksFromString(n.text));
    }
  }
  return out;
}

function findNearestHub(filePath) {
  let dir = path.dirname(filePath);
  const stop = path.resolve(vaultRoot);

  while (path.resolve(dir).startsWith(stop)) {
    const overview = glob.sync('*Overview*.md', { cwd: dir, absolute: true, onlyFiles: true });
    if (overview.length > 0) return path.basename(overview[0], '.md');

    const knowledge = glob.sync('*Knowledge*.md', { cwd: dir, absolute: true, onlyFiles: true });
    if (knowledge.length > 0) return path.basename(knowledge[0], '.md');

    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function baseNameNoExt(p) {
  return path.basename(p, path.extname(p));
}

// Scope to project bundle directories (same as healer intent)
const base = projectsGlob.replace('/**', '').replace('/**/*', '');
const bundleDirs = glob.sync(base, { cwd: vaultRoot, onlyDirectories: true, deep: 2 });
const bundleAbs = bundleDirs.map(d => path.join(vaultRoot, d));

const mdFiles = glob.sync('**/*.md', { cwd: vaultRoot, absolute: true, ignore: IGNORE });
const canvasFiles = glob.sync('**/*.canvas', { cwd: vaultRoot, absolute: true, ignore: IGNORE });

// Build global referenced set from both md + canvas
const referenced = new Set();

for (const fp of mdFiles) {
  const raw = readText(fp);
  if (!raw) continue;
  for (const t of extractWikilinksFromString(raw)) {
    referenced.add(t);
    referenced.add(path.posix.basename(t));
  }
}

for (const fp of canvasFiles) {
  const raw = readText(fp);
  if (!raw) continue;
  const json = safeParseCanvas(raw, fp);
  for (const t of canvasOutgoingTargets(json)) {
    referenced.add(t);
    referenced.add(path.posix.basename(t));
    referenced.add(baseNameNoExt(t));
  }
}

function inBundle(fp) {
  return bundleAbs.some(abs => fp.startsWith(abs + path.sep));
}

const orphanMarkdown = [];
for (const fp of mdFiles) {
  if (!inBundle(fp)) continue;
  const bn = baseNameNoExt(fp);
  if (/Overview$/.test(bn) || bn.includes('Kanban')) continue;

  const raw = readText(fp);
  if (!raw) continue;
  // Avoid strict YAML frontmatter parsing (vault may contain imperfect YAML).
  // Strip a leading frontmatter block if present.
  let body = raw;
  if (body.startsWith('---\n')) {
    const end = body.indexOf('\n---', 4);
    if (end !== -1) {
      const after = body.indexOf('\n', end + 4);
      body = after !== -1 ? body.slice(after + 1) : '';
    }
  }
  const outgoing = extractWikilinksFromString(body);

  const rel = path.relative(vaultRoot, fp).replace(/\\/g, '/');
  const inbound = referenced.has(bn) || referenced.has(rel);

  if (outgoing.length === 0 && !inbound) {
    orphanMarkdown.push({
      file: rel,
      title: bn,
      hub: findNearestHub(fp),
    });
  }
}

const orphanCanvas = [];
for (const fp of canvasFiles) {
  if (!inBundle(fp)) continue;
  const rel = path.relative(vaultRoot, fp).replace(/\\/g, '/');
  const bn = baseNameNoExt(fp);

  const inbound = referenced.has(bn) || referenced.has(rel);
  if (!inbound) {
    orphanCanvas.push({ file: rel, title: bn });
  }
}

console.log(JSON.stringify({
  vaultRoot,
  projectBundles: bundleDirs,
  orphanMarkdown: orphanMarkdown.map(o => ({
    file: o.file,
    action: o.hub ? `ATTACH_TO_HUB:${o.hub}` : 'ALERT_NO_HUB',
  })),
  orphanCanvas: orphanCanvas.map(o => ({
    file: o.file,
    action: 'DELETE (canvas-orphan-policy)',
  })),
}, null, 2));
