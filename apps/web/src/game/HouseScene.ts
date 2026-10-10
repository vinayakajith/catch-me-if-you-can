import Phaser from 'phaser';
import { HOUSE, canReach, contains, distance, findPath, isDadExposed, peekProgress, type ActionResult, type HidingSlot, type HuntSession, type Point } from '@father-hunter/game-core';
import { hideoutSvg, sackSvg, svgUri } from './art';

export interface GameBridge {
  session: HuntSession;
  movement: Point;
  reducedMotion: boolean;
  inputEnabled: boolean;
  feedback(result: ActionResult): void;
  ready(): void;
  bagged?(count: number): void;
  failed(message: string): void;
  inspect?: () => void;
  navigate?: (point: Point) => void;
}

export class HouseScene extends Phaser.Scene {
  private bridge: GameBridge;
  private hunter!: Phaser.GameObjects.Image;
  private props = new Map<string, Phaser.GameObjects.Image>();
  private rims = new Map<string, Phaser.GameObjects.Image>();
  private dads = new Map<string, Phaser.GameObjects.Image>();
  private fog = new Map<string, Phaser.GameObjects.Rectangle>();
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
  private sack!: Phaser.GameObjects.Image;
  private captureFX!: Phaser.GameObjects.Graphics;
  private bagCount = 0;
  private capturing?: { slotId: string; from: Point; startedAt: number; score: number };


  constructor(bridge: GameBridge) { super('House'); this.bridge = bridge; }

  preload() {
    this.load.image('father-source', this.bridge.session.getSnapshot().father.atlas);
    this.load.image('detective-source', '/assets/detective-poses.png');
    this.load.svg('sack', svgUri(sackSvg), { width: 160, height: 160 });
    for (const kind of new Set(HOUSE.props.map(s => s.kind))) {
      for (const open of [false, true]) {
        this.load.svg(`${kind}${open ? '-open' : ''}`, svgUri(hideoutSvg(kind, open)), { width: 160, height: 160 });
        this.load.svg(`${kind}-front${open ? '-open' : ''}`, svgUri(hideoutSvg(kind, open, true)), { width: 160, height: 160 });
      }
    }
    this.load.on('loaderror', () => { this.loaded = false; this.bridge.failed('The house art could not load. Please reload and try again.'); });
  }

