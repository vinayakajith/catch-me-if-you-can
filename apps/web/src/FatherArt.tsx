import type { CharacterPack, Expression } from '@father-hunter/game-core';
import { bodyMarkup, FACE_BOX, type DadPose } from './art/dad';

/** Identical head/body composition in the creator, introduction and Phaser rig. */
export function FatherArt({ father, pose = 'stand', mood = 'grin' }: { father: CharacterPack; pose?: DadPose; mood?: Expression }) {
  const frame = father.expressions[mood];
  return <>
    <g dangerouslySetInnerHTML={{ __html: bodyMarkup(pose, father.palette?.skin) }} />
    {pose !== 'feet' && <svg x={FACE_BOX.x} y={FACE_BOX.y} width={FACE_BOX.w} height={FACE_BOX.h} viewBox={`${frame % father.columns * 100} ${Math.floor(frame / father.columns) * 100} 100 100`} overflow="hidden">
      <image href={father.atlas} width={father.columns * 100} height={father.rows * 100} />
    </svg>}
  </>;
}
