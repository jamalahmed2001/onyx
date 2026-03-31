import { NextResponse } from 'next/server';
import { readConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';

export interface LinearIssue {
  id: string;
  title: string;
  description?: string;
  state: { name: string; type: string };
  team: { key: string; name: string };
  project?: { id: string; name: string };
  priority: number;
  updatedAt: string;
  url: string;
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
  const cfg = readConfig();
  const linear = cfg.linear as { api_key?: string } | undefined;
  const apiKey = linear?.api_key ?? process.env['LINEAR_API_KEY'] ?? '';

  if (!apiKey) {
    return NextResponse.json({ issues: [], viewerName: '', configured: false });
  }

  const issueFields = `
    id title description
    state { name type }
    team { key name }
    project { id name }
    priority updatedAt url
  `;

  const query = `{
    viewer {
      name
      assignedIssues(
        first: 100
        orderBy: updatedAt
        filter: { state: { type: { nin: ["completed", "cancelled"] } } }
      ) {
        nodes { ${issueFields} }
      }
    }
  }`;

  try {
    const json = await gql(apiKey, query);

    if (json.errors?.length) {
      return NextResponse.json({ issues: [], configured: true, error: json.errors[0]!.message });
    }

    const viewer = json.data?.viewer as { name?: string; assignedIssues?: { nodes: LinearIssue[] } } | undefined;
    const issues = viewer?.assignedIssues?.nodes ?? [];
    const viewerName = viewer?.name ?? '';

    return NextResponse.json({ issues, viewerName, configured: true });
  } catch (e) {
    return NextResponse.json({ issues: [], configured: true, error: String(e) });
  }
}
