# Time-machine intro

The intro has five beats: witch making a potion, the assistant ignoring DO NOT ENTER, duplicate assistants, escape, and the witch collecting her sack. The first four share one 15-second animation clock; dispatch waits for the player. Pause/resume preserves the exact clock, hidden tabs suspend the intro, and reduced motion advances manually through still scenes. Intro and asset loading never consume round time.

Background, actors and the doorway foreground all use the same 1536 × 1024 SVG coordinates. The doorway lip occludes entering feet. Phone rotation scales the entire stage together. Missing lab art falls back to an illustrated portal; missing gameplay assets show a reload action.

## Background provenance

- Asset: `apps/web/public/assets/time-machine-lab.png` (1536 × 1024, opaque).
- Generated with the built-in image generation tool, generation mode. No API key or runtime generation call is involved.
- Original preserved at `/Users/vinayak/.codex/generated_images/01a12666-a1a6-7ea1-ad29-cb65ef9cd1e9/exec-e1b2706c-9f54-4d97-b5f2-1e9ddd8714d0.png`.
- The game uses the copied asset in the repository. It does not depend on that original local path.
- The scene contains no father character or name. Personal father heads, native SVG lungi bodies and the witch are separate layers. The witch’s cauldron, visible potion, black hat and violet dress establish who runs the lab. The assistant enters in his ordinary lungi; no lab coat or father face is baked into the background.

Exact generation prompt:

```text
Use case: illustration-story. Asset type: reusable background for a short 2D comedy game intro, landscape 1536x1024.
Draw an empty makeshift home laboratory built by an overconfident mad scientist in an Indian house. Large eccentric homemade TIME MACHINE on the RIGHT HALF: a tall oval brass-and-copper portal opening with a muted teal glowing interior, pressure gauges, chunky wiring, salvaged kitchen hardware and a ridiculous red emergency lever. Left half has clear empty foreground floor space for separately animated character sprites; a messy workbench with coils, hand-drawn blueprints, half-disassembled toaster and tools along the back wall. A crooked wall clock, tangled cables, warm plaster walls, brown floorboards. It should feel like someone built a temporal catastrophe with household junk. Composition readable on a phone: bold simple shapes, strong portal silhouette, plenty of free space in front. Three-quarter side view, scene viewed straight enough for flat standing sprites. Warm hand-inked comic illustration, dark brown outlines, cream, ochre, coral, muted sage with restrained teal glow; dry absurdist comedy game art, lightly textured painted background. No people, no faces, no characters inside the portal, no text or numbers, no speech bubbles, no labels, no logos, no watermark. Opaque background. Character identity must be supplied separately by the game.
```

## Personalization contract

The landing page edits and remembers the assistant’s name and accepts an approved personal character or bundled fictional sample. `createFatherProfile(name, art)` and `HuntSnapshot.father` supply the name, atlas, grid dimensions, and expression-to-frame mapping to the intro, poster, Phaser sprites, case file, and results. The canonical story is generated from the father and player names; no generated artwork contains either name.

Generation produces **one reusable expression atlas per uploaded father**. Preview and approve the base face before the five expressions. Use the existing sample atlas as a layout template: equal square cells, consistent scale and placement, genuinely transparent background, head-only silhouettes centred in each cell, filling roughly the central 90%. No torso or hands. Preserve distinctive facial features across the six expressions. Both intro and hunt compose the same heads with reusable body poses in `apps/web/src/art/dad.ts`. The house clips appliance occupants to their actual windows. A character with different head framing will need explicit framing metadata or a corrected generation before acceptance.

Photo generation must run behind the backend job/storage interfaces. A completed pack replaces the sample in the room snapshot. Keep the illustrated environment and vector movement reusable; generating a fresh video or laboratory for every upload is unnecessary. Local jobs use SQLite/files; cloud jobs use DynamoDB/S3/SQS behind the same contract. The scene makes no image API calls. Recovery, budget limits and approval happen in the character creation flow.

The current face atlas, serious/laughing expression contract and exact generation prompt are in [DESI-ART.md](DESI-ART.md). Hunts contain 12–20 targets, including one broom rider, across twenty possible hiding places. No total is announced in the story or HUD.
