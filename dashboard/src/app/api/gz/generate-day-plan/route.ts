import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { getVaultRoot, getAllProjects } from '@/lib/vault';
import { readConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';
// Allow up to 5 minutes for LLM plan generation
export const maxDuration = 300;

function readVaultFile(absPath: string): string | null {
  try { return fs.existsSync(absPath) ? fs.readFileSync(absPath, 'utf-8') : null; }
  catch { return null; }
}

function getReadyPhases(vaultRoot: string) {
  const projects = getAllProjects(vaultRoot);
  const lines: string[] = [];
  for (const p of projects) {
    for (const ph of p.phases) {
      if (ph.status === 'ready' || ph.status === 'active') {
        lines.push(`- [${p.id}] P${ph.phaseNum} — ${ph.phaseName}${ph.nextTask ? `\n   Next task: ${ph.nextTask}` : ''}`);
      }
    }
  }
  return lines.join('\n');
}

export async function POST() {
  const cfg = readConfig();
  const vaultRoot = getVaultRoot();
  const today = new Date().toISOString().slice(0, 10);
  const dayName = new Date().toLocaleDateString('en-GB', { weekday: 'long' });

  // Read API key
  const apiKey = cfg.llm?.api_key ?? process.env['OPENROUTER_API_KEY'];
  if (!apiKey) {
    return NextResponse.json({ error: 'No LLM API key configured. Set OPENROUTER_API_KEY in .env' }, { status: 400 });
  }

  // Read vault context
  const inboxRaw = readVaultFile(path.join(vaultRoot, '00 - Dashboard', 'Inbox.md'));
  const directionRaw = readVaultFile(path.join(vaultRoot, '00 - Dashboard', '.plan-direction.md'));
  const readyPhases = getReadyPhases(vaultRoot);

  // Read existing plan for replan context
  const primaryDir = path.join(vaultRoot, '00 - Dashboard', 'Daily');
  const primaryPath = path.join(primaryDir, `${today}.md`);
  const existingPlanRaw = readVaultFile(primaryPath);
  let existingPlanState = '';
  if (existingPlanRaw) {
    const lines = existingPlanRaw.split('\n');
    const doneTasks = lines.filter(l => /^- \[x\]/i.test(l.trim())).map(l => l.trim().replace(/^- \[x\]\s*/i, ''));
    const openTasks = lines.filter(l => /^- \[ \]/.test(l.trim())).map(l => l.trim().replace(/^- \[ \]\s*/, ''));
    if (doneTasks.length > 0 || openTasks.length > 0) {
      existingPlanState = `## Current Progress (replan — keep what is done, reschedule what remains)\n`;
      if (doneTasks.length > 0) {
        existingPlanState += `### Already done today (${doneTasks.length})\n` + doneTasks.slice(0, 15).map(t => `- [x] ${t}`).join('\n') + '\n\n';
      }
      if (openTasks.length > 0) {
        existingPlanState += `### Still open (${openTasks.length})\n` + openTasks.slice(0, 15).map(t => `- [ ] ${t}`).join('\n') + '\n\n';
      }
    }
  }

  // Parse inbox items
  let inboxItems = '';
  if (inboxRaw) {
    const { content } = matter(inboxRaw);
    const items = content.split('\n')
      .filter(l => /^\s*-\s*\[ \]/.test(l))
      .map(l => l.replace(/^\s*-\s*\[ \]\s*/, '- ').trim())
      .slice(0, 10);
    inboxItems = items.join('\n') || '(empty)';
  } else {
    inboxItems = '(no inbox file)';
  }

  const systemPrompt = `You are a senior engineering lead and productivity expert. Generate a realistic, time-blocked daily plan for a software engineer and entrepreneur.

Core principles:
- Maximum 3-4 hours of deep work total across two 90-min blocks
- Include morning routine, breaks, meals, and wind-down
- 6-10 concrete tasks total — under-promise, over-deliver
- Risk-first: schedule highest-risk work in the first deep-work block
- Be specific — use actual phase names and task descriptions from the context

Output format (markdown):
# Daily Plan — ${dayName}, ${today}

## Today's Mission
**Primary Goal:** <one sentence>

**Top 3 Priorities:**
1. <specific, actionable>
2. <specific, actionable>
3. <specific, actionable>

---

## Time-Blocked Schedule

### HH:MM — HH:MM: Morning Routine
- [ ] Wake, breakfast, prep

### HH:MM — HH:MM: Deep Work — <Project> · <Phase Name>
**Focus:** <what you're doing>
- [ ] <concrete task>
- [ ] <concrete task>

### HH:MM — HH:MM: <break/admin/etc>
...

(continue through the day)

---

## Success Criteria
### Must-Have
- [ ] <non-negotiable outcome>

### Should-Have
- [ ] <important but optional>`;

  const userPrompt = `Date: ${dayName}, ${today}

${existingPlanState ? existingPlanState + '\n' : ''}${directionRaw ? `## Direction override\n${directionRaw}\n\n` : ''}## Ready/Active Phases (work items)
${readyPhases || '(no phases ready — use inbox items as work)'}

## Inbox (unchecked items)
${inboxItems}

Generate the daily plan. ${existingPlanState ? 'This is a replan — preserve completed tasks, reschedule remaining work into the available hours left in the day, and incorporate any direction override.' : 'Be specific and realistic.'}`;

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
        max_tokens: 1500,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: `LLM API error: ${err}` }, { status: 500 });
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    const planContent = data.choices[0]?.message?.content ?? '';

    if (!planContent) {
      return NextResponse.json({ error: 'LLM returned empty response' }, { status: 500 });
    }

    // Write the plan to vault
    const frontmatter = `---\ntype: daily-plan\ndate: ${today}\ncreated: ${new Date().toISOString()}\n---\n`;
    const fullContent = frontmatter + planContent;

    fs.mkdirSync(primaryDir, { recursive: true });

    if (fs.existsSync(primaryPath)) {
      // Append revision block instead of overwriting
      const existing = fs.readFileSync(primaryPath, 'utf-8');
      const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      fs.writeFileSync(primaryPath, existing + `\n\n---\n\n## Revised Plan (${time})\n\n${planContent}`, 'utf-8');
    } else {
      fs.writeFileSync(primaryPath, fullContent, 'utf-8');
    }

    // Delete direction file after reading
    const directionPath = path.join(vaultRoot, '00 - Dashboard', '.plan-direction.md');
    if (fs.existsSync(directionPath)) {
      fs.unlinkSync(directionPath);
    }

    const relPath = path.relative(vaultRoot, primaryPath);
    return NextResponse.json({ content: planContent, path: relPath, date: today });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
