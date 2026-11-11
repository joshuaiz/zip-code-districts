/**
 * ZIP-code districting engine (dependency-free ES module).
 *
 * Builds `k` contiguous districts inside one state by aggregating whole ZCTAs. Every mode has the
 * same three stages; only Stage 1 differs:
 *   Stage 1 — initial plan (the mode): seeded growth from an anchor, shortest splitline, county-first
 *             growth, or random spanning-tree splits (single verifiable draw / most typical of many).
 *   Stage 2 — balancing: move border ZCTAs between neighbouring districts whenever that lowers the
 *             squared population deviation and keeps both districts contiguous.
 *   Stage 3 — annealing: deterministic simulated annealing on Σ(deviation²) + μ·(weighted cut edges).
 * "Best score" is not a Stage-1 method: it picks, per state, the best of the other modes' maps by a
 * rule fixed in advance (see pickBest).
 *
 * Works the same in Node (build-time) and the browser (Astro component or Web Worker).
 */

/** Mode metadata (also drives the UI). */
export const STRATEGY_INFO = {
  nw: { label: "NW corner", group: "Start point", desc: "Each state fills from its northwest corner. District 1 grows from the ZIP nearest that corner; each new district starts at the unassigned ZIP closest to it." },
  ne: { label: "NE corner", group: "Start point", desc: "Each state fills from its northeast corner. District 1 grows from the ZIP nearest that corner; each new district starts at the unassigned ZIP closest to it." },
  center: { label: "State center", group: "Start point", desc: "Each state fills outward from the middle of its map extent. District 1 surrounds the central ZIP; later districts form around it." },
  zip: { label: "ZIP number", group: "Start point", desc: "Each state starts at its lowest-numbered ZIP, and a growing district always adds the neighboring ZIP with the lowest number. Postal numbering follows mail-sorting regions, so districts follow them too." },
  splitline: { label: "Shortest splitline", group: "Fixed rule", desc: "Cut the state with the shortest straight line that divides its population in the right ratio (e.g. 9 seats → 4:5), then cut each half the same way until every piece is one district. No settings, so only one possible map." },
  county: { label: "Counties first", group: "Fixed rule", desc: "Like Iowa's nonpartisan process: districts take whole counties wherever population allows and split a county only when they must. Growth starts in the northwest; borders prefer county lines." },
  best: { label: "Best score", group: "Pick by rule", desc: "For each state, take every other mode's map and keep the one with the smoothest borders (fewest split neighbor links), among maps within ±2% of ideal. The rule was fixed before any map was drawn." },
  random: { label: "Random draw", group: "Pick by rule", desc: "One random map per state, built by cutting random spanning trees. The random seed comes from a public number published before the maps (the 2020 apportionment total), so anyone can rerun it and get the same map. No rerolls." },
  central: { label: "Most typical", group: "Pick by rule", desc: "Draw 100 random maps per state, then keep the one most like all the others (fewest disagreements on which neighbors share a district). Randomness explores, a fixed rule chooses." },
};
export const STRATEGIES = Object.fromEntries(Object.entries(STRATEGY_INFO).map(([k, v]) => [k, v.label]));

/** Public seed for the verifiable random modes: fixed before any map was generated. */
export const PUBLIC_SEED = "2020 Census apportionment population 331108434";

