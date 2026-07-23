// WS26-T9 runtime trainer: train each persona on data/train.jsonl, evaluate frozen
// trained-vs-untrained twins on data/validation.jsonl (the legal tuning slice), write
// memories to data/memories.json (gitignored; T10 uploads them to xTrace).
import { readFile, writeFile } from 'node:fs/promises';
import { CPU_PERSONAS } from '@receipts/core';
import { baselinePolicies, frozenPolicy, runSimulation, trainMemory } from '../dist/index.js';

const load = async (name) => {
  const lines = (await readFile(new URL(`../data/${name}.jsonl`, import.meta.url), 'utf8')).split(
    '\n',
  );
  return lines.slice(1).filter(Boolean).map(JSON.parse);
};
const train = await load('train');
const validation = await load('validation');

const memories = {};
const table = [];
for (const persona of CPU_PERSONAS) {
  const { memory } = trainMemory(train, persona, '2026-05-31');
  memories[persona] = memory;
  const trained = runSimulation(validation, frozenPolicy(memory)).report;
  const baseline = runSimulation(
    validation,
    baselinePolicies().find((p) => p.name === `baseline:${persona}`),
  ).report;
  const per = (r) => (r.picks > 0 ? r.edgeSum / r.picks : 0);
  table.push({
    persona,
    params: {
      minFavProb: memory.params.minFavProb,
      maxFadeFavProb: memory.params.maxFadeFavProb,
      longshotMax: memory.params.longshotMax,
    },
    baseline: {
      picks: baseline.picks,
      winRate: baseline.winRate,
      edgeSum: +baseline.edgeSum.toFixed(2),
      edgePerPick: +per(baseline).toFixed(4),
    },
    trained: {
      picks: trained.picks,
      winRate: trained.winRate,
      edgeSum: +trained.edgeSum.toFixed(2),
      edgePerPick: +per(trained).toFixed(4),
    },
  });
}

await writeFile(
  new URL('../data/memories.json', import.meta.url),
  JSON.stringify(memories, null, 2),
);
console.log(JSON.stringify(table, null, 1));
