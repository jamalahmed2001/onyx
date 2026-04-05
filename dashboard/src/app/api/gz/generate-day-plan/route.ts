import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { getVaultRoot, getAllProjects, getDailyPlan } from '@/lib/vault';
import { readConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function readFile(absPath: string): string | null {
  try { return fs.existsSync(absPath) ? fs.readFileSync(absPath, 'utf-8') : null; }
  catch { return null; }
}

function getProjectSummaries(vaultRoot: string) {
  const projects = getAllProjects(vaultRoot);
  const sections: string[] = [];

  for (const p of projects) {
    const total = p.phases.length;
    if (total === 0) continue;
    const done = p.phases.filter(ph => ph.status === 'completed').length;
    const active = p.phases.filter(ph => ph.status === 'active');
    const ready = p.phases.filter(ph => ph.status === 'ready');
    const blocked = p.phases.filter(ph => ph.status === 'blocked');
    const backlog = p.phases.filter(ph => ph.status === 'backlog');

    const lines: string[] = [`### ${p.id} (${done}/${total} phases done)`];

    for (const ph of active) {
      lines.push(`- **ACTIVE** P${ph.phaseNum} — ${ph.phaseName} (${ph.tasksDone}/${ph.tasksTotal} tasks)`);
      if (ph.nextTask) lines.push(`  → Next: ${ph.nextTask}`);
    }
    for (const ph of blocked) {
      lines.push(`- **BLOCKED** P${ph.phaseNum} — ${ph.phaseName}${ph.blockedReason ? `: ${ph.blockedReason}` : ''}`);
    }
    for (const ph of ready) {
      lines.push(`- **READY** P${ph.phaseNum} — ${ph.phaseName} (${ph.tasksDone}/${ph.tasksTotal} tasks)`);
      if (ph.nextTask) lines.push(`  → Next: ${ph.nextTask}`);
    }
    if (backlog.length > 0) {
      lines.push(`- ${backlog.length} backlog phase(s) awaiting atomisation`);
    }

    sections.push(lines.join('\n'));
  }
  return sections.join('\n\n');
}

function getYesterdayPlan(vaultRoot: string): string {
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]!;
  const candidates = [
    path.join(vaultRoot, '04 - Planning', `Daily - ${yesterday}.md`),
    path.join(vaultRoot, '04 - Planning', `${yesterday}.md`),
    path.join(vaultRoot, '00 - Dashboard', 'Daily', `${yesterday}.md`),
    path.join(vaultRoot, '09 - Archive', 'Daily Archive (Legacy)', `Daily - ${yesterday}.md`),
  ];
  for (const p of candidates) {
    const raw = readFile(p);
    if (raw) {
      const lines = raw.split('\n');
      const done = lines.filter(l => /^\s*-\s*\[x\]/i.test(l)).map(l => l.replace(/^\s*-\s*\[x\]\s*/i, '').trim());
      const open = lines.filter(l => /^\s*-\s*\[ \]/.test(l)).map(l => l.replace(/^\s*-\s*\[ \]\s*/, '').trim());
      const parts: string[] = [];
      if (done.length > 0) parts.push(`### Completed yesterday (${done.length})\n${done.slice(0, 10).map(t => `- [x] ${t}`).join('\n')}`);
      if (open.length > 0) parts.push(`### Carried over from yesterday (${open.length})\n${open.slice(0, 10).map(t => `- [ ] ${t}`).join('\n')}`);
      return parts.join('\n\n') || '(no tasks found in yesterday\'s plan)';
    }
  }
  return '(no plan found for yesterday)';
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { direction?: string };
  const cfg = readConfig();
  const vaultRoot = getVaultRoot();
  const today = new Date().toISOString().split('T')[0]!;
  const dayName = new Date().toLocaleDateString('en-GB', { weekday: 'long' });
  const isWeekend = [0, 6].includes(new Date().getDay());

  const apiKey = cfg.llm?.api_key ?? process.env['OPENROUTER_API_KEY'];
  if (!apiKey) {
    return NextResponse.json({ error: 'No LLM API key configured. Set OPENROUTER_API_KEY in .env' }, { status: 400 });
  }

  // Gather all context
  const projectSummaries = getProjectSummaries(vaultRoot);
  const yesterdayContext = getYesterdayPlan(vaultRoot);

  // Read inbox
  const inboxRaw = readFile(path.join(vaultRoot, '00 - Dashboard', 'Inbox.md'));
  let inboxItems = '(empty)';
  if (inboxRaw) {
    const { content } = matter(inboxRaw);
    const items = content.split('\n')
      .filter(l => /^\s*-\s*\[ \]/.test(l))
      .map(l => l.replace(/^\s*-\s*\[ \]\s*/, '').trim())
      .slice(0, 12);
    if (items.length > 0) inboxItems = items.map(i => `- ${i}`).join('\n');
  }

  // Direction override (from request body or vault file)
  const directionFromFile = readFile(path.join(vaultRoot, '00 - Dashboard', '.plan-direction.md'));
  const direction = body.direction?.trim() || directionFromFile?.trim() || '';

  // Check for existing plan today (for replan)
  const existingPlan = getDailyPlan(vaultRoot);
  let replanContext = '';
  if (existingPlan.exists && existingPlan.date === today) {
    const lines = existingPlan.raw.split('\n');
    const done = lines.filter(l => /^\s*-\s*\[x\]/i.test(l)).map(l => l.replace(/^\s*-\s*\[x\]\s*/i, '').trim());
    const open = lines.filter(l => /^\s*-\s*\[ \]/.test(l)).map(l => l.replace(/^\s*-\s*\[ \]\s*/, '').trim());
    if (done.length > 0 || open.length > 0) {
      replanContext = `## Today's Progress So Far (this is a REPLAN)\n`;
      if (done.length > 0) replanContext += `### Done (${done.length})\n${done.slice(0, 15).map(t => `- [x] ${t}`).join('\n')}\n\n`;
      if (open.length > 0) replanContext += `### Still open (${open.length})\n${open.slice(0, 15).map(t => `- [ ] ${t}`).join('\n')}\n\n`;
      replanContext += `Keep completed items. Reschedule remaining work into the hours left.\n`;
    }
  }

  // Location
  const lat = cfg.location?.lat ?? 51.5074;
  const lng = cfg.location?.lng ?? -0.1278;

  const systemPrompt = `You are a senior engineering lead and productivity advisor generating a daily plan for a software engineer and entrepreneur.

You know the user's full project portfolio, yesterday's outcomes, inbox items, and their direction for today.

## Rules

1. **Realistic scope.** ${isWeekend ? 'This is a WEEKEND — lighter schedule, max 2-3h focused work, leave space for life/rest.' : 'Weekday — up to 4h deep work across two 90-min blocks.'}
2. **Risk-first.** Schedule the hardest/riskiest task in the first deep-work block.
3. **Concrete tasks.** Every task must reference an actual project, phase, or inbox item — no vague "work on stuff".
4. **Prayer times.** Include approximate prayer times for lat ${lat}, lng ${lng} (estimate from the date ${today} — Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha). Use the ISNA calculation method. Mark prayer blocks in the schedule.
5. **Carry-over.** Unfinished tasks from yesterday should be rescheduled if still relevant.
6. **Time blocks.** Use actual times (HH:MM format). Include breaks, meals, and prayer slots.
7. **6-10 tasks total.** Under-promise, over-deliver.
8. **Checkboxes.** Every actionable item must be a markdown checkbox (\`- [ ] task\`).

## Output format (markdown only, no fences)

# Daily Plan — ${dayName}, ${today}

## Prayer Times (estimated)
- 🌅 **Fajr:** HH:MM
- ☀️ **Sunrise:** HH:MM
- 🌞 **Dhuhr:** HH:MM
- 🌤 **Asr:** HH:MM
- 🌆 **Maghrib:** HH:MM
- 🌃 **Isha:** HH:MM

## Today's Mission
**Primary Goal:** <one sentence>

**Top 3 Priorities:**
1. <specific, from project context>
2. <specific, from project context>
3. <specific, from project context or inbox>

---

## Schedule

### HH:MM — HH:MM: Block Name
- [ ] task

(continue through the full day)

---

## Success Criteria
### Must-Have
- [ ] <non-negotiable>

### Should-Have
- [ ] <stretch goal>`;

  const userPrompt = `# Context for ${dayName}, ${today}

${replanContext}${direction ? `## Direction\n${direction}\n\n` : ''}## Yesterday
${yesterdayContext}

## Projects
${projectSummaries || '(no active projects)'}

## Inbox
${inboxItems}

Generate the daily plan.`;

  try {
    const model = cfg.llm?.model ?? 'anthropic/claude-sonnet-4-6';
    const baseUrl = cfg.llm?.base_url ?? 'https://openrouter.ai/api/v1';

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 3000,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: `LLM API error: ${err.slice(0, 300)}` }, { status: 500 });
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    const planContent = data.choices[0]?.message?.content ?? '';

    if (!planContent) {
      return NextResponse.json({ error: 'LLM returned empty response' }, { status: 500 });
    }

    // Write to 04 - Planning/ (where the automated tool writes)
    const planDir = path.join(vaultRoot, '04 - Planning');
    const planPath = path.join(planDir, `Daily - ${today}.md`);
    fs.mkdirSync(planDir, { recursive: true });

    const frontmatter = `---\ntype: daily-plan\ndate: ${today}\ncreated: ${new Date().toISOString()}\n---\n`;

    if (fs.existsSync(planPath)) {
      // Replan: append revision block
      const existing = fs.readFileSync(planPath, 'utf-8');
      const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      fs.writeFileSync(planPath, existing + `\n\n---\n\n## Revised Plan (${time})\n\n${planContent}`, 'utf-8');
    } else {
      fs.writeFileSync(planPath, frontmatter + planContent, 'utf-8');
    }

    // Clean up direction file
    const directionPath = path.join(vaultRoot, '00 - Dashboard', '.plan-direction.md');
    if (fs.existsSync(directionPath)) {
      try { fs.unlinkSync(directionPath); } catch { /* ignore */ }
    }

    const relPath = path.relative(vaultRoot, planPath);
    return NextResponse.json({ content: planContent, path: relPath, date: today });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
