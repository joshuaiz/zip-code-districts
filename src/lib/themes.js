/**
 * Map colour themes. Every district map is coloured with exactly 5 colours (pipeline/03c_patch_topo.mjs), so each
 * theme supplies 5 fills of similar lightness (no district looks more important than its neighbour), plus:
 *   ground  the map background (sea / outside the U.S.)     land    land with no ZIP area (no residents)
 *   border  district border line, bw its width scale        state   state line, sw its width scale
 *   sel     outline of the selected district / ZIP           dark    light text and halos on this theme
 * Sources: Standard = ColorBrewer Pastel1; Accessible = Paul Tol "light" and Bold = Okabe–Ito (both colour-blind safe);
 * Factbook = after the
 * CIA World Factbook reference maps; the rest are this project's.
 */
export const THEMES = [
  { id: "accessible", name: "Accessible", group: "Accessible", desc: "Color-blind safe (Paul Tol light)",
    fills: ["#77aadd", "#ee8866", "#eedd88", "#ffaabb", "#44bb99"], ground: "#ffffff", land: "#eeeeee", border: "#ffffff", bw: 1.3, state: "#111111", sw: 1.2, sel: "#000000", dark: false },
  { id: "standard", name: "Standard", group: "Standard", desc: "Reference-map pastels, grey state lines",
    fills: ["#fbb4ae", "#b3cde3", "#ccebc5", "#decbe4", "#fed9a6"], ground: "#ffffff", land: "#ededed", border: "#ffffff", bw: 1, state: "#3d3d3d", sw: 1, sel: "#111111", dark: false },
  { id: "factbook", name: "Factbook", group: "Standard", desc: "Butter, pink, mint and lilac on a pale-blue sea",
    fills: ["#f7efa4", "#f4c6d2", "#c6e2b3", "#d5c8e6", "#f8d1a6"], ground: "#cfe3ef", land: "#f1ecdd", border: "#8e8e8e", bw: 0.6, state: "#3f3f3f", sw: 1, sel: "#111111", dark: false },
  { id: "atlas", name: "Atlas", group: "Standard", desc: "Quiet pastels on warm paper",
    fills: ["#c7d7ea", "#ecd3b4", "#c9e0c3", "#ebc9cd", "#ddd2ea"], ground: "#f3efe7", land: "#e6e0d4", border: "#ffffff", bw: 1, state: "#2b2f36", sw: 1, sel: "#111111", dark: false },
  { id: "terrain", name: "Terrain", group: "Earth tones", desc: "Sage, wheat, clay, moss and khaki",
    fills: ["#b6c8a0", "#e2cf9b", "#d6ab8c", "#a9c3bb", "#cbb89a"], ground: "#eeeadc", land: "#e0d8c3", border: "#faf7ee", bw: 1, state: "#3a3426", sw: 1, sel: "#1c1810", dark: false },
  { id: "greens", name: "Greens", group: "Earth tones", desc: "Five soft greens, lime to sea-green",
    fills: ["#dbe9b5", "#a9d3a0", "#c4e3d2", "#8fc4ad", "#e6edd2"], ground: "#f6f8f1", land: "#e8ede0", border: "#ffffff", bw: 1.1, state: "#2c4430", sw: 1, sel: "#14241a", dark: false },
  { id: "bold", name: "Bold", group: "Bold", desc: "Full strength, color-blind safe (Okabe–Ito)",
    fills: ["#e69f00", "#56b4e9", "#009e73", "#f0e442", "#cc79a7"], ground: "#fafafa", land: "#e8e8e8", border: "#ffffff", bw: 1.3, state: "#111111", sw: 1.2, sel: "#000000", dark: false },
  { id: "poster", name: "Poster", group: "Bold", desc: "Vermilion, cobalt, sunflower, teal, violet",
    fills: ["#e4572e", "#2e86de", "#f3c623", "#17a589", "#8e5bb8"], ground: "#fbfaf6", land: "#e9e6de", border: "#ffffff", bw: 1.3, state: "#141414", sw: 1.3, sel: "#000000", dark: false },
  { id: "graphite", name: "Graphite", group: "Dark", desc: "Slate greys, white state lines",
    fills: ["#3c424b", "#525963", "#30353c", "#646c77", "#474e57"], ground: "#16181c", land: "#1e2126", border: "#16181c", bw: 1, state: "#e3e7ec", sw: 1, sel: "#ffffff", dark: true },
  { id: "lunar", name: "Lunar", group: "Just for fun", desc: "Moon-dust greys in a starfield",
    fills: ["#cfccc4", "#a7a6a1", "#8c9199", "#e2ddd0", "#b6b0a3"], ground: "#0a0c16", land: "#2a2c35", border: "#5d6070", bw: 0.7, state: "#0a0c16", sw: 1.4, sel: "#ffd34d", dark: true, stars: true },
  { id: "blueprint", name: "Blueprint", group: "Just for fun", desc: "Blueprint blues, chalk-white lines",
    fills: ["#1f5d93", "#2f74b3", "#164a7a", "#3b86c6", "#265f9e"], ground: "#0b2f52", land: "#123a62", border: "#cfe3ff", bw: 0.7, state: "#ffffff", sw: 1.2, sel: "#ffd34d", dark: true },
];
export const DEFAULT_THEME = "accessible";
const ALIASES = { clear: "accessible" }; // old ids, so saved choices and shared links keep working
export const themeById = (id) => THEMES.find((t) => t.id === (ALIASES[id] ?? id)) ?? THEMES[0];
