import json, sys, collections
g = json.load(open(sys.argv[1])); A = json.load(open(sys.argv[2]))
nodes = {n["id"]: n for n in g["nodes"]}
statepop = collections.Counter()
for n in g["nodes"]: statepop[n["st"]] += n["pop"]
ok = True
for s, r in A["results"].items():
    asg = r["assignment"]
    assert set(asg) == set(nodes), "unassigned ZCTAs"
    members = collections.defaultdict(list)
    for z, d in asg.items():
        assert d.split("-")[0] == nodes[z]["st"]; members[d].append(z)
    per_state = collections.Counter(d.split("-")[0] for d in members)
    bad_seats = [st for st in g["seats"] if per_state[st] != g["seats"][st]]
    noncontig = []
    for d, zs in members.items():
        zset = set(zs); seen = {zs[0]}; stack = [zs[0]]
        while stack:
            u = stack.pop()
            for v in nodes[u]["nb"]:
                if v in zset and v not in seen: seen.add(v); stack.append(v)
        if len(seen) != len(zset): noncontig.append(d)
    pops = {d: sum(nodes[z]["pop"] for z in zs) for d, zs in members.items()}
    total_ok = sum(pops.values()) == sum(statepop.values())
    devs = [abs(pops[d] - statepop[d.split('-')[0]] / g["seats"][d.split('-')[0]]) / (statepop[d.split('-')[0]] / g["seats"][d.split('-')[0]]) for d in pops if g["seats"][d.split('-')[0]] > 1]
    print(f"{s:7} districts={len(members)} seatsMismatch={bad_seats} nonContiguous={len(noncontig)} popTotalOK={total_ok} maxDev={100*max(devs):.2f}% meanDev={100*sum(devs)/len(devs):.2f}%")
    ok &= not bad_seats and not noncontig and total_ok and len(members) == 435
print("ALL CHECKS PASS" if ok else "CHECK FAILURES")

# ZIP integrity: a ZIP may be divided only by a state line. Pieces of a split ZIP have ids "<zip>-<ST>" (one per state).
pieces = collections.defaultdict(list)
for n in g["nodes"]: pieces[n.get("zip", n["id"])].append(n["st"])
split = {z: sts for z, sts in pieces.items() if len(sts) > 1}
bad = {z: sts for z, sts in split.items() if len(set(sts)) != len(sts)}
print(f"ZIPs divided by a state line: {len(split)} (into {sum(map(len, split.values()))} pieces) · ZIPs divided any other way: {len(bad)}")
assert not bad, bad
