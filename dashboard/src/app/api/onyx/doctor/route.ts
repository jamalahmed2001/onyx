import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import path from 'path';
import { getVaultRoot, getAllProjects } from '@/lib/vault';

export const dynamic = 'force-dynamic';

const ONYX_ROOT = path.resolve(process.cwd(), '..');
const ONYX_BIN  = path.join(ONYX_ROOT, 'dist', 'cli', 'onyx.js');

export async function GET() {
  const vaultRoot = getVaultRoot();
  const projects = getAllProjects(vaultRoot);
  const allPhases = projects.flatMap(p => p.phases);

  const stats = {
    vaultRoot,
    projectCount: projects.length,
    phaseCount: allPhases.length,
    byStatus: {
      active:    allPhases.filter(p => p.status === 'active').length,
      blocked:   allPhases.filter(p => p.status === 'blocked').length,
      ready:     allPhases.filter(p => p.status === 'ready').length,
      planning:  allPhases.filter(p => p.status === 'planning').length,
      backlog:   allPhases.filter(p => p.status === 'backlog').length,
      completed: allPhases.filter(p => p.status === 'completed').length,
    },
    projectsNoPhases: projects.filter(p => p.phases.length === 0).map(p => p.id),
  };

  let doctorOutput = '';
  try {
    doctorOutput = execSync(`node "${ONYX_BIN}" doctor`, { cwd: ONYX_ROOT, timeout: 15_000, encoding: 'utf8' });
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string };
    doctorOutput = (err.stdout ?? '') + (err.stderr ?? '');
  }

  return NextResponse.json({ stats, doctorOutput });
}
