"""Step 3a: attach district ids + map colours to ZCTA polygons; write GeoJSON for mapshaper.

Colouring: districts that touch (including across state lines) never share a colour.
"""
import json, sys
from pathlib import Path
import geopandas as gpd

DATA = Path(sys.argv[1])
z = gpd.read_file(DATA / "zcta_50.gpkg")
A = json.load(open(DATA / "assignments.json"))
strategies = list(A["strategies"])

# ZCTA adjacency across ALL states (for colouring only)
zA = z.to_crs(5070)
buf = zA[["zcta", "geometry"]].copy(); buf["geometry"] = buf.geometry.buffer(100)
pairs = gpd.sjoin(buf, zA[["zcta", "geometry"]], predicate="intersects")
pairs = pairs[pairs.zcta_left < pairs.zcta_right][["zcta_left", "zcta_right"]].values.tolist()

colors = {}
for s in strategies:
    asg = A["results"][s]["assignment"]
    z["d_" + s] = z.zcta.map(asg)
    nbr = {}
    for a, b in pairs:
        da, db = asg.get(a), asg.get(b)
        if da and db and da != db:
            nbr.setdefault(da, set()).add(db); nbr.setdefault(db, set()).add(da)
    # smallest-last ordering greedy colouring (planar-ish graph -> few colours)
    nodes = sorted(set(asg.values())); deg = {d: len(nbr.get(d, ())) for d in nodes}
    order, rem = [], set(nodes); dd = dict(deg)
    while rem:
        v = min(rem, key=lambda x: (dd[x], x)); order.append(v); rem.remove(v)
        for w in nbr.get(v, ()):
            if w in rem: dd[w] -= 1
    col = {}
    for v in reversed(order):
        used = {col[w] for w in nbr.get(v, ()) if w in col}
        col[v] = next(c for c in range(20) if c not in used)
    colors[s] = col
    z["c_" + s] = z["d_" + s].map(col).astype(int)
    print(s, "colours used:", max(col.values()) + 1)

z = z.to_crs(4326)
z.to_file(DATA / "zcta_districts.geojson", driver="GeoJSON", COORDINATE_PRECISION=6)
json.dump(colors, open(DATA / "district_colors.json", "w"))
