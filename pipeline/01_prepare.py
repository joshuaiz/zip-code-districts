"""Step 1: build the ZCTA graph used by the districting algorithm.

Inputs  (untrusted downloads, read-only):
  raw/zcta/z.shp   - Census 2020 cartographic boundary ZCTAs (cb_2020_us_zcta520_500k)
  raw/state/s.shp  - Census 2020 cartographic boundary states (cb_2020_us_state_500k)
  raw/pop/c3.csv   - Census 2020 DHC table P1 (total population) for all ZCTAs
Outputs:
  data/zcta_graph.json  - nodes with state, population, projected x/y, lon/lat, neighbours
  data/zcta_state.csv   - ZCTA -> state assignment with share of area in that state
"""
import csv, json, sys
from pathlib import Path
import geopandas as gpd
import numpy as np
import pandas as pd

RAW = Path(sys.argv[1])
OUT = Path(sys.argv[2]); OUT.mkdir(parents=True, exist_ok=True)

SEATS = dict(AL=7, AK=1, AZ=9, AR=4, CA=52, CO=8, CT=5, DE=1, FL=28, GA=14, HI=2, ID=2, IL=17, IN=9,
             IA=4, KS=4, KY=6, LA=6, ME=2, MD=8, MA=9, MI=13, MN=8, MS=4, MO=8, MT=2, NE=3, NV=4, NH=2,
             NJ=12, NM=3, NY=26, NC=14, ND=1, OH=15, OK=5, OR=6, PA=17, RI=2, SC=7, SD=1, TN=9, TX=38,
             UT=4, VT=1, VA=11, WA=10, WV=2, WI=8, WY=1)
assert sum(SEATS.values()) == 435

# ---- population
pop = {}
with open(RAW / "pop/c3.csv", encoding="utf-8-sig") as f:
    rows = list(csv.reader(f))[2:]
for r in rows:
    pop[r[0][-5:]] = int(r[2])

z = gpd.read_file(RAW / "zcta/z.shp")[["ZCTA5CE20", "geometry"]].rename(columns={"ZCTA5CE20": "zcta"})
s = gpd.read_file(RAW / "state/s.shp")[["STUSPS", "geometry"]].rename(columns={"STUSPS": "st"})
s = s[s.st.isin(list(SEATS) + ["DC"])]
z["pop"] = z.zcta.map(pop).fillna(0).astype(int)
print("ZCTAs", len(z), "with pop data", z.zcta.isin(pop.keys()).sum())

# ---- assign every ZCTA to the state holding most of its area (equal-area projection)
zA = z.to_crs(5070); sA = s.to_crs(5070)
inter = gpd.overlay(zA[["zcta", "geometry"]], sA, how="intersection", keep_geom_type=True)
inter["a"] = inter.geometry.area
tot = inter.groupby("zcta").a.sum()
best = inter.sort_values("a", ascending=False).drop_duplicates("zcta").set_index("zcta")
z["st"] = z.zcta.map(best.st)
z["share"] = z.zcta.map(best.a / tot).round(4)
multi = inter.groupby("zcta").st.nunique()
print("ZCTAs spanning >1 state:", int((multi > 1).sum()),
      "population in them:", int(z[z.zcta.isin(multi[multi > 1].index)]["pop"].sum()))
z = z[z.st.isin(SEATS.keys())].copy()          # drops DC, PR, territories
print("ZCTAs in 50 states", len(z), "pop", int(z["pop"].sum()))

# ---- per-state projections for distances (metres)
def proj_for(st):
    return 3338 if st == "AK" else ("ESRI:102007" if st == "HI" else 5070)

z["x"] = 0.0; z["y"] = 0.0
for st in SEATS:
    m = z.st == st
    rp = z[m].to_crs(proj_for(st)).geometry.representative_point()
    z.loc[m, "x"] = rp.x.values; z.loc[m, "y"] = rp.y.values
ll = z.geometry.representative_point()
z["lon"] = ll.x.round(5); z["lat"] = ll.y.round(5)

