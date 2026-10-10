export type RoomId = 'living' | 'kitchen' | 'bedroom' | 'bathroom' | 'storeroom' | 'hall';
export interface Point { x: number; y: number }
export interface Rect extends Point { w: number; h: number }
export type PropKind = 'sofa' | 'tv' | 'cabinet' | 'plant' | 'curtain' | 'papers' | 'fridge' | 'stove' | 'sink' | 'pots' | 'rice' | 'table' | 'bed' | 'wardrobe' | 'mirror' | 'laundry' | 'desk' | 'toilet' | 'shower' | 'towels' | 'bucket' | 'boxes' | 'shelf' | 'trunk' | 'suitcase' | 'fan' | 'vase' | 'cushion' | 'portrait' | 'jar' | 'cooker' | 'microwave' | 'statue' | 'toaster' | 'fruit' | 'pillow' | 'drawer' | 'slipper' | 'washer' | 'toiletries' | 'umbrella' | 'carpet';
export interface RoomDefinition extends Rect { id: RoomId; name: string; subtitle: string; color: string; floor: string }
export interface HouseProp { id: string; roomId: RoomId; kind: PropKind; prop: Rect }
export interface HidingSlot extends HouseProp {
  name: string; mode: 'peek' | 'search' | 'visible'; behavior: 'peek' | 'container' | 'portrait' | 'spin' | 'feet' | 'cramped' | 'statue'; anchor: Point; target: Point; hit: Rect;
  pose: { angle: number; width: number; height: number; crop: number };
  reveal: 'lid' | 'fabric' | 'rim' | 'frame';
  peek: { visibleMs: number; hiddenMs: number };
}
export interface HouseDefinition { id: string; width: number; height: number; rooms: RoomDefinition[]; passages: Rect[]; props: HouseProp[]; slots: HidingSlot[]; spawn: Point }
export type Expression = 'serious' | 'grin' | 'laugh' | 'giggle' | 'bonked' | 'dizzy';
export interface CharacterPack {
  id: string; name: string; atlas: string; columns: number; rows: number; expressions: Record<Expression, number>;
  version?: 1; palette?: { skin: string }; expiresAt?: number;
}
export interface TargetBase { id: string; claimedBy: string | null; claimedAt: number | null }
export interface HiddenTarget extends TargetBase { kind: 'hidden'; slotId: string }
export interface BroomLeg { from: Point; to: Point; departAt: number; arriveAt: number }
export interface BroomTarget extends TargetBase { kind: 'broom'; route: BroomLeg[]; lockedPosition: Point | null }
export type Target = HiddenTarget | BroomTarget;
export interface CaseBeat { id: 'experiment' | 'entrance' | 'chaos' | 'escape' | 'dispatch'; kicker: string; title: string; text: string }
export interface CaseStory { id: string; title: string; story: string; stamp: string; beats: CaseBeat[] }
export interface Activity { id: number; text: string; kind: 'catch' | 'search' | 'hint' | 'welcome'; at: number; slotId?: string }
export interface HuntSnapshot {
  id: string; seed: string; father: CharacterPack; case: CaseStory; status: 'ready' | 'playing' | 'finished' | 'expired';
  finishReason: 'complete' | 'timeout' | 'expired' | null;
  startedAt: number; endsAt: number; expiresAt: number; now: number; lastCatchAt: number;
  player: { id: string; name: string; position: Point; roomId: RoomId; score: number };
  targets: Target[]; opened: string[]; spotted: string[]; search: { slotId: string; startedAt: number; endsAt: number } | null;
  activity: Activity[];
}
export interface ActionResult { ok: boolean; message: string; kind: 'catch' | 'search' | 'spot' | 'hint' | 'error'; slotId?: string; targetId?: string }
export interface HuntSession {
  start(): void;
  getSnapshot(): HuntSnapshot;
  subscribe(listener: () => void): () => void;
  move(direction: Point, deltaMs: number): void;
  search(slotId: string): ActionResult;
  spot(targetId: string): ActionResult;
  catch(targetId: string): ActionResult;
  hint(): ActionResult;
  tick(): void;
  dispose(): void;
}
