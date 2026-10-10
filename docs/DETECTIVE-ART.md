# Detective sprite atlas

Bundled asset: `apps/web/public/assets/detective-poses.png`.

Generated with the built-in image generation tool, with transparent background enabled. The atlas is 1536 × 1024, with three columns and two rows. It is sliced at runtime; the original raster is preserved. The separate sack and furniture layers are editable SVG source in `apps/web/src/game/art.ts`.

Frames: idle, sneak left, sneak right, inspect, grab, bag.

## Final prompt

Use case: stylized-concept. Create a transparent 2D cartoon detective sprite sheet for a friendly comic mystery game. Exactly six equal square cells in a 3-column, 2-row grid, 1536x1024 overall. The same adult detective in each cell, full body, large beige trench coat, brown deerstalker hat, expressive round face, dark hair, small brown shoes and magnifying glass. Bold dark brown ink outlines, warm cream and ochre colours, simple cel shading, readable as a tiny game sprite. Poses in reading order: standing idle; walking with left foot forward; walking with right foot forward; leaning to inspect with the magnifying glass; reaching forward; bending to pick something up. Same scale, facing three-quarter right, consistent foot baseline, generous empty padding around each pose. Genuine transparent alpha background. No grid lines, text, shadows, other people or objects.
