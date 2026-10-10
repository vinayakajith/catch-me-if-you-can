# Government agent and wooden hammer

The player is a suited government agent with sunglasses and an earpiece. The shared vector rig lives in `apps/web/src/art/agent.ts`; the intro and game use the same artwork. Six poses cover idle, two walking steps, inspection, hammer wind-up, and bagging.

The oversized wooden mallet uses a separate SVG head and animated handle. A catch extracts the laughing character, swings the mallet onto the crown of his head, changes to the existing bonked/dizzy expressions, and arcs him into the sack. Reduced motion keeps the sequence readable without the swing or flight. The former rear-facing caught body is no longer used.

Artwork is rasterized at the game's capped device pixel ratio (maximum 2). Character face packs remain unchanged and are reused in higher-resolution runtime composites. This phase makes no paid image calls.

The old `detective-poses.png` is a historical asset and is no longer loaded by the game or intro.
