// Step 4b: flat tables. data/zip_to_district.csv (one column per mode) and data/district_stats.csv.
import fs from "node:fs";
const A = JSON.parse(fs.readFileSync("data/assignments.json", "utf8"));
const g = JSON.parse(fs.readFileSync("data/zcta_graph.json", "utf8"));
const modes = Object.keys(A.results);
const rows = [["zcta", "state", "county_fips", "pop2020", ...modes.map((m) => "district_" + m)].join(",")];
for (const n of [...g.nodes].sort((a, b) => (a.id < b.id ? -1 : 1))) rows.push([n.id, n.st, n.co ?? "", n.pop, ...modes.map((m) => A.results[m].assignment[n.id])].join(","));
fs.writeFileSync("data/zip_to_district.csv", rows.join("\n") + "\n");
const st = ["mode,district,state,pop2020,state_ideal,deviation_pct,zcta_count"];
for (const m of modes) for (const s of Object.keys(A.results[m].stats).sort()) {
  const v = A.results[m].stats[s];
  for (const [num, pop, z] of v.districts) st.push([m, `${s}-${num}`, s, pop, v.ideal, +((100 * (pop - v.ideal)) / v.ideal).toFixed(2), z].join(","));
}
fs.writeFileSync("data/district_stats.csv", st.join("\n") + "\n");
console.log("wrote zip_to_district.csv and district_stats.csv for", modes.join(", "));
