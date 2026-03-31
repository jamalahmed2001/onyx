import fs from 'fs';
import path from 'path';
import { readRawFile } from './reader.js';
import matter from 'gray-matter';

export interface KnowledgeEntry {
  projectId: string;
  text: string;
  keywords: string[];
  source: string; // file path
  section: 'learnings' | 'decisions' | 'gotchas' | 'cross-project';
}

// Read all Knowledge.md files across all projects and index them
export function buildKnowledgeIndex(vaultRoot: string, projectsGlob: string): KnowledgeEntry[] {
  const projectsBase = projectsGlob.replace(/\/\*\*.*$/, '').replace(/^\{/, '').replace(/\}$/, '').split(',')[0] ?? '01 - Projects';
  const projectsRoot = path.join(vaultRoot, projectsBase.trim());
  const entries: KnowledgeEntry[] = [];

  if (!fs.existsSync(projectsRoot)) return entries;

  let projectDirs: string[] = [];
  try {
    projectDirs = fs.readdirSync(projectsRoot, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => path.join(projectsRoot, d.name));
  } catch {
    return entries;
  }

  for (const projectDir of projectDirs) {
    let files: string[] = [];
    try {
      files = fs.readdirSync(projectDir).filter(f => f.endsWith('- Knowledge.md'));
    } catch {
      continue;
    }
    for (const knFile of files) {
      const knPath = path.join(projectDir, knFile);
      const raw = readRawFile(knPath);
      if (!raw) continue;
      const parsed = matter(raw);
      const projectId = String((parsed.data as Record<string, unknown>)['project'] ?? path.basename(projectDir));
      // Index all three knowledge sections
      const sections: Array<{ heading: string; type: KnowledgeEntry['section'] }> = [
        { heading: 'Learnings', type: 'learnings' },
        { heading: 'Decisions', type: 'decisions' },
        { heading: 'Gotchas',   type: 'gotchas'   },
      ];
      for (const { heading, type } of sections) {
        const match = parsed.content.match(new RegExp(`## ${heading}([\\s\\S]*?)(?=\\n##|\\s*$)`));
        if (!match) continue;
        const sectionText = match[1]!.trim();
        if (!sectionText) continue;
        const chunks = sectionText.split(/\n\n+/).filter(c => c.trim().length > 20);
        for (const chunk of chunks) {
          const keywords = extractKeywords(chunk);
          entries.push({ projectId, text: chunk.trim(), keywords, source: knPath, section: type });
        }
      }
    }
  }

  return entries;
}

// Read cross-project knowledge file
export function readCrossProjectKnowledge(vaultRoot: string): KnowledgeEntry[] {
  const crossPath = path.join(vaultRoot, '08 - System', 'Cross-Project Knowledge.md');
  if (!fs.existsSync(crossPath)) return [];
  const raw = readRawFile(crossPath);
  if (!raw) return [];
  const parsed = matter(raw);
  const chunks = parsed.content.split(/\n\n+/).filter(c => c.trim().length > 20);
  return chunks.map(chunk => ({
    projectId: 'cross-project',
    text: chunk.trim(),
    keywords: extractKeywords(chunk),
    source: crossPath,
    section: 'cross-project' as const,
  }));
}

// Simple keyword extractor — strips common words, returns meaningful tokens
function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'the','a','an','and','or','but','in','on','at','to','for','of','with','is','are',
    'was','were','be','been','being','have','has','had','do','does','did','will','would',
    'could','should','may','might','that','this','these','those','it','its','we','you',
    'i','they','he','she','from','by','as','into','through','after','before','not','no',
    'if','then','can','all','any','some','each','every','also','just','more','than','so',
    'up','out','about','what','when','where','how','which',
  ]);
  return text.toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w))
    .slice(0, 30);
}

// Score a knowledge entry's relevance to a task description
export function scoreRelevance(entry: KnowledgeEntry, taskText: string, projectId: string): number {
  let score = 0;
  const taskKeywords = extractKeywords(taskText);
  // Keyword overlap
  const overlap = entry.keywords.filter(k => taskKeywords.includes(k));
  score += overlap.length * 2;
  // Same project bonus
  if (entry.projectId === projectId) score += 3;
  // Cross-project bonus for broad relevance
  if (entry.projectId === 'cross-project') score += 1;
  // Gotchas and decisions are higher-signal than general learnings — boost them
  if (entry.section === 'gotchas') score += 2;
  if (entry.section === 'decisions') score += 1;
  return score;
}

// Get the top N most relevant knowledge snippets for a task
export function getRelevantKnowledge(
  vaultRoot: string,
  projectsGlob: string,
  projectId: string,
  taskText: string,
  maxEntries = 5,
  maxChars = 1500,
): string {
  const index = [
    ...buildKnowledgeIndex(vaultRoot, projectsGlob),
    ...readCrossProjectKnowledge(vaultRoot),
  ];
  if (index.length === 0) return '';

  const scored = index
    .map(e => ({ entry: e, score: scoreRelevance(e, taskText, projectId) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxEntries);

  if (scored.length === 0) return '';

  let result = '';
  for (const { entry } of scored) {
    const prefix = entry.projectId === projectId ? '' : `[${entry.projectId}] `;
    const snippet = `${prefix}${entry.text}`;
    if (result.length + snippet.length > maxChars) break;
    result += snippet + '\n\n';
  }
  return result.trim();
}
