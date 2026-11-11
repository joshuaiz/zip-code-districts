# ZIP Code Districts

## Run locally

```
yarn install
yarn dev           # http://localhost:8787  (/districts = React map, /standalone.html = no-build map)
yarn build         # static output in dist/
yarn astro check   # type-check src/
```

Requires Node 22+. Astro's dev server runs detached; stop it with `yarn astro dev stop`.

U.S. House districts built by aggregating adjacent ZIP Code Tabulation Areas (ZCTAs), with four
non-partisan seeding strategies. No voter, party, race or incumbent data is used anywhere.

## Results (2020 Census)

| Strategy | Mean deviation | Largest deviation | Within ±1% |
|---|---|---|---|
| NW corner | 0.22% | 1.65% | 418 / 429 |
| NE corner | 0.22% | 1.70% | 419 / 429 |
| State center | 0.22% | 3.36% | 416 / 429 |
| ZIP number | 0.20% | 1.80% | 424 / 429 |

All 435 districts in every strategy: correct seat count per state, every ZCTA assigned once, every
district contiguous (checked independently by `pipeline/05_verify.py`). The 6 single-seat states
(AK, DE, ND, SD, VT, WY) are one district each and are excluded from the deviation stats.

## Bundle layout

```
public/                     → copy into your Astro site's /public
  data/zipdistricts.topo.json   national layer: ZCTAs (10% simplified) + dissolved districts for all 4 strategies,
                                state outlines, district label points (one shared topology, 14.7 MB, 3.9 MB gzipped)
  data/states/XX.topo.json      full-resolution ZCTAs + districts per state, lazy-loaded at zoom ≥ 7 (43 MB total)
  data/land.topo.json           Census state boundaries (grey base layer: shows unpopulated land with no ZIP area)
  data/districts.json           per-district population, deviation, ZCTA count + summaries (45 KB)
  standalone.html, lib/         the standalone published map (no build step), served at /standalone.html
src/
  components/ZipDistrictMap.tsx React island (MapLibre + Tailwind), type-checked
  pages/districts.astro         example page
  lib/districter.js             the districting engine: dependency-free ES module, runs in Node or the browser
data/
  zcta_graph.json               the ZCTA graph the engine runs on (pop, state, coordinates, neighbours) 4.8 MB
  assignments.json              ZCTA → district for each strategy
  zip_to_district.csv           same, as a flat table
  district_stats.csv            every district × strategy with population and deviation
  zcta_state.csv                ZCTA → state, with share of area (for the 137 ZCTAs that cross state lines)
pipeline/                     rebuild everything from raw Census files
```

### Astro setup
```
yarn add maplibre-gl topojson-client && yarn add -D @types/topojson-client
```
Put `ZipDistrictMap.tsx` in `src/components`, copy `public/data`, and render it with
`client:only="react"`. The container needs a height (the example page uses `h-screen`). The data
files are static JSON, so any CDN or static host works. Enable gzip/brotli: TopoJSON compresses ~4×.

### Running the engine in the browser
```js
import { districtState } from "./lib/districter.js";
const graph = await fetch("/data/zcta_graph.json").then(r => r.json());
const mi = graph.nodes.filter(n => n.st === "MI");
const { assignment, districts } = districtState(mi, graph.seats.MI, "center");
```
A large state (CA, TX) takes ~2–3 s, so run it in a Web Worker if you add a "re-run with options" UI.
Options: `{ anneal: false }` skips the refinement phase (much faster, ~1–3% worse balance);
`seed` changes the annealing random seed (results are deterministic for a given seed).

## Method

1. **Building blocks**: 33,585 ZCTAs in the 50 states with 2020 DHC population (Table P1). A ZCTA
   that crosses a state line (137 of them, 556k people) is assigned whole to the state containing most
   of its area. DC and territories are excluded (no voting seat).
2. **Targets**: 2020 apportionment seats. The national average is 761,169 per seat, but each
   district targets *its state's* population ÷ seats (Montana 542k … Delaware 990k).
3. **Adjacency**: shared boundary (25 m tolerance); plus ZCTAs facing each other across an
   uncovered, unpopulated gap within 25 km (ZCTAs don't cover deserts, forests, parks); plus a
   single nearest link for islands (140 links, e.g. Hawaiian islands, Long Island Sound islands).
4. **Phase 1, seeded growth**: seed at the anchor (NW corner, NE corner, center of the state's
   extent, or lowest ZIP number); add the adjacent ZCTA closest to the growing district (tilted
   toward the anchor so the sweep is clean, or the lowest-numbered ZIP for the ZIP strategy) until
   the target is reached; seed the next district at the unassigned ZCTA nearest the anchor.
   Small enclosed leftovers are absorbed.
5. **Phase 2, greedy balancing**: move border ZCTAs between neighbouring districts whenever that
   reduces squared population deviation without breaking contiguity.
6. **Phase 3, annealing**: deterministic simulated annealing on
   Σ(deviation²) + μ·(cut edges). Cut edges (adjacencies split between districts) keep borders
   smooth. A move may carry along a small piece it would otherwise cut off, which lets districts
   pass through narrow rural corridors (this fixed El Paso).

## Caveats to state publicly
- **Population equality**: courts have held congressional districts to near-exact equality
  (*Karcher v. Daggett*, 1983). ZIPs are whole units of up to ~130k people, so ±1–2% is close to the
  practical floor for ZIP-only maps. Exact equality would require splitting a few ZIPs by census block.
- **ZIP ≠ ZCTA**: ZIP codes are USPS delivery routes. ZCTAs are the Census Bureau's area
  approximation of them (see Census ZCTA documentation).
- **Voting Rights Act**: a mechanical method does not check Section 2 compliance.
- **2020 basis**: rebuild with new data after the 2030 census (the pipeline is reusable).

## Rebuild
```
python3 pipeline/01_prepare.py RAW_DIR data        # needs geopandas; RAW_DIR has zcta/, state/, pop/
node    pipeline/02_run.mjs data/zcta_graph.json data
python3 pipeline/03_geometry.py data
# then the mapshaper commands in pipeline/build_geometry.sh, then:
node    pipeline/04_meta.mjs data/assignments.json public/data/districts.json
python3 pipeline/05_verify.py data/zcta_graph.json data/assignments.json
```

Sources: U.S. Census Bureau. 2020 Census DHC Table P1 by ZCTA; 2020 cartographic boundaries
`cb_2020_us_zcta520_500k` and `cb_2020_us_state_500k`; 2020 apportionment results.
