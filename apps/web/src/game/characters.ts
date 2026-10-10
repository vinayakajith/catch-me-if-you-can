import type Phaser from 'phaser';
import type { CharacterPack } from '@father-hunter/game-core';
import { DAD_POSES, FACE_BOX } from '../art/dad';

// Runtime composition, not altered source art: every reusable body takes its
// face from the room's pack. Appliance frames are physically clipped here, so
// spinning elbows/heads can never appear outside the glass aperture.
export function prepareCharacters(scene: Phaser.Scene, father: CharacterPack, density = 1) {
  const heads = scene.textures.get('father-source').getSourceImage() as HTMLImageElement;
  const fw = heads.width / father.columns, fh = heads.height / father.rows;
  for (const pose of DAD_POSES) {
    const height = pose === 'feet' ? 100 : 220, canvas = document.createElement('canvas');
    canvas.width = 160 * 6 * density; canvas.height = height * density;
    const ctx = canvas.getContext('2d')!, body = scene.textures.get(`body-${pose}`).getSourceImage() as HTMLImageElement;
    ctx.scale(density, density); ctx.imageSmoothingQuality = 'high';
    for (let frame = 0; frame < 6; frame++) {
      ctx.save(); ctx.translate(frame * 160, 0);
      if (pose === 'feet') ctx.drawImage(body, 0, 120 * density, 160 * density, 100 * density, 0, 0, 160, 100);
      else {
        ctx.drawImage(body, 0, 0, 160, 220);
        ctx.drawImage(heads, frame % father.columns * fw, Math.floor(frame / father.columns) * fh, fw, fh, FACE_BOX.x, FACE_BOX.y, FACE_BOX.w, FACE_BOX.h);
      }
      ctx.restore();
    }
    scene.textures.addSpriteSheet(`father-${pose}`, scene.textures.addCanvas(`father-${pose}`, canvas)!, { frameWidth: 160 * density, frameHeight: height * density });
  }
  const body = scene.textures.get('father-cramped').getSourceImage() as HTMLCanvasElement;
  for (const kind of ['washer', 'microwave']) {
    const canvas = document.createElement('canvas'); canvas.width = 160 * 8 * density; canvas.height = 160 * 4 * density;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(density, density); ctx.imageSmoothingQuality = 'high';
    for (let i = 0; i < 32; i++) {
      ctx.save(); ctx.translate(i % 8 * 160, Math.floor(i / 8) * 160);
      ctx.beginPath();
      if (kind === 'washer') ctx.ellipse(81, 98, 33, 32, 0, 0, Math.PI * 2);
      else ctx.rect(19, 51, 94, 57);
      ctx.clip(); ctx.translate(kind === 'washer' ? 81 : 66, kind === 'washer' ? 98 : 79);
      ctx.rotate(i / 32 * Math.PI * 2);
      const frame = father.expressions[Math.floor(i / 8) % 2 ? 'giggle' : 'laugh'];
      ctx.drawImage(body, frame * 160 * density, 0, 160 * density, 220 * density, -26, -36, 52, 72);
      ctx.restore();
    }
    scene.textures.addSpriteSheet(`spin-${kind}`, scene.textures.addCanvas(`spin-${kind}`, canvas)!, { frameWidth: 160 * density, frameHeight: 160 * density });
  }
  const witch = document.createElement('canvas'); witch.width = 160 * 6 * density; witch.height = 220 * density;
  const ctx = witch.getContext('2d')!; ctx.scale(density, density);
  for (let frame = 0; frame < 6; frame++) ctx.drawImage(scene.textures.get(`witch-${frame}`).getSourceImage() as HTMLImageElement, frame * 160, 0, 160, 220);
  scene.textures.addSpriteSheet('witch', scene.textures.addCanvas('witch', witch)!, { frameWidth: 160 * density, frameHeight: 220 * density });
}
