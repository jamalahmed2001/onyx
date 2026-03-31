import { loadConfig } from '../config/load.js';
import { discoverBundles, readRawFile } from '../vault/reader.js';
import { writeFile, writeFrontmatter } from '../vault/writer.js';
import { scanRepo } from './init.js';
import { resolveRepoPath } from '../repos/resolveRepoPath.js';
import matter from 'gray-matter';
import path from 'path';
import fs from 'fs';

export async function runRefreshContext(projectArg?: string): Promise<void> {
  if (!projectArg) {
    console.log('Usage: gzos refresh-context <project-name>');
    return;
  }

  const config = loadConfig();
  const bundles = discoverBundles(config.vaultRoot, config.projectsGlob);
  const bundle = bundles.find(b => b.projectId.toLowerCase().includes(projectArg.toLowerCase()));

  if (!bundle) {
    console.error(`No project found matching "${projectArg}"`);
    process.exit(1);
  }

  const rcPath = path.join(bundle.bundleDir, `${bundle.projectId} - Repo Context.md`);
  const ovPath = path.join(bundle.bundleDir, `${bundle.projectId} - Overview.md`);

  // Resolve repo path (prefer Overview.repo_path; else fuzzy match under config.reposRoot)
  const ovRaw = readRawFile(ovPath);
  const explicitRepoPath = ovRaw
    ? String((matter(ovRaw).data as Record<string, unknown>)['repo_path'] ?? '')
    : '';

  const resolved = resolveRepoPath({
    projectId: bundle.projectId,
    explicitRepoPath,
    reposRoot: config.reposRoot,
  });

  const repoPath = resolved.repoPath;

  if (!repoPath || !fs.existsSync(repoPath)) {
    console.error(`Repo not found. Set repo_path in ${ovPath} or set repos_root in groundzero.config.json (or GZOS_REPOS_ROOT env).`);
    process.exit(1);
  }

  // Write back repo_path if we fuzzily resolved it and Overview lacks a valid value
  if (resolved.source === 'fuzzy' && ovRaw) {
    try {
      const parsed = matter(ovRaw);
      const fm = { ...(parsed.data as Record<string, unknown>), repo_path: repoPath };
      writeFrontmatter(ovPath, fm);
    } catch {
      // non-fatal
    }
  }

  console.log(`Scanning repo: ${repoPath}${resolved.source === 'fuzzy' ? ' (resolved via reposRoot fuzzy match)' : ''}`);
  const scan = scanRepo(repoPath);
  console.log(`Stack: ${scan.stack}`);

  // Read existing Repo Context to preserve frontmatter and Agent Constraints
  const existing = readRawFile(rcPath);
  let existingFm: Record<string, unknown> = {};
  let existingConstraints = scan.constraints;

  if (existing) {
    const parsed = matter(existing);
    existingFm = parsed.data as Record<string, unknown>;
    // Preserve manually-edited Agent Constraints if present
    const constraintsMatch = existing.match(/## Agent Constraints([\s\S]*?)(?=\n##|\s*$)/);
    if (constraintsMatch?.[1]?.trim()) {
      existingConstraints = constraintsMatch[1].trim();
    }
  }

  existingFm['stack'] = scan.stack;

  const newBody = `\n## 🔗 Navigation\n\n- [[${bundle.projectId} - Overview|Overview]]\n- [[${bundle.projectId} - Docs Hub|Docs Hub]]\n\n# Repo Context — ${bundle.projectId}\n\n## Repo Path\n\nSee Overview frontmatter (\`repo_path\`).\n\n## Stack\n\n${scan.stack}\n\n## Key Areas\n\n${scan.keyAreas}\n\n## Architecture Notes\n\n${scan.architectureNotes}\n\n## Agent Constraints\n\n${existingConstraints}\n`;

  writeFile(rcPath, matter.stringify(newBody, existingFm));
  console.log(`Updated: ${rcPath}`);
}
