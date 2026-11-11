#!/usr/bin/env bash
# Step 3b: TopoJSON for the web (needs: npm i mapshaper). Run from the project root.
# OUT = folder that is served as the site root (default: public). STATE_PCT = detail kept in state files.
set -euo pipefail
OUT=${OUT:-public}; MS=${MS:-"npx mapshaper-xl 16gb"}; STATE_PCT=${STATE_PCT:-100}
MODES=$(node -e 'console.log(Object.keys(JSON.parse(require("fs").readFileSync("data/assignments.json")).results).join(" "))')
FIELDS="zcta,st,pop"   # per-mode district ids/colours live in data/modes.json and are attached in the browser
CMD="-i data/zcta_districts.geojson name=zctas -simplify ${NAT_PCT:-7}% weighted keep-shapes"
for s in $MODES; do CMD="$CMD -dissolve d_$s copy-fields=c_$s target=zctas + name=dist_$s"; done
CMD="$CMD -dissolve st target=zctas + name=states"
for s in $MODES; do CMD="$CMD -points inner target=dist_$s + name=lbl_$s"; done
eval $MS $CMD -filter-fields $FIELDS target=zctas -o $OUT/data/zipdistricts.topo.json format=topojson quantization=${NAT_Q:-300000} target=*
# full-resolution per-state files (lazy-loaded at zoom >= 7)
rm -rf data/split; mkdir -p data/split $OUT/data/states
eval $MS -i data/zcta_districts.geojson -split st -o data/split/ format=geojson
for f in data/split/*.json; do
  st=$(basename "$f" .json); CMD="-i $f name=zctas"
  [ "$STATE_PCT" != "100" ] && CMD="$CMD -simplify $STATE_PCT% weighted keep-shapes"
  for s in $MODES; do CMD="$CMD -dissolve d_$s copy-fields=c_$s target=zctas + name=dist_$s"; done
  eval $MS $CMD -filter-fields zcta,pop target=zctas -o $OUT/data/states/$st.topo.json format=topojson quantization=1000000 target=* >/dev/null
done