# ---- adjacency: polygons touching (25 m tolerance for cartographic slivers), same state only
zA = z.to_crs(5070)[["zcta", "st", "geometry"]].reset_index(drop=True)
buf = zA.copy(); buf["geometry"] = zA.geometry.buffer(25)
pairs = gpd.sjoin(buf, zA, predicate="intersects", how="inner")
pairs = pairs[(pairs.zcta_left < pairs.zcta_right) & (pairs.st_left == pairs.st_right)]
nb = {c: set() for c in z.zcta}
for a, b in zip(pairs.zcta_left, pairs.zcta_right):
    nb[a].add(b); nb[b].add(a)
print("adjacency edges", len(pairs))

# ---- gap links: ZCTAs leave unpopulated land uncovered (deserts, parks, forests, water bodies).
# ZCTAs that border the same uncovered gap and lie within 25 km of each other are treated as
# neighbours, because a district can legitimately span the empty land between them.
from shapely.ops import unary_union
gap_edges = 0
sA2 = s.to_crs(5070).set_index("st")
for st in SEATS:
    zs = zA[zA.st == st]
    gaps = sA2.loc[st].geometry.difference(unary_union(zs.geometry.buffer(10)))
    g = gpd.GeoDataFrame(geometry=[gaps], crs=5070).explode(index_parts=False)
    g = g[g.area > 1e6]                                       # ignore slivers < 1 km²
    if g.empty: continue
    touch = gpd.sjoin(zs, gpd.GeoDataFrame(geometry=g.geometry.buffer(60).values, crs=5070),
                      predicate="intersects", how="inner")
    for _, grp in touch.groupby("index_right"):
        ids = grp.zcta.tolist(); geoms = zs.set_index("zcta").geometry.loc[ids]
        tree_ids = list(geoms.index)
        for i in range(len(tree_ids)):
            gi = geoms.iloc[i]
            for j in range(i + 1, len(tree_ids)):
                a, b = tree_ids[i], tree_ids[j]
                if b in nb[a]: continue
                if gi.distance(geoms.iloc[j]) <= 25000:
                    nb[a].add(b); nb[b].add(a); gap_edges += 1
print("gap links added", gap_edges)

# ---- connect islands / disconnected pieces to nearest node of the main component, per state
links = []
xy = dict(zip(z.zcta, zip(z.x, z.y)))
for st in SEATS:
    ids = list(z.zcta[z.st == st])
    while True:
        seen, comps = set(), []
        for i in ids:
            if i in seen: continue
            comp, stack = [], [i]; seen.add(i)
            while stack:
                u = stack.pop(); comp.append(u)
                for v in nb[u]:
                    if v not in seen: seen.add(v); stack.append(v)
            comps.append(comp)
        if len(comps) == 1: break
        comps.sort(key=len, reverse=True)
        main = np.array([xy[i] for i in comps[0]])
        for comp in comps[1:]:   # link each fragment to the closest main-component node
            best_d, best_pair = 1e30, None
            for u in comp:
                d = ((main - xy[u]) ** 2).sum(1)
                k = int(d.argmin())
                if d[k] < best_d: best_d, best_pair = d[k], (u, comps[0][k])
            u, v = best_pair
            nb[u].add(v); nb[v].add(u); links.append((st, u, v, round(float(np.sqrt(best_d)) / 1000, 1)))
print("island links added", len(links))

nodes = []
for r in z.sort_values("zcta").itertuples():
    nodes.append(dict(id=r.zcta, st=r.st, pop=int(r.pop), x=round(r.x), y=round(r.y),
                      lon=r.lon, lat=r.lat, nb=sorted(nb[r.zcta])))
json.dump(dict(source="Census 2020 DHC P1 + cb_2020_us_zcta520_500k", seats=SEATS, nodes=nodes,
               islandLinks=links), open(OUT / "zcta_graph.json", "w"), separators=(",", ":"))
z[["zcta", "st", "share", "pop"]].sort_values("zcta").to_csv(OUT / "zcta_state.csv", index=False)
z[["zcta", "st", "pop", "geometry"]].to_file(OUT / "zcta_50.gpkg", driver="GPKG")
print("done")
