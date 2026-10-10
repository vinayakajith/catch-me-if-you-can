import type { Expression } from '../../../packages/game-core/src/index.ts';

export const PROMPT_VERSION = 'dad-head-v1';
const moods: Record<Expression, string> = {
  serious: 'Completely serious deadpan portrait: closed mouth, still eyebrows, absolutely no smile. He believes his disguise is flawless.',
  grin: 'Mischievous closed-mouth grin, one slightly raised eyebrow, pleased with his terrible invention.',
  laugh: 'Hyperactive delighted open-mouth cackling laugh, joyful crescent eyes. Laughing at his own ridiculous joke.',
  giggle: 'A different delighted giggle: scrunched happy eyes, slightly open cheeky smile, puffed laughing cheeks.',
  bonked: 'Brief slapstick surprise: wide eyes and round O mouth, comically startled, no injury or pain marks.',
  dizzy: 'Amused silly dazed expression, slightly cross-eyed and lopsided smile. No stars or objects outside the head.',
};
export function headPrompt(expression: Expression, hasBase: boolean, correction?: string) {
  return `Use case: identity-preserve. Asset: one transparent head-only sprite for a funny 2D game.
Image 1 is the original person. Preserve their individual face shape, complexion, age, hairline, hairstyle, facial hair, glasses and distinctive features. Do not add a moustache, glasses, hair or any other feature that is absent.
${hasBase ? 'Image 2 is the approved cartoon head. EDIT THIS APPROVED HEAD: change only the facial expression. Keep its identity, silhouette, frontal angle, palette, ink lines, head size and placement identical. Use image 1 only to maintain likeness.' : 'Turn the person into a recognizable, gently exaggerated big-headed cartoon with confident dark brown ink outlines, soft painted shading and warm natural colours. Preserve likeness before exaggeration. This is an adult character, not a baby-faced mascot.'}
Expression: ${moods[expression]}
One frontal upright head only. No neck, shoulders, torso, hands, props, hat, captions or lettering. Complete hair, ears, chin and beard within the canvas. Center the head with at least 12 percent clear margin on every side. The head must read clearly when small.
Fully transparent background with real alpha. Preserve transparency. No scene, solid background, checkerboard, glow or cast shadow. No fear or sadness for hiding expressions. No other faces or expression grid.
${correction ? `Correct the previous technical issue: ${correction}.` : ''}`;
}
