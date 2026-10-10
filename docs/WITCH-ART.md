# Witch and wooden hammer

The player is an old witch with an angular face, grey hair, a black pointed hat and a violet dress. The vector rig in `apps/web/src/art/witch.ts` is shared by the intro and house. Six poses cover idle, two walking steps, inspection, hammer wind-up and bagging. Existing dimensions and anchors preserve pathfinding and capture timing.

In the intro she stirs a visible potion while her idiot assistant enters the time machine. His chosen name and personal face carry through every scene. She returns with her sack to collect the laughing copies.

A catch extracts the assistant, swings an oversized wooden mallet onto his head, switches to his bonked/dizzy faces, and arcs him into the sack. Reduced motion keeps the sequence readable without the swing or flight. The hiding faces stay amused; the framed portrait and Liberty pose stay serious.

Artwork is rasterized at the game’s capped device pixel ratio (maximum 2). This rig and story change required no paid image calls. The old detective atlas is a historical asset and is not loaded by the game.
