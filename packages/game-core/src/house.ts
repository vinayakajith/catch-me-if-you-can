import type { CharacterPack, HidingSlot, HouseDefinition, Point, PropKind, Rect, RoomDefinition, RoomId } from './types.ts';

const rooms: RoomDefinition[] = [
  { id: 'living', name: 'Living room', subtitle: 'The remote is also missing.', x: 50, y: 80, w: 600, h: 410, color: '#c68c64', floor: '#e7c7a4' },
  { id: 'kitchen', name: 'Kitchen', subtitle: 'Something smells like a cover-up.', x: 850, y: 80, w: 620, h: 410, color: '#799888', floor: '#cdd5b8' },
  { id: 'bedroom', name: 'Bedroom', subtitle: 'Definitely just taking a nap.', x: 50, y: 650, w: 480, h: 400, color: '#ad8998', floor: '#e5ccd0' },
  { id: 'bathroom', name: 'Bathroom', subtitle: 'Please knock. Then investigate.', x: 570, y: 650, w: 400, h: 400, color: '#6f999b', floor: '#c0d8d0' },
  { id: 'storeroom', name: 'Storeroom', subtitle: 'Kept here because it might be useful.', x: 1010, y: 650, w: 460, h: 400, color: '#ae986b', floor: '#ded1aa' },
  { id: 'hall', name: 'The hallway', subtitle: 'Five rooms. Twelve questionable alibis.', x: 50, y: 510, w: 1420, h: 120, color: '#a49276', floor: '#e5d9bd' },
];

type SlotInput = [string, PropKind, 'peek' | 'search', number, number, number, number, string, string, string];
const content: Record<Exclude<RoomId, 'hall'>, SlotInput[]> = {
  living: [
    ['sofa', 'sofa', 'peek', 240, 100, 175, 85, 'A very familiar tuft of hair.', 'I was looking for the remote!', 'Three coins and a suspicious peanut.'],
    ['tv', 'tv', 'peek', 500, 100, 100, 72, 'The TV has grown a moustache.', 'The match has not even started!', 'Breaking news: still no dad.'],
    ['plant', 'plant', 'peek', 74, 295, 65, 68, 'One leaf looks unusually judgemental.', 'I am doing photosynthesis.', 'A plant. Somehow less dramatic.'],
    ['curtain', 'curtain', 'peek', 506, 292, 93, 93, 'Those curtains might need a shave.', 'I was checking the neighbours.', 'Just the neighbours checking you.'],
    ['cabinet', 'cabinet', 'search', 72, 100, 83, 94, 'The cabinet is breathing. Probably.', 'Tell your mother nothing.', 'The good plates. For guests only.'],
    ['papers', 'papers', 'search', 288, 305, 107, 51, 'A newspaper dated tomorrow?', 'I am still reading that!', 'Nine newspapers. Zero useful news.'],
  ],
  kitchen: [
    ['fridge', 'fridge', 'search', 87, 100, 92, 108, 'A tiny cough from the vegetable tray.', 'I am keeping my cool.', 'Ice cream box. Frozen peas inside.'],
    ['rice', 'rice', 'search', 497, 303, 88, 78, 'This rice sack seems very opinionated.', 'Premium basmati, beta.', 'Enough rice for unexpected guests.'],
    ['stove', 'stove', 'peek', 290, 95, 123, 79, 'Something is simmering suspiciously.', 'Too many cooks. Only one dad.', 'The gas is off. Dad would approve.'],
    ['sink', 'sink', 'peek', 500, 99, 110, 76, 'A moustache that refuses to wash off.', 'I was about to do the dishes!', 'The dishes are still waiting.'],
    ['pots', 'pots', 'peek', 94, 310, 96, 63, 'A pressure cooker with eyebrows.', 'Three whistles. Then let me out.', 'A lid. For a completely different pot.'],
    ['table', 'table', 'peek', 298, 308, 125, 67, 'Tea for two. One is missing.', 'This is my tea break.', 'Tea has gone cold. A family emergency.'],
  ],
  bedroom: [
    ['bed', 'bed', 'peek', 130, 108, 164, 122, 'That pillow is wearing glasses.', 'I was resting my eyes!', 'A blanket rolled with suspicious care.'],
    ['wardrobe', 'wardrobe', 'search', 356, 91, 107, 110, 'A shirt is quietly asking for tea.', 'This is my formal hiding place.', 'Wedding clothes from 1998. Still fit, apparently.'],
    ['laundry', 'laundry', 'search', 354, 287, 86, 64, 'Freshly washed. Mildly suspicious.', 'Do not put me on spin cycle.', 'One sock. As tradition demands.'],
    ['mirror', 'mirror', 'peek', 280, 186, 67, 74, 'A reflection with its own plans.', 'Must be your imagination.', 'Looking very detective today.'],
    ['desk', 'desk', 'peek', 117, 294, 125, 65, 'A head behind the unpaid bills.', 'EMI found me first.', 'Receipts. Every receipt. Since 2004.'],
    ['plant', 'plant', 'peek', 235, 294, 52, 65, 'This plant has a receding hairline.', 'Indoor plants need privacy.', 'A fake plant. A real disappointment.'],
  ],
  bathroom: [
    ['toilet', 'toilet', 'search', 95, 99, 85, 98, 'The commode lid just moved. Open it.', 'OCCUPIED MEANS OCCUPIED!', 'A clean commode. Unusually innocent.'],
    ['laundry', 'laundry', 'search', 280, 299, 80, 66, 'Something is moving under the towels.', 'I am soaking. Come back later.', 'Laundry. It has been here a while.'],
    ['shower', 'shower', 'peek', 290, 106, 102, 113, 'The shower curtain has eyebrows.', 'It is called a water break.', 'The bucket is full. The mystery deepens.'],
    ['sink', 'sink', 'peek', 89, 281, 91, 64, 'A familiar face beneath the tap.', 'I am fixing the plumbing.', 'The tap still drips. Classic.'],
    ['towels', 'towels', 'peek', 194, 296, 66, 49, 'One towel looks profoundly stressed.', 'Fresh towel. Fresh start.', 'Guest towels. You are not the guest.'],
    ['bucket', 'bucket', 'peek', 196, 115, 51, 58, 'A bucket with a suspicious side part.', 'Economy-class swimming pool.', 'One mug. Unlimited possibilities.'],
  ],
  storeroom: [
    ['trunk', 'trunk', 'search', 107, 105, 120, 82, 'The family trunk is clearing its throat.', 'I am a family heirloom.', 'Old cables. None of them useful.'],
    ['suitcase', 'suitcase', 'search', 337, 296, 94, 71, 'Hand luggage. Dad luggage.', 'My flight is in twenty years.', 'A smaller suitcase. Of course.'],
    ['boxes', 'boxes', 'peek', 323, 99, 114, 100, 'Handle with care. Contains opinions.', 'Keep me. Might be useful later.', 'The box the mixer came in.'],
    ['shelf', 'shelf', 'peek', 109, 290, 115, 93, 'Something vintage is staring back.', 'I am not old. I am vintage.', 'Batteries from a different century.'],
    ['fan', 'fan', 'peek', 223, 296, 57, 70, 'A fan with a very familiar face.', 'I am your biggest fan.', 'Works only if you hit it twice.'],
    ['papers', 'papers', 'peek', 218, 108, 69, 49, 'An unusually hairy stack of files.', 'These are important documents!', 'Instructions for a VCR nobody owns.'],
  ],
};

