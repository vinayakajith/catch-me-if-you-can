export type RoomId = 'living' | 'kitchen' | 'bedroom' | 'bathroom' | 'storeroom' | 'hall';
export interface Point { x: number; y: number }
export interface Rect extends Point { w: number; h: number }
export type PropKind = 'sofa' | 'tv' | 'cabinet' | 'plant' | 'curtain' | 'papers' | 'fridge' | 'stove' | 'sink' | 'pots' | 'rice' | 'table' | 'bed' | 'wardrobe' | 'mirror' | 'laundry' | 'desk' | 'toilet' | 'shower' | 'towels' | 'bucket' | 'boxes' | 'shelf' | 'trunk' | 'suitcase' | 'fan';
export interface RoomDefinition extends Rect { id: RoomId; name: string; subtitle: string; color: string; floor: string }
export interface HidingSlot {
  id: string; roomId: RoomId; name: string; kind: PropKind; mode: 'peek' | 'search';
  prop: Rect; anchor: Point; target: Point; hit: Rect; clue: string; reaction: string; empty: string;
}
export interface HouseDefinition { id: string; width: number; height: number; rooms: RoomDefinition[]; passages: Rect[]; slots: HidingSlot[]; spawn: Point }
export type Expression = 'normal' | 'hiding' | 'surprised' | 'caught' | 'crying' | 'defeated';
export interface CharacterPack { id: string; name: string; atlas: string; columns: number; rows: number; expressions: Record<Expression, number> }
export interface Target { id: string; slotId: string; claimedBy: string | null; claimedAt: number | null }
export interface Activity { id: number; text: string; kind: 'catch' | 'search' | 'hint' | 'welcome'; at: number; slotId?: string }
export interface HuntSnapshot {
  id: string; seed: string; status: 'playing' | 'finished' | 'expired';
  finishReason: 'complete' | 'timeout' | 'expired' | null;
  startedAt: number; endsAt: number; expiresAt: number; now: number; lastCatchAt: number;
  player: { id: string; name: string; position: Point; roomId: RoomId; score: number };
  targets: Target[]; opened: string[]; search: { slotId: string; startedAt: number; endsAt: number } | null;
  activity: Activity[];
}
export interface ActionResult { ok: boolean; message: string; kind: 'catch' | 'search' | 'hint' | 'error'; slotId?: string }
export interface HuntSession {
  getSnapshot(): HuntSnapshot;
  subscribe(listener: () => void): () => void;
  move(direction: Point, deltaMs: number): void;
  search(slotId: string): ActionResult;
  catch(slotId: string): ActionResult;
  hint(): ActionResult;
  tick(): void;
  dispose(): void;
}
