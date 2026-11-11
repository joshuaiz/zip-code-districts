// Step 2: run every mode for every state; "best" picks per state by the fixed rule in pickBest().
// Optional: --reuse <old assignments.json> [--rerun mode,mode] loads modes already in that file instead of
// recomputing them (the engine is deterministic, so this is only a speed-up). Modes listed in --rerun, and modes missing from the old file, are computed fresh.
import fs from "node:fs";
import { districtState, pickBest, verifiableSeed, STRATEGY_INFO, PUBLIC_SEED } from "../src/lib/districter.js";

const [, , graphPath, outDir, ...flags] = process.argv;
const flag = (name) => { const i = flags.indexOf(name); return i >= 0 ? flags[i + 1] : undefined; };
const prev = flag("--reuse") ? JSON.parse(fs.readFileSync(flag("--reuse"), "utf8")) : null;
const rerun = new Set((flag("--rerun") ?? "").split(",").filter(Boolean));
const g = JSON.parse(fs.readFileSync(graphPath, "utf8"));
const byState = {};
for (const n of g.nodes) (byState[n.st] ??= []).push(n);
const modes = Object.keys(STRATEGY_INFO).filter((m) => m !== "best");

const out = { generated: new Date().toISOString(), source: g.source, seats: g.seats, publicSeed: PUBLIC_SEED,
  strategies: STRATEGY_INFO, results: {} };
const raw = {}; // raw[mode][state] = result
const statePop = Object.fromEntries(Object.entries(byState).map(([st, zs]) => [st, zs.reduce((a, z) => a + z.pop, 0)]));
for (const m of modes) {
  const t0 = Date.now(); raw[m] = {};
  if (prev?.results[m] && !rerun.has(m)) { // rebuild the result objects from the old file
    const asg = {}; for (const [z, d] of Object.entries(prev.results[m].assignment)) { const [st, n] = d.split("-"); (asg[st] ??= {})[z] = +n; }
    for (const [st, v] of Object.entries(prev.results[m].stats)) raw[m][st] = { assignment: asg[st],
      districts: v.districts.map(([n, pop, zctas]) => ({ n, pop, zctas })), ideal: statePop[st] / g.seats[st], cutEdges: v.cutEdges, countySplits: v.countySplits };
    console.log(`${m.padEnd(11)} reused`); continue;
  }
  for (const [st, zs] of Object.entries(byState)) {
    const seed = m === "random" ? verifiableSeed(st, m) : undefined;
    raw[m][st] = districtState(zs, g.seats[st], m, { seed });
  }
  console.log(`${m.padEnd(11)} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
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
