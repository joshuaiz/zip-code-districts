// Step 7: a small static SVG of one mode's 435 districts for the home page (no MapLibre, no data download).
// Usage: node pipeline/07_home_map.mjs [mode=splitline]  ->  public/img/home-map-<mode>.svg
// Lower 48 in an Albers equal-area projection, with Alaska and Hawaii insets (bottom left), like a reference map.
// Colours: the default Accessible theme (src/lib/themes.js), embedded so the file works as a plain <img>.
import fs from "node:fs";
import * as topojson from "topojson-client";
import { themeById, DEFAULT_THEME } from "../src/lib/themes.js";

const mode = process.argv[2] ?? "splitline";
const topo = JSON.parse(fs.readFileSync("public/data/zipdistricts.topo.json", "utf8"));
const land = JSON.parse(fs.readFileSync("public/data/land.topo.json", "utf8"));
const W = 975, H = 610, TOL = 1.8, GROW = 6; // GROW: each district is widened by a same-colour stroke this wide (px), closing small gaps of unpopulated land // output size (px) and simplification tolerance (px)

const rad = Math.PI / 180;
function albers(phi1, phi2, lon0, lat0) {
  const n = (Math.sin(phi1 * rad) + Math.sin(phi2 * rad)) / 2, C = Math.cos(phi1 * rad) ** 2 + 2 * n * Math.sin(phi1 * rad);
  const r = (lat) => Math.sqrt(C - 2 * n * Math.sin(lat * rad)) / n, r0 = r(lat0);
  return ([lon, lat]) => { const t = n * (lon - lon0) * rad, p = r(lat); return [p * Math.sin(t), -(r0 - p * Math.cos(t))]; };
}
const REGIONS = {
  l48: { proj: albers(29.5, 45.5, -96, 37.5), box: [10, 10, W - 10, H - 10] },
  ak: { proj: albers(55, 65, -154, 50), box: [20, H - 175, 225, H - 15] },
  hi: { proj: albers(8, 18, -157, 20), box: [235, H - 95, 345, H - 20] },
};
const regionOf = (st) => (st === "AK" ? "ak" : st === "HI" ? "hi" : "l48");

// decode a topology's arcs to lon/lat
const decode = (t) => t.arcs.map((a) => { let x = 0, y = 0; return a.map(([dx, dy]) => [(x += dx) * t.transform.scale[0] + t.transform.translate[0], (y += dy) * t.transform.scale[1] + t.transform.translate[1]]); });

// fit each region's projection to its box, using the district outlines (AK is clipped to exclude the Aleutians past 180°)
function fit(reg, pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { const [x, y] = reg.proj(p); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const [bx0, by0, bx1, by1] = reg.box, k = Math.min((bx1 - bx0) / (x1 - x0), (by1 - by0) / (y1 - y0));
  const ox = bx0 + ((bx1 - bx0) - k * (x1 - x0)) / 2 - k * x0, oy = by0 + ((by1 - by0) - k * (y1 - y0)) / 2 - k * y0;
  reg.xy = (p) => { const [x, y] = reg.proj(p); return [ox + k * x, oy + k * y]; };
}

const dist = topo.objects[`dist_${mode}`];
if (!dist) { console.error(`no layer dist_${mode}`); process.exit(1); }
const dArcs = decode(topo);
const pts = { l48: [], ak: [], hi: [] };
for (const g of dist.geometries) { const r = regionOf(g.properties[`d_${mode}`].slice(0, 2)); for (const poly of g.type === "Polygon" ? [g.arcs] : g.arcs) for (const ring of poly) for (const a of ring) for (const p of dArcs[a < 0 ? ~a : a]) if (r !== "ak" || p[0] < 0) pts[r].push(p); }
for (const r in REGIONS) fit(REGIONS[r], pts[r]);

// project + simplify each arc once per region, so shared borders stay identical
function arcPath(arcs, cache, i, region) {
  const key = region + (i < 0 ? ~i : i);
  let s = cache.get(key);
  if (!s) {
    const xy = REGIONS[region].xy, src = arcs[i < 0 ? ~i : i], out = [];
    for (let j = 0; j < src.length; j++) {
      const p = xy(src[j]); const q = out[out.length - 1];
      if (!q || j === src.length - 1 || Math.hypot(p[0] - q[0], p[1] - q[1]) >= TOL) out.push(p);
    }
    s = out; cache.set(key, s);
  }
  return i < 0 ? [...s].reverse() : s;
}
// relative path commands on a 0.5 px grid keep the file small
const q = (v) => Math.round(v * 2) / 2;
function rel(p, close) {
  let [x0, y0] = [q(p[0][0]), q(p[0][1])], d = "M" + x0 + " " + y0, out = [];
  for (let k = 1; k < p.length; k++) { const x = q(p[k][0]), y = q(p[k][1]); if (x === x0 && y === y0) continue; out.push(+(x - x0).toFixed(1) + " " + +(y - y0).toFixed(1)); x0 = x; y0 = y; }
  return out.length < (close ? 2 : 1) ? "" : d + "l" + out.join(" ").replace(/ -/g, "-") + (close ? "z" : "");
}
function ringD(arcs, cache, ring, region) {
  const p = [];
  for (const a of ring) { const s = arcPath(arcs, cache, a, region); for (let k = p.length ? 1 : 0; k < s.length; k++) p.push(s[k]); }
  return p.length < 3 ? "" : rel(p, true);
}
function geomD(arcs, cache, g, region) {
  return (g.type === "Polygon" ? [g.arcs] : g.arcs).flatMap((poly) => poly.map((ring) => ringD(arcs, cache, ring, region))).join("");
}

// At this size the holes in districts (unpopulated land inside them: forests, deserts, parks) read as speckle, so
// districts are drawn as their outer rings only, largest first, so any district enclosed by another stays on top.
// Land with no ZIP *between* districts still shows through in grey.
const dCache = new Map();
const ringArea = (pts) => { let a = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]); return Math.abs(a / 2); };
const districts = dist.geometries.map((g) => {
  const id = g.properties[`d_${mode}`], c = g.properties[`c_${mode}`], region = regionOf(id.slice(0, 2));
  const outers = (g.type === "Polygon" ? [g.arcs] : g.arcs).map((poly) => poly[0]);
  let area = 0;
  const d = outers.map((ring) => {
    const p = []; for (const a of ring) { const s = arcPath(dArcs, dCache, a, region); for (let k = p.length ? 1 : 0; k < s.length; k++) p.push(s[k]); }
    area += ringArea(p); return p.length < 3 ? "" : rel(p, true);
  }).join("");
  return { area, svg: `<path class="c${c}" d="${d}"/>` };
}).sort((a, b) => b.area - a.area).map((x) => x.svg);

