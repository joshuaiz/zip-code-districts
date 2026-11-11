/**
 * ZIP-code districting engine (dependency-free ES module).
 *
 * Builds `k` contiguous districts inside one state by aggregating whole ZCTAs.
 *   Phase 1 — seeded growth: start at an anchor (NW corner, NE corner, state center or lowest ZIP),
 *             grow a district one adjacent ZCTA at a time until it reaches the state's ideal population,
 *             then seed the next district from the unassigned ZCTA nearest the anchor.
 *   Phase 2 — balancing: move boundary ZCTAs between neighbouring districts whenever that lowers the
 *             total squared population deviation and keeps both districts contiguous.
 *
 * Works the same in Node (build-time) and the browser (Astro/React island or Web Worker).
 */

export const STRATEGIES = {
  nw: "Start in the NW corner",
  ne: "Start in the NE corner",
  center: "Start in the state center",
  zip: "Start by ZIP code number",
};

/**
 * @param {Array<{id:string,pop:number,x:number,y:number,nb:string[]}>} zctas  ZCTAs of ONE state
 *        (x/y in a projected metric CRS, y increasing northward; nb = neighbour ids in the same state)
 * @param {number} k  number of districts (seats)
 * @param {"nw"|"ne"|"center"|"zip"} strategy
 * @param {{maxPasses?:number}} [opts]
 * @returns {{assignment: Record<string, number>, districts: Array<{n:number,pop:number,zctas:number}>, ideal:number}}
 */
export function districtState(zctas, k, strategy, opts = {}) {
  const N = zctas.length;
  const idx = new Map(zctas.map((z, i) => [z.id, i]));
  const pop = Float64Array.from(zctas, (z) => z.pop);
  const X = Float64Array.from(zctas, (z) => z.x);
  const Y = Float64Array.from(zctas, (z) => z.y);
  const zipNum = Int32Array.from(zctas, (z) => parseInt(z.id, 10));
  const adj = zctas.map((z) => z.nb.map((id) => idx.get(id)).filter((j) => j !== undefined));
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
    nw: [minX, maxY], ne: [maxX, maxY], center: [(minX + maxX) / 2, (minY + maxY) / 2], zip: null,
  }[strategy];
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

  // ---------- Phase 1: seeded growth ----------
  let d = 0;
  for (; d < k; d++) {
    const seed = nextSeed();
    if (seed < 0) break;
    if (d === k - 1) { // last district takes whatever is left; stray pieces are absorbed below
      for (let i = 0; i < N; i++) if (D[i] === -1) D[i] = d;
      break;
    }
    grow(seed, d, T);
    absorbEnclaves(d);
  }
  // fewer districts than seats (rare): split the most populous district until we have k
  let made = new Set(D).size;
  while (made < k) { splitLargest(made); made++; }
  fixFragments();

  // ---------- Phase 2: balancing ----------
  balance(opts.maxPasses ?? 400);

  // ---------- Phase 3: annealing (population equality + compact borders) ----------
  if (opts.anneal !== false) anneal(opts.annealIters ?? Math.max(20000, 600 * N), opts.seed ?? 12345);
  return finish();

  // ======================================================================
  function grow(seed, dist, target) {
    // frontier = unassigned neighbours of the district; priority depends on strategy
    let p = 0, cx = 0, cy = 0, w = 0;
    const inFrontier = new Uint8Array(N);
    const frontier = [];
    const add = (i) => {
      D[i] = dist; p += pop[i];
      const wi = pop[i] + 1; cx = (cx * w + X[i] * wi) / (w + wi); cy = (cy * w + Y[i] * wi) / (w + wi); w += wi;
      for (const j of adj[i]) if (D[j] === -1 && !inFrontier[j]) { inFrontier[j] = 1; frontier.push(j); }
    };
    const priority = (j) => {
      if (strategy === "zip") return zipNum[j];                       // lowest ZIP first
      const comp = Math.hypot(X[j] - cx, Y[j] - cy);                   // compactness around the district
      return comp + 0.35 * dA(j);                                      // + sweep away from the anchor
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
  function anneal(iters, seed) {
    let s = seed >>> 0;
    const rand = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const E1 = [], E2 = [];
    for (let i = 0; i < N; i++) for (const j of adj[i]) if (i < j) { E1.push(i); E2.push(j); }
    if (!E1.length) return;
    const MU = 4e-6;
    const P = new Float64Array(k), C = new Int32Array(k);
    for (let i = 0; i < N; i++) { P[D[i]] += pop[i]; C[D[i]]++; }
    const popE = () => { let e = 0; for (let dd = 0; dd < k; dd++) e += ((P[dd] - T) / T) ** 2; return e; };
    let cut = 0; for (let e = 0; e < E1.length; e++) if (D[E1[e]] !== D[E2[e]]) cut++;
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
      if (S.length === 1) { for (const j of adj[u]) { if (D[j] === a) dCut++; else if (D[j] === b) dCut--; } }
      else {
        const inS = new Set(S);
        for (const i of S) for (const j of adj[i]) { if (inS.has(j)) continue; if (D[j] === a) dCut++; else if (D[j] === b) dCut--; }
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

  function finish() {
    // renumber districts 1..k in creation order (keeps the strategy's sweep order visible)
    const assignment = {}; const districts = Array.from({ length: k }, (_, n) => ({ n: n + 1, pop: 0, zctas: 0 }));
    for (let i = 0; i < N; i++) { assignment[zctas[i].id] = D[i] + 1; districts[D[i]].pop += pop[i]; districts[D[i]].zctas++; }
    return { assignment, districts, ideal: T };
  }
}
