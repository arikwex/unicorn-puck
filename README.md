# Unicorn Puck

A small JS13k starter. It retains the reusable engine and packaging ideas from [Infernal Sigil](https://github.com/arikwex/infernal-sigil) without copying its game, assets, entities, maps, or rules. The initial scene contains only a placeholder player and its camera.

## Setup and commands

```sh
nvm use
npm install
npm run dev
```

`npm run dev` watches the source, generates `index.html` and `build.zip`, and serves the project at <http://127.0.0.1:8000>. Other build modes are:

```sh
npm run dev:minify # watch + Terser minification
npm run build      # Terser + Roadroller production build
```

Every mode emits a self-contained `index.html` and a `build.zip`. The production command prints the zip's size against the JS13k 13,312-byte limit.

## Core modules

- `src/engine.js` — animation loop, ordered game objects, lifecycle, and tag queries
- `src/camera.js` — camera transform, following, zoom, and coordinate conversion
- `src/bus.js` — event subscription, one-shot handlers, emission, and cleanup
- `src/audio.js` — Web Audio initialization, procedural buffers, SFX playback, channel volume, and crossfading looped music
- `src/canvas.js` — full-window canvas setup and transform helper
- `src/tags.js` — shared numeric camera, player, and puck tags
- `src/PlayerCharacter.js` — placeholder player object and render pass

Game objects may implement `start()`, `update(dt)`, `render(ctx)`, and `destroy()`. Returning a truthy value from `update` removes the object. Use `add`, `remove`, `tag`, `untag`, and `getObjectsByTag` from `src/engine.js` to manage a scene.

Browsers require audio to begin in a user gesture. Call `audio.init()` from a click or key handler before playing sound or music.