// borders where two districts touch, drawn on top of the (widened) fills
const bordD = topojson.meshArcs(topo, dist, (a, b) => a !== b).arcs.map((line) => {
  const a = line[0], p0 = dArcs[a < 0 ? ~a : a][0], region = p0[1] < 24 && p0[0] < -150 ? "hi" : p0[1] > 51 && p0[0] < -129 ? "ak" : "l48";
  const pts = []; for (const i of line) { const s = arcPath(dArcs, dCache, i, region); for (let k = pts.length ? 1 : 0; k < s.length; k++) pts.push(s[k]); }
  return rel(pts, false);
}).join("");

// land (areas with no ZIP show through) and state lines between states, from the Census land layer
const lArcs = decode(land), lCache = new Map();
const landD = land.objects.land.geometries.map((g) => geomD(lArcs, lCache, g, regionOf(g.properties.STUSPS))).join("");
const mesh = topojson.meshArcs(land, land.objects.land, (a, b) => a !== b);
const stD = mesh.arcs.map((line) => {
  // which region: test the first point
  const a = line[0], p = lArcs[a < 0 ? ~a : a][0], region = p[1] < 24 && p[0] < -150 ? "hi" : p[1] > 51 && p[0] < -129 ? "ak" : "l48";
  const pts = []; for (const i of line) { const s = arcPath(lArcs, lCache, i, region); for (let k = pts.length ? 1 : 0; k < s.length; k++) pts.push(s[k]); }
  return rel(pts, false);
}).join("");

const T = themeById(DEFAULT_THEME);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="hm-t">` +
  `<style>${T.fills.map((f, i) => `.c${i}{fill:${f};stroke:${f}}`).join("")}.grow{stroke-linejoin:round}.borders{fill:none;stroke:${T.border};stroke-width:.6;stroke-linejoin:round}.land{fill:${T.land}}.states{fill:none;stroke:${T.state};stroke-width:.8;stroke-linejoin:round;stroke-linecap:round}</style>` +
  `<title id="hm-t">Map of all 435 U.S. House districts drawn from whole ZIP codes (${mode})</title>` +
  `<defs><path id="hm-l" d="${landD}"/><clipPath id="hm-land"><use href="#hm-l"/></clipPath></defs>` +
  `<use href="#hm-l" class="land"/>` +
  // pass 1 widens every district into nearby empty land; pass 2 redraws the exact shapes on top, so where two
  // districts touch the colour edge sits exactly on the border line
  `<defs><g id="hm-d">${districts.join("")}</g></defs>` +
  `<g clip-path="url(#hm-land)"><use href="#hm-d" class="grow" stroke-width="${GROW}"/><use href="#hm-d" stroke-width="0"/></g>` +
  `<path class="borders" d="${bordD}" clip-path="url(#hm-land)"/>` +
  `<path class="states" d="${stD}"/>` +
  `</svg>`;
fs.mkdirSync("public/img", { recursive: true });
const out = `public/img/home-map-${mode}.svg`;
fs.writeFileSync(out, svg);
console.log(out, (svg.length / 1024).toFixed(0) + " KB");
