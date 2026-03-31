import type { ControllerConfig } from '../config/load.js';
import type { VaultBundle } from '../vault/reader.js';
import { createIssue, updateIssue } from './client.js';
import { notify } from '../notify/notify.js';
import { writeFrontmatter, appendToLog } from '../vault/writer.js';

export interface UplinkResult {
  created: number;
  updated: number;
  skipped: number;
}

// Post-atomise sync: vault phases → Linear issues.
// For each phase: if linear_identifier set → update; else → create + write identifier back.
// Notifies: linear_uplink_done
export async function uplinkPhasesToLinear(
  bundle: VaultBundle,
  config: ControllerConfig
): Promise<UplinkResult> {
  if (!config.linear) {
    return { created: 0, updated: 0, skipped: bundle.phases.length };
  }

  const { apiKey, teamId } = config.linear;
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const phase of bundle.phases) {
    if (!phase.exists) {
      skipped++;
      continue;
    }

    const phaseName = String(phase.frontmatter['phase_name'] ?? 'Unnamed Phase');
    const phaseContent = phase.content;
    const existingIdentifier = phase.frontmatter['linear_identifier'];

    try {
      if (typeof existingIdentifier === 'string' && existingIdentifier !== '') {
        // Update existing issue
        await updateIssue(apiKey, existingIdentifier, {
          title: phaseName,
          description: phaseContent,
          teamId,
        });
        updated++;
      } else {
        // Create new issue
        const issueId = await createIssue(apiKey, {
          teamId,
          title: phaseName,
          description: phaseContent,
          projectId: bundle.projectId,
        });

        // Write linear_identifier back to frontmatter
        const updatedFm = { ...phase.frontmatter, linear_identifier: issueId };
        writeFrontmatter(phase.path, updatedFm);
        created++;
      }

      appendToLog(phase.path, {
        runId: 'uplink',
        event: 'linear_uplink_done',
        detail: `${existingIdentifier ? 'Updated' : 'Created'} Linear issue`,
      });
    } catch (err) {
      // Log but don't throw — partial uplink is acceptable
      const detail = err instanceof Error ? err.message : String(err);
      appendToLog(phase.path, {
        runId: 'uplink',
        event: 'linear_uplink_done',
        detail: `Failed: ${detail}`,
      });
      skipped++;
    }
  }

  await notify({
    event: 'linear_uplink_done',
    projectId: bundle.projectId,
    detail: `created:${created} updated:${updated} skipped:${skipped}`,
  }, config);

  return { created, updated, skipped };
}
