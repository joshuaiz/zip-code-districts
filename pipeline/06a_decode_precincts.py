"""Step 6a: stream-decode the NYT 2024 precinct TopoJSON (640 MB) without loading it whole.
Input:  data/raw/precincts-with-results.topojson[.gz] (download link: pipeline/README_outcomes.md)
Output: data/raw/precincts/<ST>.parquet (git-ignored).  Needs: pip install geopandas pyarrow ijson
Run from the project root: python3 pipeline/06a_decode_precincts.py
Pass 1: arcs -> one flat int64 coordinate array (delta-decoded) + offsets.
Pass 2: geometries -> shapely polygons, written per state to GeoParquet (lon/lat, EPSG:4326).
"""
import gzip, sys, time, json
from collections import defaultdict
import numpy as np, ijson
from shapely.geometry import Polygon, MultiPolygon
import geopandas as gpd

import os
SRC = next(p for p in ("data/raw/precincts-with-results.topojson", "data/raw/precincts-with-results.topojson.gz") if os.path.exists(p))
OUT = "data/raw/precincts"
os.makedirs(OUT, exist_ok=True)
_open = gzip.open if SRC.endswith(".gz") else open
t0 = time.time()

# transform (scale/translate) — small, find it by streaming keys
with _open(SRC, "rb") as f:
    tr = next(ijson.items(f, "transform"), None)
print("transform", tr, flush=True)
sx, sy = (float(tr["scale"][0]), float(tr["scale"][1])) if tr else (1, 1)
tx, ty = (float(tr["translate"][0]), float(tr["translate"][1])) if tr else (0, 0)

# pass 1: arcs
xs, ys, offs = [], [], [0]
n = 0
with _open(SRC, "rb") as f:
    for arc in ijson.items(f, "arcs.item", use_float=True):
        a = np.asarray(arc, dtype=np.int64)
        if tr is not None: a = np.cumsum(a, axis=0)
        xs.append(a[:, 0]); ys.append(a[:, 1]); offs.append(offs[-1] + len(a)); n += 1
        if n % 500000 == 0: print(f"  arcs {n:,}  {time.time()-t0:.0f}s", flush=True)
X = np.concatenate(xs) * sx + tx; Y = np.concatenate(ys) * sy + ty; del xs, ys
OFF = np.asarray(offs, dtype=np.int64)
print(f"arcs done: {n:,} arcs, {len(X):,} points, {time.time()-t0:.0f}s", flush=True)

def arc_pts(i):
    if i >= 0: s, e = OFF[i], OFF[i + 1]; return np.column_stack((X[s:e], Y[s:e]))
    j = ~i; s, e = OFF[j], OFF[j + 1]; return np.column_stack((X[s:e], Y[s:e]))[::-1]

def ring(arcs):
    parts = [arc_pts(a) for a in arcs]
    pts = np.vstack([parts[0]] + [p[1:] for p in parts[1:]])
    return pts

def polygon(rings):
    rs = [ring(r) for r in rings]
    rs = [r for r in rs if len(r) >= 4]
    if not rs: return None
    return Polygon(rs[0], rs[1:])

# pass 2: geometries, grouped by state
rows = defaultdict(list)
with _open(SRC, "rb") as f:
    for k, g in enumerate(ijson.items(f, "objects.tiles.geometries.item", use_float=True)):
        p = g.get("properties") or {}
        t = g.get("type")
        if t == "Polygon": geom = polygon(g["arcs"])
        elif t == "MultiPolygon":
            ps = [q for q in (polygon(r) for r in g["arcs"]) if q is not None]
            geom = MultiPolygon(ps) if ps else None
        else: geom = None
        if geom is None: continue
        rows[p.get("state")].append({"GEOID": p.get("GEOID"), "dem": p.get("votes_dem") or 0, "rep": p.get("votes_rep") or 0,
                                     "tot": p.get("votes_total") or 0, "official": bool(p.get("official_boundary")), "geometry": geom})
        if k % 25000 == 0: print(f"  geoms {k:,}  {time.time()-t0:.0f}s", flush=True)
summary = {}
for st, r in rows.items():
    g = gpd.GeoDataFrame(r, geometry="geometry", crs="EPSG:4326")
    g.to_parquet(f"{OUT}/{st}.parquet")
    summary[st] = {"precincts": len(g), "dem": int(g.dem.sum()), "rep": int(g.rep.sum()), "tot": int(g.tot.sum())}
json.dump(summary, open(f"{OUT}/_summary.json", "w"), indent=1)
print(f"done {time.time()-t0:.0f}s; states:", len(summary), flush=True)
