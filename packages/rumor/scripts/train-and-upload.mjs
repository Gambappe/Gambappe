#!/usr/bin/env node
/**
 * Train the RumorSkill across all fetched sagas and version the lineage to xTrace
 * (WS27-T5). Chronological walk-forward: each saga is evaluated with the skill as
 * trained on strictly earlier sagas, then tuned on (one bounded knob move). Writes
 * data/skills/<label>.json + skill-live.json + training-report.json locally, then — when
 * XTRACE_API_KEY + XTRACE_APP_ID are set — uploads each version as an xTrace memory
 * under conv_id rumor:<label>, group 'rumor:lebron-2026', agent 'rumor-radar'.
 *
 * Requires builds first: pnpm --filter @receipts/rumor... build --filter @receipts/companion... build
 * Run from packages/rumor: node scripts/train-and-upload.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';

import { createXtraceClient, XTRACE_DEFAULT_API_BASE } from '@receipts/companion';

import {
  SAGAS,
  defaultRumorSkill,
  evaluateSkill,
  prepareEntries,
  trainSkill,
} from '../dist/index.js';
import { loadSagaEntries } from './lib/load-corpus.mjs';

setGlobalDispatcher(new EnvHttpProxyAgent());

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const SKILLS_DIR = join(DATA_DIR, 'skills');

// ---- load corpus ---------------------------------------------------------------------
const entriesBySaga = new Map();
for (const saga of SAGAS) {
  const entries = loadSagaEntries(saga.id);
  if (entries === null) {
    console.error(`missing corpus for ${saga.id} — run fetch-sagas.mjs first`);
    process.exit(1);
  }
  entriesBySaga.set(saga.id, entries);
}

// ---- train ---------------------------------------------------------------------------
const { skill, versions } = trainSkill(SAGAS, (id) => entriesBySaga.get(id));

// ---- trained-vs-untrained table ------------------------------------------------------
const untrained = defaultRumorSkill('untrained');
console.log('\nwalk-forward (pre-tune) vs untrained twin, per saga:');
let sumTrained = 0;
let sumUntrained = 0;
for (const v of versions) {
  const saga = SAGAS.find((s) => `skill@${s.id}` === v.label);
  const prepared = prepareEntries(entriesBySaga.get(saga.id), untrained);
  const twin = evaluateSkill(untrained, saga, prepared);
  sumTrained += v.pretune.meanLogLoss;
  sumUntrained += twin.meanLogLoss;
  const delta = twin.meanLogLoss - v.pretune.meanLogLoss;
  console.log(
    `  ${saga.id.padEnd(12)} trained-so-far ${v.pretune.meanLogLoss.toFixed(3)}  ` +
      `untrained ${twin.meanLogLoss.toFixed(3)}  Δ ${delta >= 0 ? '+' : ''}${delta.toFixed(3)}` +
      `  rank #${v.pretune.final.outcomeRank}` +
      (v.tuned
        ? `  [tuned ${v.tuned.knob}: ${v.tuned.from.toFixed(3)} → ${v.tuned.to.toFixed(3)}]`
        : '  [no tune]'),
  );
}
console.log(
  `  Σ mean logLoss: trained-so-far ${sumTrained.toFixed(3)} vs untrained ${sumUntrained.toFixed(3)}`,
);
console.log('\nfinal skill:', {
  cutoff: skill.cutoff,
  temperature: skill.temperature,
  recencyHalfLifeDays: skill.recencyHalfLifeDays,
  homerDiscount: skill.homerDiscount,
  upvoteAlpha: skill.upvoteAlpha,
});

// ---- write local artifacts -----------------------------------------------------------
mkdirSync(SKILLS_DIR, { recursive: true });
for (const v of versions) {
  writeFileSync(
    join(SKILLS_DIR, `${v.label.replace('skill@', 'skill-')}.json`),
    JSON.stringify(v.skill, null, 2),
  );
}
writeFileSync(join(SKILLS_DIR, 'skill-live.json'), JSON.stringify(skill, null, 2));
writeFileSync(
  join(SKILLS_DIR, 'training-report.json'),
  JSON.stringify(
    versions.map((v) => ({
      label: v.label,
      tuned: v.tuned,
      pretuneMeanLogLoss: v.pretune.meanLogLoss,
      pretuneFinalRank: v.pretune.final.outcomeRank,
      cutoff: v.skill.cutoff,
    })),
    null,
    2,
  ),
);
console.log(`\nwrote ${versions.length + 2} files to ${SKILLS_DIR}`);

// ---- upload lineage to xTrace --------------------------------------------------------
const apiKey = process.env.XTRACE_API_KEY;
const appId = process.env.XTRACE_APP_ID;
if (!apiKey || !appId) {
  console.log('\nXTRACE_API_KEY / XTRACE_APP_ID not set — skipping upload (local files only).');
  process.exit(0);
}
const client = createXtraceClient({
  apiBase: process.env.XTRACE_API_BASE ?? XTRACE_DEFAULT_API_BASE,
  apiKey,
  appId,
});
const groupId = await client.createGroup({ name: 'rumor:lebron-2026' });
console.log(`\nxTrace group: ${groupId ?? '(creation failed — uploading ungrouped)'}`);

let uploaded = 0;
for (const v of [...versions, { label: 'skill@live', skill }]) {
  const summary =
    `RumorSkill version ${v.label} (cutoff ${v.skill.cutoff}): ` +
    `temperature ${v.skill.temperature.toFixed(3)}, recency half-life ` +
    `${v.skill.recencyHalfLifeDays.toFixed(2)}d, homer discount ` +
    `${v.skill.homerDiscount.toFixed(2)}, upvote alpha ${v.skill.upvoteAlpha.toFixed(2)}. ` +
    `Trained sagas: ${Object.keys(v.skill.record).join(', ') || 'none'}.`;
  const ok = await client.ingest({
    userId: 'rumor-radar',
    convId: `rumor:${v.label}`,
    agentId: 'rumor-radar',
    groupIds: groupId ? [groupId] : [],
    messages: [
      { role: 'user', content: `Store the ${v.label} skill snapshot.` },
      { role: 'assistant', content: `${summary}\n\n${JSON.stringify(v.skill)}` },
    ],
  });
  console.log(`  ${ok ? '✓' : '✗'} ${v.label}`);
  if (ok) uploaded += 1;
}
console.log(`uploaded ${uploaded}/${versions.length + 1} skill versions to xTrace`);
