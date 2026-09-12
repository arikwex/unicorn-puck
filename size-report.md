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

---

# Addendum — audit after the new enemies + chain lightning

Measured at `0df2c7a` (HEAD), where `npm run build` reports **14,047 / 13,312**
— a gap of **735**. Sections A–C above are applied; D is not.

Every number below was measured at HEAD in this pass. An earlier draft of this
section was written from measurement runs whose output was later lost; when
those were re-run against HEAD, nearly every figure moved (see F7), so treat
any trim number not reproduced here as unsourced. The suite is green at HEAD
(101/101) — that is the baseline the test caveats refer to.

## F0. What the new work cost

All seven rows re-measured from clean worktrees; none of these commits
contains a debug `type = MEDIUM/LARGE` override.

| Commit | Build | Δ |
|---|---|---|
| `2cdc8bc` FIRST DIP UNDER THRESHOLD | 13,239 | — |
| `651ad1c` New enemy colorizations (3 enemy shapes) | 13,877 | +638 |
| `43f5598` charging animations + chain lightning | 14,064 | +187 |
| `a603e50` Chain lightning hell yes | 14,085 | +21 |
| `7fa1e36` Small text changy | 14,057 | −28 |
| `3255943` chain lightning bounce 2 | 14,068 | +11 |
| `0df2c7a` Valkyrie wing icon improve and shared | 14,047 | −21 |

The orb art is the bulk of it (+638); the charge tell and the whole lightning
ability together added ~+170 net. Total cost of the new work: **+808**.

## F1. Re-tune the packer — free, no source change (−13)

The pinned roadroller parameters in `tools/build.js` were searched before ~2 kB
of new code landed. A fresh 7-minute `-OO` search:

```
-Zab32 -Zlr2286 -Zmd26 -Zpr15 -S0,1,2,3,6,7,13,25,26,43,170,449
```

Real zip at HEAD: 14,047 (pinned) → **14,034** (new). Roadroller's own "13,573"
line is its pre-zip estimate, not the file size. `modelMaxCount` drops out of
the new set only because 5 is already its default. Worth re-running after any
large change; it costs only build time.

## F2. No visible change (−27 stacked)

Applied and re-measured on 2026-09-12 with `npm run build`, keeping the
existing pinned packer settings unchanged:

| Artifact | Before | After | Δ |
|---|---:|---:|---:|
| `build.zip` (build limit) | 14,047 | 14,019 | −28 |
| `index.html` | 18,202 | 18,163 | −39 |
| `dist/build.js` | 18,057 | 18,018 | −39 |

All three recommendations below are applied, with trail arrays destructured
when rendering and the rename scoped to `Grub.js` plus the affected test
references. `npm test` passes 101/101 before and after. The measured zip saving
is 0.20%; the build remains 707 bytes above 13,312. The original research
estimates follow.

| Change | Δ alone |
|---|---|
| ChainLightning: trail entries as `[source, target, end]` arrays instead of dicts | −14 |
| ChainLightning: drop its `save()`/`restore()`, `lineCap`/`lineJoin` (canvas.js already sets round caps) and the defensive `globalAlpha = 1` | −11 |
| Rename `size→sz`, `type→ty`, `depth→d`, `orbit→o`, `aimT→k` | −6 |
| **Stacked** | **−27** |

The stack is −27 against a −31 naive sum, but the components do not compose
the way the table suggests: the two ChainLightning items measure −14 and −11
alone yet only **−14 together** — they rewrite the same minified region, so the
packer pays for it once. The rename, worth only −6 alone, therefore supplies
the remaining −13 of Stack 1.

Two constraints on the rename. It must stay **scoped to Grub.js**: the `.size`
in `mapCreator.js`/`inflateDungeon.js` is `dungeon.size` and the `.depth` in
`PlayerCharacter.js` is that file's own render list, so a global rename would
be wrong. And it breaks real assertions in `large-grubs.test.js`,
`grub-attacks.test.js` and `combat-rooms.test.js`, which read `.type`, `.aimT`,
`.orbit` and `.size` off enemies. Alone it is only −6 — but in combination it
is what takes Stack 1 from −14 to −27, so it is worth more than it looks once
the ChainLightning items are already in.

## F3. Visual trims on the new art

Each measured alone, at HEAD.

| Trim | Δ | Note |
|---|---|---|
| Chain lightning removed entirely | −361 | The whole ability: bolt, chaining, Chromatic Hoof effect |
| Charge tell (siphoning motes) removed | −75 | Enemies wind up with no tell |
| Bolt as a solid colour instead of the 7-stop rainbow | −53 | Breaks the CL tests — see caveat below |
| Large eyes always oval (drop the diamond branch) | −24 | Large loses its diamond eyes |
| Orb ground shadow | −23 | Hover reads less |
| Orb lit cap (the roundness shading) | −18 | |
| Orbiter highlight dot | −18 | |
| Winglets 4 → 2 (drop the small lower pair) | −12 | Changes the medium silhouette |
| Winglet centre ridge | −12 | |
| Eye socket rim (the dark pass behind each eye) | −12 | |
| Bolt polyline 32 → 16 segments | −10 | Barely visible at this line width |
| Charge motes 7 → 5 | −9 | |
| Orbiters 5 → 4 | −5 | |
| Bolt gradient 7 stops → 2 | −4 | Also breaks the CL tests |

**CL test caveat.** `chain-lightning.test.js` *selects* bolts with
`stroke?.stops`, so replacing the gradient with a string `strokeStyle` doesn't
just fail the 7-stop assertion at line 184 — it makes every bolt-counting
assertion (lines 89, 168, 170, 196…) see zero bolts. Line 179 also pins
`bolt.width === 15`. Both bolt-colour trims need that file reworked first.

