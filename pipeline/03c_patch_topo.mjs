// Step 3c (shortcut): (re)build the district layers of the given modes inside the EXISTING web TopoJSON,
// without the raw Census geometry that 03_geometry.py + build_geometry.sh need. District outlines are
// merged from the ZIP polygons already in each file (same arcs, so borders match the ZIP layer exactly),
// colours are recomputed (K colours, default 5; touching districts never share one, across state lines too) and label
// points are placed at each district's pole of inaccessibility. Layers of modes no longer in
// data/assignments.json are removed. Run after 02_run.mjs, before 04_meta.mjs:
//   node pipeline/03c_patch_topo.mjs splitcounty best
import fs from "node:fs";
import * as topojson from "topojson-client";

const modes = process.argv.slice(2);
if (!modes.length) { console.error("usage: node pipeline/03c_patch_topo.mjs <mode> [mode…]"); process.exit(1); }
const OUT = process.env.OUT || "public";
const A = JSON.parse(fs.readFileSync("data/assignments.json", "utf8"));
const g = JSON.parse(fs.readFileSync("data/zcta_graph.json", "utf8"));
const colors = JSON.parse(fs.readFileSync("data/district_colors.json", "utf8"));
const order = Object.keys(A.strategies); // canonical mode order = engine (ranked) order
for (const m of modes) if (!A.results[m]) throw new Error(`mode ${m} not in data/assignments.json`);

const natPath = `${OUT}/data/zipdistricts.topo.json`;
const nat = JSON.parse(fs.readFileSync(natPath, "utf8"));

// ZIP adjacency for colouring: ZIPs whose outlines share an edge in the national layer (crosses state lines).
// The engine graph's links across empty land are left out on purpose: districts that only face each other
// across unpopulated land don't touch on the map, and counting them would force far more colours.
const zipNb = new Map(g.nodes.map((n) => [n.id, new Set()]));
const arcOwners = new Map();
for (const geo of nat.objects.zctas.geometries) {
  const rings = geo.type === "Polygon" ? geo.arcs : geo.arcs.flat();
  for (const ring of rings) for (const a of ring) { const k = a < 0 ? ~a : a; (arcOwners.get(k) ?? arcOwners.set(k, []).get(k)).push(geo.properties.zcta); }
}
for (const zs of arcOwners.values()) for (let i = 0; i < zs.length; i++) for (let j = i + 1; j < zs.length; j++) if (zs[i] !== zs[j]) { zipNb.get(zs[i])?.add(zs[j]); zipNb.get(zs[j])?.add(zs[i]); }

