#!/usr/bin/env bash
# Step 3b: TopoJSON for the web (needs: npm i mapshaper). Run from the project root.
set -euo pipefail
MS="npx mapshaper-xl 16gb"
CMD="-i data/zcta_districts.geojson name=zctas -simplify 10% weighted keep-shapes"
for s in nw ne center zip; do CMD="$CMD -dissolve d_$s copy-fields=c_$s target=zctas + name=dist_$s"; done
CMD="$CMD -dissolve st target=zctas + name=states"
for s in nw ne center zip; do CMD="$CMD -points inner target=dist_$s + name=lbl_$s"; done
CMD="$CMD -filter-fields zcta,st,pop,d_nw,d_ne,d_center,d_zip,c_nw,c_ne,c_center,c_zip target=zctas"
eval $MS $CMD -o public/data/zipdistricts.topo.json format=topojson quantization=400000 target=*
# full-resolution per-state files
mkdir -p data/split public/data/states
eval $MS -i data/zcta_districts.geojson -split st -o data/split/ format=geojson
for f in data/split/*.json; do
  st=$(basename "$f" .json); CMD="-i $f name=zctas"
  for s in nw ne center zip; do CMD="$CMD -dissolve d_$s copy-fields=c_$s target=zctas + name=dist_$s"; done
  eval $MS $CMD -filter-fields zcta,pop,d_nw,d_ne,d_center,d_zip,c_nw,c_ne,c_center,c_zip target=zctas \
    -o public/data/states/$st.topo.json format=topojson quantization=1000000 target=*
done
