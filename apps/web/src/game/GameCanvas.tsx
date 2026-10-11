import { useEffect, useRef } from 'react';
import type { GameBridge } from './HouseScene';

export function GameCanvas({ bridge }: { bridge: GameBridge }) {
  const parent = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    let game: { destroy(remove: boolean): void; scale: { resize(w: number, h: number): void } } | undefined;
    let observer: ResizeObserver | undefined;
    Promise.all([import('phaser'), import('./HouseScene')]).then(([{ default: Phaser }, { HouseScene }]) => {
      if (cancelled || !parent.current) return;
      const node = parent.current;
      const density = Math.max(1, Math.min(2, window.devicePixelRatio || 1)); bridge.pixelRatio = density;
      // This scene uses ordinary 2D sprites. Canvas avoids software WebGL
      // stalls on low-power devices while preserving the same retina artwork.
      game = new Phaser.Game({ type: Phaser.CANVAS, parent: node, width: Math.round(node.clientWidth * density), height: Math.round(node.clientHeight * density),
        backgroundColor: '#29493d', antialias: true, roundPixels: false,
        scene: new HouseScene(bridge), input: { activePointers: 3, keyboard: true },
        scale: { mode: Phaser.Scale.NONE, zoom: 1 / density, autoCenter: Phaser.Scale.CENTER_BOTH },
        audio: { noAudio: true }, banner: false,
      });
      observer = new ResizeObserver(() => { if (node.clientWidth && node.clientHeight) game?.scale.resize(Math.round(node.clientWidth * density), Math.round(node.clientHeight * density)); });
      observer.observe(node);
    }).catch(() => bridge.failed('The game could not start. Please reload and try again.'));
    return () => { cancelled = true; observer?.disconnect(); game?.destroy(true); };
  }, [bridge]);
  return <div ref={parent} className="game-canvas" role="application" aria-label={`${bridge.session.getSnapshot().father.name}’s house. Tap the floor to walk, tap furniture to search, and tap a visible ${bridge.session.getSnapshot().father.name} to catch him.`} />;
}
