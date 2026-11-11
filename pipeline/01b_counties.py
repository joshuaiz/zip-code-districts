"""Step 1b: add a county to every ZCTA (county holding most of the ZCTA's area, within its state).
Used by the county-first mode and by the 'county splits' statistic.
Inputs: data/zcta_50.gpkg, RAW/county/c.shp (cb_2020_us_county_500k). Updates data/zcta_graph.json.
"""
import json, sys
from pathlib import Path
import geopandas as gpd

RAW, DATA = Path(sys.argv[1]), Path(sys.argv[2])
z = gpd.read_file(DATA / "zcta_50.gpkg").to_crs(5070)
c = gpd.read_file(RAW / "county/c.shp")[["GEOID", "NAME", "STUSPS", "geometry"]].to_crs(5070)
inter = gpd.overlay(z[["zcta", "st", "geometry"]], c, how="intersection", keep_geom_type=True)
inter = inter[inter.st == inter.STUSPS]
inter["a"] = inter.geometry.area
best = inter.sort_values("a", ascending=False).drop_duplicates("zcta").set_index("zcta")
co = best.GEOID.to_dict()
g = json.load(open(DATA / "zcta_graph.json"))
missing = 0
for n in g["nodes"]:
    n["co"] = co.get(n["id"])
    if n["co"] is None: missing += 1
g["counties"] = {r.GEOID: f"{r.NAME}, {r.STUSPS}" for r in c.itertuples()}
json.dump(g, open(DATA / "zcta_graph.json", "w"), separators=(",", ":"))
print("ZCTAs without county:", missing, "| counties used:", len(set(co.values())))
