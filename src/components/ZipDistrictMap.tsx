/**
 * <ZipDistrictMap /> — React island for Astro (client:only="react").
 *
 *   npm i maplibre-gl topojson-client
 *   npm i -D @types/topojson-client
 *
 * Expects the static assets from /public/data (zipdistricts.topo.json, districts.json, states/*.topo.json).
 * Coarse national geometry draws at every zoom; full-resolution state files stream in at zoom >= 7.
 */
import { useEffect, useRef, useState } from "react";
import maplibregl, { type ExpressionSpecification, type FilterSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import * as topojson from "topojson-client";

export type Strategy = "nw" | "ne" | "center" | "zip";
type Meta = {
  seats: Record<string, number>;
  ideal: Record<string, number>;
  strategies: Record<Strategy, string>;
  results: Record<Strategy, { districts: Record<string, [number, number, number]>; summary: { meanAbsDevPct: number; maxAbsDevPct: number; within1pct: number; multiSeatDistricts: number } }>;
};

export const PALETTE = ["#4e79a7", "#f28e2b", "#59a14f", "#e15759", "#76b7b2", "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#86bcb6"];
const DETAIL_Z = 7;
const NONE: FilterSpecification = ["==", ["get", "zcta"], "__none__"];
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const fillExpr = (s: Strategy): ExpressionSpecification =>
  ["match", ["get", `c_${s}`], ...PALETTE.flatMap((c, i) => [i, c]), "#999999"] as unknown as ExpressionSpecification;

function bboxOf(g: GeoJSON.Geometry): [number, number, number, number] {
  const b: [number, number, number, number] = [180, 90, -180, -90];
  const walk = (c: any): void => {
    if (typeof c[0] === "number") { b[0] = Math.min(b[0], c[0]); b[1] = Math.min(b[1], c[1]); b[2] = Math.max(b[2], c[0]); b[3] = Math.max(b[3], c[1]); }
    else c.forEach(walk);
  };
  walk((g as any).coordinates);
  return b;
}

interface Props {
  dataUrl?: string;              // base URL of the data folder
  initialStrategy?: Strategy;
  className?: string;
  onSelect?: (districtId: string | null) => void;
}

export default function ZipDistrictMap({ dataUrl = "/data", initialStrategy = "nw", className = "", onSelect }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const store = useRef<any>({});
  const [meta, setMeta] = useState<Meta | null>(null);
  const [strategy, setStrategy] = useState<Strategy>(initialStrategy);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; zip: string; pop: number; d: string } | null>(null);

  // ---------- one-time setup ----------
  useEffect(() => {
    if (!box.current) return;
    const map = new maplibregl.Map({
      container: box.current,
      style: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#e6ebf1" } }] },
      bounds: [[-125, 24.3], [-66.8, 49.5]], maxZoom: 13.5, dragRotate: false,
      attributionControl: { compact: true, customAttribution: "U.S. Census Bureau (2020)" },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    const st = store.current;
    st.detail = { loaded: new Set<string>(), loading: new Set<string>(), z: [] as any[], d: [] as any[] };
    st.sel = NONE; st.strategy = initialStrategy;

    (async () => {
      const [m, topo, landTopo] = await Promise.all([
        fetch(`${dataUrl}/districts.json`).then((r) => r.json()),
        fetch(`${dataUrl}/zipdistricts.topo.json`).then((r) => r.json()),
        fetch(`${dataUrl}/land.topo.json`).then((r) => r.json()),
      ]);
      st.meta = m;
      const zctas = topojson.feature(topo, topo.objects.zctas) as unknown as GeoJSON.FeatureCollection;
      const states = topojson.feature(topo, topo.objects.states) as unknown as GeoJSON.FeatureCollection;
      st.dist = {}; st.distBBox = {};
      for (const s of Object.keys(m.strategies)) {
        st.dist[s] = topojson.feature(topo, topo.objects[`dist_${s}`]);
        st.distBBox[s] = Object.fromEntries(st.dist[s].features.map((f: any) => [f.properties[`d_${s}`], bboxOf(f.geometry)]));
      }
      st.stateBBox = Object.fromEntries(states.features.map((f: any) => [f.properties.st, bboxOf(f.geometry)]));
      if (!map.isStyleLoaded()) await new Promise((r) => map.once("load", r));
      const s0: Strategy = st.strategy;
      map.addSource("zctas", { type: "geojson", data: zctas, tolerance: 0.25 });
      map.addSource("dist", { type: "geojson", data: st.dist[s0], tolerance: 0.25 });
      map.addSource("states", { type: "geojson", data: states });
      // real state boundaries, so land with no ZIP area (unpopulated) shows grey instead of background
      map.addSource("land", { type: "geojson", data: topojson.feature(landTopo, landTopo.objects.land) as any, tolerance: 0.2 });
      map.addSource("zd", { type: "geojson", data: EMPTY, tolerance: 0.15 });
      map.addSource("dd", { type: "geojson", data: EMPTY, tolerance: 0.15 });
      const zipLine = { "line-color": "#fff", "line-width": ["interpolate", ["linear"], ["zoom"], 6.5, 0.2, 11, 0.9], "line-opacity": ["interpolate", ["linear"], ["zoom"], 6.5, 0, 8, 0.55] } as any;
      const distLine = { "line-color": "#1b2433", "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.35, 7, 1.1, 11, 2.2] } as any;
      const selLine = { "line-color": "#0b111a", "line-width": ["interpolate", ["linear"], ["zoom"], 3, 2, 10, 4.5] } as any;
      map.addLayer({ id: "land", type: "fill", source: "land", paint: { "fill-color": "#bfc4cb" } });
      map.addLayer({ id: "zcta-fill", type: "fill", source: "zctas", paint: { "fill-color": fillExpr(s0), "fill-opacity": 0.78, "fill-antialias": false } });
      map.addLayer({ id: "zcta-line", type: "line", source: "zctas", minzoom: 6.5, paint: zipLine });
      map.addLayer({ id: "zd-fill", type: "fill", source: "zd", layout: { visibility: "none" }, paint: { "fill-color": fillExpr(s0), "fill-opacity": 0.78, "fill-antialias": false } });
      map.addLayer({ id: "zd-line", type: "line", source: "zd", layout: { visibility: "none" }, paint: zipLine });
      map.addLayer({ id: "dist-line", type: "line", source: "dist", paint: distLine });
      map.addLayer({ id: "dd-line", type: "line", source: "dd", filter: ["==", ["get", "s"], s0], layout: { visibility: "none" }, paint: distLine });
      map.addLayer({ id: "state-line", type: "line", source: "states", paint: { "line-color": "#0b111a", "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1, 7, 2.4, 11, 3.6] } });
      map.addLayer({ id: "sel-line", type: "line", source: "dist", filter: NONE, paint: selLine });
      map.addLayer({ id: "dd-sel-line", type: "line", source: "dd", filter: NONE, paint: selLine });

      const refresh = () => {
        const s: Strategy = st.strategy;
        const on = map.getZoom() >= DETAIL_Z && st.detail.loaded.size > 0;
        ["zd-fill", "zd-line", "dd-line"].forEach((l) => map.setLayoutProperty(l, "visibility", on ? "visible" : "none"));
        const loaded = ["literal", [...st.detail.loaded]] as unknown as ExpressionSpecification;
        const notLoadedZ = ["!", ["in", ["get", "st"], loaded]] as unknown as FilterSpecification;
        const notLoadedD = ["!", ["in", ["slice", ["get", `d_${s}`], 0, 2], loaded]] as unknown as FilterSpecification;
        map.setFilter("zcta-fill", on ? notLoadedZ : null);
        map.setFilter("zcta-line", on ? notLoadedZ : null);
        map.setFilter("dist-line", on ? notLoadedD : null);
        map.setFilter("sel-line", on ? (["all", st.sel, notLoadedD] as unknown as FilterSpecification) : st.sel);
      };
      const loadDetail = () => {
        if (map.getZoom() < DETAIL_Z - 0.5) return;
        const b = map.getBounds();
        for (const [code, x] of Object.entries<number[]>(st.stateBBox)) {
          if (!(x[0] < b.getEast() && x[2] > b.getWest() && x[1] < b.getNorth() && x[3] > b.getSouth())) continue;
          if (st.detail.loaded.has(code) || st.detail.loading.has(code)) continue;
          st.detail.loading.add(code);
          fetch(`${dataUrl}/states/${code}.topo.json`).then((r) => r.json()).then((t) => {
            for (const f of (topojson.feature(t, t.objects.zctas) as any).features) { f.properties.st = code; st.detail.z.push(f); }
            for (const s of Object.keys(m.strategies)) for (const f of (topojson.feature(t, t.objects[`dist_${s}`]) as any).features) {
              f.properties = { s, d: f.properties[`d_${s}`] }; st.detail.d.push(f);
            }
            st.detail.loaded.add(code); st.detail.loading.delete(code);
            (map.getSource("zd") as maplibregl.GeoJSONSource).setData({ type: "FeatureCollection", features: st.detail.z });
            (map.getSource("dd") as maplibregl.GeoJSONSource).setData({ type: "FeatureCollection", features: st.detail.d });
            refresh();
          }).catch(() => st.detail.loading.delete(code));
        }
      };
      st.refresh = refresh;
      map.on("moveend", () => { loadDetail(); refresh(); });
      for (const l of ["zcta-fill", "zd-fill"]) {
        map.on("mousemove", l, (e) => {
          const p: any = e.features![0].properties;
          map.getCanvas().style.cursor = "pointer";
          setHover({ x: e.point.x, y: e.point.y, zip: p.zcta, pop: p.pop, d: p[`d_${st.strategy}`] });
        });
        map.on("mouseleave", l, () => { map.getCanvas().style.cursor = ""; setHover(null); });
        map.on("click", l, (e) => setSelected((e.features![0].properties as any)[`d_${st.strategy}`]));
      }
      setMeta(m);
    })().catch(console.error);
    return () => map.remove();
  }, [dataUrl, initialStrategy]);

  // ---------- strategy changes ----------
  useEffect(() => {
    const map = mapRef.current, st = store.current;
    st.strategy = strategy;
    if (!meta || !map) return;
    map.setPaintProperty("zcta-fill", "fill-color", fillExpr(strategy));
    map.setPaintProperty("zd-fill", "fill-color", fillExpr(strategy));
    map.setFilter("dd-line", ["==", ["get", "s"], strategy]);
    (map.getSource("dist") as maplibregl.GeoJSONSource).setData(st.dist[strategy]);
    setSelected(null);
    st.refresh?.();
  }, [strategy, meta]);

  // ---------- selection ----------
  useEffect(() => {
    const map = mapRef.current, st = store.current;
    onSelect?.(selected);
    if (!meta || !map) return;
    st.sel = (["==", ["get", `d_${strategy}`], selected ?? "__none__"] as unknown as FilterSpecification);
    map.setFilter("dd-sel-line", ["all", ["==", ["get", "s"], strategy], ["==", ["get", "d"], selected ?? "__none__"]]);
    st.refresh?.();
  }, [selected, strategy, meta]);

  const sum = meta?.results[strategy].summary;
  const sel = selected && meta ? meta.results[strategy].districts[selected] : null;
  const hv = hover && meta ? meta.results[strategy].districts[hover.d] : null;

  return (
    <div className={`relative h-full w-full ${className}`}>
      <div ref={box} className="absolute inset-0" />
      <div className="absolute left-3 top-3 z-10 w-72 rounded-xl border border-slate-200 bg-white/95 p-3 text-sm shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
        <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Districting strategy">
          {(["nw", "ne", "center", "zip"] as Strategy[]).map((s) => (
            <button key={s} type="button" aria-pressed={strategy === s} onClick={() => setStrategy(s)}
              className={`rounded-lg border px-2 py-1.5 text-left font-medium ${strategy === s ? "border-blue-700 bg-blue-50 dark:bg-blue-950" : "border-slate-200 hover:border-blue-700 dark:border-slate-700"}`}>
              {{ nw: "NW corner", ne: "NE corner", center: "State center", zip: "ZIP number" }[s]}
            </button>
          ))}
        </div>
        {sum && (
          <p className="mt-2 text-xs text-slate-500 tabular-nums">
            Mean deviation {sum.meanAbsDevPct.toFixed(2)}% · max {sum.maxAbsDevPct.toFixed(1)}% · {sum.within1pct}/{sum.multiSeatDistricts} within ±1%
          </p>
        )}
        {sel && selected && (
          <div className="mt-2 border-t border-slate-200 pt-2 tabular-nums dark:border-slate-700">
            <div className="text-lg font-extrabold">{selected}</div>
            <div>Population {sel[0].toLocaleString()} ({sel[1] > 0 ? "+" : ""}{sel[1].toFixed(2)}% vs ideal {meta!.ideal[selected.split("-")[0]].toLocaleString()})</div>
            <div className="text-slate-500">{sel[2]} ZIP codes</div>
          </div>
        )}
        {!meta && <p className="mt-2 text-xs text-slate-500">Loading 33,585 ZIP code areas…</p>}
      </div>
      <details open className="absolute bottom-7 left-3 z-10 max-w-[250px] rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-sm dark:border-slate-700 dark:bg-slate-900/95">
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-slate-500">Legend</summary>
        <ul className="mt-2 grid gap-1.5">
          <li className="grid grid-cols-[22px_1fr] gap-2"><span className="mt-0.5 h-3.5 rounded-sm opacity-80" style={{ background: `linear-gradient(90deg,${PALETTE[0]} 0 33%,${PALETTE[1]} 33% 66%,${PALETTE[2]} 66%)` }} /><span>District<br /><span className="text-slate-500">Colors only tell neighbors apart.</span></span></li>
          <li className="grid grid-cols-[22px_1fr] gap-2"><span className="mt-0.5 h-3.5 rounded-sm bg-[#bfc4cb]" /><span>No ZIP code area<br /><span className="text-slate-500">Unpopulated land such as national forests, deserts, parks and military ranges. Zero residents, so it belongs to no district.</span></span></li>
          <li className="grid grid-cols-[22px_1fr] items-center gap-2"><span className="border-t-[3px] border-[#0b111a]" /><span>State line</span></li>
          <li className="grid grid-cols-[22px_1fr] items-center gap-2"><span className="border-t border-[#1b2433]" /><span>District border</span></li>
        </ul>
      </details>
      {hover && hv && (
        <div className="pointer-events-none absolute z-20 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-md tabular-nums dark:border-slate-700 dark:bg-slate-900"
          style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <div><b>{hover.zip}</b> · {hover.pop.toLocaleString()} people</div>
          <div className="text-slate-500">District <b>{hover.d}</b> · {hv[0].toLocaleString()} ({hv[1] > 0 ? "+" : ""}{hv[1].toFixed(2)}%)</div>
        </div>
      )}
    </div>
  );
}
