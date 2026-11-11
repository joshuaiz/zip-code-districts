---
title: How the ZIP Code Districts are drawn
description: Data, rules and algorithms behind all nine districting modes, and how they rank.
---

# How the ZIP Code Districts are drawn

This map redraws all 435 U.S. House districts by joining neighboring ZIP code areas. No voter registration, election results, party data, incumbent addresses or demographic data other than total population is used at any step. The same code, run on the same Census files, produces the same maps every time.

The map offers nine modes, each a different way to produce a first version of the districts. Every mode then goes through the same two finishing stages, so the modes differ only in how they start. The modes are listed from most to least defensible as a neutral rule; [Ranking the modes](#ranking) explains the order.

- [The building blocks](#building-blocks)
- [The rules](#rules)
- [The shared finish: balancing and smoothing](#finish)
- [The nine modes](#modes)
- [Ranking the modes](#ranking)
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

**Map colors.** District colors carry no meaning; they only tell neighbors apart. Every map uses exactly five colors, each on about the same number of districts (87), and districts whose borders touch get different colors, including across state lines. Four colors are always enough in theory, and reference maps conventionally use a handful of soft colors so borders and labels stay readable. In a few modes, New York City districts interlock so tightly that seven or eight of them all touch one another. There, at most four pairs that touch only through one or two ZIP codes share a color, and the district border still divides them. The map offers eleven color themes: Clear (the default), Standard, Factbook, Atlas, Terrain, Greens, Bold, Poster, Graphite, Lunar and Blueprint. Clear uses Paul Tol's "light" palette and Bold uses the Okabe–Ito palette, both designed to stay distinguishable with color-vision deficiency.

**Distances** are measured in equal-area map projections: one for the lower 48, and separate Albers projections for Alaska and Hawaii.

<h2 id="rules">The rules</h2>

"The rules" means the complete recipe the program follows. Written down in full, it lets anyone who runs it on the same Census files get the same map. Every item below changes the result, so whoever chooses them holds real power. What keeps that power from becoming a gerrymander is *when* the choices are made (see [why the rules are fixed in advance](#fixed-in-advance)).

<h3 id="constraints">Constraints every map follows</h3>

- **Each state keeps its 2020 seat count.** Districts never cross state lines.
- **Equal population within each state.** The national average is 761,169 people per seat. Districts can't cross state lines, though, so each district aims for its own state's ideal: the state's population divided by its seats. That's about 542,000 in Montana and about 990,000 for Delaware's single seat.
- **Whole ZIPs only.** A district is a set of complete ZIP areas.
- **Contiguity.** Every district is one connected piece, using the neighbor rules above.
- **No political inputs.** Only geography, population and county lines.

Six states have one seat (Alaska, Delaware, North Dakota, South Dakota, Vermont, Wyoming). There the whole state is the district, and those states are left out of the deviation statistics.

<h3 id="recipe">The complete recipe</h3>

1. **Building blocks.** The ZIP Code Tabulation Areas published with the census, frozen at that moment (2020: 33,585 in the 50 states). ZIP codes the Postal Service adds or retires later are ignored until the next census, so nobody can move a district by lobbying for a new ZIP code.
2. **Population.** Total population per ZIP from the same census (2020 DHC, table P1).
3. **Seats and target.** Each state's apportioned seats. Target = the state's population ÷ its seats. Deviation should be as small as whole ZIPs allow (currently about ±1–2%). Best score treats ±2% as its eligibility cutoff.
4. **Neighbors.** Boundaries touching within 25 m; ZIPs facing each other across at least 1 km² of uncovered land within 25 km; islands linked to the nearest ZIP in the state. See [the building blocks](#building-blocks).
5. **Method.** One mode, applied the same way in every state.
6. **Shared finish.** Balancing (up to 400 passes), then smoothing: 600 steps per ZIP, border weight μ = 0.000004, or in the county-aware modes μ = 0.00003 with cuts along county lines at 15% of the cost. Fixed random seed. See [the shared finish](#finish).
7. **Tie-breakers.** Written into each mode, for example "the cut closest to north–south" in the splitline modes.
8. **The code.** The published source is the recipe in a form a computer can run. Given the same files, it reproduces every map exactly.

<h3 id="fixed-in-advance">Why the rules are fixed in advance</h3>

Gerrymandering means looking at possible outcomes, then choosing the map you like. Fixing the rules means choosing the recipe *before* anyone can see what it produces. Is choosing the rules just another way to gerrymander? Only if the rules are picked after looking at the partisan results. These safeguards prevent that:

- **Adopt the rule now, apply it to the next census.** The 2030 data doesn't exist yet, so nobody, in either party, can know whom the rule will help.
- **Use one rule for all 50 states.** A single nationwide rule can't be tailored to help one party: it would help in some states and hurt in others.
- **Choose on stated principles, before any partisan analysis.** Publish the reasons for each choice, then measure the outcome.
- **Pick one mode.** This map shows nine modes for comparison. In a real redistricting cycle, offering a menu would hand the choice to whoever picks the mode for each state. That would just move the gerrymander from drawing lines to picking modes. [Ranking the modes](#ranking) makes the case for one.
- **Publish random seeds after the rules are locked.** This only matters for the random modes; see [Random draw](#mode-random).

<h3 id="principle">Fair process, not engineered outcomes</h3>

This project judges fairness by the process, not by the result. Districts follow people: a dense city gets exactly as many districts as its population earns, and the map neither knows nor cares who lives in a ZIP.

There is a serious counter-view. When one party's voters are packed into cities, that party wins those seats by large margins, and its extra votes there earn it nothing more. Its share of seats can then fall below its share of votes even on a politics-blind map. People who judge fairness by outcomes argue that maps should be drawn to correct for this, which requires voter data. This project doesn't do that. It does hold that partisan outcomes should still be measured and published *after* the maps are drawn, so the trade-off is visible to everyone (see [Limitations](#limitations)).

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

- **Fixed rule** modes apply one mechanical rule.
- **Start point** modes grow districts outward from an anchor.
- **Pick by rule** modes let a rule set before any map existed make the choice: one random draw from a public seed, or the best-scoring of the other modes' maps.

They are described here in ranking order, the same order as on the map ([why](#ranking)).

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

<h3 id="mode-splitcounty">Splitline + counties</h3>

**In one sentence:** shortest splitline, but the pieces being cut are whole counties.

1. As in Shortest splitline, a region that needs *k* districts is split A : B (A = ⌊k/2⌋), trying every cut direction in 1° steps.
2. For each direction, counties are lined up by their population center along that direction (the ZIPs inside a county by their own position). The cut slides along this line-up until one side holds A/k of the population. So every county lands whole on one side, except the single county where that share is reached, which is divided along the straight line.
3. The resulting border follows county lines, so its length is measured as the number of neighboring ZIP pairs it separates (cut edges). The shortest border wins. Ties go to the direction closest to north–south.
4. Repeat inside each piece. Inside a county big enough for several districts (Cook County, Los Angeles County), every ZIP is in the same county, so the cut is a plain splitline.
5. Then the shared finish, with the county-aware settings borrowed from Counties first: cutting along a county line costs 15% of cutting through a county, μ = 0.00003, and a state beyond ±2% gets one more pass at the normal weight.

**Result:** the fewest split counties of any mode (644 nationwide) and the second smoothest borders (15,792 cut edges, behind only Best score). Iowa shows the difference: 6 split counties, versus 19 for Shortest splitline and 7 for Counties first. **Cost:** the least even population of the fixed rules: average deviation 0.41%, largest 2.71% (NY-5 in Queens, where ZIPs are dense and large), 387 of 429 districts within ±1%. **Strength:** keeps splitline's single rule while respecting the places people know. **Weakness:** one more rule (counties are the units) and the two county settings in the finish.

<h3 id="mode-county">Counties first</h3>

**In one sentence:** keep counties whole wherever population allows, as Iowa's nonpartisan agency does.

1. Growth works like NW corner, with one change: a district finishes the counties it has already entered before it may enter a new county.
2. In the smoothing stage, cutting a border *along* a county line costs about 15% of what cutting *through* a county costs, and borders carry more weight overall (μ = 0.00003). So borders settle on county lines where they can.
3. If any district in a state ends up more than ±2% from ideal, that state gets one more smoothing pass at the normal border weight. This happens in New York, where each NYC borough is a county with several districts' worth of people.

**Result:** about a third fewer split counties than the start point modes (703 nationwide versus roughly 1,060–1,150), at the cost of slightly less even population. **Strength:** districts line up with places people already know. **Weakness:** county sizes vary enormously, so perfect county integrity is impossible in large states.

<h3 id="mode-center">State center</h3>

Works like [NW corner](#mode-nw), except the anchor is the middle of the state's extent (the center of its bounding box, not its population center). District 1 forms around the middle and later districts form around it. Districts at the edges are drawn last, so they absorb whatever is left over and tend to be less tidy.

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

<h3 id="mode-zip">ZIP number</h3>

**In one sentence:** let the Postal Service's numbering decide the order.

1. District 1 starts at the state's lowest-numbered populated ZIP.
2. It grows by always adding the neighboring ZIP with the lowest number, until it reaches the ideal population.
3. The next district starts at the lowest-numbered unassigned ZIP.
4. Then the shared finish.

ZIP numbers aren't random. The first three digits identify a mail-sorting center, and numbers within a region roughly follow delivery geography. So districts in this mode tend to follow postal regions. **Strength:** uses an existing, politically neutral numbering. **Weakness:** postal regions were designed for mail, not representation, and the resulting shapes can be irregular.

<h3 id="mode-best">Best score</h3>

**In one sentence:** for each state, take the best map the other eight modes produced, judged by a rule fixed in advance.

1. **Candidates:** the eight other modes' maps for that state.
2. **Eligibility:** keep maps whose largest district deviation is within ±2% (if none qualify, all stay eligible).
3. **Winner:** the fewest cut edges, meaning the smoothest, most compact borders.
4. **Tie-breakers:** lowest average deviation, then the ranking order. In one-seat states every mode gives the same map, so the top-ranked mode, Shortest splitline, "wins" there.

The map shows which mode won each state. Nationally the winners spread across seven modes: Splitline + counties wins 24 states, Shortest splitline 13 (6 of them one-seat states), Counties first 5, State center and NW corner 3 each, NE corner and ZIP number 1 each. This mode has the fewest cut edges overall (14,459) and the third fewest split counties (722).

**Why fixing the rule first matters:** if the scoring rule were chosen after looking at the maps, choosing the rule would just be a way of choosing the map.

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

<h2 id="ranking">Ranking the modes</h2>

**The question:** how many choices does each mode leave that a person could tune? Every such choice is a lever, and a lever can be pulled toward one party. Fewer choices means less room for bias. The balance and border statistics are reported in [Results](#results), but they don't decide the rank: a mode that needs tuning to look good isn't neutral.

| Rank | Mode | What a person could tune | Why it ranks here |
|---|---|---|---|
| 1 | Shortest splitline | Only a tie-breaker | Explainable in one sentence, one possible map, no randomness, proposed by someone else years before this project |
| 2 | Splitline + counties | The tie-breaker, plus the two county settings in the finish | The same cutting rule applied to counties; fewest split counties, but less even population |
| 3 | Counties first | Northwest starting corner, county border weight, ±2% fallback | Keeps counties whole, but starts from an arbitrary corner |
| 4 | State center | How "center" is defined | Less arbitrary than a corner, but a bounding-box center is arbitrary for odd shapes |
| 5 | NW corner | Which corner | Each corner gives a different map |
| 6 | NE corner | Which corner | Same as NW corner |
| 7 | ZIP number | Postal numbering order | Arbitrary order; postal regions were designed for mail, not representation |
| 8 | Best score | The scoring rule | Follows a fixed rule, but using a different mode in each state looks like cherry-picking |
| 9 | Random draw | The seed | Fair with a public seed and one draw, but "random" sounds haphazard to most people |

**Recommendation.** Shortest splitline is the most defensible as a neutral rule. Splitline + counties is the strongest choice if keeping counties whole matters most. It adds one rule and two settings, but those settings are plain and fixed, and it splits the fewest counties of any mode. Random draw isn't less fair than the modes above it; it ranks low because it is harder to explain and to trust.

<h2 id="results">Results</h2>

Deviation is measured against each state's own ideal, over the 429 districts in multi-seat states.

| Rank | Group | Mode | Average deviation | Largest deviation | Within ±1% | Counties split | Cut edges |
|---|---|---|---|---|---|---|---|
| 1 | Fixed rule | Shortest splitline | 0.24% | 1.65% | 413 | 1,014 | 16,975 |
| 2 | Fixed rule | Splitline + counties | 0.41% | 2.71% | 387 | 644 | 15,792 |
| 3 | Fixed rule | Counties first | 0.30% | 3.36% | 415 | 703 | 17,532 |
| 4 | Start point | State center | 0.22% | 3.36% | 416 | 1,119 | 17,747 |
| 5 | Start point | NW corner | 0.22% | 1.65% | 418 | 1,060 | 17,352 |
| 6 | Start point | NE corner | 0.22% | 1.70% | 419 | 1,091 | 17,524 |
| 7 | Start point | ZIP number | 0.20% | 1.80% | 424 | 1,146 | 18,005 |
| 8 | Pick by rule | Best score | 0.38% | 2.00% | 395 | 722 | 14,459 |
| 9 | Pick by rule | Random draw | 0.26% | 2.00% | 414 | 1,071 | 17,202 |

The 3.36% cases are the same district in New York, and Splitline + counties' 2.71% is also in New York (NY-5, Queens): large, dense ZIPs and island geography limit how finely population can be traded there.

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
- **Blind to politics is not the same as neutral in outcome.** Researchers Jowei Chen and Jonathan Rodden argue that because one party's voters are more concentrated in cities, compact, politics-blind maps can systematically favor the other party. Others, including Michael McDonald, dispute how strong that effect is. This project judges fairness by process: no political data, rules fixed in advance (see [Fair process, not engineered outcomes](#principle)). It doesn't yet measure partisan outcomes; publishing that analysis is a planned next step.
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