## F4. Stacks, measured together

| Stack | Contents | Δ | Lands at |
|---|---|---|---|
| 1 | F2 only (no visible change) | −27 | 14,020 |
| 2 | 1 + shadow, lit cap, ridge, 4 orbiters | −75 | 13,972 |
| 2b | 2 + highlight dot, oval eyes | −118 | 13,929 |
| 3 | 2b + solid bolt | −162 | 13,885 |
| 4 | 3 + charge tell removed | −229 | 13,818 |
| 5 | 2b + chain lightning removed | −449 | 13,598 |
| 6 | everything (no lightning, no tell) | −536 | 13,511 |

With F1's −13 on top, even Stack 6 — which deletes both the ability and the
tell — lands at **13,498, still 186 over**. **The new art cannot pay for
itself; the gap has to close from section D.**

Section D's items (hallway grubs −211, minimap −140, damage popups −122,
favicon −103, ability descriptions −102) were measured on a much older tree and
are *not* re-verified here; re-measure before relying on them. Taking them at
face value: F1 + Stack 1 + all of D ≈ 13,329, which is **still 17 over** —
Stack 1 alone is not enough. F1 + Stack 2 + all of D ≈ 13,281 clears it with
~30 to spare, and keeps both the lightning and the tell.

## F5. Cost map of the new code

From `ablation.json` (261 targets, baseline 14,057 at `7fa1e36` — two commits
stale, though Grub.js is unchanged since). Nested entries overlap their parents.

| Area | Cost |
|---|---|
| `Grub` factory (whole enemy, all three types) | 2,526 |
| `Grub > render` / `> tick` / `> hit` / `> hurt` | 961 / 629 / 385 / 162 |
| `renderOrb` (orb assembly + depth sort) | 611 |
| `chainLightning` (incl. `> next` 336, `renderBolt` 168) | 368 |
| `GrubProjectile` | 206 |
| `renderOrbBody` / `renderWinglet` / `renderOrbEye` | 198 / 181 / 148 |
| `renderGrub` (small grub) / `segmentPosition` | 187 / 95 |
| `renderCharge` (the tell) / `renderGrubFace` / `orbPoint` / `muzzle` | 80 / 67 / 64 / 36 |
| `ORB_THEMES` data | 32 |

For scale, the largest targets in the whole game are `MainMenu` 11,284,
`startGame` 9,308 and `createMap` 8,060 (these cascade — emptying them removes
everything they reach).

## F6. Measured, genuinely not worth it

| Idea | Δ |
|---|---|
| `parts` as `[depth, draw]` arrays instead of `{depth, draw}` dicts | **+1 (worse)** — the sort/call sites grow as much as the keys save |
| Remove the dead `KNOCKBACK_DECAY` constant | 0 — terser already strips it; delete for hygiene, not bytes |

The dictionary rule from section C doesn't generalise: MainMenu's wall dicts
paid −25, the orb's `parts` dicts cost +1 to convert. Measure each one.

## F7. Corrections to the earlier draft

Re-running at HEAD moved almost every figure. Recorded so the old numbers
don't get reused:

| Item | Claimed | Measured |
|---|---|---|
| Stack 1 (F2) | −114 | **−27** |
| Rename props | −30 | **−6** |
| CL trail arrays | −7 | **−14** |
| Chain lightning removed | −402 | **−361** |
| Charge tell removed | −92 | **−75** |
| Solid bolt | −40 | **−53** |
| Oval eyes | −12 | **−24** |
| Charge motes 7 → 5 | +1 (dud) | **−9 (a real trim)** |
| `parts` as arrays | +11 | **+1** |
| CL chrome | −11 | −11 (only figure that held) |

Two causes. The old rename variant reported `min -168` against this one's
`-136`, so it was rewriting beyond Grub.js — probably including `dungeon.size`,
i.e. measuring a broken build. And the old stack numbers came from runs where
the rename edits ran *before* the visual-trim patterns that quote `grub.size`,
which silently changes what those patterns match. Visual edits must be applied
before renames; the same ordering bug bit the `batch-new3` stacks earlier.

## F8. Suggested order from here

1. F1 (re-tune the packer) — free, −13.
2. Both ChainLightning items in F2 — **−14 together** (not −25; they overlap),
   and no test churn.
3. Re-measure section D, then take it; it is the only place the remaining
   ~700 lives.
4. F3's micro visual trims (Stack 2's four, −48 more) if D lands short.
5. Leave the rename (−13 in combination, but it churns three test files), the
   tell and the lightning alone unless still over.


## Main menu simplification — applied 2026-09-12

`npm run build` before: **13,828 bytes**; after: **13,676 bytes**.
Saved **152 bytes (1.10%)**; **364 bytes** remain above the 13,312-byte limit.

Removed the menu's walls, candelabra and chalice. Kept the animated unicorn,
replaced per-letter title colors with one red–yellow–blue linear gradient on
both title lines, and enlarged the pulsing prompt from 22px to 28px with the
text `[Click to Start]`. Pointer input still starts the game on click or tap.

Follow-up typography adjustment: title font is 1.5× larger below 600px canvas
width; the start prompt is now 56px (2× larger). Text is constrained to the
available width to avoid clipping on phones. `npm run build` increases from
13,676 to **13,690 bytes** (+14), leaving **378 bytes** above the limit.

Second mobile adjustment: title font is another 50% larger (2.25× the original),
and mobile detection includes device screen width for phones with a wider
layout viewport. Both title lines fit the canvas width; the mobile prompt's
baseline now sits 12% of the canvas height above the bottom. Build size:
13,690 → **13,709 bytes** (+19), **397 bytes** above the limit.
