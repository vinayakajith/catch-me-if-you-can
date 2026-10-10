# Desi character pack

Generated with the built-in image generation tool. The original sample father was the identity reference; no personal photo was uploaded.

Asset: `apps/web/public/assets/balaji-heads.png` (1536 × 1024, transparent, 3 × 2).

Frames: serious, grin, laugh, giggle, bonked, dizzy. The serious portrait and Liberty disguise never animate their expressions. Other hiding poses use laugh/giggle.

The reusable checked-lungi body rig is native SVG in `apps/web/src/art/dad.ts`. Intro and game share it; the face atlas remains replaceable for later photo generation. Poses: standing, running, scientist coat, broom rider, cramped, Liberty (flashlight/notebook), caught, feet under the bed.

## Exact generation prompt

Use case: identity-preserve.
Asset type: production transparent 2D game character expression sprite atlas.
Input image 1: reference for the exact Indian dad identity, moustache, glasses, hair, skin tone and warm hand-drawn cartoon rendering.
Primary request: create a NEW expression atlas of this same dad as six HEAD-ONLY portraits, no hands, no torso, no clothing. Keep his thick black moustache, square black spectacles, receding side-part hair, oversized nose, warm brown skin. The head is funny and instantly recognizable. Output a 1536 by 1024 transparent PNG arranged as a strict 3-column by 2-row grid of six equal 512 by 512 cells. Each head is centered at the identical position, top at about 40px and chin at about 450px inside its own cell, complete silhouette with clear transparent margins. No head overlaps a cell edge.
Expressions in reading order: top left completely serious deadpan suspicious official portrait, mouth closed, no smile; top middle very cheeky closed-mouth grin with raised eyebrows; top right hyperactive delighted open-mouth cackling laugh with joyful crescent eyes; bottom left another big mischievous laughing expression, head same frontal angle; bottom middle comic startled reaction to a slapstick bonk, wide eyes and round mouth, not injured; bottom right dazed and cross-eyed after a boing, amused silly mouth.
Constraints: preserve reference identity and polished ink outlines and softly painted highlights. No scared hiding expressions. All heads frontal and identical scale. No shoulders, no hands, no props, no labels, no numbers, no text, no grid lines, no shadows or colored glow outside the head, no opaque backdrop. Actual transparent alpha outside sprites.

