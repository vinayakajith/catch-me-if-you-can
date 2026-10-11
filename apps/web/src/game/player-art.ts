import type Phaser from 'phaser';
import { witchSvg } from '../art/witch';
import { svgUri } from './art';

export function playerWitchSvg(colour: string, frame = 0, face?: string) {
  let svg = witchSvg(frame).replaceAll('#743bac', colour).replaceAll('#9859c5', colour).replaceAll('#9854bc', colour);
  if (face) svg = svg.replace(/<path d="M52 56[\s\S]+?(?=<path d="M47 49)/, `<image href="${face}" x="35" y="43" width="91" height="82" stroke="none"/>`);
  return svg;
}
const load = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src; });
export async function playerTexture(scene: Phaser.Scene, key: string, colour: string, avatar: string | undefined, density: number) {
  let face: string | undefined;
  if (avatar) {
    try {
      const response = await fetch(avatar, { credentials: 'same-origin' }); if (!response.ok) throw new Error();
      const blob = await response.blob();
      face = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob); });
      if (!face.startsWith('data:image/png;base64,')) face = undefined;
    } catch { /* A preset always remains playable, including when an image expires. */ }
  }
  const frames = await Promise.all(Array.from({ length: 6 }, (_, i) => load(svgUri(playerWitchSvg(colour, i, face)))));
  if (!scene.scene.isActive()) return;
  const canvas = document.createElement('canvas'); canvas.width = 960 * density; canvas.height = 220 * density;
  const ctx = canvas.getContext('2d')!; ctx.scale(density, density); ctx.imageSmoothingQuality = 'high';
  frames.forEach((frame, i) => ctx.drawImage(frame, i * 160, 0, 160, 220));
  scene.textures.addSpriteSheet(key, scene.textures.addCanvas(key, canvas)!, { frameWidth: 160 * density, frameHeight: 220 * density });
}
