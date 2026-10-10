import type { CharacterPack, HidingSlot, HouseDefinition, HouseProp, Point, PropKind, Rect, RoomDefinition, RoomId } from './types.ts';

const rooms: RoomDefinition[] = [
  { id: 'living', name: 'Living room', subtitle: 'The remote is also missing.', x: 50, y: 80, w: 600, h: 410, color: '#c68c64', floor: '#e7c7a4' },
  { id: 'kitchen', name: 'Kitchen', subtitle: 'Something smells like a cover-up.', x: 850, y: 80, w: 620, h: 410, color: '#799888', floor: '#cdd5b8' },
  { id: 'bedroom', name: 'Bedroom', subtitle: 'Definitely just taking a nap.', x: 50, y: 650, w: 480, h: 400, color: '#ad8998', floor: '#e5ccd0' },
  { id: 'bathroom', name: 'Bathroom', subtitle: 'Please knock. Then investigate.', x: 570, y: 650, w: 400, h: 400, color: '#6f999b', floor: '#c0d8d0' },
  { id: 'storeroom', name: 'Storeroom', subtitle: 'Kept here because it might be useful.', x: 1010, y: 650, w: 460, h: 400, color: '#ae986b', floor: '#ded1aa' },
  { id: 'hall', name: 'The hallway', subtitle: 'Five rooms. Six very flexible suspects.', x: 50, y: 510, w: 1420, h: 120, color: '#a49276', floor: '#e5d9bd' },
];

type SlotInput = [PropKind, 'peek' | 'search', number, number, number, number, string, number, number, number, number, number, number, HidingSlot['reveal']];
// Local prop centres, size, label, face offset (fractions), angle, face dimensions, crop, cover.
const content: Record<Exclude<RoomId, 'hall'>, SlotInput[]> = {
  living: [
    ['vase', 'search', 100, 112, 105, 140, 'giant flower vase', .5, .43, 0, 67, 75, .76, 'rim'],
    ['cushion', 'search', 310, 110, 155, 85, 'zipped sofa cushion', .51, .52, 0, 88, 42, .8, 'fabric'],
    ['curtain', 'peek', 500, 290, 100, 118, 'rolled curtain', .52, .69, 180, 57, 68, .75, 'fabric'],
    ['portrait', 'peek', 288, 292, 98, 112, 'family portrait', .5, .49, 0, 59, 66, .85, 'frame'],
  ],
  kitchen: [
    ['jar', 'search', 95, 108, 96, 114, 'pickle jar', .5, .52, 180, 59, 72, .9, 'rim'],
    ['cooker', 'search', 305, 105, 128, 108, 'pressure cooker', .5, .43, 0, 68, 64, .78, 'lid'],
    ['toaster', 'peek', 500, 300, 108, 87, 'toaster', .5, .34, 0, 54, 61, .75, 'rim'],
    ['fruit', 'peek', 100, 305, 115, 82, 'fruit bowl', .53, .43, -16, 55, 59, .8, 'rim'],
  ],
  bedroom: [
    ['pillow', 'search', 112, 112, 143, 112, 'stuffed pillowcase', .55, .44, 90, 76, 58, .84, 'fabric'],
    ['drawer', 'search', 352, 99, 102, 106, 'bedside drawer', .5, .58, 0, 64, 74, .8, 'rim'],
    ['slipper', 'peek', 352, 288, 97, 112, 'enormous slipper', .49, .4, -12, 53, 60, .65, 'fabric'],
    ['laundry', 'peek', 110, 290, 108, 98, 'laundry pile', .52, .38, 0, 64, 70, .8, 'fabric'],
  ],
  bathroom: [
    ['toilet', 'search', 95, 110, 94, 111, 'commode bowl', .5, .52, 0, 64, 72, .72, 'lid'],
    ['washer', 'search', 292, 110, 104, 121, 'washing machine', .5, .59, 38, 61, 67, .85, 'frame'],
    ['bucket', 'peek', 95, 299, 87, 98, 'bucket', .5, .33, 0, 55, 64, .8, 'rim'],
    ['toiletries', 'peek', 286, 298, 102, 97, 'toiletries shelf', .5, .77, 180, 50, 61, .8, 'rim'],
  ],
  storeroom: [
    ['suitcase', 'search', 105, 110, 130, 112, 'suitcase', .5, .56, 90, 74, 57, .9, 'rim'],
    ['boxes', 'search', 326, 110, 121, 110, 'spring-loaded box', .5, .36, 0, 62, 82, .85, 'lid'],
    ['umbrella', 'peek', 105, 290, 98, 116, 'umbrella rack', .53, .57, 180, 51, 64, .8, 'rim'],
    ['carpet', 'peek', 326, 295, 136, 84, 'rolled carpet', .76, .51, 90, 53, 58, .78, 'fabric'],
  ],
};
const decoration: Record<Exclude<RoomId, 'hall'>, [PropKind, number, number, number, number][]> = {
  living: [['tv', 501, 99, 107, 86], ['plant', 75, 293, 64, 82]],
  kitchen: [['stove', 500, 100, 109, 90], ['table', 307, 310, 119, 75]],
  bedroom: [['wardrobe', 235, 90, 63, 80], ['mirror', 235, 282, 56, 80]],
  bathroom: [['shower', 196, 110, 61, 85], ['towels', 192, 299, 50, 54]],
  storeroom: [['papers', 217, 100, 55, 48], ['fan', 219, 290, 51, 75]],
};
const slots: HidingSlot[] = [];
const props: HouseProp[] = [];
for (const room of rooms.filter(r => r.id !== 'hall')) {
  const roomId = room.id as Exclude<RoomId, 'hall'>;
  for (const [kind, mode, x, y, w, h, name, tx, ty, angle, width, height, crop, reveal] of content[roomId]) {
    const prop = { x: room.x + x - w / 2, y: room.y + y - h / 2, w, h };
    const target = { x: prop.x + w * tx, y: prop.y + h * ty };
    const slot: HidingSlot = { id: `${room.id}-${kind}`, roomId, kind, name, mode, prop,
      // Stand beside the face, including faces at the far end of a long prop.
      anchor: { x: target.x + 56, y: prop.y + h + 32 }, target,
      hit: { x: target.x - 28, y: target.y - 28, w: 56, h: 56 },
      pose: { angle, width, height, crop }, reveal,
      peek: { visibleMs: 2100, hiddenMs: 3200 + slots.length % 5 * 150 } };
    slots.push(slot); props.push(slot);
  }
  for (const [kind, x, y, w, h] of decoration[roomId]) props.push({ id: `${roomId}-decor-${kind}`, roomId, kind, prop: { x: room.x + x - w / 2, y: room.y + y - h / 2, w, h } });
}

