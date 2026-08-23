/**
 * Evidence retention sweeper (spec §80). Deletes scans (rows cascade + storage
 * artifacts) older than the organization's plan retention window. Scans pinned
 * by an ACTIVE baseline are always kept — a baseline without evidence is
 * worthless. Superseded-baseline evidence expires normally (metadata rows in
 * `baselines` retain the historical record). See docs/DATA_RETENTION.md.
 */
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { sql } from './db';
import { entitlementsFor } from './entitlements';
import { storageBase } from './storage';

export interface SweepResult {
  scansDeleted: number;
  orgsProcessed: number;
}

export async function sweepExpiredEvidence(now: Date = new Date()): Promise<SweepResult> {
  const orgs = await sql`select id, plan from organizations`;
  let scansDeleted = 0;
  for (const org of orgs) {
    const days = entitlementsFor(org['plan'] as string).evidenceRetentionDays;
    const cutoff = new Date(now.getTime() - days * 86400000);
    const expired = await sql`
      select sc.id from scans sc
      where sc.organization_id = ${org['id']}
        and sc.created_at < ${cutoff}
        and not exists (
          select 1 from baselines b
          where b.scan_id = sc.id and b.superseded_at is null
        )`;
    for (const row of expired) {
      const scanId = row['id'] as string;
      await sql`delete from scans where id = ${scanId}`; // observations/evidence/findings cascade
      await rm(join(storageBase(), 'scans', scanId), { recursive: true, force: true });
      scansDeleted += 1;
    }
  }
  if (scansDeleted > 0) console.log(`[retention] deleted ${scansDeleted} expired scan(s)`);
  return { scansDeleted, orgsProcessed: orgs.length };
}
