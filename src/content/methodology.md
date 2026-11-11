---
title: How the ZIP Code Districts are drawn
description: Data, rules and algorithms behind all nine districting modes.
---

# How the ZIP Code Districts are drawn

This map redraws all 435 U.S. House districts by joining neighboring ZIP code areas. No voter registration, election results, party data, incumbent addresses or demographic data other than total population is used at any step. The same code, run on the same Census files, produces the same maps every time.

The map offers nine modes, each a different way to produce a first version of the districts. Every mode then goes through the same two finishing stages, so the modes differ only in how they start.

- [The building blocks](#building-blocks)
- [Rules every map follows](#rules)
- [The shared finish: balancing and smoothing](#finish)
- [The nine modes](#modes)
- [Results](#results)
- [How the maps were checked](#verification)
- [Limitations and open questions](#limitations)
- [Sources](#sources)

<h2 id="building-blocks">The building blocks</h2>

**ZIP Code Tabulation Areas.** ZIP codes are mail delivery routes, not areas, so the Census Bureau publishes ZIP Code Tabulation Areas (ZCTAs). Each ZCTA is a block-based approximation of the land a ZIP code serves. This project uses the 33,585 ZCTAs in the 50 states from the 2020 Census cartographic boundary file. Throughout this page, "ZIP" means a ZCTA.

**Population.** Each ZIP's population comes from the 2020 Census Demographic and Housing Characteristics file, table P1 (total population). That's the same census that set each state's number of seats.

**ZIPs that cross state lines.** 137 ZIP areas, home to 556,203 people, straddle a state line. Each one goes, whole, to the state that contains most of its land. ZIPs are never split.

**Counties.** Each ZIP is assigned to the county that holds most of its land, using the 2020 county boundary file. That assignment drives the Counties first mode and the "counties split" statistic.

**Who is left out.** The District of Columbia and the territories have no voting House seat, so they are excluded.

**Neighbors.** Districts must be connected, so the algorithm needs to know which ZIPs are neighbors. Two ZIPs are neighbors when:

1. **Their boundaries touch**, allowing 25 meters for small gaps in the boundary file (87,928 pairs).
2. **They face each other across empty land.** ZIP areas don't cover unpopulated land: national forests, deserts, parks, military ranges. ZIPs that border the same uncovered area (at least 1 km²) and lie within 25 km of each other are treated as neighbors (9,455 pairs). A district may legally span empty land, and without these links places like El Paso would be attached to the rest of Texas by only a thread.
3. **Water is the only link.** Islands are connected to the nearest ZIP in the same state (140 links).

**Distances** are measured in equal-area map projections: one for the lower 48, and separate Albers projections for Alaska and Hawaii.

<h2 id="rules">Rules every map follows</h2>

- **Each state keeps its 2020 seat count.** Districts never cross state lines.
- **Equal population within each state.** The national average is 761,169 people per seat. Districts can't cross state lines, though, so each district aims for its own state's ideal: the state's population divided by its seats. That's about 542,000 in Montana and about 990,000 for Delaware's single seat.
- **Whole ZIPs only.** A district is a set of complete ZIP areas.
- **Contiguity.** Every district is one connected piece, using the neighbor rules above.
- **No political inputs.** Only geography, population and county lines.

Six states have one seat (Alaska, Delaware, North Dakota, South Dakota, Vermont, Wyoming). There the whole state is the district, and those states are left out of the deviation statistics.

<h2 id="finish">The shared finish: balancing and smoothing</h2>

Every mode produces a first draft. Two stages then improve it, identically for all modes.

**Stage 2: balancing.** The algorithm visits every ZIP on a district border. It moves the ZIP to the neighboring district if that lowers the total squared population deviation of the two districts and leaves both in one piece. It repeats until no move helps (at most 400 passes). A small tie-breaker prefers giving a ZIP to the district whose center is closer.

**Stage 3: smoothing (simulated annealing).** Balancing alone gets stuck. Imagine a district that is 3% over, but every ZIP it could give away is too large or would cut it in two. Annealing explores more freely. It scores the whole state as:

> score = Σ (district deviation)² + μ × (cut edges)

A *cut edge* is a pair of neighboring ZIPs that end up in different districts. Fewer cut edges means smoother, more compact borders, and this is a standard compactness measure in redistricting research. μ is small (0.000004), so population equality dominates. Border smoothness acts as the tie-breaker.

Each step picks a random cut edge and proposes moving one of its ZIPs across. Improvements are always accepted. Worse moves are sometimes accepted early on and almost never at the end. That lets the search escape dead ends, then settle. If moving a ZIP would cut off a small piece of its district (under 15% of a district's population), the piece moves with it, which lets districts pass through narrow rural corridors. The run lasts 600 steps per ZIP in the state, and the best scoring map seen is kept.

The random numbers in this stage come from a fixed seed, so reruns are identical.

<h2 id="modes">The nine modes</h2>

The modes fall into three groups:

- **Start point** modes grow districts outward from an anchor.
- **Fixed rule** modes apply one mechanical rule with no settings.
- **Pick by rule** modes generate many possible maps and choose one with a rule set before any map existed.

<h3 id="mode-nw">NW corner</h3>

**In one sentence:** fill each state like reading a page, starting from its northwest corner.

1. The anchor is the northwest corner of the state's extent.
2. District 1 starts at the populated ZIP closest to the anchor.
3. The district grows one neighboring ZIP at a time. It always picks the candidate with the lowest value of *distance to the district's population-weighted center + 0.35 × distance to the anchor*. The first term keeps districts compact. The second sweeps the filling away from the corner, so no stray gaps are left behind.
4. Growth stops at the state's ideal population. The last ZIP is added only if that leaves the district closer to ideal than stopping short.
5. Any pocket of unassigned ZIPs too small to hold a district (under half the ideal) is absorbed into a neighboring district.
6. The next district starts at the unassigned ZIP closest to the anchor. The last district takes whatever remains.
7. Then the shared finish.

**Strengths:** simple, explainable, deterministic. **Weakness:** the choice of corner is arbitrary, and the NE corner gives a visibly different map.

<h3 id="mode-ne">NE corner</h3>

Identical to NW corner, except the anchor is the northeast corner of the state's extent. Comparing the two shows how much the starting corner matters.

<h3 id="mode-center">State center</h3>

Identical to NW corner, except the anchor is the middle of the state's extent (the center of its bounding box, not its population center). District 1 forms around the middle and later districts form around it. Districts at the edges are drawn last, so they absorb whatever is left over and tend to be less tidy.

<h3 id="mode-zip">ZIP number</h3>

**In one sentence:** let the Postal Service's numbering decide the order.

1. District 1 starts at the state's lowest-numbered populated ZIP.
2. It grows by always adding the neighboring ZIP with the lowest number, until it reaches the ideal population.
3. The next district starts at the lowest-numbered unassigned ZIP.
4. Then the shared finish.

ZIP numbers aren't random. The first three digits identify a mail-sorting center, and numbers within a region roughly follow delivery geography. So districts in this mode tend to follow postal regions. **Strength:** uses an existing, politically neutral numbering. **Weakness:** postal regions were designed for mail, not representation, and the resulting shapes can be irregular.

<h3 id="mode-splitline">Shortest splitline</h3>

**In one sentence:** cut the state with the shortest possible straight line, then cut each half the same way.

Warren D. Smith proposed this rule specifically to take choice out of redistricting.

1. For a region that needs *k* districts, split it into two parts holding A = ⌊k/2⌋ and B = k − A districts. For example, 9 seats split 4 : 5.
2. Try every straight cut direction in 1° steps (180 directions). For each direction, sort the ZIPs by position across the cut and slide the cut until one side holds as close to A/k of the region's population as possible. Each ZIP goes to the side its population center falls on.
3. Measure each candidate cut's length, and keep the shortest. Ties go to the cut closest to north–south.
4. Repeat inside each half until every piece needs one district.
5. Then the shared finish, which repairs any piece disconnected by a cut and fine-tunes population.

**Adapting splitline to ZIPs.** The original rule measures a cut across the state's outline. Here, a cut's length is measured across the populated ZIPs nearest the cut (the closest 3% of the region's ZIPs, at least 8). Empty land between ZIP areas doesn't count toward length, so cuts favor narrow populated crossings. Because whole ZIPs are kept, district borders follow ZIP boundaries near the cut instead of exactly straight lines.

**Strengths:** no settings at all, so only one possible map. Compact, simple shapes. **Weakness:** straight cuts ignore communities, rivers and county lines.

<h3 id="mode-county">Counties first</h3>

**In one sentence:** keep counties whole wherever population allows, as Iowa's nonpartisan agency does.

1. Growth works like NW corner, with one change: a district finishes the counties it has already entered before it may enter a new county.
2. In the smoothing stage, cutting a border *along* a county line costs about 15% of what cutting *through* a county costs, and borders carry more weight overall (μ = 0.00003). So borders settle on county lines where they can.
3. If any district in a state ends up more than ±2% from ideal, that state gets one more smoothing pass at the normal border weight. This happens in New York, where each NYC borough is a county with several districts' worth of people.

**Result:** about a third fewer split counties than the start point modes (703 nationwide versus roughly 1,060–1,150), at the cost of slightly less even population. **Strength:** districts line up with places people already know. **Weakness:** county sizes vary enormously, so perfect county integrity is impossible in large states.

<h3 id="mode-random">Random draw</h3>

**In one sentence:** one random map per state, from a seed nobody could choose.

Randomness is only fair if nobody can redraw until they like the result. This mode allows exactly one draw.

1. **Seed.** Each state's seed is a hash (FNV-1a) of the text `2020 Census apportionment population 331108434|<STATE>|random`. The number is the official 2020 apportionment total, published before any of these maps existed. Anyone can recompute the seed and get the identical map.
2. **Random spanning tree.** Give every neighbor link in the region a random weight and take the minimum spanning tree: a set of links that connects every ZIP with no loops.
3. **Split.** Removing any one link of a tree splits it into exactly two connected pieces. Find every link whose removal leaves one side within ±3% of A/k of the population, and pick one at random. If no tree has such a link, draw new trees (up to 400) and keep the closest.
4. Recurse into each piece until every piece needs one district.
5. Then the shared finish.

This "random spanning tree" method is the standard way researchers sample possible districtings, because both sides of every cut are guaranteed to be connected.

**Caveat:** the apportionment total was published before these maps, but it was also known when the rules were written. For a real redistricting cycle, the seed should be a public value released *after* the rules are locked in, such as a lottery draw or a public randomness beacon.

<h3 id="mode-central">Most typical</h3>

**In one sentence:** draw 100 random maps, then keep the one most like all the others.

1. Using the random draw method (seeded from `…|<STATE>|central`), draw 100 maps per state.
2. For every pair of neighboring ZIPs, count how many of the 100 maps put them in different districts.
3. Score each map by its total disagreement with the other 99: how often it splits a pair that most maps keep together, or keeps together a pair that most maps split.
4. Keep the map with the lowest score (the *medoid* of the ensemble). Then the shared finish.

**Why:** courts have used ensembles of thousands of random maps as a neutral baseline, to show that an enacted map is an extreme outlier. This mode turns that idea around: instead of flagging the outlier, it picks the most ordinary map. Randomness explores the possibilities; a fixed rule chooses.

<h3 id="mode-best">Best score</h3>

**In one sentence:** for each state, take the best map the other eight modes produced, judged by a rule fixed in advance.

1. **Candidates:** the eight other modes' maps for that state.
2. **Eligibility:** keep maps whose largest district deviation is within ±2% (if none qualify, all stay eligible).
3. **Winner:** the fewest cut edges, meaning the smoothest, most compact borders.
4. **Tie-breakers:** lowest average deviation, then the mode order shown on the map.

The map shows which mode won each state. Nationally, the winners spread across all eight modes, as a neutral rule should. This mode has the fewest cut edges overall (15,094) and the second fewest split counties (944).

**Why fixing the rule first matters:** if the scoring rule were chosen after looking at the maps, choosing the rule would just be a way of choosing the map.

<h2 id="results">Results</h2>

Deviation is measured against each state's own ideal, over the 429 districts in multi-seat states.

| Group | Mode | Average deviation | Largest deviation | Within ±1% | Counties split | Cut edges |
|---|---|---|---|---|---|---|
| Start point | NW corner | 0.22% | 1.65% | 418 | 1,060 | 17,352 |
| Start point | NE corner | 0.22% | 1.70% | 419 | 1,091 | 17,524 |
| Start point | State center | 0.22% | 3.36% | 416 | 1,119 | 17,747 |
| Start point | ZIP number | 0.20% | 1.80% | 424 | 1,146 | 18,005 |
| Fixed rule | Shortest splitline | 0.24% | 1.65% | 413 | 1,014 | 16,975 |
| Fixed rule | Counties first | 0.30% | 3.36% | 415 | 703 | 17,532 |
| Pick by rule | Random draw | 0.26% | 2.00% | 414 | 1,071 | 17,202 |
| Pick by rule | Most typical | 0.27% | 2.12% | 417 | 1,022 | 16,034 |
| Pick by rule | Best score | 0.30% | 1.65% | 411 | 944 | 15,094 |

The 3.36% cases are the same district in New York, where large, dense ZIPs and island geography limit how finely population can be traded.

<h2 id="verification">How the maps were checked</h2>

A separate program, written independently of the districting code, checks every mode and confirms that:

- every one of the 33,585 ZIPs is assigned to exactly one district;
- every ZIP's district is in that ZIP's own state;
- each state has exactly its number of seats, for 435 districts in total;
- every district is one connected piece;
- district populations add up to the total population.

All nine modes pass.

<h2 id="limitations">Limitations and open questions</h2>

- **Exact population equality.** Courts hold congressional districts to near-exact equality (*Karcher v. Daggett*, 1983). Whole ZIPs can hold up to about 130,000 people, so ±1–2% is near the practical limit for a ZIP-only map. Exact equality would mean splitting a few ZIPs along census blocks.
- **Voting Rights Act.** A mechanical method doesn't check compliance with Section 2, which can require districts that give minority communities an opportunity to elect their preferred candidates.
- **ZIP areas aren't ZIP codes.** ZCTAs approximate delivery areas, and some addresses fall in a ZCTA with a different number than their mailing ZIP.
- **Blind to politics is not the same as neutral in outcome.** Researchers Jowei Chen and Jonathan Rodden argue that because one party's voters are more concentrated in cities, compact, politics-blind maps can systematically favor the other party. Others, including Michael McDonald, dispute how strong that effect is. This project judges fairness by process: no political data, rules fixed in advance. It doesn't measure partisan outcomes.
- **One census.** Everything is based on 2020 data. The pipeline can be rerun after the 2030 census.
- **Seed for the random modes.** See the caveat under [Random draw](#mode-random).

<h2 id="sources">Sources</h2>

- U.S. Census Bureau, 2020 Census Demographic and Housing Characteristics File, Table P1 (total population), by ZCTA.
- U.S. Census Bureau, 2020 cartographic boundary files: ZCTAs (cb_2020_us_zcta520_500k), counties (cb_2020_us_county_500k), states (cb_2020_us_state_500k).
- U.S. Census Bureau, 2020 Census apportionment results.
- Warren D. Smith, shortest splitline algorithm ([rangevoting.org](https://rangevoting.org/FastShortestSplitline.html)).
- Iowa Legislative Services Agency redistricting criteria ([Iowa Code §42.4](https://www.legis.iowa.gov/docs/code/42.4.pdf)).
- DeFord, Duchin and Solomon, "Recombination: A family of Markov chains for redistricting" (random spanning-tree methods) ([mggg.org](https://mggg.org/ReCom)).
- Chen and Rodden, "Unintentional Gerrymandering: Political Geography and Electoral Bias in Legislatures," *Quarterly Journal of Political Science*, 2013.
