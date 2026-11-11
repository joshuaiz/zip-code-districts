"""Step 6c: partisan outcomes of each districting mode, measured AFTER drawing, with 2024 presidential votes.
Inputs: data/raw/zcta_votes_2024.csv (06b), data/assignments.json (ZCTA -> district per mode).
Outputs: data/outcomes/2024_districts.csv, 2024_modes.csv, 2024_states.csv, 2024.json
All shares are two-party (Harris / (Harris + Trump)). "D" = Harris, "R" = Trump.
"""
import json
import numpy as np, pandas as pd

import os
os.makedirs("data/outcomes", exist_ok=True)
A = json.load(open("data/assignments.json"))
z = pd.read_csv("data/raw/zcta_votes_2024.csv", dtype={"zcta": str}).set_index("zcta")
order = list(A["strategies"].keys())
labels = {k: v["label"] for k, v in A["strategies"].items()}

nat_d, nat_r = z.dem.sum(), z.rep.sum()
nat_share = nat_d / (nat_d + nat_r)

def eff_gap(d, r):
    """Efficiency gap: (wasted D - wasted R) / all two-party votes. Positive = more D votes wasted = favours R."""
    t = d + r; win_d = d > r
    wd = np.where(win_d, d - t / 2, d); wr = np.where(win_d, r, r - t / 2)
    return (wd.sum() - wr.sum()) / t.sum()

def seats_at(share, target):
    """Uniform swing: shift every district's D share so the national (vote-weighted) D share equals target."""
    return int((share + (target - nat_share) > 0.5).sum())

rows, dist_rows, state_rows = [], [], []
for m in order:
    asg = A["results"][m]["assignment"]
    zz = z.copy(); zz["d"] = zz.index.map(asg)
    g = zz.groupby("d")[["dem", "rep", "tot"]].sum()
    g["st"] = g.index.str.split("-").str[0]
    g["share"] = g.dem / (g.dem + g.rep)
    g["margin"] = g.share * 2 - 1
    for d, r in g.iterrows(): dist_rows.append({"mode": m, "district": d, "st": r.st, "harris": round(r.dem), "trump": round(r.rep), "total": round(r.tot), "harris_two_party": round(r.share, 4)})
    dseats = int((g.share > 0.5).sum())
    med_margin = float(np.median(g.margin)); nat_margin = nat_share * 2 - 1
    rows.append({
        "mode": m, "label": labels[m],
        "harris_seats": dseats, "trump_seats": len(g) - dseats,
        "proportional_harris": round(nat_share * len(g), 1),
        "efficiency_gap_pct": round(100 * eff_gap(g.dem.values, g.rep.values), 2),
        "median_minus_nation_pts": round(100 * (med_margin - nat_margin), 2),
        "competitive_45_55": int(((g.share > 0.45) & (g.share < 0.55)).sum()),
        "harris_seats_at_50_50": seats_at(g.share.values, 0.5),
        "lean_r_15plus": int((g.share < 0.425).sum()), "lean_d_15plus": int((g.share > 0.575).sum()),
        # voters whose district went to the other candidate ("represented by someone they voted against")
        "losing_side_pct": round(100 * np.minimum(g.dem, g.rep).sum() / (g.dem + g.rep).sum(), 1),
        "harris_voters_losing_pct": round(100 * g.dem[g.share < 0.5].sum() / g.dem.sum(), 1),
        "trump_voters_losing_pct": round(100 * g.rep[g.share > 0.5].sum() / g.rep.sum(), 1),
    })
    for st, s in g.groupby("st"):
        sd, sr = s.dem.sum(), s.rep.sum()
        state_rows.append({"mode": m, "st": st, "seats": len(s), "harris_seats": int((s.share > 0.5).sum()),
                           "harris_state_share": round(sd / (sd + sr), 4), "proportional_harris": round(len(s) * sd / (sd + sr), 1)})

modes = pd.DataFrame(rows)
pd.DataFrame(dist_rows).to_csv("data/outcomes/2024_districts.csv", index=False)
modes.to_csv("data/outcomes/2024_modes.csv", index=False)
pd.DataFrame(state_rows).to_csv("data/outcomes/2024_states.csv", index=False)
json.dump({"national": {"harris": round(nat_d), "trump": round(nat_r), "harris_two_party": round(nat_share, 4)},
           "modes": rows}, open("data/outcomes/2024.json", "w"), indent=1)
print(f"national Harris two-party share {nat_share:.4f}  (Harris {nat_d:,.0f}, Trump {nat_r:,.0f})")
print(modes.to_string(index=False))
