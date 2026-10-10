import type { CaseStory } from './types.ts';

export const CASES: readonly CaseStory[] = [
  { id: 'family-pack', title: 'The Family Pack', stamp: 'PRINTER INCIDENT', story: 'Balaji put his photo in the printer and selected FAMILY PACK; six dads crawled out. Collect them before they demand six separate cups of tea.' },
  { id: 'aadhaar', title: 'The Aadhaar Incident', stamp: 'IDENTITY CRISIS', story: 'Balaji tried to laminate his Aadhaar card in the microwave, and there are now six Balajis. Amma has hired you to collect them before the neighbours find out.' },
  { id: 'wifi', title: 'The Six-Device Plan', stamp: 'CONNECTION LOST', story: 'Balaji upgraded the Wi-Fi to a six-device plan and counted himself as a device. Six dads connected; none remembers the password.' },
  { id: 'coupon', title: 'Extreme Couponing', stamp: 'RETURN TO SENDER', story: 'Balaji scanned a buy-one-get-five-free coupon at the supermarket. Six copies came home, and Amma has kept the receipt.' },
  { id: 'yoga', title: 'Advanced Yoga', stamp: 'HIGHLY FLEXIBLE', story: 'Balaji followed a yoga video called “Be Everywhere At Once.” It worked; six dads are insisting this is completely normal.' },
  { id: 'emi', title: 'Easy Installments', stamp: 'ALL SIX OVERDUE', story: 'Balaji divided himself into six easy monthly installments. Unfortunately, all six are due today.' },
  { id: 'forwarded', title: 'Forwarded Many Times', stamp: 'UNCLES ARE TYPING', story: 'Balaji forwarded himself to six family groups instead of the good-morning message. The copies have escaped into the house, and the uncles are typing.' },
  { id: 'delivery', title: 'Wrong Delivery', stamp: 'DADS, NOT VADAS', story: 'Balaji ordered six extra dads instead of six extra vadas. The delivery app only accepts returns after you collect them.' },
];

// Persist only the consumed IDs, so a reload cannot repeat a case until the deck is exhausted.
export function drawCase(seen: readonly string[], rng: () => number = Math.random): { story: CaseStory; seen: string[] } {
  let used = [...new Set(seen.filter(id => CASES.some(c => c.id === id)))];
  if (used.length === CASES.length) used = [];
  const available = CASES.filter(c => !used.includes(c.id));
  const story = available[Math.min(available.length - 1, Math.floor(rng() * available.length))];
  return { story, seen: [...used, story.id] };
}
