# Build size report

Research into where the next bytes can come from, measured against commit
`8ab382d` ("Music audio shrinky first pass"), when `npm run build` reported
14,146 / 13,312 bytes. Nothing here has been applied yet.

**Headline:** build settings (A) + behavior-preserving code cleanups (B) + a
bulk property rename (C), measured together, reach **13,404 bytes** — 92 over
the limit with no gameplay change. Any one of the larger feature trims (D) then
gets under.

## Method

- Roadroller's optimizer makes build sizes wobble ±20 bytes run to run, so
  measurements pin its parameters (found once with `optimize(2)`) and pack at
  `optimize(0)`: deterministic, and 14,134 bytes for the baseline above.
- Each idea was applied as a text edit to a scratch copy of `src/` and run
  through the real pipeline (esbuild → terser with `tools/build.js` options →
  roadroller → `zip`). All numbers below are deltas in the final zip size.
- For a cost map, every function body ≥ 100 characters and every large
  top-level data literal (245 in total) was emptied one at a time and the build
  re-measured.
- Combined totals were measured as combined runs, not summed — though the
  individual numbers turned out to be nearly additive.

## A. Build tooling — no source changes (−255 combined)

| Change | Δ | Notes |
|---|---|---|
| `zip -X` (drop macOS extra file attributes) | −52 | Free. |
| terser `pure_getters: true` | −52 | Assumes property reads have no side effects; playtest the built file. |
| Pinned roadroller params from an 8-minute `-OO` search | −37 (−44 stacked) | `-Zab32 -Zlr2090 -Zmc5 -Zmd29 -Zpr15 -S0,1,2,3,5,7,11,13,25,42,113,142`. Also cuts builds from ~26 s to ~3 s; re-search occasionally as the code changes. |
| terser `booleans_as_integers: true` | −33 | No `=== true/false` comparisons exist in `src/`; playtest anyway. |
| Drop `<html><head></head><body></body></html>` from the HTML shell | −31 | Browsers infer them. |
| roadroller `allowFreeVars: true` (smaller decoder) | −30 | Decoder leaves single-letter globals behind; harmless for this page. |
| Minimal CSS: `body{margin:0;overflow:hidden;background:#224}canvas{display:block}` | −25 | `canvas.js` already sizes the canvas in pixels; needs a visual check. |

Stacked, in the order above: 14,134 → 13,879.

## B. Behavior-preserving code cleanups (−385 combined)

| Change | Δ |
|---|---|
| Remove `polymorphBite` (L-shaped room notches). The maze pass refills every notch: 0 of 3,123 rooms across 200 seeds end up notched. | −90 |
| `renderHealthBar`: its options object (outline, background, gap, padding) is never overridden — make them fixed values, `shields` a plain parameter | −60 |
| `SplatEffect(..., { size, arcHeight })` → positional parameters | −38 |
| Favicon: drop the `querySelector` fallback, the `type`, and the `'image/png'` argument | −37 |
| `PlayerCharacter` props (hp / maxHp / shields) → constants (only tests pass props) | −30 |
| StatusCard: `fillText(text, x, y, maxWidth)` instead of measuring and shrinking | −29 |
| MainMenu wall placements: objects → arrays | −25 |
| Remove the redundant `collected` flags in the 4 pickups (the engine removes them once `update()` returns true) | −17 |
| ToastSystem: `fillText` `maxWidth` instead of shrinking the font | −16 |
| TreasureChest: remove the unused default `contents` (mapCreator always passes it) | −16 |
| DragController: drop the camera-exists guards | −10 |
| StatusCard: `duration` option → constant | −10 |
| `hud.js`: plain `matchMedia()`, no space in the media query | −8 |
| Remove spaces in `hsl()` strings | −4 |

## C. Bulk property rename (−95)

Renaming 13 custom property names — e.g. `order→z`, `radius→r`,
`update→tick`, `impactDamageBonus→horn`, `aimProgress→aimT`, `isCarved→open`,
plus `angle`, `description`, `renderHUD`, `gridHeight`, `charge`,
`pinballMomentum`, `bubbleShields` — saves 95. The top six alone save 66.
Individually each saves under 22. This is a large mechanical diff that also
touches tests, and it hurts readability; keep it in reserve.

## D. Feature / visual trims — decisions

| Trim | Δ |
|---|---|
| Hallway grubs | −211 |
| Minimap / Oracle Eyes | −140 |
| "-N hp" / "+1 shield" popup text (DamageCallout) | −122 |
| Favicon entirely (instead of the −37 trim in B) | −103 |
| Ability descriptions in the HUD (names only) | −102 |
| Grub post-shot lunge animation | −58 |
| Player damage splats via `fireSplatBurst` (loses per-splat arc-height variety) | −46 |
| Grub aim jitter | −42 |
| `imageSmoothingEnabled = false` in `canvas.js` | −27 |
| `<title>` (tab would show "index.html") | −22 |
| Single "[Click Anywhere to Begin]" prompt, no touch detection | −21 |

## E. Measured, not worth it

| Idea | Δ |
|---|---|
| `dist(a, b)` helper for 6 `Math.hypot(a.x - b.x, a.y - b.y)` | +19 (worse) |
| `decay(t, rate)` helper for 21 `Math.exp(-t * k)` envelopes (music + sounds) | +4 (worse) |
| terser `passes: 5` / `hoist_funs` / `unsafe_arrows` | +14 / +102 / +41 (worse) |
| `zip -9`, terser `unsafe` bundle, `ecma: 2020`, `keep_fargs: false` | ~0 |
| Numeric grid keys instead of `` `${x},${y}` `` | 0 |
| `getPlayer()` helper for 8 `getObjectsByTag(TAG_PLAYER)[0]` | −5 |
| `forEach` → `map` everywhere | −9 (and `Set`s have no `map`) |
| Removing `</script>` | −7, but an unclosed script at end of file never runs |

Repeated inline code already compresses well, so small helpers rarely pay off;
dictionaries and long property names are what survive.

## Cost map — larger targets for later

From the ablation (cost of emptying each function; includes code only it uses):

| Area | Cost |
|---|---|
| Player art: `renderHead` / `renderWingsAndTail` / `renderWingShape` / ears / horn / tail / trail | 553 / 541 / 232 / 161 / 157 / 190 / 141 |
| Dungeon generator (`generateDonjonDungeon`) | ~913 |
| Grub `update` / `render` / `renderGrub` / `segmentPosition` | 588 / 310 / 286 / 258 |
| `DragController` (incl. `renderDragIndicator` 170) | 530 |
| `TreasureChest` | 358 |
| `ITEM_ABILITY_CATALOG` data | 305 |
| `playDungeonTheme` | 318 |
| `GameWatcher` / `StatusCard` / `ToastSystem` / `CombatRoom` | 291 / 229 / 236 / 236 |

## Suggested order

1. A, after a quick playtest of the built file (for `pure_getters`,
   `booleans_as_integers`, `allowFreeVars`, and the CSS).
2. B.
3. One or two items from D.

That lands under 13,312 with some headroom, and C stays in reserve.
