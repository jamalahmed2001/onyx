import { NextResponse } from 'next/server';
import { readConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';

function readLinearConfig(): { apiKey: string; teamId: string } {
  const cfg = readConfig();
  const linear = cfg.linear as { api_key?: string; team_id?: string } | undefined;
  return {
    apiKey: linear?.api_key ?? process.env['LINEAR_API_KEY'] ?? '',
    teamId: linear?.team_id ?? '',
  };
}

async function gql(apiKey: string, query: string): Promise<{ data?: Record<string, unknown>; errors?: { message: string }[] }> {
  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: apiKey },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(8000),
  });
  return res.json() as Promise<{ data?: Record<string, unknown>; errors?: { message: string }[] }>;
}

export async function GET() {
  const { apiKey, teamId } = readLinearConfig();
  if (!apiKey) {
    return NextResponse.json({ projects: [], configured: false });
  }

  try {
    const projectFields = `id name description state updatedAt teams { nodes { key name } }`;

    const safeTeamId = teamId.replace(/["\\]/g, '');
    const query = safeTeamId
      ? `{ team(id: "${safeTeamId}") { projects(first: 100, orderBy: updatedAt) { nodes { ${projectFields} } } } }`
      : `{ projects(first: 100, orderBy: updatedAt) { nodes { ${projectFields} } } }`;

    const json = await gql(apiKey, query);

    if (json.errors?.length) {
      return NextResponse.json({ projects: [], configured: true, error: json.errors[0]!.message });
    }

    const nodes = teamId
      ? ((json.data?.team as { projects?: { nodes: unknown[] } })?.projects?.nodes ?? [])
      : ((json.data?.projects as { nodes: unknown[] })?.nodes ?? []);

    return NextResponse.json({ projects: nodes, configured: true, teamScoped: !!teamId });
  } catch (e) {
    return NextResponse.json({ projects: [], configured: true, error: String(e) });
  }
}
