import Phaser from 'phaser';
import { BALAJI, HOUSE, canReach, contains, distance, findPath, type ActionResult, type HidingSlot, type HuntSession, type Point } from '@father-hunter/game-core';
import { hunterSvg, propSvg, svgUri } from './art';

export interface GameBridge {
  session: HuntSession;
  movement: Point;
  reducedMotion: boolean;
  feedback(result: ActionResult): void;
  ready(): void;
  failed(message: string): void;
  inspect?: () => void;
  navigate?: (point: Point) => void;
}

export class HouseScene extends Phaser.Scene {
  private bridge: GameBridge;
  private hunter!: Phaser.GameObjects.Image;
  private props = new Map<string, Phaser.GameObjects.Image>();
  private dads = new Map<string, Phaser.GameObjects.Image>();
  private masks = new Map<string, Phaser.Display.Masks.GeometryMask>();
  private fog = new Map<string, Phaser.GameObjects.Rectangle>();
  private shown = new Set<string>();
  private reacted = new Set<string>();
  private opened = new Set<string>();
  private route: Point[] = [];
  private pending?: { type: 'search' | 'catch'; slotId: string };
  private searchBar!: Phaser.GameObjects.Graphics;
  private destination!: Phaser.GameObjects.Arc;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private stopped = false;
  private previousPosition: Point = HOUSE.spawn;
  private loaded = true;

  constructor(bridge: GameBridge) { super('House'); this.bridge = bridge; }

  preload() {
    this.load.image('balaji-source', BALAJI.atlas);
    this.load.svg('hunter', svgUri(hunterSvg), { width: 160, height: 160 });
    for (const kind of new Set(HOUSE.slots.map(s => s.kind))) {
      this.load.svg(kind, svgUri(propSvg(kind)), { width: 160, height: 160 });
      this.load.svg(`${kind}-open`, svgUri(propSvg(kind, true)), { width: 160, height: 160 });
    }
    this.load.on('loaderror', () => { this.loaded = false; this.bridge.failed('The house art could not load. Please reload and try again.'); });
  }

