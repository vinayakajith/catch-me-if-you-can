import Phaser from 'phaser';
import { HOUSE, broomPosition, roomAt, clearPath, canReach, contains, distance, findPath, isDadExposed, peekProgress, type ActionResult, type HidingSlot, type HuntSession, type Target, type Point } from '@catch-me-if-you-can/game-core';
import { DAD_POSES, bodySvg } from '../art/dad';
import { prepareCharacters } from './characters';
import { hideoutSvg, sackSvg, svgUri } from './art';
import { witchSvg, hammerHeadSvg } from '../art/witch';

export interface GameBridge {
  session: HuntSession;
  movement: Point;
  reducedMotion: boolean;
  inputEnabled: boolean;
  pixelRatio?: number;
  feedback(result: ActionResult): void;
  ready(): void;
  bagged?(count: number, restored?: boolean): void;
  bonk?(): void;
  failed(message: string): void;
  inspect?: () => void;
  navigate?: (point: Point) => void;
}

type Pending = { type: 'search'; slotId: string } | { type: 'catch'; targetId: string };

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
  private pending?: Pending;
  private searchBar!: Phaser.GameObjects.Graphics;
  private destination!: Phaser.GameObjects.Arc;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private stopped = false;
  private previousPosition: Point = HOUSE.spawn;
  private acting = false;
  private layoutId = '';
  private loaded = true;
  private sack!: Phaser.GameObjects.Image;
  private captureFX!: Phaser.GameObjects.Graphics;
  private bagCount = 0;
  private captureDad!: Phaser.GameObjects.Image;
  private hammerHead!: Phaser.GameObjects.Image;
  private hammerImpact: Point | null = null;
  private capturing?: { targetId: string; from: Point; startedAt: number; score: number; bonked: boolean };


  constructor(bridge: GameBridge) { super('House'); this.bridge = bridge; }

  preload() {
    const density = this.bridge.pixelRatio ?? 1;
    this.load.image('father-source', this.bridge.session.getSnapshot().father.atlas);
    for (let frame = 0; frame < 6; frame++) this.load.svg(`witch-${frame}`, svgUri(witchSvg(frame)), { width: 160 * density, height: 220 * density });
    this.load.svg('hammer-head', svgUri(hammerHeadSvg), { width: 240, height: 128 });
    for (const pose of DAD_POSES) this.load.svg(`body-${pose}`, svgUri(bodySvg(pose, this.bridge.session.getSnapshot().father.palette?.skin)), { width: 160 * density, height: 220 * density });
    this.load.svg('sack', svgUri(sackSvg), { width: 160 * density, height: 160 * density });
    for (const kind of new Set(HOUSE.props.map(s => s.kind))) {
      for (const open of [false, true]) {
        this.load.svg(`${kind}${open ? '-open' : ''}`, svgUri(hideoutSvg(kind, open, false, this.bridge.session.getSnapshot().father.name)), { width: 160 * density, height: 160 * density });
        this.load.svg(`${kind}-front${open ? '-open' : ''}`, svgUri(hideoutSvg(kind, open, true, this.bridge.session.getSnapshot().father.name)), { width: 160 * density, height: 160 * density });
      }
    }
    this.load.on('loaderror', () => { this.loaded = false; this.bridge.failed('The house art could not load. Please reload and try again.'); });
  }

  create() {
    if (!this.loaded) return;
    const source = this.textures.get('father-source').getSourceImage() as HTMLImageElement;
    const father = this.bridge.session.getSnapshot().father;
    this.textures.addSpriteSheet('father', source, { frameWidth: source.width / father.columns, frameHeight: source.height / father.rows });
    prepareCharacters(this, father, this.bridge.pixelRatio ?? 1);
    this.drawHouse();
    for (const item of HOUSE.props) {
      const { prop: p } = item;
      const slot = HOUSE.slots.find(s => s.id === item.id);
      const open = slot && slot.mode !== 'search';
      this.props.set(item.id, this.add.image(p.x + p.w / 2, p.y + p.h / 2, `${item.kind}${open ? '-open' : ''}`).setDisplaySize(p.w, p.h).setDepth(p.y + p.h));
      if (!slot) continue;
      this.rims.set(slot.id, this.add.image(p.x + p.w / 2, p.y + p.h / 2, `${slot.kind}-front${open ? '-open' : ''}`).setDisplaySize(p.w, p.h).setDepth(p.y + p.h + 2));
    }
    this.captureDad = this.add.image(0, 0, 'father-caught', father.expressions.laugh).setVisible(false).setDepth(2100);
    this.sack = this.add.image(HOUSE.spawn.x + 25, HOUSE.spawn.y - 6, 'sack').setOrigin(.5, 1).setDisplaySize(30, 34).setDepth(1999);
    this.hunter = this.add.image(HOUSE.spawn.x, HOUSE.spawn.y, 'witch', 0).setOrigin(.5, .94).setDisplaySize(73, 100).setDepth(2000);
    this.hammerHead = this.add.image(0, 0, 'hammer-head').setDisplaySize(62, 33).setDepth(2250).setVisible(false);
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
      if (pointer.getDistance() > 14 * (this.bridge.pixelRatio ?? 1) || this.stopped || (pointer.event.target as HTMLElement | null)?.tagName !== 'CANVAS') return;
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
        face: (id: string) => this.targetPoint(id),
        presentation: () => ({ busy: !!this.capturing, bagged: this.bagCount, capture: this.capturing, hammer: { x: this.hammerHead.x, y: this.hammerHead.y, visible: this.hammerHead.visible, impact: this.hammerImpact }, actor: { x: this.captureDad.x, y: this.captureDad.y, visible: this.captureDad.visible } }),
        screen: (p: Point) => ({ x: (p.x - this.cameras.main.worldView.x) * this.cameras.main.zoom / (this.bridge.pixelRatio ?? 1), y: (p.y - this.cameras.main.worldView.y) * this.cameras.main.zoom / (this.bridge.pixelRatio ?? 1) }),
        slots: HOUSE.slots,
      };
    }
  }

  private resize() {
    const density = this.bridge.pixelRatio ?? 1, width = this.scale.width / density, height = this.scale.height / density;
    // Keep furniture and faces large on phones; camera follows rather than shrinking the entire house.
    this.cameras.main.setZoom((width < 600 ? Math.max(.78, width / 490) : Math.min(1.3, Math.max(.95, height / 530))) * density);
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
        this.add.text(room.x + 22, room.y + room.h - 26, room.name.toUpperCase(), { resolution: this.bridge.pixelRatio ?? 1, fontFamily: 'Georgia, serif', fontSize: '14px', color: '#645e48', letterSpacing: 2 }).setAlpha(.6).setDepth(3);
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
    this.add.text(748, 157, '← LIVING\n\nKITCHEN →', { resolution: this.bridge.pixelRatio ?? 1, fontFamily: 'Arial', fontSize: '13px', color: '#6f765d', align: 'center', lineSpacing: 4 }).setOrigin(.5).setDepth(4);
    for (const [x, label] of [[270, '↓ BEDROOM'], [760, '↓ BATHROOM'], [1240, '↓ STOREROOM']] as const) {
      this.add.text(x, 585, label, { resolution: this.bridge.pixelRatio ?? 1, fontFamily: 'Arial', fontSize: '12px', color: '#817554', letterSpacing: 1 }).setOrigin(.5).setDepth(4);
    }
    const statue = HOUSE.slots.find(s => s.kind === 'statue')!, p = statue.prop;
    const spotlight = this.add.graphics().setDepth(4);
    spotlight.fillStyle(0xfff2b0, .22).fillTriangle(p.x + p.w / 2, p.y - 42, p.x - 24, p.y + p.h + 4, p.x + p.w + 24, p.y + p.h + 4);
    spotlight.fillStyle(0xfff6ba, .42).fillEllipse(p.x + p.w / 2, p.y + p.h - 1, p.w + 36, 38);
    spotlight.fillStyle(0x5d654e).fillRoundedRect(p.x + p.w / 2 - 13, p.y - 50, 26, 15, 4);
    const slippers = this.add.graphics().setDepth(3);
    slippers.fillStyle(0x777f61).fillRoundedRect(582, 550, 13, 25, 6).fillRoundedRect(600, 560, 13, 25, 6);
    slippers.lineStyle(2, 0xcebd88).lineBetween(584, 558, 592, 565).lineBetween(603, 568, 611, 575);
  }

  private targetPoint(id: string): Point {
    const state = this.bridge.session.getSnapshot();
    const target = state.targets.find(t => t.id === id || t.kind === 'hidden' && t.slotId === id);
    if (!target) return HOUSE.spawn;
    return target.kind === 'hidden' ? HOUSE.slots.find(s => s.id === target.slotId)!.target : { x: this.dads.get(target.id)!.x, y: this.dads.get(target.id)!.y - 12 };
  }

  private async tap(point: Point) {
    if (!this.bridge.inputEnabled || this.capturing || this.acting) return;
    const state = this.bridge.session.getSnapshot();
    if (state.status !== 'playing') return;
    for (const target of state.targets.filter(t => !t.claimedBy)) {
      const slot = target.kind === 'hidden' ? HOUSE.slots.find(s => s.id === target.slotId)! : null;
      const ground = target.kind === 'broom' ? broomPosition(target, this.bridge.session.time() - state.startedAt) : slot!.anchor;
      if (slot ? slot.behavior !== 'statue' && slot.roomId !== state.player.roomId || !isDadExposed(state, slot, this.bridge.session.time()) : roomAt(ground) !== state.player.roomId) continue;
      const centre = this.targetPoint(target.id), size = Math.max(64, 48 * (this.bridge.pixelRatio ?? 1) / this.cameras.main.zoom);
      if (contains({ x: centre.x - size / 2, y: centre.y - size / 2, w: size, h: size }, point)) {
        if (slot?.behavior === 'statue') { this.walkTo(slot.anchor, { type: 'catch', targetId: target.id }); return; }
        this.acting = true;
        const result = await this.bridge.session.spot(target.id);
        this.acting = false;
        if (!this.scene.isActive()) return;
        if (result.ok) this.walkTo(ground, { type: 'catch', targetId: target.id });
        else this.bridge.feedback(result);
        return;
      }
    }
    const prop = HOUSE.slots.find(s => s.roomId === state.player.roomId && contains(s.prop, point, 5));
    if (prop) this.walkTo(prop.anchor, { type: 'search', slotId: prop.id });
    else this.walkTo(point);
  }

  private canPerform(action: Pending) {
    const state = this.bridge.session.getSnapshot(), player = state.player.position;
    if (action.type === 'search') return canReach(player, HOUSE.slots.find(s => s.id === action.slotId)!);
    const target = state.targets.find(t => t.id === action.targetId)!;
    if (target.kind === 'hidden') { const slot = HOUSE.slots.find(s => s.id === target.slotId)!; return canReach(player, slot) && distance(player, slot.anchor) < 22; }
    const position = broomPosition(target, this.bridge.session.time() - state.startedAt);
    return state.player.roomId === roomAt(position) && distance(position, player) < 88 && clearPath(player, position, 4);
  }

  private walkTo(point: Point, pending?: Pending) {
    const state = this.bridge.session.getSnapshot();
    if (state.status !== 'playing' || this.capturing) return;
    this.pending = pending;
    if (pending && this.canPerform(pending)) { this.route = []; this.perform(); return; }
    this.route = findPath(state.player.position, point);
    if (!this.route.length) { this.pending = undefined; this.bridge.feedback({ ok: false, kind: 'error', message: 'Try tapping a clear bit of floor.' }); return; }
    const end = this.route.at(-1)!;
    this.destination.setPosition(end.x, end.y).setVisible(true);
  }

  private async perform() {
    const action = this.pending; this.pending = undefined;
    if (!action) return;
    const point = action.type === 'search' ? HOUSE.slots.find(s => s.id === action.slotId)!.target : this.targetPoint(action.targetId);
    this.hunter.setFlipX(point.x < this.bridge.session.getSnapshot().player.position.x);
    this.acting = true;
    const result = await (action.type === 'search' ? this.bridge.session.search(action.slotId) : this.bridge.session.catch(action.targetId));
    this.acting = false;
    if (this.scene.isActive()) this.bridge.feedback(result);
  }

  private async inspectNearest() {
    if (!this.bridge.inputEnabled || this.capturing || this.acting) return;
    const state = this.bridge.session.getSnapshot();
    const near = HOUSE.slots.filter(s => canReach(state.player.position, s) && !state.opened.includes(s.id)).sort((a, b) => distance(a.anchor, state.player.position) - distance(b.anchor, state.player.position))[0];
    if (near) { this.hunter.setFlipX(near.target.x < state.player.position.x); this.acting = true; const result = await this.bridge.session.search(near.id); this.acting = false; if (this.scene.isActive()) this.bridge.feedback(result); }
    else this.bridge.feedback({ ok: false, kind: 'error', message: 'Tap some furniture to walk over and check it.' });
  }

  private sync() {
    const state = this.bridge.session.getSnapshot();
    if (this.layoutId !== state.id) {
      this.layoutId = state.id;
      for (const dad of this.dads.values()) dad.destroy(); this.dads.clear(); this.reacted.clear(); this.opened.clear();
      this.bagCount = state.player.score; this.bridge.bagged?.(this.bagCount, true);
      for (const target of state.targets) {
        const slot = target.kind === 'hidden' ? HOUSE.slots.find(s => s.id === target.slotId)! : null;
        const pose = slot?.behavior === 'statue' ? 'liberty' : slot?.behavior === 'feet' ? 'feet' : slot?.behavior === 'cramped' ? 'cramped' : target.kind === 'broom' ? 'broom' : 'stand';
        const texture = slot?.behavior === 'portrait' ? 'father' : slot?.behavior === 'spin' ? `spin-${slot.kind}` : `father-${pose}`;
        const dad = this.add.image(slot?.target.x ?? HOUSE.spawn.x, slot?.target.y ?? HOUSE.spawn.y, texture, 0).setVisible(false).setDepth(slot?.behavior === 'statue' ? 1801 : slot ? slot.prop.y + slot.prop.h + 1 : 1750);
        this.dads.set(target.id, dad); if (target.claimedBy) this.reacted.add(target.id);
      }
    }
    this.stopped = state.status !== 'playing';
    this.cameras.main.setFollowOffset(state.player.roomId === 'hall' && state.player.score === 0 ? 65 : 0, 35);
    this.cameras.main.setLerp(this.bridge.reducedMotion ? 1 : .12, this.bridge.reducedMotion ? 1 : .12);
    for (const [id, fog] of this.fog) fog.setVisible(id !== state.player.roomId);
    for (const slot of HOUSE.slots) {
      const target = state.targets.find(t => t.kind === 'hidden' && t.slotId === slot.id);
      if (state.opened.includes(slot.id) && !this.opened.has(slot.id)) {
        this.opened.add(slot.id);
        this.props.get(slot.id)!.setTexture(`${slot.kind}-open`);
        this.rims.get(slot.id)!.setTexture(`${slot.kind}-front-open`);
        if (!target) {
          const tick = this.add.text(slot.target.x, slot.target.y, '✓', { resolution: this.bridge.pixelRatio ?? 1, fontSize: '24px', color: '#fff3c8', backgroundColor: '#647b60', padding: { x: 6, y: 2 } }).setOrigin(.5).setDepth(1600);
          this.time.delayedCall(650, () => tick.destroy());
        }
      }
    }
    for (const target of state.targets) if (target.claimedBy && !this.reacted.has(target.id)) { this.reacted.add(target.id); this.react(target); }
    this.animateDads(this.bridge.session.time());
  }

  private animateDads(now: number) {
    const state = this.bridge.session.getSnapshot();
    for (const target of state.targets) {
      const dad = this.dads.get(target.id)!;
      if (target.claimedBy) { dad.setVisible(false); continue; }
      const laughing = state.father.expressions[this.bridge.reducedMotion || Math.floor(now / 240) % 2 ? 'laugh' : 'giggle'];
      if (target.kind === 'broom') {
        const position = broomPosition(target, now - state.startedAt), next = broomPosition(target, now - state.startedAt + 80);
        dad.setPosition(position.x, position.y - 42 + (this.bridge.reducedMotion ? 0 : Math.sin(now / 260) * 3)).setDisplaySize(84, 116).setFrame(laughing);
        if (next.x !== position.x) dad.setFlipX(next.x < position.x);
        dad.setVisible(state.status === 'playing' && roomAt(position) === state.player.roomId);
        continue;
      }
      const slot = HOUSE.slots.find(s => s.id === target.slotId)!;
      const revealed = state.opened.includes(slot.id) || state.spotted.includes(target.id);
      const permanent = slot.mode === 'visible' || slot.behavior === 'spin';
      const progress = revealed || permanent ? 1 : slot.mode === 'peek' ? peekProgress(state.seed, slot, now - state.startedAt) : 0;
      dad.setVisible(state.status === 'playing' && (state.player.roomId === slot.roomId || slot.behavior === 'statue') && progress > 0);
      if (!dad.visible) continue;
      const serious = slot.behavior === 'portrait' || slot.behavior === 'statue';
      if (slot.behavior === 'spin') {
        const frame = revealed || this.bridge.reducedMotion ? 0 : Math.floor((now - state.startedAt) / (slot.kind === 'washer' ? 70 : 100)) % 32;
        dad.setFrame(frame).setPosition(slot.prop.x + slot.prop.w / 2, slot.prop.y + slot.prop.h / 2).setDisplaySize(slot.prop.w, slot.prop.h).setAngle(0);
        continue;
      }
      dad.setFrame(serious ? state.father.expressions.serious : laughing).setAlpha(this.bridge.reducedMotion ? progress : Math.min(1, progress * 3));
      const wiggle = serious || this.bridge.reducedMotion ? 0 : Math.sin(now / 115 + slot.target.x) * (slot.behavior === 'feet' ? 2 : .8);
      dad.setPosition(slot.target.x + (slot.behavior === 'feet' ? wiggle : 0), slot.target.y + (1 - progress) * (slot.pose.angle === 180 ? -14 : 14) + (slot.behavior === 'feet' ? 0 : wiggle));
      dad.setAngle(slot.pose.angle + (slot.behavior === 'cramped' ? wiggle * 2 : 0)).setDisplaySize(slot.pose.width, slot.pose.height);
    }
  }

  private react(target: Target) {
    this.route = []; this.pending = undefined; this.bridge.movement = { x: 0, y: 0 };
    const from = this.targetPoint(target.id);
    this.capturing = { targetId: target.id, from: { ...from }, startedAt: this.bridge.session.time(), score: this.bridge.session.getSnapshot().player.score, bonked: false };
    this.captureDad.setPosition(from.x, from.y).setFrame(this.bridge.session.getSnapshot().father.expressions.laugh).setAlpha(1).setVisible(true).setAngle(0);
    this.destination.setVisible(false);
  }

  private animateCapture(now: number) {
    const capture = this.capturing;
    if (!capture) return;
    const dad = this.captureDad, expressions = this.bridge.session.getSnapshot().father.expressions;
    const p = Math.min(1, (now - capture.startedAt) / 1300), side = this.hunter.flipX ? -1 : 1;
    const floor = { x: this.hunter.x + side * 57, y: this.hunter.y - 49 }, hand = { x: this.hunter.x + side * 18, y: this.hunter.y - 43 };
    const extract = Math.min(1, p / .26), hop = Math.max(0, (p - .57) / .43);
    const ease = 1 - (1 - extract) ** 3;
    const bag = { x: this.sack.x, y: this.sack.y - this.sack.displayHeight * .76 };
    dad.setFlipX(side > 0).setPosition(Phaser.Math.Linear(capture.from.x, floor.x, ease), Phaser.Math.Linear(capture.from.y, floor.y, ease));
    dad.setFrame(p < .45 ? expressions.laugh : p < .65 ? expressions.bonked : expressions.dizzy);
    dad.setDisplaySize(70 * (1 - hop * .92), 96 * (1 - hop * .92));
    this.hunter.setFrame(p < .6 ? 4 : 5).setOrigin(.5, .94);
    this.captureFX.clear();
    this.hammerHead.setVisible(false);
    if (hop > 0) {
      if (this.bridge.reducedMotion) dad.setAlpha(1 - hop);
      else dad.setPosition(Phaser.Math.Linear(floor.x, bag.x, hop), Phaser.Math.Linear(floor.y, bag.y, hop) - Math.sin(hop * Math.PI) * 50).setAngle(hop * side * 42);
    }
    if (p >= .22 && p < .62) {
      const impact = { x: floor.x, y: floor.y - 39 }, swing = Math.max(0, Math.min(1, (p - .28) / .17));
      this.hammerImpact = impact;
      const tip = this.bridge.reducedMotion ? { x: impact.x, y: impact.y - 15 } : { x: Phaser.Math.Linear(hand.x - side * 28, impact.x, swing), y: Phaser.Math.Linear(hand.y - 80, impact.y - 15, swing) - Math.sin(swing * Math.PI) * 14 };
      this.captureFX.lineStyle(10, 0x65432a).lineBetween(hand.x, hand.y, tip.x, tip.y);
      this.captureFX.lineStyle(5, 0xd4a367).lineBetween(hand.x, hand.y - 1, tip.x, tip.y - 1);
      this.hammerHead.setVisible(true).setPosition(tip.x, tip.y).setAngle(this.bridge.reducedMotion ? 0 : -side * 35 * (1 - swing));
      if (p >= .45 && p < .58) {
        for (let i = 0; i < 7; i++) { const angle = i * Math.PI * 2 / 7; this.captureFX.lineStyle(3, 0xffdf86).lineBetween(impact.x + Math.cos(angle) * 7, impact.y + Math.sin(angle) * 7, impact.x + Math.cos(angle) * 16, impact.y + Math.sin(angle) * 16); }
      }
    }
    if (p >= .45 && !capture.bonked) { capture.bonked = true; this.bridge.bonk?.(); }
    if (p > .57) this.captureFX.fillStyle(0x6c5237).fillEllipse(bag.x, bag.y, 21 + Math.sin(hop * Math.PI) * 8, 8);
    if (p > .9 && !this.bridge.reducedMotion) this.captureFX.lineStyle(3, 0xf3d589, (1 - p) * 7).strokeCircle(bag.x, bag.y, 15 + (p - .9) * 120);
    if (p >= 1) {
      dad.setVisible(false); this.hammerHead.setVisible(false); this.captureFX.clear(); this.bagCount = capture.score;
      this.capturing = undefined; this.hunter.setFrame(0).setOrigin(.5, .94);
      this.bridge.bagged?.(this.bagCount);
    }
  }

  update(time: number, delta: number) {
    if (!this.hunter || !this.loaded) return;
    this.bridge.session.tick();
    const now = this.bridge.session.time();
    this.animateDads(now);
    this.animateCapture(now); // Also settle a last capture after a tab was in the background.
    const stateBefore = this.bridge.session.getSnapshot();
    const bagSize = 30 + Math.min(10, this.bagCount) * 3;
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
    if (!this.bridge.inputEnabled || this.capturing || this.acting) {
      this.route = []; this.pending = undefined; this.bridge.movement = { x: 0, y: 0 }; this.destination.setVisible(false); return;
    }
    const k = this.keys;
    const keyDirection = { x: Number(k.D.isDown || k.RIGHT.isDown) - Number(k.A.isDown || k.LEFT.isDown), y: Number(k.S.isDown || k.DOWN.isDown) - Number(k.W.isDown || k.UP.isDown) };
    let direction = this.bridge.movement.x || this.bridge.movement.y ? this.bridge.movement : keyDirection;
    if (direction.x || direction.y) { this.route = []; this.pending = undefined; }
    else if (this.pending?.type === 'catch' && this.canPerform(this.pending)) { this.route = []; this.perform(); }
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
