# Feature Hit List

- [x] Core physics engine with basic walls
- [x] Drag/release to push self (mobile friendly?) + drawn arrow juice visulizer
- [x] basic enemy grub (4 sergmented spheres with face, no attack)
- [x] basic combat instance room (kill all enemies to continue?)
- [x] tresure chest -> Bump to damage / crack open
- [x] toast system -> item collected should show momentary toast "Health Potion Collected" or "Pegacorn Blood Chalice Collected" etc. (momentary 2 seconds from bottom of screen). use even bus to trigger. small sfx "du-ding" when invoked. (use the same sound that is currently the "chalice collected" sound, but use it for all toast events. rename it to "item collected" and it's always used one-to-one with toast=item-collected.)
- [x] level end mechanics (exit gateway / flag / unicorn key)
- pinball style dingers
- crystal -> Bump to damage / recharge unicorn power
- lever + gateway

- new collectable (like the HealthItem): bubble shield (single use health shield). Visually shown as semi-transparent circle bubble around player. Takes exactly one hit of damage and never comes back. while present, the player's HP bar should show one BLUE tick for each bubble shield the player has. If the bubble shield exceeds the players max health, just increase the max health bar meter temporarily to accomodate the bubble shield. Bubble shields stack and you can have as many as you find. Render a single bubble around the player until the play has no bubble shields remaining.

Item abilities (All very simple solid color with 6px thick outline shapes. Hieroglyph/iconographs of the intended item).
- BATTLE ARMOR: increase max health by 2 (grant +2 health at the moment it is gained)
- VALKYRIE WINGS: max boost speed
- MITHRIL HORN: all impact damage +1
- CHROMATIC HOOF: after hitting an enemy, bouncing will reboost your momentum instead of decaying (like pinball)
- ORACLE EYES: show minimap in top right (just map + your location)

Items show up as a stack of: icon + name/description (description under name saying what the buff is in 3-5 words)
Items stacked in order they are found (under the chalice part of the hud, equidistance as collected).

Mobile hud:
- the minimap should be bottom left of the screen always (desktop too) and the player placement dot should be WHITE not red.
- All HUD contents on mobile mode must be x0.5 size size they're occupying way too much of the screen


Game Mechanics:
- The main character should be treated like a hockey puck. To control it, the player should click+drag to set the trajectory/impulse to impart on the unicorn main character. The actual controls should be distance from click start to click finish = magnitude of impulse in the target direction. The line integral of the 2d curl should be the imparted angular impulse (e.g. a perfectly straight line = no angular impulse, but many revolutions = high angular impulse). The character has a natural friction/viscosity for both angular velocity and linear velocity (make these obvious constant baselines with multipliers that are character properties that default to 1).
- The camera should follow the character with exponential easing (no rotation, just x/y following with k-factor easing).
- When the player is dragging out the target impulse, there should be a clear visualization of the dragged motion with a think rainbow hue cycling line (hue should be animating from start-to-finish of the dragged out line). Indiciator line thickness should be proportional to linear impulse, set a max cap for this impulse value. Torsional/rotational impulse should be hinted by the rate that the rainbow hue is advancing along the contour of the line.
- To ensure that basic collisions/physicals are functional. Add a basic cube obstacle type and wrap the scene with it (just make a square play pen of a bunch of cubes that the player is bounded by). Physics collisions are elastic but there should be a lossiness on player character bounces.
- To ensure all "puck-like" elastic collision objects have the necessary properties, ensure there is a function that returns all the required values to manage elastic collisions. e.g. { mass, vx, vy, omega, viscosity, angularViscosity, bounciness, etc. }. This function should have a consistent name across puck-like objects and there should be a simple physics helper file that allows passing in these two structs and facilitates calculating the physics results produced by the collisions.
- The obstacles should be placed isometrically since the game is faux 3d. That is build a playpen along the vector bases (1, -1) and (1, 1) and render the cube obstacle accordingly. Be sure that the cube object CAN be constructed with x,y,angle and that the angle is respected (this should be angle=pi/4).
- Make a map creator module as the entry point for specifying the map objects / character / etc.
- Ensure that click+drag works on desktop AND mobile.