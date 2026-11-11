// Step 4: compact per-district stats for the UI (populations, deviation, ZCTA counts, summaries).
import fs from "node:fs";
const [, , assignPath, outPath] = process.argv;
const A = JSON.parse(fs.readFileSync(assignPath, "utf8"));
const meta = {
  generated: A.generated,
  sources: {
    population: "U.S. Census Bureau, 2020 Census Demographic and Housing Characteristics (DHC), Table P1, by ZCTA",
    boundaries: "U.S. Census Bureau, 2020 cartographic boundary file cb_2020_us_zcta520_500k",
    seats: "2020 Census apportionment (435 seats)",
  },
  nationalAverage: 761169,
  seats: A.seats,
  strategies: A.strategies,
  publicSeed: A.publicSeed,
  stateStats: {},
  ideal: {},
  results: {},
};
for (const [s, r] of Object.entries(A.results)) {
  const districts = {}; let sumAbs = 0, worst = 0, n = 0, w1 = 0, w2 = 0, cut = 0, csplit = 0;
  meta.stateStats[s] = {};
  for (const [st, v] of Object.entries(r.stats)) {
    meta.ideal[st] = v.ideal;
    cut += v.cutEdges; csplit += v.countySplits;
    meta.stateStats[s][st] = { cutEdges: v.cutEdges, countySplits: v.countySplits, ...(v.winner ? { winner: v.winner } : {}) };
    for (const [num, pop, z] of v.districts) {
      const dev = (pop - v.ideal) / v.ideal;
      districts[`${st}-${num}`] = [pop, +(dev * 100).toFixed(2), z];
      if (A.seats[st] > 1) { n++; sumAbs += Math.abs(dev); worst = Math.max(worst, Math.abs(dev)); if (Math.abs(dev) <= 0.01) w1++; if (Math.abs(dev) <= 0.02) w2++; }
    }
  }
  meta.results[s] = { districts, summary: { meanAbsDevPct: +(100 * sumAbs / n).toFixed(2), maxAbsDevPct: +(100 * worst).toFixed(2), within1pct: w1, within2pct: w2, multiSeatDistricts: n, cutEdges: cut, countySplits: csplit } };
}
fs.writeFileSync(outPath, JSON.stringify(meta));

// modes.json: compact per-ZCTA district number + map colour for every mode (attached to features in the browser)
const colors = JSON.parse(fs.readFileSync(new URL("../data/district_colors.json", import.meta.url)));
const zctas = Object.keys(A.results.nw.assignment).sort();
const modes = {};
for (const [s, r] of Object.entries(A.results)) {
  modes[s] = {
    d: zctas.map((z) => +r.assignment[z].split("-")[1]),
    c: zctas.map((z) => colors[s][r.assignment[z]]),
  };
}
fs.writeFileSync(outPath.replace("districts.json", "modes.json"), JSON.stringify({ zctas, modes }));
console.log(Object.fromEntries(Object.entries(meta.results).map(([k, v]) => [k, v.summary])));