/** FNV-1a 32-bit hash: anyone can reproduce the seed for a state from PUBLIC_SEED. */
export function verifiableSeed(state, mode) {
  const str = `${PUBLIC_SEED}|${state}|${mode}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/** mulberry32 PRNG: deterministic for a given seed. */
export function makeRng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * "Best score" selection rule, fixed in advance. Among candidate maps for one state:
 *   1. eligible = maps whose largest deviation is ≤ 2% (if none qualify, all are eligible);
 *   2. fewest cut edges (adjacent ZIP pairs split between districts: smoother, more compact borders);
 *   3. tie → smallest mean absolute deviation; 4. tie → mode order in STRATEGY_INFO.
 * @param {Array<{mode:string, result:ReturnType<typeof districtState>}>} candidates
 */
export function pickBest(candidates) {
  const order = Object.keys(STRATEGY_INFO);
  const devs = (r) => r.districts.map((d) => Math.abs(d.pop - r.ideal) / r.ideal);
  const scored = candidates.map((c) => { const d = devs(c.result); return { ...c, max: Math.max(...d), mean: d.reduce((a, b) => a + b, 0) / d.length }; });
  const ok = scored.filter((c) => c.max <= 0.02);
  const pool = ok.length ? ok : scored;
  pool.sort((a, b) => a.result.cutEdges - b.result.cutEdges || a.mean - b.mean || order.indexOf(a.mode) - order.indexOf(b.mode));
  return pool[0];
}

/**
 * @param {Array<{id:string,pop:number,x:number,y:number,nb:string[]}>} zctas  ZCTAs of ONE state
 *        (x/y in a projected metric CRS, y increasing northward; nb = neighbour ids in the same state)
 * @param {number} k  number of districts (seats)
 * @param {"nw"|"ne"|"center"|"zip"|"splitline"|"county"|"random"|"central"} strategy
 * @param {{maxPasses?:number, anneal?:boolean, annealIters?:number, seed?:number, ensemble?:number}} [opts]
 *        seed: annealing seed, and the random-tree seed for "random"/"central" (use verifiableSeed()).
 *        ZCTAs may carry `co` (county id) — required for "county", used for the county-split statistic.
 * @returns {{assignment: Record<string, number>, districts: Array<{n:number,pop:number,zctas:number}>, ideal:number, cutEdges:number, countySplits:number}}
 */
export function districtState(zctas, k, strategy, opts = {}) {
  const N = zctas.length;
  const idx = new Map(zctas.map((z, i) => [z.id, i]));
  const pop = Float64Array.from(zctas, (z) => z.pop);
  const X = Float64Array.from(zctas, (z) => z.x);
  const Y = Float64Array.from(zctas, (z) => z.y);
  const zipNum = Int32Array.from(zctas, (z) => parseInt(z.id, 10));
  const adj = zctas.map((z) => z.nb.map((id) => idx.get(id)).filter((j) => j !== undefined));
  const co = zctas.map((z) => z.co ?? null);
  // edge weights for the border-smoothness term: in county mode, cutting along a county line is cheap
  const adjW = adj.map((list, i) => list.map((j) => (strategy === "county" && co[i] !== co[j] ? 0.15 : 1)));
  const total = pop.reduce((a, b) => a + b, 0);
  const T = total / k;
  const D = new Int32Array(N).fill(-1);

  if (k === 1) {
    D.fill(0);
    return finish();
  }

  // ---------- anchor ----------
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < N; i++) {
    minX = Math.min(minX, X[i]); maxX = Math.max(maxX, X[i]);
    minY = Math.min(minY, Y[i]); maxY = Math.max(maxY, Y[i]);
  }
  const anchor = {
    nw: [minX, maxY], ne: [maxX, maxY], center: [(minX + maxX) / 2, (minY + maxY) / 2], county: [minX, maxY],
  }[strategy] ?? null;
  const span = Math.hypot(maxX - minX, maxY - minY) || 1;
  const dA = (i) => (anchor ? Math.hypot(X[i] - anchor[0], Y[i] - anchor[1]) : 0);

  // seed: unassigned ZCTA nearest the anchor (or lowest ZIP number).
  // Prefer populated ZCTAs so a district never starts on an empty P.O.-box polygon.
  function nextSeed() {
    let best = -1, bestKey = Infinity;
    for (let i = 0; i < N; i++) {
      if (D[i] !== -1) continue;
      const key = (strategy === "zip" ? zipNum[i] : dA(i)) + (pop[i] > 0 ? 0 : 1e12);
      if (key < bestKey) { bestKey = key; best = i; }
    }
    return best;
  }

  // ---------- Stage 1: initial plan ----------
  if (strategy === "splitline") splitlinePartition();
  else if (strategy === "random") treePartition(makeRng(opts.seed ?? 1));
  else if (strategy === "central") centralPartition(makeRng(opts.seed ?? 1), opts.ensemble ?? 100);
  else {
    for (let d = 0; d < k; d++) {
      const seed = nextSeed();
      if (seed < 0) break;
      if (d === k - 1) { // last district takes whatever is left; stray pieces are absorbed below
        for (let i = 0; i < N; i++) if (D[i] === -1) D[i] = d;
        break;
      }
      grow(seed, d, T);
      absorbEnclaves(d);
    }
  }
  // fewer districts than seats (rare): split the most populous district until we have k
  let made = new Set(D).size;
  while (made < k) { splitLargest(made); made++; }
  fixFragments();

  // ---------- Stage 2: balancing ----------
  balance(opts.maxPasses ?? 400);

  // ---------- Stage 3: annealing (population equality + compact borders) ----------
  if (opts.anneal !== false) {
    const iters = opts.annealIters ?? Math.max(20000, 600 * N);
    anneal(iters, opts.seed ?? 12345, strategy === "county" ? 3e-5 : 4e-6);
    // county mode trades a little balance for whole counties; if any district ends up beyond ±2%,
    // rebalance that state once at the normal border weight
    if (strategy === "county" && maxDev() > 0.02) anneal(iters, (opts.seed ?? 12345) + 1, 4e-6);
  }
  
  return finish();

  // ======================================================================
  function grow(seed, dist, target) {
    // frontier = unassigned neighbours of the district; priority depends on strategy
    let p = 0, cx = 0, cy = 0, w = 0;
    const touched = new Set();   // counties this district already reaches (county mode)
    const inFrontier = new Uint8Array(N);
    const frontier = [];
    const add = (i) => {
      D[i] = dist; p += pop[i]; touched.add(co[i]);
      const wi = pop[i] + 1; cx = (cx * w + X[i] * wi) / (w + wi); cy = (cy * w + Y[i] * wi) / (w + wi); w += wi;
      for (const j of adj[i]) if (D[j] === -1 && !inFrontier[j]) { inFrontier[j] = 1; frontier.push(j); }
    };
    const priority = (j) => {
      if (strategy === "zip") return zipNum[j];                       // lowest ZIP first
      const comp = Math.hypot(X[j] - cx, Y[j] - cy);                   // compactness around the district
      const base = comp + 0.35 * dA(j);                                // + sweep away from the anchor
      return strategy === "county" && !touched.has(co[j]) ? base + 10 * span : base; // finish counties first
    };
    add(seed);
    while (p < target) {
      let bi = -1, bk = Infinity;
      for (let f = frontier.length - 1; f >= 0; f--) {
        const j = frontier[f];
        if (D[j] !== -1) { frontier[f] = frontier[frontier.length - 1]; frontier.pop(); continue; }
        const key = priority(j);
        if (key < bk) { bk = key; bi = j; }
      }
      if (bi < 0) break; // boxed in
      if (p + pop[bi] > target && Math.abs(p + pop[bi] - target) > Math.abs(p - target)) break;
      add(bi);
    }
  }

  // unassigned components too small to hold a district get merged into a neighbouring district
  function absorbEnclaves(current) {
    for (const comp of components((i) => D[i] === -1)) {
      const cp = comp.reduce((a, i) => a + pop[i], 0);
      if (cp >= 0.5 * T) continue;
      const target = neighbourDistrict(comp, current);
      for (const i of comp) D[i] = target;
    }
  }

  function neighbourDistrict(comp, prefer) {
    const counts = new Map();
    for (const i of comp) for (const j of adj[i]) if (D[j] >= 0) counts.set(D[j], (counts.get(D[j]) || 0) + 1);
    if (counts.has(prefer)) return prefer;
    let best = -1, bc = -1;
    for (const [dd, c] of counts) if (c > bc) { bc = c; best = dd; }
    return best >= 0 ? best : prefer;
  }

  // every district must be one connected piece: keep its largest piece, hand the rest to neighbours
  function fixFragments() {
    for (let guard = 0; guard < 20; guard++) {
      let changed = false;
      for (let dd = 0; dd < k; dd++) {
        const comps = components((i) => D[i] === dd);
        if (comps.length <= 1) continue;
        comps.sort((a, b) => b.reduce((s, i) => s + pop[i], 0) - a.reduce((s, i) => s + pop[i], 0));
        for (const comp of comps.slice(1)) {
          const counts = new Map();
          for (const i of comp) for (const j of adj[i]) if (D[j] >= 0 && D[j] !== dd) counts.set(D[j], (counts.get(D[j]) || 0) + 1);
          let best = -1, bc = -1;
          for (const [x, c] of counts) if (c > bc) { bc = c; best = x; }
          if (best >= 0) { for (const i of comp) D[i] = best; changed = true; }
        }
      }
      if (!changed) break;
    }
  }

  function splitLargest(newId) {
    const pops = new Float64Array(k);
    for (let i = 0; i < N; i++) if (D[i] >= 0) pops[D[i]] += pop[i];
    let big = 0; for (let dd = 1; dd < k; dd++) if (pops[dd] > pops[big]) big = dd;
    const members = []; for (let i = 0; i < N; i++) if (D[i] === big) members.push(i);
    for (const i of members) D[i] = -1;
    const order = members.slice().sort((a, b) => dA(a) - dA(b));
    grow(order[order.length - 1], newId, pops[big] / 2);
    for (const i of members) if (D[i] === -1) D[i] = big;
  }

  function components(pred) {
    const seen = new Uint8Array(N), out = [];
    for (let s = 0; s < N; s++) {
      if (seen[s] || !pred(s)) continue;
      const comp = [s]; seen[s] = 1;
      for (let h = 0; h < comp.length; h++) for (const j of adj[comp[h]]) if (!seen[j] && pred(j)) { seen[j] = 1; comp.push(j); }
      out.push(comp);
    }
    return out;
  }

  // does removing node u keep district dd connected?
  function staysConnected(u, dd) {
    const nbs = adj[u].filter((j) => D[j] === dd);
    if (nbs.length <= 1) return true;
    const seen = new Set([u, nbs[0]]); const q = [nbs[0]]; let found = 1;
    const want = new Set(nbs);
    for (let h = 0; h < q.length && found < want.size; h++) for (const j of adj[q[h]]) {
      if (D[j] !== dd || seen.has(j)) continue;
      seen.add(j); q.push(j); if (want.has(j)) found++;
    }
    return found === want.size;
  }

  function balance(maxPasses) {
    const P = new Float64Array(k), C = new Int32Array(k);
    const SX = new Float64Array(k), SY = new Float64Array(k), W = new Float64Array(k);
    for (let i = 0; i < N; i++) { const dd = D[i]; P[dd] += pop[i]; C[dd]++; const wi = pop[i] + 1; SX[dd] += X[i] * wi; SY[dd] += Y[i] * wi; W[dd] += wi; }
    const cdist = (i, dd) => Math.hypot(X[i] - SX[dd] / W[dd], Y[i] - SY[dd] / W[dd]);
    for (let pass = 0; pass < maxPasses; pass++) {
      let moves = 0;
      for (let u = 0; u < N; u++) {
        const a = D[u]; if (C[a] <= 1) continue;
        let bestB = -1, bestScore = 0;
        for (const j of adj[u]) {
          const b = D[j]; if (b === a) continue;
          const gain = (P[a] - T) ** 2 + (P[b] - T) ** 2 - (P[a] - pop[u] - T) ** 2 - (P[b] + pop[u] - T) ** 2;
          if (gain <= 0) continue;
          // small compactness term: prefer handing a ZCTA to the district whose centre is closer
          const score = gain / (T * T) - 0.02 * (cdist(u, b) - cdist(u, a)) / span;
          if (score > bestScore) { bestScore = score; bestB = b; }
        }
        if (bestB < 0 || !staysConnected(u, a)) continue;
        const wi = pop[u] + 1;
        P[a] -= pop[u]; C[a]--; SX[a] -= X[u] * wi; SY[a] -= Y[u] * wi; W[a] -= wi;
        P[bestB] += pop[u]; C[bestB]++; SX[bestB] += X[u] * wi; SY[bestB] += Y[u] * wi; W[bestB] += wi;
        D[u] = bestB; moves++;
      }
      if (!moves) break;
    }
  }

  /**
   * Simulated annealing over boundary moves. Energy = Σ((P_d − T)/T)² + μ·(cut edges).
   * Cut edges (adjacencies split between districts) is the standard compactness proxy:
   * fewer cut edges = smoother, less tentacled borders. Deterministic for a given seed.
   */
  function maxDev() {
    const P = new Float64Array(k); for (let i = 0; i < N; i++) P[D[i]] += pop[i];
    let m = 0; for (let dd = 0; dd < k; dd++) m = Math.max(m, Math.abs(P[dd] - T) / T); return m;
  }

  function anneal(iters, seed, MU) {
    let s = seed >>> 0;
    const rand = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const E1 = [], E2 = [];
    for (let i = 0; i < N; i++) for (const j of adj[i]) if (i < j) { E1.push(i); E2.push(j); }
    if (!E1.length) return;
    const P = new Float64Array(k), C = new Int32Array(k);
    for (let i = 0; i < N; i++) { P[D[i]] += pop[i]; C[D[i]]++; }
    const popE = () => { let e = 0; for (let dd = 0; dd < k; dd++) e += ((P[dd] - T) / T) ** 2; return e; };
    const EW = [];
    for (let i = 0; i < N; i++) adj[i].forEach((j, q) => { if (i < j) EW.push(adjW[i][q]); });
    let cut = 0; for (let e = 0; e < E1.length; e++) if (D[E1[e]] !== D[E2[e]]) cut += EW[e];
    let energy = popE() + MU * cut;
    let best = energy; const bestD = Int32Array.from(D);
    const t0 = 5e-3, t1 = 1e-8;
    for (let it = 0; it < iters; it++) {
      const e = (rand() * E1.length) | 0;
      let u = E1[e], v = E2[e];
      if (D[u] === D[v]) continue;
      if (rand() < 0.5) { const t = u; u = v; v = t; }
      const a = D[u], b = D[v];
      if (C[a] <= 1) continue;
      const temp = t0 * Math.pow(t1 / t0, it / iters);
      // the move set: u alone, or u plus any small piece of district a that removing u would cut off
      let S = [u];
      if (!staysConnected(u, a)) { S = cutOffSet(u, a, 0.15 * T); if (!S) continue; }
      let mp = 0; for (const i of S) mp += pop[i];
      if (S.length >= C[a]) continue;
      const dPop = ((P[a] - mp - T) / T) ** 2 + ((P[b] + mp - T) / T) ** 2 - ((P[a] - T) / T) ** 2 - ((P[b] - T) / T) ** 2;
      let dCut = 0;
      if (S.length === 1) { adj[u].forEach((j, q) => { if (D[j] === a) dCut += adjW[u][q]; else if (D[j] === b) dCut -= adjW[u][q]; }); }
      else {
        const inS = new Set(S);
        for (const i of S) adj[i].forEach((j, q) => { if (inS.has(j)) return; if (D[j] === a) dCut += adjW[i][q]; else if (D[j] === b) dCut -= adjW[i][q]; });
      }
      const delta = dPop + MU * dCut;
      if (delta > 0 && rand() >= Math.exp(-delta / temp)) continue;
      for (const i of S) D[i] = b;
      P[a] -= mp; P[b] += mp; C[a] -= S.length; C[b] += S.length; cut += dCut; energy += delta;
      if (energy < best - 1e-12) { best = energy; bestD.set(D); }
    }
    D.set(bestD);
  }

  // If removing u splits district a, return u + every piece except the most populous one
  // (null if those pieces exceed maxPop). Moving them together keeps both districts contiguous.
  function cutOffSet(u, a, maxPop) {
    const pieces = [], seen = new Set([u]);
    for (const s0 of adj[u]) {
      if (D[s0] !== a || seen.has(s0)) continue;
      const comp = [s0]; seen.add(s0); let p = pop[s0];
      for (let h = 0; h < comp.length; h++) for (const j of adj[comp[h]]) if (D[j] === a && !seen.has(j)) {
        seen.add(j); comp.push(j); p += pop[j];
      }
      pieces.push({ comp, p });
    }
    pieces.sort((x, y) => y.p - x.p);
    const S = [u]; let p = pop[u];
    for (const pc of pieces.slice(1)) { p += pc.p; if (p > maxPop) return null; S.push(...pc.comp); }
    return S;
  }

  /**
   * Shortest splitline on ZIP population centroids. For a region needing kk districts, split A:B
   * (A = ⌊kk/2⌋) with the shortest straight cut, testing every whole-degree angle. ZIPs are whole
   * units, so each goes to the side its centroid falls on. Cut length is measured across the populated
   * ZIPs nearest the cut (empty land between ZIP areas isn't counted). Ties → closest to north–south.
   */
  function splitlinePartition() {
    let next = 0;
    const rec = (nodes, kk) => {
      if (kk === 1) { for (const i of nodes) D[i] = next; next++; return; }
      const A = Math.floor(kk / 2), B = kk - A;
      let P = 0; for (const i of nodes) P += pop[i];
      const target = (P * A) / kk;
      const m = Math.max(8, Math.ceil(nodes.length * 0.03));
      let best = null;
      for (let deg = 0; deg < 180; deg++) {
        const th = (deg * Math.PI) / 180, ux = Math.cos(th), uy = Math.sin(th), nx = -uy, ny = ux;
        const order = nodes.map((i) => [nx * X[i] + ny * Y[i], i]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        let cum = 0, cutIdx = 0, bestDiff = Infinity;
        for (let q = 0; q < order.length - 1; q++) { cum += pop[order[q][1]]; const df = Math.abs(cum - target); if (df < bestDiff) { bestDiff = df; cutIdx = q; } }
        const c = (order[cutIdx][0] + order[cutIdx + 1][0]) / 2;
        let lo = cutIdx, hi = cutIdx + 1, tmin = Infinity, tmax = -Infinity;
        for (let n = 0; n < m && (lo >= 0 || hi < order.length); n++) {
          const dl = lo >= 0 ? c - order[lo][0] : Infinity, dh = hi < order.length ? order[hi][0] - c : Infinity;
          const i = dl <= dh ? order[lo--][1] : order[hi++][1];
          const t = ux * X[i] + uy * Y[i]; if (t < tmin) tmin = t; if (t > tmax) tmax = t;
        }
        const len = tmax - tmin, ns = Math.abs(deg - 90);
        if (!best || len < best.len - 1e-6 || (Math.abs(len - best.len) <= 1e-6 && ns < best.ns)) best = { len, ns, order, cutIdx };
      }
      rec(best.order.slice(0, best.cutIdx + 1).map((o) => o[1]), A);
      rec(best.order.slice(best.cutIdx + 1).map((o) => o[1]), B);
    };
    rec([...Array(N).keys()], k);
  }

  /**
   * Random spanning-tree splits (the standard way to draw unbiased random districtings): draw a random
   * spanning tree of the region, cut one tree edge so one side holds A/kk of the population (±3%),
   * recurse. Both sides of a tree cut are connected, so districts start contiguous.
   */
  function treePartition(rng) {
    let next = 0;
    const inR = new Uint8Array(N), parentUF = new Int32Array(N);
    const find = (x) => { while (parentUF[x] !== x) { parentUF[x] = parentUF[parentUF[x]]; x = parentUF[x]; } return x; };
    const rec = (nodes, kk) => {
      if (kk === 1) { for (const i of nodes) D[i] = next; next++; return; }
      const A = Math.floor(kk / 2);
      let P = 0; for (const i of nodes) { P += pop[i]; inR[i] = 1; }
      const target = (P * A) / kk, tol = 0.03 * T;
      const base = []; for (const i of nodes) for (const j of adj[i]) if (i < j && inR[j]) base.push([i, j]);
      let bestSide = null, bestDiff = Infinity;
      for (let tries = 0; tries < 400 && bestDiff > tol; tries++) {
        const edges = base.map((e) => [rng(), e[0], e[1]]).sort((a, b) => a[0] - b[0]);
        for (const i of nodes) parentUF[i] = i;
        const tadj = new Map(nodes.map((i) => [i, []]));
        for (const [, i, j] of edges) { const ri = find(i), rj = find(j); if (ri !== rj) { parentUF[ri] = rj; tadj.get(i).push(j); tadj.get(j).push(i); } }
        const root = nodes[0], par = new Map([[root, -1]]), order = [root];
        for (let h = 0; h < order.length; h++) for (const j of tadj.get(order[h])) if (!par.has(j)) { par.set(j, order[h]); order.push(j); }
        const sub = new Map(); for (let h = order.length - 1; h >= 0; h--) { const v = order[h]; sub.set(v, (sub.get(v) || 0) + pop[v]); const pv = par.get(v); if (pv >= 0) sub.set(pv, (sub.get(pv) || 0) + sub.get(v)); }
        const cands = [];
        for (const v of order) {
          if (v === root) continue;
          const s1 = sub.get(v), d1 = Math.abs(s1 - target), d2 = Math.abs(P - s1 - target);
          if (Math.min(d1, d2) <= tol) cands.push([v, d1 <= d2]);
          if (Math.min(d1, d2) < bestDiff && !cands.length) { bestDiff = Math.min(d1, d2); bestSide = [v, d1 <= d2, tadj, par]; }
        }
        if (cands.length) { const [v, inside] = cands[(rng() * cands.length) | 0]; bestSide = [v, inside, tadj, par]; bestDiff = 0; }
      }
      const [v, inside, tadj, par] = bestSide;
      const subtree = new Set([v]); const q = [v];
      for (let h = 0; h < q.length; h++) for (const j of tadj.get(q[h])) if (par.get(j) === q[h] && !subtree.has(j)) { subtree.add(j); q.push(j); }
      const sideA = nodes.filter((i) => (inside ? subtree.has(i) : !subtree.has(i)));
      const sideB = nodes.filter((i) => (inside ? !subtree.has(i) : subtree.has(i)));
      for (const i of nodes) inR[i] = 0;
      rec(sideA, A); rec(sideB, kk - A);
    };
    rec([...Array(N).keys()], k);
  }

  /**
   * Most typical of an ensemble: draw `M` random tree-split maps, then keep the medoid — the map with
   * the fewest total disagreements with all others about which neighbouring ZIP pairs share a district.
   */
  function centralPartition(rng, M) {
    const E1 = [], E2 = [];
    for (let i = 0; i < N; i++) for (const j of adj[i]) if (i < j) { E1.push(i); E2.push(j); }
    const maps = [], cutCount = new Int32Array(E1.length);
    for (let mm = 0; mm < M; mm++) {
      D.fill(-1); treePartition(rng);
      const cutv = new Uint8Array(E1.length);
      for (let e = 0; e < E1.length; e++) if (D[E1[e]] !== D[E2[e]]) { cutv[e] = 1; cutCount[e]++; }
      maps.push({ D: Int32Array.from(D), cutv });
    }
    let bestI = 0, bestScore = Infinity;
    maps.forEach((mp, i) => {
      let sc = 0; for (let e = 0; e < E1.length; e++) sc += mp.cutv[e] ? M - cutCount[e] : cutCount[e];
      if (sc < bestScore) { bestScore = sc; bestI = i; }
    });
    D.set(maps[bestI].D);
  }

  function finish() {
    // renumber districts 1..k in creation order (keeps the strategy's sweep order visible)
    const assignment = {}; const districts = Array.from({ length: k }, (_, n) => ({ n: n + 1, pop: 0, zctas: 0 }));
    for (let i = 0; i < N; i++) { assignment[zctas[i].id] = D[i] + 1; districts[D[i]].pop += pop[i]; districts[D[i]].zctas++; }
    let cutEdges = 0; for (let i = 0; i < N; i++) for (const j of adj[i]) if (i < j && D[i] !== D[j]) cutEdges++;
    const byCounty = new Map(); for (let i = 0; i < N; i++) if (co[i]) { if (!byCounty.has(co[i])) byCounty.set(co[i], new Set()); byCounty.get(co[i]).add(D[i]); }
    let countySplits = 0; for (const s of byCounty.values()) if (s.size > 1) countySplits++;
    return { assignment, districts, ideal: T, cutEdges, countySplits };
  }
}