  create() {
    if (!this.loaded) return;
    const source = this.textures.get('balaji-source').getSourceImage() as HTMLImageElement;
    this.textures.addSpriteSheet('balaji', source, { frameWidth: source.width / 3, frameHeight: source.height / 2 });
    this.drawHouse();
    for (const slot of HOUSE.slots) {
      const { prop: p } = slot;
      const prop = this.add.image(p.x + p.w / 2, p.y + p.h / 2, slot.kind).setDisplaySize(p.w, p.h).setDepth(p.y + p.h);
      this.props.set(slot.id, prop);
      const dad = this.add.image(slot.target.x, slot.target.y, 'balaji', 1).setDisplaySize(78, 78).setDepth(p.y - 1).setVisible(false);
      const maskGraphics = this.make.graphics({ x: 0, y: 0 });
      maskGraphics.fillStyle(0xffffff).fillRect(slot.hit.x, slot.hit.y, slot.hit.w, slot.hit.h);
      const mask = maskGraphics.createGeometryMask();
      this.masks.set(slot.id, mask); dad.setMask(mask);
      this.dads.set(slot.id, dad);
    }
    this.hunter = this.add.image(HOUSE.spawn.x, HOUSE.spawn.y - 25, 'hunter').setDisplaySize(57, 66).setDepth(2000);
    this.searchBar = this.add.graphics().setDepth(2200);
    this.destination = this.add.circle(0, 0, 9, 0xf7e8a6, .3).setStrokeStyle(2, 0xf6edc8, .9).setDepth(30).setVisible(false);
    for (const room of HOUSE.rooms.filter(r => r.id !== 'hall')) {
      this.fog.set(room.id, this.add.rectangle(room.x + room.w / 2, room.y + room.h / 2, room.w, room.h, 0x263e34, .34).setDepth(1800));
    }
    this.cameras.main.setBounds(0, 0, HOUSE.width, HOUSE.height);
    this.cameras.main.startFollow(this.hunter, false, this.bridge.reducedMotion ? 1 : .12, this.bridge.reducedMotion ? 1 : .12, 0, 10);
    this.resize();
    this.scale.on('resize', this.resize, this);
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,E') as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.getDistance() > 14 || this.stopped) return;
      const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      this.tap(point);
    });
    this.bridge.inspect = () => this.inspectNearest();
    this.bridge.navigate = point => this.walkTo(point);
    const unsubscribe = this.bridge.session.subscribe(() => this.sync());
    this.events.once('shutdown', () => {
      unsubscribe(); this.scale.off('resize', this.resize, this);
      this.bridge.inspect = undefined; this.bridge.navigate = undefined;
    });
    this.sync(); this.bridge.ready();
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('test')) {
      // Development-only browser test access; never present in production builds.
      (window as unknown as { __huntTest: unknown }).__huntTest = { session: this.bridge.session, scene: this,
        tap: (p: Point) => this.tap(p), walk: (p: Point) => this.walkTo(p),
        screen: (p: Point) => ({ x: (p.x - this.cameras.main.scrollX) * this.cameras.main.zoom, y: (p.y - this.cameras.main.scrollY) * this.cameras.main.zoom }),
        slots: HOUSE.slots,
      };
    }
  }

  private resize() {
    const { width, height } = this.scale;
    // Keep furniture and faces large on phones; camera follows rather than shrinking the entire house.
    this.cameras.main.setZoom(width < 600 ? Math.max(.78, width / 490) : Math.min(1.3, Math.max(.95, height / 530)));
  }

  private drawHouse() {
    const g = this.add.graphics().setDepth(0);
    g.fillStyle(0x29493d).fillRect(0, 0, HOUSE.width, HOUSE.height);
    for (let y = 20; y < HOUSE.height; y += 40) for (let x = 20; x < HOUSE.width; x += 40) {
      g.fillStyle((x + y) % 80 ? 0x325344 : 0x254639, .8).fillCircle(x, y, 3);
    }
    // Warm walls, floorboards, tile grout, and rugs are separate from interactive furniture.
    for (const room of HOUSE.rooms) {
      g.fillStyle(0x172f27, .4).fillRoundedRect(room.x - 14, room.y - 5, room.w + 38, room.h + 35, 10);
      g.fillStyle(0x4d5546).fillRoundedRect(room.x - 14, room.y - 16, room.w + 28, room.h + 30, 8);
      g.fillStyle(0xe6d9b9).fillRoundedRect(room.x - 8, room.y - 10, room.w + 16, room.h + 18, 4);
      g.fillStyle(Phaser.Display.Color.HexStringToColor(room.floor).color).fillRect(room.x, room.y, room.w, room.h);
      g.lineStyle(1, 0x857859, .17);
      if (room.id === 'bathroom' || room.id === 'kitchen') {
        for (let y = room.y; y < room.y + room.h; y += 38) for (let x = room.x; x < room.x + room.w; x += 38) {
          g.strokeRect(x, y, Math.min(38, room.x + room.w - x), Math.min(38, room.y + room.h - y));
          if ((Math.floor(x / 38) + Math.floor(y / 38)) % 3 === 0) g.fillStyle(0x6f9485, .1).fillRect(x + 3, y + 3, 30, 30);
        }
      } else {
        for (let y = room.y + 24; y < room.y + room.h; y += 32) {
          g.lineBetween(room.x, y, room.x + room.w, y);
          for (let x = room.x + (y % 3) * 38; x < room.x + room.w; x += 113) g.lineBetween(x, y, x, Math.min(y + 32, room.y + room.h));
        }
      }
      if (room.id !== 'hall') {
        const rug = this.add.rectangle(room.x + room.w / 2, room.y + room.h * .55, room.w * .4, room.h * .19, Phaser.Display.Color.HexStringToColor(room.color).color, .35).setDepth(2).setStrokeStyle(4, 0xf9e9c6, .45);
        if (room.id === 'bathroom') rug.setSize(75, 39);
        this.add.text(room.x + 22, room.y + room.h - 26, room.name.toUpperCase(), { fontFamily: 'Georgia, serif', fontSize: '14px', color: '#645e48', letterSpacing: 2 }).setAlpha(.6).setDepth(3);
      }
    }
    for (const p of HOUSE.passages) {
      g.fillStyle(0xe5d9bd).fillRect(p.x, p.y, p.w, p.h);
      if (p.w < 40 || p.h < 40) {
        g.lineStyle(2, 0x947e5d, .3);
        if (p.w < p.h) g.lineBetween(p.x + p.w / 2, p.y, p.x + p.w / 2, p.y + p.h);
        else g.lineBetween(p.x, p.y + p.h / 2, p.x + p.w, p.y + p.h / 2);
      }
    }
    this.add.text(748, 157, '← LIVING\n\nKITCHEN →', { fontFamily: 'Arial', fontSize: '13px', color: '#6f765d', align: 'center', lineSpacing: 4 }).setOrigin(.5).setDepth(4);
    for (const [x, label] of [[270, '↓ BEDROOM'], [760, '↓ BATHROOM'], [1240, '↓ STOREROOM']] as const) {
      this.add.text(x, 585, label, { fontFamily: 'Arial', fontSize: '12px', color: '#817554', letterSpacing: 1 }).setOrigin(.5).setDepth(4);
    }
    const slippers = this.add.graphics().setDepth(3);
    slippers.fillStyle(0x777f61).fillRoundedRect(582, 550, 13, 25, 6).fillRoundedRect(600, 560, 13, 25, 6);
    slippers.lineStyle(2, 0xcebd88).lineBetween(584, 558, 592, 565).lineBetween(603, 568, 611, 575);
  }

  private dadPoint(slot: HidingSlot): Point {
    return this.opened.has(slot.id) ? { x: slot.prop.x + slot.prop.w / 2, y: slot.prop.y + slot.prop.h * .3 } : slot.target;
  }

  private tap(point: Point) {
    const state = this.bridge.session.getSnapshot();
    if (state.status !== 'playing') return;
    for (const slot of HOUSE.slots.filter(s => s.roomId === state.player.roomId)) {
      const target = state.targets.find(t => t.slotId === slot.id && !t.claimedBy);
      if (!target || (slot.mode === 'search' && !state.opened.includes(slot.id))) continue;
      const p = this.dadPoint(slot);
      const hit = state.opened.includes(slot.id) ? { x: p.x - 30, y: p.y - 35, w: 60, h: 65 } : slot.hit;
      if (contains(hit, point, 3)) { this.walkTo(slot.anchor, { type: 'catch', slotId: slot.id }); return; }
    }
    const prop = HOUSE.slots.find(s => s.roomId === state.player.roomId && contains(s.prop, point, 5));
    if (prop) this.walkTo(prop.anchor, { type: 'search', slotId: prop.id });
    else this.walkTo(point);
  }

  private walkTo(point: Point, pending?: { type: 'search' | 'catch'; slotId: string }) {
    const state = this.bridge.session.getSnapshot();
    if (state.status !== 'playing') return;
    this.pending = pending;
    if (pending && canReach(state.player.position, HOUSE.slots.find(s => s.id === pending.slotId)!)) { this.route = []; this.perform(); return; }
    this.route = findPath(state.player.position, point);
    if (!this.route.length) { this.pending = undefined; this.bridge.feedback({ ok: false, kind: 'error', message: 'Try tapping a clear bit of floor.' }); return; }
    const end = this.route.at(-1)!;
    this.destination.setPosition(end.x, end.y).setVisible(true);
  }

  private perform() {
    const action = this.pending; this.pending = undefined;
    if (action) this.bridge.feedback(this.bridge.session[action.type](action.slotId));
  }

  private inspectNearest() {
    const state = this.bridge.session.getSnapshot();
    const near = HOUSE.slots.filter(s => canReach(state.player.position, s)).sort((a, b) => distance(a.anchor, state.player.position) - distance(b.anchor, state.player.position))[0];
    if (near) this.bridge.feedback(this.bridge.session.search(near.id));
    else this.bridge.feedback({ ok: false, kind: 'error', message: 'Tap some furniture to walk over and check it.' });
  }

  private sync() {
    const state = this.bridge.session.getSnapshot();
    this.stopped = state.status !== 'playing';
    this.cameras.main.setLerp(this.bridge.reducedMotion ? 1 : .12, this.bridge.reducedMotion ? 1 : .12);
    for (const [id, fog] of this.fog) fog.setVisible(id !== state.player.roomId);
    for (const slot of HOUSE.slots) {
      const target = state.targets.find(t => t.slotId === slot.id);
      const dad = this.dads.get(slot.id)!;
      if (state.opened.includes(slot.id) && !this.opened.has(slot.id)) {
        this.opened.add(slot.id); this.props.get(slot.id)!.setTexture(`${slot.kind}-open`);
        if (target && !target.claimedBy) {
          dad.clearMask(); const p = this.dadPoint(slot);
          dad.setPosition(p.x, p.y).setDepth(1500).setFrame(2).setVisible(true);
          if (!this.bridge.reducedMotion) this.tweens.add({ targets: dad, y: { from: p.y + 20, to: p.y }, duration: 360, ease: 'Back.Out' });
        }
      }
      if (!target) { dad.setVisible(false); continue; }
      if (target.claimedBy) {
        if (!this.reacted.has(slot.id)) { this.reacted.add(slot.id); this.react(slot); }
        continue;
      }
      const visible = state.player.roomId === slot.roomId && (slot.mode === 'peek' || this.opened.has(slot.id));
      dad.setVisible(visible);
      if (visible) this.shown.add(slot.id);
    }
  }

  private react(slot: HidingSlot) {
    const dad = this.dads.get(slot.id)!;
    dad.clearMask().setFrame(3).setDepth(2100).setVisible(true);
    const label = this.add.text(dad.x, dad.y - 53, '+1 BALAJI', { fontFamily: 'Arial', fontSize: '15px', fontStyle: 'bold', color: '#fff1c5', backgroundColor: '#3d6555', padding: { x: 10, y: 6 } }).setOrigin(.5).setDepth(2300);
    if (this.bridge.reducedMotion) this.time.delayedCall(800, () => { dad.setVisible(false); label.destroy(); });
    else {
      this.tweens.add({ targets: dad, y: dad.y - 34, angle: 9, duration: 240, yoyo: true, ease: 'Back.Out' });
      this.time.delayedCall(380, () => dad.setFrame(slot.kind === 'toilet' ? 2 : 4));
      this.tweens.add({ targets: [dad, label], alpha: 0, delay: 900, duration: 400, onComplete: () => { dad.setVisible(false); label.destroy(); } });
    }
  }

  update(_time: number, delta: number) {
    if (!this.hunter || !this.loaded) return;
    this.bridge.session.tick();
    const k = this.keys;
    const keyDirection = { x: Number(k.D.isDown || k.RIGHT.isDown) - Number(k.A.isDown || k.LEFT.isDown), y: Number(k.S.isDown || k.DOWN.isDown) - Number(k.W.isDown || k.UP.isDown) };
    let direction = this.bridge.movement.x || this.bridge.movement.y ? this.bridge.movement : keyDirection;
    if (direction.x || direction.y) { this.route = []; this.pending = undefined; }
    else if (this.route.length) {
      const pos = this.bridge.session.getSnapshot().player.position;
      while (this.route.length && distance(pos, this.route[0]) < 4) this.route.shift();
      if (this.route.length) {
        const next = this.route[0], d = distance(pos, next);
        direction = { x: (next.x - pos.x) / d, y: (next.y - pos.y) / d };
        delta = Math.min(delta, d / 210 * 1000);
      } else this.perform();
    }
    this.bridge.session.move(direction, delta);
    if (Phaser.Input.Keyboard.JustDown(k.E)) this.inspectNearest();
    const state = this.bridge.session.getSnapshot();
    const pos = state.player.position;
    const moving = distance(pos, this.previousPosition) > .1;
    this.previousPosition = pos;
    this.hunter.setPosition(pos.x, pos.y - 25 + (moving && !this.bridge.reducedMotion ? Math.sin(_time / 85) * 2 : 0));
    if (direction.x) this.hunter.setFlipX(direction.x < 0);
    this.destination.setVisible(this.route.length > 0 && !this.stopped);
    this.searchBar.clear();
    if (state.search) {
      const slot = HOUSE.slots.find(s => s.id === state.search!.slotId)!;
      const progress = Math.min(1, (Date.now() - state.search.startedAt) / (state.search.endsAt - state.search.startedAt));
      this.searchBar.fillStyle(0x303e33, .9).fillRoundedRect(slot.prop.x + slot.prop.w / 2 - 35, slot.prop.y - 53, 70, 9, 4);
      this.searchBar.fillStyle(0xf4c86e).fillRoundedRect(slot.prop.x + slot.prop.w / 2 - 33, slot.prop.y - 51, 66 * progress, 5, 2);
    }
  }
}