export const HOUSE: HouseDefinition = {
  id: 'balaji-house-v2', width: 1520, height: 1110, rooms, slots, props,
  passages: [
    { x: 680, y: 80, w: 140, h: 550 },
    { x: 650, y: 260, w: 30, h: 110 }, { x: 820, y: 260, w: 30, h: 110 },
    { x: 220, y: 630, w: 100, h: 20 }, { x: 710, y: 630, w: 100, h: 20 }, { x: 1190, y: 630, w: 100, h: 20 },
  ],
  spawn: { x: 740, y: 550 },
};

export const BALAJI: CharacterPack = { id: 'sample-balaji', name: 'Balaji', atlas: '/assets/balaji-heads.png', columns: 3, rows: 2,
  expressions: { serious: 0, grin: 1, laugh: 2, giggle: 3, bonked: 4, dizzy: 5 } };

export const contains = (r: Rect, p: Point, margin = 0) => p.x >= r.x - margin && p.x <= r.x + r.w + margin && p.y >= r.y - margin && p.y <= r.y + r.h + margin;
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const roomAt = (p: Point): RoomId => HOUSE.rooms.find(r => contains(r, p))?.id ?? 'hall';

export function isWalkable(p: Point, radius = 12): boolean {
  const probes = [p, { x: p.x - radius, y: p.y }, { x: p.x + radius, y: p.y }, { x: p.x, y: p.y - radius }, { x: p.x, y: p.y + radius }];
  return probes.every(q => [...HOUSE.rooms, ...HOUSE.passages].some(r => contains(r, q)))
    && !HOUSE.props.some(s => contains(s.prop, p, radius - 2));
}

export function canReach(position: Point, slot: HidingSlot): boolean {
  if (roomAt(position) !== slot.roomId || distance(position, slot.anchor) > 106) return false;
  // Validate the path to the accessible side of furniture, not through its collider.
  for (let t = 0; t <= 1; t += .1) {
    if (!isWalkable({ x: position.x + (slot.anchor.x - position.x) * t, y: position.y + (slot.anchor.y - position.y) * t }, 4)) return false;
  }
  return true;
}
