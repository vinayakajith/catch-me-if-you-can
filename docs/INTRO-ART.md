# Time-machine intro

The case has three scenes: the scientist walks into a homemade time machine, six hyperactive copies escape, and a government detective is assigned to bag them. The first two scenes last about thirteen seconds together. The player can advance or skip immediately, pause, replay, mute, or use reduced motion. The dispatch screen waits for an explicit start. Intro and loading time never consume hunt time.

## Background provenance

- Asset: `apps/web/public/assets/time-machine-lab.png` (1536 × 1024, opaque).
- Generated with the built-in image generation tool, generation mode. No API key or runtime generation call is involved.
- Original preserved at `/Users/vinayak/.codex/generated_images/01a12666-a1a6-7ea1-ad29-cb65ef9cd1e9/exec-e1b2706c-9f54-4d97-b5f2-1e9ddd8714d0.png`.
- The game uses the copied asset in the repository. It does not depend on that original local path.
- The scene contains no father character or name. Existing father/detective atlases are separate layers. Native SVG costumes, limbs, cape, and pitchfork animate over the background.

Exact generation prompt:

```text
Use case: illustration-story. Asset type: reusable background for a short 2D comedy game intro, landscape 1536x1024.
Draw an empty makeshift home laboratory built by an overconfident mad scientist in an Indian house. Large eccentric homemade TIME MACHINE on the RIGHT HALF: a tall oval brass-and-copper portal opening with a muted teal glowing interior, pressure gauges, chunky wiring, salvaged kitchen hardware and a ridiculous red emergency lever. Left half has clear empty foreground floor space for separately animated character sprites; a messy workbench with coils, hand-drawn blueprints, half-disassembled toaster and tools along the back wall. A crooked wall clock, tangled cables, warm plaster walls, brown floorboards. It should feel like someone built a temporal catastrophe with household junk. Composition readable on a phone: bold simple shapes, strong portal silhouette, plenty of free space in front. Three-quarter side view, scene viewed straight enough for flat standing sprites. Warm hand-inked comic illustration, dark brown outlines, cream, ochre, coral, muted sage with restrained teal glow; dry absurdist comedy game art, lightly textured painted background. No people, no faces, no characters inside the portal, no text or numbers, no speech bubbles, no labels, no logos, no watermark. Opaque background. Character identity must be supplied separately by the game.
```

## Personalization contract

The landing page currently edits and remembers the scientist's name; artwork is still the bundled fictional sample. `createFatherProfile(name, art)` and `HuntSnapshot.father` supply the name, atlas, grid dimensions, and expression-to-frame mapping to the intro, poster, Phaser sprites, case file, and results. The canonical story is generated from the father and detective names; no generated artwork contains either name.

For Phase 3, generate **one reusable expression atlas per uploaded father**, then preview and approve it during room creation. Use the existing sample atlas as a layout template: equal square cells, consistent scale and placement, genuinely transparent background, head in the upper 70% of each cell, and a short torso below. Preserve distinctive facial features across the six expressions. The intro crops the head and supplies animated bodies; the house uses the full portrait, poses, and existing furniture layers. A character with different head framing will need explicit framing metadata or a corrected generation before acceptance.

Photo generation must run behind the backend job/storage interfaces. A completed pack replaces the sample in the room snapshot. Keep the illustrated environment and vector movement reusable; generating a fresh video or laboratory for every upload is unnecessary. The later worker can use local storage first, then S3 without changing the intro or hunt renderer. Provider choice, photo handling, generation cost, and retries remain Phase 3 work.

The intro is an optional visual setup. The hunt keeps the same six targets, twenty possible hideouts, quiet discovery, and automatic sack captures.
