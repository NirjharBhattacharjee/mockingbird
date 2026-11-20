# Vendored files

All three.js 0.187.0 from the npm package, MIT ([three.LICENSE](./three.LICENSE)). Pages import them by name and `motion` fills in the path; nothing is fetched at render time.

| File | Import | What |
|---|---|---|
| `three.module.min.js` | `from "THREE"` | three.js core (#270) |
| `three-addons.min.js` | `from "THREE_ADDONS"` | `RoomEnvironment`, `EffectComposer`, `RenderPass`, `UnrealBloomPass`, `BokehPass`, `OutputPass` from `examples/jsm`, importing the core beside it (#275) |

To rebuild the add-ons: `npm pack three@0.187.0`, export those six from a one-file entry, `bun build entry.js --target=browser --minify --external three`, and change its `from"three"` to `from"./three.module.min.js"`.
