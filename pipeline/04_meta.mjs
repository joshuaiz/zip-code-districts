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
  ideal: {},
  results: {},
};
for (const [s, r] of Object.entries(A.results)) {
  const districts = {}; let sumAbs = 0, worst = 0, n = 0, w1 = 0, w2 = 0;
  for (const [st, v] of Object.entries(r.stats)) {
    meta.ideal[st] = v.ideal;
    for (const [num, pop, z] of v.districts) {
      const dev = (pop - v.ideal) / v.ideal;
      districts[`${st}-${num}`] = [pop, +(dev * 100).toFixed(2), z];
      if (A.seats[st] > 1) { n++; sumAbs += Math.abs(dev); worst = Math.max(worst, Math.abs(dev)); if (Math.abs(dev) <= 0.01) w1++; if (Math.abs(dev) <= 0.02) w2++; }
    }
  }
  meta.results[s] = { districts, summary: { meanAbsDevPct: +(100 * sumAbs / n).toFixed(2), maxAbsDevPct: +(100 * worst).toFixed(2), within1pct: w1, within2pct: w2, multiSeatDistricts: n } };
}
fs.writeFileSync(outPath, JSON.stringify(meta));
console.log(Object.fromEntries(Object.entries(meta.results).map(([k, v]) => [k, v.summary])));