  create() {
    if (!this.loaded) return;
    const source = this.textures.get('father-source').getSourceImage() as HTMLImageElement;
    const father = this.bridge.session.getSnapshot().father;
    this.textures.addSpriteSheet('father', source, { frameWidth: source.width / father.columns, frameHeight: source.height / father.rows });
    const detective = this.textures.get('detective-source').getSourceImage() as HTMLImageElement;
    this.textures.addSpriteSheet('detective', detective, { frameWidth: detective.width / 3, frameHeight: detective.height / 2 });
    this.drawHouse();
    for (const item of HOUSE.props) {
      const { prop: p } = item;
      const slot = HOUSE.slots.find(s => s.id === item.id);
      const open = slot?.mode === 'peek';
      this.props.set(item.id, this.add.image(p.x + p.w / 2, p.y + p.h / 2, `${item.kind}${open ? '-open' : ''}`).setDisplaySize(p.w, p.h).setDepth(p.y + p.h));
      if (!slot) continue;
      this.rims.set(slot.id, this.add.image(p.x + p.w / 2, p.y + p.h / 2, `${slot.kind}-front${open ? '-open' : ''}`).setDisplaySize(p.w, p.h).setDepth(p.y + p.h + 2));
      const dad = this.add.image(slot.target.x, slot.target.y, 'father', father.expressions.laugh).setDisplaySize(slot.pose.width, slot.pose.height).setAngle(slot.pose.angle).setDepth(p.y + p.h + 1).setVisible(false);
      dad.setCrop(0, 0, dad.width, dad.height * slot.pose.crop);
      this.dads.set(slot.id, dad);
    }
    this.sack = this.add.image(HOUSE.spawn.x + 25, HOUSE.spawn.y - 6, 'sack').setOrigin(.5, 1).setDisplaySize(30, 34).setDepth(1999);
    this.hunter = this.add.image(HOUSE.spawn.x, HOUSE.spawn.y, 'detective', 0).setOrigin(.5, .94).setDisplaySize(94, 94).setDepth(2000);
    this.captureFX = this.add.graphics().setDepth(2200);
    this.searchBar = this.add.graphics().setDepth(2200);
    this.destination = this.add.circle(0, 0, 9, 0xf7e8a6, .3).setStrokeStyle(2, 0xf6edc8, .9).setDepth(30).setVisible(false);
    for (const room of HOUSE.rooms.filter(r => r.id !== 'hall')) {
      this.fog.set(room.id, this.add.rectangle(room.x + room.w / 2, room.y + room.h / 2, room.w, room.h, 0x263e34, .34).setDepth(1800));
    }
    this.cameras.main.setBounds(0, 0, HOUSE.width, HOUSE.height);
    this.cameras.main.startFollow(this.hunter, false, this.bridge.reducedMotion ? 1 : .12, this.bridge.reducedMotion ? 1 : .12, 0, 35);
    this.resize();
    this.scale.on('resize', this.resize, this);
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,E') as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.getDistance() > 14 || this.stopped || (pointer.event.target as HTMLElement | null)?.tagName !== 'CANVAS') return;
      const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      this.tap(point);
    });
    this.bridge.inspect = () => this.inspectNearest();
    this.bridge.navigate = point => this.walkTo(point);
    const unsubscribe = this.bridge.session.subscribe(() => this.sync());
    this.events.once('shutdown', () => {
      unsubscribe(); this.scale.off('resize', this.resize, this);
      this.bridge.inspect = undefined; this.bridge.navigate = undefined;
      if (import.meta.env.DEV) delete (window as unknown as { __huntTest?: unknown }).__huntTest;
    });
    this.sync(); this.bridge.ready();
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('test')) {
      // Development-only browser test access; never present in production builds.
      (window as unknown as { __huntTest: unknown }).__huntTest = { session: this.bridge.session, scene: this,
        tap: (p: Point) => this.tap(p), walk: (p: Point) => this.walkTo(p),
        face: (id: string) => { const dad = this.dads.get(id)!; return { x: dad.x, y: dad.y }; },
        presentation: () => ({ busy: !!this.capturing, bagged: this.bagCount }),
        screen: (p: Point) => ({ x: (p.x - this.cameras.main.worldView.x) * this.cameras.main.zoom, y: (p.y - this.cameras.main.worldView.y) * this.cameras.main.zoom }),
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

  private tap(point: Point) {
    if (!this.bridge.inputEnabled || this.capturing) return;
    const state = this.bridge.session.getSnapshot();
    if (state.status !== 'playing') return;
    for (const slot of HOUSE.slots.filter(s => s.roomId === state.player.roomId)) {
      const target = state.targets.find(t => t.slotId === slot.id && !t.claimedBy);
      if (!target || !isDadExposed(state, slot, Date.now())) continue;
      const dad = this.dads.get(slot.id)!;
      const hit = { x: dad.x - 30, y: dad.y - 31, w: 60, h: 62 };
      if (contains(hit, point, 7)) {
        const result = this.bridge.session.spot(slot.id);
        if (result.ok) this.walkTo(slot.anchor, { type: 'catch', slotId: slot.id });
        else this.bridge.feedback(result);
        return;
      }
    }
    const prop = HOUSE.slots.find(s => s.roomId === state.player.roomId && contains(s.prop, point, 5));
    if (prop) this.walkTo(prop.anchor, { type: 'search', slotId: prop.id });
    else this.walkTo(point);
  }

  private walkTo(point: Point, pending?: { type: 'search' | 'catch'; slotId: string }) {
    const state = this.bridge.session.getSnapshot();
    if (state.status !== 'playing' || this.capturing) return;
    this.pending = pending;
    if (pending && canReach(state.player.position, HOUSE.slots.find(s => s.id === pending.slotId)!)) { this.route = []; this.perform(); return; }
    this.route = findPath(state.player.position, point);
    if (!this.route.length) { this.pending = undefined; this.bridge.feedback({ ok: false, kind: 'error', message: 'Try tapping a clear bit of floor.' }); return; }
    const end = this.route.at(-1)!;
    this.destination.setPosition(end.x, end.y).setVisible(true);
  }

  private perform() {
    const action = this.pending; this.pending = undefined;
    if (action) {
      const slot = HOUSE.slots.find(s => s.id === action.slotId)!;
      this.hunter.setFlipX(slot.target.x < this.bridge.session.getSnapshot().player.position.x);
      this.bridge.feedback(this.bridge.session[action.type](action.slotId));
    }
  }

  private inspectNearest() {
    if (!this.bridge.inputEnabled || this.capturing) return;
    const state = this.bridge.session.getSnapshot();
    const near = HOUSE.slots.filter(s => canReach(state.player.position, s) && !state.opened.includes(s.id)).sort((a, b) => distance(a.anchor, state.player.position) - distance(b.anchor, state.player.position))[0];
    if (near) { this.hunter.setFlipX(near.target.x < state.player.position.x); this.bridge.feedback(this.bridge.session.search(near.id)); }
    else this.bridge.feedback({ ok: false, kind: 'error', message: 'Tap some furniture to walk over and check it.' });
  }

  private sync() {
    const state = this.bridge.session.getSnapshot();
    this.stopped = state.status !== 'playing';
    this.cameras.main.setLerp(this.bridge.reducedMotion ? 1 : .12, this.bridge.reducedMotion ? 1 : .12);
    for (const [id, fog] of this.fog) fog.setVisible(id !== state.player.roomId);
    for (const slot of HOUSE.slots) {
      const target = state.targets.find(t => t.slotId === slot.id);
      if (state.opened.includes(slot.id) && !this.opened.has(slot.id)) {
        this.opened.add(slot.id);
        this.props.get(slot.id)!.setTexture(`${slot.kind}-open`);
        this.rims.get(slot.id)!.setTexture(`${slot.kind}-front-open`);
        // A quiet visual tick confirms an empty search, without stopping play for a joke.
        if (!target) {
          const tick = this.add.text(slot.target.x, slot.target.y, '✓', { fontSize: '24px', color: '#fff3c8', backgroundColor: '#647b60', padding: { x: 6, y: 2 } }).setOrigin(.5).setDepth(1600);
          this.time.delayedCall(650, () => tick.destroy());
        }
      }
      if (target?.claimedBy && !this.reacted.has(slot.id)) { this.reacted.add(slot.id); this.react(slot); }
    }
    this.animatePeeks(Date.now());
  }

  private animatePeeks(now: number) {
    const state = this.bridge.session.getSnapshot();
    for (const slot of HOUSE.slots) {
      const dad = this.dads.get(slot.id)!;
      const target = state.targets.find(t => t.slotId === slot.id);
      if (target?.claimedBy) continue; // The capture owns its sprite until it is in the sack.
      const revealed = state.opened.includes(slot.id) || state.spotted.includes(slot.id);
      const progress = revealed ? 1 : slot.mode === 'peek' ? peekProgress(state.seed, slot, now - state.startedAt) : 0;
      dad.setVisible(!!target && state.status === 'playing' && state.player.roomId === slot.roomId && progress > 0);
      if (!dad.visible) continue;
      dad.setFrame(revealed ? state.father.expressions.giggle : state.father.expressions.laugh).setAlpha(this.bridge.reducedMotion ? progress : Math.min(1, progress * 3));
      const upsideDown = slot.pose.angle === 180;
      dad.setPosition(slot.target.x, slot.target.y + (this.bridge.reducedMotion ? 0 : (1 - progress) * (upsideDown ? -14 : 14)));
      // Different silhouettes: a squash in a cushion, a long spring dad in a box.
      const stretch = slot.kind === 'boxes' && !this.bridge.reducedMotion ? 1 + Math.sin(now / 270) * .035 : 1;
      dad.setDisplaySize(slot.pose.width, slot.pose.height * stretch);
    }
  }

  private react(slot: HidingSlot) {
    const dad = this.dads.get(slot.id)!;
    this.route = []; this.pending = undefined; this.bridge.movement = { x: 0, y: 0 };
    this.capturing = { slotId: slot.id, from: { x: dad.x, y: dad.y }, startedAt: Date.now(), score: this.bridge.session.getSnapshot().player.score };
    dad.setCrop().setFrame(this.bridge.session.getSnapshot().father.expressions.giggle).setAlpha(1).setDepth(2100).setVisible(true);
    this.destination.setVisible(false);
  }

  private animateCapture(now: number) {
    const capture = this.capturing;
    if (!capture) return;
    const dad = this.dads.get(capture.slotId)!;
    const slot = HOUSE.slots.find(s => s.id === capture.slotId)!;
    const expressions = this.bridge.session.getSnapshot().father.expressions;
    const p = Math.min(1, (now - capture.startedAt) / (this.bridge.reducedMotion ? 450 : 1050));
    const hand = { x: this.hunter.x + (this.hunter.flipX ? -27 : 27), y: this.hunter.y - 53 };
    this.hunter.setFrame(p < .4 ? 4 : 5).setOrigin(.5, .9);
    this.captureFX.clear();
    if (this.bridge.reducedMotion) dad.setAlpha(1 - p).setAngle(slot.pose.angle);
    else {
      const grab = Math.min(1, p / .42), plop = Math.max(0, (p - .42) / .58);
      const ease = 1 - Math.pow(1 - grab, 3);
      dad.setPosition(Phaser.Math.Linear(capture.from.x, hand.x, ease), Phaser.Math.Linear(capture.from.y, hand.y, ease));
      dad.setAngle(slot.pose.angle * (1 - ease) + plop * 24).setFrame(p < .38 ? expressions.giggle : expressions.bonked);
      dad.setDisplaySize((slot.pose.width + 8 * Math.sin(grab * Math.PI)) * (1 - plop * .88), (slot.pose.height + 23 * Math.sin(grab * Math.PI)) * (1 - plop * .88));
      if (plop > 0) dad.setPosition(Phaser.Math.Linear(hand.x, this.sack.x, plop), Phaser.Math.Linear(hand.y, this.sack.y - this.sack.displayHeight * .75, plop) - Math.sin(plop * Math.PI) * 26);
      if (p > .4 && p < .82) {
        this.captureFX.fillStyle(0x9dd5d3, .9);
        this.captureFX.fillEllipse(dad.x - 15, dad.y + Math.sin(p * 15) * 8, 5, 9).fillEllipse(dad.x + 15, dad.y + Math.cos(p * 15) * 8, 5, 9);
      }
      if (p > .83) this.captureFX.lineStyle(3, 0xf3d589, (1 - p) * 5).strokeCircle(this.sack.x, this.sack.y - 25, 16 + (p - .83) * 100);
    }
    if (p >= 1) {
      dad.setVisible(false); this.captureFX.clear(); this.bagCount = capture.score;
      this.capturing = undefined; this.hunter.setFrame(0).setOrigin(.5, .94);
      this.bridge.bagged?.(this.bagCount);
    }
  }

  update(time: number, delta: number) {
    if (!this.hunter || !this.loaded) return;
    this.bridge.session.tick();
    const now = Date.now();
    this.animatePeeks(now);
    this.animateCapture(now); // Also settle a last capture after a tab was in the background.
    const stateBefore = this.bridge.session.getSnapshot();
    const bagSize = 30 + this.bagCount * 4;
    const wiggle = !this.bridge.reducedMotion && this.bagCount > 0 ? Math.sin(time / 160) * Math.max(0, Math.sin(time / 900)) : 0;
    this.sack.setDisplaySize(bagSize + wiggle * 2, bagSize * 1.08 - wiggle * 2).setPosition(this.hunter.x + (this.hunter.flipX ? 28 : -28), this.hunter.y - 4).setAngle(wiggle * 5);
    this.searchBar.clear();
    if (stateBefore.search) {
      this.hunter.setFrame(3).setOrigin(.5, .9);
      const slot = HOUSE.slots.find(s => s.id === stateBefore.search!.slotId)!;
      const progress = Math.min(1, (now - stateBefore.search.startedAt) / (stateBefore.search.endsAt - stateBefore.search.startedAt));
      this.searchBar.fillStyle(0x303e33, .9).fillRoundedRect(slot.prop.x + slot.prop.w / 2 - 30, slot.prop.y - 14, 60, 8, 4);
      this.searchBar.fillStyle(0xf4c86e).fillRoundedRect(slot.prop.x + slot.prop.w / 2 - 28, slot.prop.y - 12, 56 * progress, 4, 2);
    }
    if (!this.bridge.inputEnabled || this.capturing) {
      this.route = []; this.pending = undefined; this.bridge.movement = { x: 0, y: 0 }; this.destination.setVisible(false); return;
    }
    const k = this.keys;
    const keyDirection = { x: Number(k.D.isDown || k.RIGHT.isDown) - Number(k.A.isDown || k.LEFT.isDown), y: Number(k.S.isDown || k.DOWN.isDown) - Number(k.W.isDown || k.UP.isDown) };
    let direction = this.bridge.movement.x || this.bridge.movement.y ? this.bridge.movement : keyDirection;
    if (direction.x || direction.y) { this.route = []; this.pending = undefined; }
    else if (this.route.length) {
      const pos = this.bridge.session.getSnapshot().player.position;
      while (this.route.length && distance(pos, this.route[0]) < .1) this.route.shift();
      if (this.route.length) {
        const next = this.route[0], d = distance(pos, next);
        direction = { x: (next.x - pos.x) / d, y: (next.y - pos.y) / d };
        delta = Math.min(delta, d / 210 * 1000);
      } else this.perform();
    }
    if (this.capturing) return;
    this.bridge.session.move(direction, delta);
    if (Phaser.Input.Keyboard.JustDown(k.E)) this.inspectNearest();
    const state = this.bridge.session.getSnapshot(), pos = state.player.position;
    const moving = distance(pos, this.previousPosition) > .1;
    this.previousPosition = pos;
    this.hunter.setPosition(pos.x, pos.y + (moving && !this.bridge.reducedMotion ? Math.sin(time / 85) * 1.5 : 0));
    this.hunter.setFrame(state.search ? 3 : moving && !this.bridge.reducedMotion ? 1 + Math.floor(time / 160) % 2 : 0).setOrigin(.5, state.search ? .9 : .94);
    if (direction.x) this.hunter.setFlipX(direction.x < 0);
    this.destination.setVisible(this.route.length > 0 && !this.stopped);
  }
}
