// Step 2: run every mode for every state; "best" picks per state by the fixed rule in pickBest().
import fs from "node:fs";
import { districtState, pickBest, verifiableSeed, STRATEGY_INFO, PUBLIC_SEED } from "../src/lib/districter.js";

const [, , graphPath, outDir] = process.argv;
const g = JSON.parse(fs.readFileSync(graphPath, "utf8"));
const byState = {};
for (const n of g.nodes) (byState[n.st] ??= []).push(n);
const modes = Object.keys(STRATEGY_INFO).filter((m) => m !== "best");

const out = { generated: new Date().toISOString(), source: g.source, seats: g.seats, publicSeed: PUBLIC_SEED,
  strategies: STRATEGY_INFO, results: {} };
const raw = {}; // raw[mode][state] = result
for (const m of modes) {
  const t0 = Date.now(); raw[m] = {};
  for (const [st, zs] of Object.entries(byState)) {
    const seed = m === "random" || m === "central" ? verifiableSeed(st, m) : undefined;
    raw[m][st] = districtState(zs, g.seats[st], m, { seed });
  }
  console.log(`${m.padEnd(9)} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
raw.best = {}; const winners = {};
for (const st of Object.keys(byState)) {
  const w = pickBest(modes.map((m) => ({ mode: m, result: raw[m][st] })));
  raw.best[st] = w.result; winners[st] = w.mode;
}
for (const m of [...modes, "best"]) {
  const assignment = {}, stats = {};
  for (const [st, r] of Object.entries(raw[m])) {
    for (const [z, d] of Object.entries(r.assignment)) assignment[z] = `${st}-${d}`;
    stats[st] = { ideal: Math.round(r.ideal), districts: r.districts.map((d) => [d.n, d.pop, d.zctas]), cutEdges: r.cutEdges, countySplits: r.countySplits };
    if (m === "best") stats[st].winner = winners[st];
  }
  out.results[m] = { assignment, stats };
}
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(`${outDir}/assignments.json`, JSON.stringify(out));
const tally = {}; for (const w of Object.values(winners)) tally[w] = (tally[w] || 0) + 1;
console.log("best-score winners by state count:", tally);
