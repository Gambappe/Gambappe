/** Shared corpus loader for the WS27 scripts: data/<sagaId>/*.json → CrowdEntry[]. */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isPostSnapshot, snapshotEntries } from '../../dist/index.js';

export const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');

export function loadSagaEntries(sagaId) {
  const dir = join(DATA_DIR, sagaId);
  if (!existsSync(dir)) return null;
  const entries = [];
  for (const file of readdirSync(dir)) {
    const parsed = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    if (!isPostSnapshot(parsed)) {
      console.warn(`  skipping invalid snapshot ${sagaId}/${file}`);
      continue;
    }
    entries.push(...snapshotEntries(parsed));
  }
  return entries;
}