// Map colouring: exactly K colours (default 5), no two touching districts alike (across state lines too),
// each colour used about equally. DSATUR order with backtracking; least-used colour first. Political maps
// conventionally use 4–7 colours (four always suffice in theory), so the themes ship 5-colour palettes.
const K = +(process.env.COLOURS || 5);
// Where K colours are impossible (in some modes 7–8 New York City districts all touch each other), a district
// with no free colour takes the one whose neighbours touch it least (fewest ZIP pairs in contact); the border line
// still divides them. The best of 40 seeded runs (least such contact) is kept.
function colour(asg) {
  const pairs = new Map(); // "a|b" -> number of touching ZIP pairs between districts a and b
  for (const [z, set] of zipNb) for (const w of set) { if (z > w) continue; const a = asg[z], b = asg[w]; if (!a || !b || a === b) continue; const key = a < b ? a + "|" + b : b + "|" + a; pairs.set(key, (pairs.get(key) || 0) + 1); }
  const nodes = [...new Set(Object.values(asg))].sort(), at = new Map(nodes.map((d, i) => [d, i]));
  const n = nodes.length;
  const adj = nodes.map(() => []), wt = nodes.map(() => new Map());
  for (const [key, c] of pairs) { const [a, b] = key.split("|").map((d) => at.get(d)); adj[a].push(b); adj[b].push(a); wt[a].set(b, c); wt[b].set(a, c); }
  // swap colours a<->b on the connected a/b-coloured component containing u (a Kempe chain)
  const kempe = (col, u, a, b) => { const seen = new Set([u]), q = [u];
    for (let h = 0; h < q.length; h++) for (const w of adj[q[h]]) if (!seen.has(w) && (col[w] === a || col[w] === b)) { seen.add(w); q.push(w); }
    for (const w of q) col[w] = col[w] === a ? b : a; };
  function attempt(k, seed) {
    let r = seed; const rand = () => ((r = (r * 16807) % 2147483647) / 2147483647);
    const col = new Int8Array(n).fill(-1), done = new Uint8Array(n);
    for (let step = 0; step < n; step++) {
      // DSATUR: most distinct neighbour colours, then most neighbours, then a seeded random tie-break
      let v = -1, bs = -1, bd = -1, br = -1;
      for (let x = 0; x < n; x++) if (!done[x]) { const s = new Set(adj[x].map((u) => col[u]).filter((c) => c >= 0)).size, d = adj[x].length, rr = rand();
        if (s > bs || (s === bs && (d > bd || (d === bd && rr > br)))) { v = x; bs = s; bd = d; br = rr; } }
      done[v] = 1;
      const free = () => { const used = new Set(adj[v].map((u) => col[u])); for (let c = 0; c < k; c++) if (!used.has(c)) return c; return -1; };
      let c = free();
      for (let a = 0; c < 0 && a < k; a++) for (let b = 0; c < 0 && b < k; b++) {
        if (a === b) continue;
        for (const u of adj[v]) if (col[u] === a) { const save = Int8Array.from(col); kempe(col, u, a, b); c = free(); if (c < 0) col.set(save); else break; }
      }
      if (c < 0) { // least-contact compromise
        const cost = new Array(k).fill(0); for (const u of adj[v]) if (col[u] >= 0) cost[col[u]] += wt[v].get(u);
        c = cost.indexOf(Math.min(...cost));
      }
      col[v] = c;
    }
    // even out colour use: move a district to a less-used colour when no neighbour has it
    const use = new Int32Array(k); for (const c of col) use[c]++;
    for (let pass = 0; pass < 20; pass++) { let moved = 0;
      for (let v = 0; v < n; v++) { if (adj[v].some((u) => col[u] === col[v])) continue; const used = new Set(adj[v].map((u) => col[u]));
        let best = col[v]; for (let c = 0; c < k; c++) if (!used.has(c) && use[c] < use[best] - 1) best = c;
        if (best !== col[v]) { use[col[v]]--; use[best]++; col[v] = best; moved++; } }
      if (!moved) break; }
    return col;
  }
  let best = null, bestCost = Infinity;
  for (let t = 0; t < 40 && bestCost > 0; t++) {
    const col = attempt(K, 12345 + t * 7919); let cost = 0, same = 0;
    for (let v = 0; v < n; v++) for (const u of adj[v]) if (u > v && col[u] === col[v]) { cost += wt[v].get(u); same++; }
    if (cost < bestCost) { best = { col, same }; bestCost = cost; }
  }
  if (best.same) console.log(`  ${best.same} touching pair(s) share a colour (${bestCost} ZIP contacts)`);
  return Object.fromEntries(nodes.map((d, i) => [d, best.col[i]]));
  throw new Error("colouring failed");
}

// pole of inaccessibility (polylabel, Agafonkin 2016), in lon/lat
function polylabel(poly, precision = 0.005) {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of poly[0]) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  const dist = (x, y) => { let inside = false, md = Infinity;
    for (const ring of poly) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, ay] = ring[i], [bx, by] = ring[j];
      if ((ay > y) !== (by > y) && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
      let px = bx, py = by, dx = ax - px, dy = ay - py;
      if (dx || dy) { const t = Math.max(0, Math.min(1, ((x - px) * dx + (y - py) * dy) / (dx * dx + dy * dy))); px += dx * t; py += dy * t; }
      md = Math.min(md, (x - px) ** 2 + (y - py) ** 2);
    }
    return (inside ? 1 : -1) * Math.sqrt(md); };
  const cell = (x, y, h) => { const d = dist(x, y); return { x, y, h, d, max: d + h * Math.SQRT2 }; };
  const size = Math.min(maxX - minX, maxY - minY); if (!size) return [minX, minY];
  let h = size / 2; const q = [];
  for (let x = minX; x < maxX; x += size) for (let y = minY; y < maxY; y += size) q.push(cell(x + h, y + h, h));
  let best = cell((minX + maxX) / 2, (minY + maxY) / 2, 0);
  while (q.length) {
    q.sort((a, b) => a.max - b.max); const c = q.pop();
    if (c.d > best.d) best = c;
    if (c.max - best.d <= precision) continue;
    h = c.h / 2; q.push(cell(c.x - h, c.y - h, h), cell(c.x + h, c.y - h, h), cell(c.x - h, c.y + h, h), cell(c.x + h, c.y + h, h));
  }
  return [best.x, best.y];
}
const ringArea = (r) => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return Math.abs(s / 2); };

