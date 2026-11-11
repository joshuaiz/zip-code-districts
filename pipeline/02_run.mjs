// Step 2: run all four strategies for every state; write assignments + a stats report.
import fs from "node:fs";
import { districtState, STRATEGIES } from "../src/lib/districter.js";

const [, , graphPath, outDir] = process.argv;
const g = JSON.parse(fs.readFileSync(graphPath, "utf8"));
const byState = {};
for (const n of g.nodes) (byState[n.st] ??= []).push(n);

const out = { generated: new Date().toISOString(), source: g.source, seats: g.seats, strategies: STRATEGIES, results: {} };
const report = [];
for (const strat of Object.keys(STRATEGIES)) {
  const t0 = Date.now();
  const assign = {}, stats = {};
  for (const [st, zs] of Object.entries(byState)) {
    const k = g.seats[st];
    const r = districtState(zs, k, strat);
    Object.assign(assign, Object.fromEntries(Object.entries(r.assignment).map(([z, d]) => [z, `${st}-${d}`])));
    stats[st] = { ideal: Math.round(r.ideal), districts: r.districts.map((d) => [d.n, d.pop, d.zctas]) };
  }
  out.results[strat] = { assignment: assign, stats };
  // summary
  let worst = 0, sumAbs = 0, cnt = 0, within1 = 0, within5 = 0;
  for (const [st, s] of Object.entries(stats)) {
    if (g.seats[st] === 1) continue;
    for (const [, p] of s.districts) {
      const dev = (p - s.ideal) / s.ideal; worst = Math.max(worst, Math.abs(dev)); sumAbs += Math.abs(dev); cnt++;
      if (Math.abs(dev) <= 0.01) within1++; if (Math.abs(dev) <= 0.05) within5++;
    }
  }
  report.push(`${strat.padEnd(7)} ${(Date.now() - t0) + "ms"}  districts(multi-seat states)=${cnt}  meanAbsDev=${(100 * sumAbs / cnt).toFixed(2)}%  max=${(100 * worst).toFixed(1)}%  ≤1%: ${within1}  ≤5%: ${within5}`);
}
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(`${outDir}/assignments.json`, JSON.stringify(out));
console.log(report.join("\n"));
