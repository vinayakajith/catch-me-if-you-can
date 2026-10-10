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
      game = new Phaser.Game({ type: Phaser.AUTO, parent: node, width: node.clientWidth, height: node.clientHeight,
        backgroundColor: '#29493d', antialias: true, roundPixels: true,
        scene: new HouseScene(bridge), input: { activePointers: 3, keyboard: true },
        scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
        audio: { noAudio: true }, banner: false,
      });
      observer = new ResizeObserver(() => { if (node.clientWidth && node.clientHeight) game?.scale.resize(node.clientWidth, node.clientHeight); });
      observer.observe(node);
    }).catch(() => bridge.failed('The game could not start. Please reload and try again.'));
    return () => { cancelled = true; observer?.disconnect(); game?.destroy(true); };
  }, [bridge]);
  return <div ref={parent} className="game-canvas" role="application" aria-label={`${bridge.session.getSnapshot().father.name}’s house. Tap the floor to walk, tap furniture to search, and tap a visible dad to catch him.`} />;
}