function districtLayer(topo, zctaGeoms, asg, col, m) {
  const by = new Map();
  for (const geo of zctaGeoms) { const d = asg[geo.properties.zcta]; if (d) (by.get(d) ?? by.set(d, []).get(d)).push(geo); }
  return [...by.keys()].sort().map((d) => {
    const geom = topojson.mergeArcs(topo, by.get(d));
    if (geom.arcs.length === 1) { geom.type = "Polygon"; geom.arcs = geom.arcs[0]; }
    geom.properties = { ["c_" + m]: col[d], ["d_" + m]: d };
    return geom;
  });
}
function reorder(objects, fixedFirst, fixedMid) {
  const out = {};
  for (const k of fixedFirst) if (objects[k]) out[k] = objects[k];
  for (const m of order) if (objects["dist_" + m]) out["dist_" + m] = objects["dist_" + m];
  for (const k of fixedMid) if (objects[k]) out[k] = objects[k];
  for (const m of order) if (objects["lbl_" + m]) out["lbl_" + m] = objects["lbl_" + m];
  // anything else is kept, except layers of modes that no longer exist (dropped modes are removed)
  for (const k of Object.keys(objects)) if (!(k in out) && !/^(dist|lbl)_/.test(k)) out[k] = objects[k];
  return out;
}

const [sx, sy] = nat.transform.scale, [tx, ty] = nat.transform.translate;
for (const m of modes) {
  const asg = A.results[m].assignment;
  const col = (colors[m] = colour(asg));
  console.log(`${m}: ${Math.max(...Object.values(col)) + 1} colours`);
  // national layer + labels
  const geoms = districtLayer(nat, nat.objects.zctas.geometries, asg, col, m);
  nat.objects["dist_" + m] = { type: "GeometryCollection", geometries: geoms };
  nat.objects["lbl_" + m] = { type: "GeometryCollection", geometries: geoms.map((geo) => {
    const f = topojson.feature(nat, geo).geometry;
    const polys = f.type === "Polygon" ? [f.coordinates] : f.coordinates;
    const big = polys.reduce((a, b) => (ringArea(b[0]) > ringArea(a[0]) ? b : a));
    const [lon, lat] = polylabel(big);
    return { type: "Point", coordinates: [Math.round((lon - tx) / sx), Math.round((lat - ty) / sy)], properties: geo.properties };
  }) };
}
nat.objects = reorder(nat.objects, ["zctas"], ["states"]);
fs.writeFileSync(natPath, JSON.stringify(nat));
// per-state full-resolution files
for (const f of fs.readdirSync(`${OUT}/data/states`).filter((f) => f.endsWith(".topo.json"))) {
  const p = `${OUT}/data/states/${f}`, t = JSON.parse(fs.readFileSync(p, "utf8"));
  for (const m of modes) t.objects["dist_" + m] = { type: "GeometryCollection", geometries: districtLayer(t, t.objects.zctas.geometries, A.results[m].assignment, colors[m], m) };
  t.objects = reorder(t.objects, ["zctas"], []);
  fs.writeFileSync(p, JSON.stringify(t));
}
// keep colours in canonical order too
fs.writeFileSync("data/district_colors.json", JSON.stringify(Object.fromEntries(order.map((m) => [m, colors[m]]))));
console.log("patched", natPath, "and", fs.readdirSync(`${OUT}/data/states`).length, "state files");