const slots: HidingSlot[] = [];
for (const room of rooms.filter(r => r.id !== 'hall')) {
  for (const [id, kind, mode, x, y, w, h, clue, reaction, empty] of content[room.id as Exclude<RoomId, 'hall'>]) {
    const prop = { x: room.x + x - w / 2, y: room.y + y - h / 2, w, h };
    const target = { x: prop.x + w * (kind === 'toilet' ? .5 : .7), y: prop.y - 9 };
    slots.push({ id: `${room.id}-${id}`, roomId: room.id, name: id === 'toilet' ? 'commode lid' : id.replaceAll('-', ' '), kind, mode, prop,
      anchor: { x: prop.x + w / 2, y: prop.y + h + 26 }, target,
      hit: { x: target.x - 23, y: target.y - 27, w: 46, h: 38 }, clue, reaction, empty });
  }
}

export const HOUSE: HouseDefinition = {
  id: 'balaji-house-v1', width: 1520, height: 1110, rooms, slots,
  passages: [
    { x: 680, y: 80, w: 140, h: 550 },
    { x: 650, y: 260, w: 30, h: 110 }, { x: 820, y: 260, w: 30, h: 110 },
    { x: 220, y: 630, w: 100, h: 20 }, { x: 710, y: 630, w: 100, h: 20 }, { x: 1190, y: 630, w: 100, h: 20 },
  ],
  spawn: { x: 740, y: 550 },
};

export const BALAJI: CharacterPack = { id: 'sample-balaji', name: 'Balaji', atlas: '/assets/balaji-expressions.png', columns: 3, rows: 2,
  expressions: { normal: 0, hiding: 1, surprised: 2, caught: 3, crying: 4, defeated: 5 } };

export const contains = (r: Rect, p: Point, margin = 0) => p.x >= r.x - margin && p.x <= r.x + r.w + margin && p.y >= r.y - margin && p.y <= r.y + r.h + margin;
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const roomAt = (p: Point): RoomId => HOUSE.rooms.find(r => contains(r, p))?.id ?? 'hall';

export function isWalkable(p: Point, radius = 12): boolean {
  const probes = [p, { x: p.x - radius, y: p.y }, { x: p.x + radius, y: p.y }, { x: p.x, y: p.y - radius }, { x: p.x, y: p.y + radius }];
  return probes.every(q => [...HOUSE.rooms, ...HOUSE.passages].some(r => contains(r, q)))
    && !HOUSE.slots.some(s => contains(s.prop, p, radius - 2));
}

export function canReach(position: Point, slot: HidingSlot): boolean {
  if (roomAt(position) !== slot.roomId || distance(position, slot.anchor) > 106) return false;
  // Validate the path to the accessible side of furniture, not through its collider.
  for (let t = 0; t <= 1; t += .1) {
    if (!isWalkable({ x: position.x + (slot.anchor.x - position.x) * t, y: position.y + (slot.anchor.y - position.y) * t }, 4)) return false;
  }
  return true;
}
