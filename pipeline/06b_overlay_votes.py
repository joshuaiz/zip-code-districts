"""Step 6b: allocate 2024 presidential precinct votes to ZCTAs (area-weighted overlay), state by state.
Inputs: data/raw/precincts/*.parquet (06a), data/zcta_graph.json, public/data/states/*.topo.json,
        data/raw/2024_US_County_Level_Presidential_Results.csv (github.com/tonmcg/US_County_Level_Election_Results_08-24)
Output: data/raw/zcta_votes_2024.csv (git-ignored: fine-grained data derived from the NYT dataset).

For each precinct: votes are split over the ZCTAs (of the same state) it overlaps, in proportion to overlap area,
renormalised over the covered part (precinct area outside any ZCTA, e.g. water or land with no ZIP area, is
ignored). A precinct overlapping no ZCTA goes to the nearest one. Counties the NYT data covers <90% get their
shortfall (official county total - NYT precinct sum) spread over the county's ZCTAs by population.
"""
import json, glob, time
import numpy as np, pandas as pd, geopandas as gpd, shapely
from shapely.geometry import Polygon, MultiPolygon

G = json.load(open("data/zcta_graph.json"))
nodes = pd.DataFrame([{"zcta": n["id"], "st": n["st"], "pop": n["pop"], "co": n.get("co")} for n in G["nodes"]])
seats = G["seats"]
t0 = time.time()

def decode_topo(t, obj):
    tr = t.get("transform"); sx, sy = tr["scale"]; tx, ty = tr["translate"]
    arcs = []
    for a in t["arcs"]:
        a = np.cumsum(np.asarray(a, dtype=np.float64), axis=0); a[:, 0] = a[:, 0] * sx + tx; a[:, 1] = a[:, 1] * sy + ty; arcs.append(a)
    def ring(r):
        parts = [arcs[i] if i >= 0 else arcs[~i][::-1] for i in r]
        return np.vstack([parts[0]] + [p[1:] for p in parts[1:]])
    def poly(rs):
        rr = [ring(r) for r in rs]; rr = [r for r in rr if len(r) >= 4]
        return Polygon(rr[0], rr[1:]) if rr else None
    out = []
    for g in t["objects"][obj]["geometries"]:
        if g["type"] == "Polygon": geom = poly(g["arcs"])
        elif g["type"] == "MultiPolygon": ps = [p for p in (poly(r) for r in g["arcs"]) if p]; geom = MultiPolygon(ps) if ps else None
        else: geom = None
        out.append({**g.get("properties", {}), "geometry": geom})
    return gpd.GeoDataFrame(out, geometry="geometry", crs="EPSG:4326")

county = pd.read_csv("data/raw/2024_US_County_Level_Presidential_Results.csv", dtype={"county_fips": str})
county["fips"] = county.county_fips.str.zfill(5)
# coverage of the NYT precinct data per county, against the official county totals
_n = pd.concat([pd.read_parquet(p, columns=["GEOID", "dem", "rep", "tot"]).assign(fips=lambda d: d.GEOID.str[:5]).groupby("fips")[["dem", "rep", "tot"]].sum()
                for p in glob.glob("data/raw/precincts/*.parquet")]).groupby(level=0).sum()
cov = county.set_index("fips")[["votes_dem", "votes_gop", "total_votes"]].join(_n, how="left").fillna(0)
cov["cov"] = cov.tot / cov.total_votes

results = []
for st in sorted(seats):
    zn = nodes[nodes.st == st]
    if seats[st] == 1:
        # one at-large seat: the district is the state; take the official statewide total from the county file
        c = county[county.fips.str[:2] == zn.co.dropna().iloc[0][:2]]
        results.append(pd.DataFrame({"zcta": zn.zcta, "st": st, "dem": c.votes_dem.sum() * zn["pop"] / zn["pop"].sum(),
                                     "rep": c.votes_gop.sum() * zn["pop"] / zn["pop"].sum(), "tot": c.total_votes.sum() * zn["pop"] / zn["pop"].sum(), "source": "statewide"}))
        print(f"{st}: at-large, statewide totals", flush=True); continue
    z = decode_topo(json.load(open(f"public/data/states/{st}.topo.json")), "zctas")[["zcta", "geometry"]]
    z = z[z.zcta.isin(set(zn.zcta))].to_crs(5070); z["geometry"] = shapely.make_valid(z.geometry.values)
    p = gpd.read_parquet(f"data/raw/precincts/{st}.parquet").to_crs(5070); p["geometry"] = shapely.make_valid(p.geometry.values)
    p = p.reset_index(drop=True); p["pid"] = p.index
    j = gpd.sjoin(p[["pid", "geometry"]], z[["zcta", "geometry"]], predicate="intersects", how="inner")
    zg = z.set_index("zcta").geometry
    inter = shapely.intersection(j.geometry.values, zg.loc[j.zcta].values)
    j = pd.DataFrame({"pid": j.pid.values, "zcta": j.zcta.values, "a": shapely.area(inter)})
    j = j[j.a > 0]
    j["w"] = j.a / j.groupby("pid").a.transform("sum")
    miss = set(p.pid) - set(j.pid)
    if miss:
        near = gpd.sjoin_nearest(p.loc[list(miss), ["pid", "geometry"]], z[["zcta", "geometry"]], how="left")
        j = pd.concat([j, pd.DataFrame({"pid": near.pid.values, "zcta": near.zcta.values, "a": 0, "w": 1.0})])
    j = j.merge(p[["pid", "dem", "rep", "tot"]], on="pid")
    for k in ("dem", "rep", "tot"): j[k] = j[k] * j.w
    zv = j.groupby("zcta")[["dem", "rep", "tot"]].sum().reindex(zn.zcta).fillna(0).reset_index()
    zv["st"] = st; zv["source"] = "precinct"
    # county shortfall fill
    zn2 = zn.set_index("zcta")
    stc = cov[cov.index.str[:2] == zn.co.dropna().iloc[0][:2]]
    filled = 0
    for fips, r in stc[stc["cov"] < 0.9].iterrows():
        gap = {"dem": max(r.votes_dem - r.dem, 0), "rep": max(r.votes_gop - r.rep, 0), "tot": max(r.total_votes - r.tot, 0)}
        zs = zn2[zn2.co == fips]
        if zs.empty or zs["pop"].sum() == 0: continue
        w = zs["pop"] / zs["pop"].sum(); idx = zv.set_index("zcta").index
        for k in gap: zv.loc[zv.zcta.isin(zs.index), k] += zv.loc[zv.zcta.isin(zs.index), "zcta"].map(w).values * gap[k]
        zv.loc[zv.zcta.isin(zs.index), "source"] = "precinct+county fill"; filled += gap["tot"]
    results.append(zv)
    print(f"{st}: {len(p):,} precincts -> {len(zv):,} ZCTAs, {len(miss)} by nearest, fill {filled:,.0f} votes  ({time.time()-t0:.0f}s)", flush=True)

out = pd.concat(results, ignore_index=True)
out.to_csv("data/raw/zcta_votes_2024.csv", index=False)
print("TOTAL dem %.0f rep %.0f tot %.0f" % (out.dem.sum(), out.rep.sum(), out.tot.sum()))
