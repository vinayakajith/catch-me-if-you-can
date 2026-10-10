import { BALAJI } from './house.ts';
import type { CaseStory, CharacterPack } from './types.ts';

export function createFatherProfile(name: string, art: CharacterPack = BALAJI): CharacterPack {
  return { ...art, name: name.trim().replace(/\s+/g, ' ').slice(0, 32) || BALAJI.name, expressions: { ...art.expressions }, ...(art.palette ? { palette: { ...art.palette } } : {}) };
}

export function createTimeMachineCase(father: string, player: string): CaseStory {
  return {
    id: 'time-machine', title: `The ${father} Incident`, stamp: 'ASSISTANT OVERFLOW',
    story: `The witch was brewing a potion. Her assistant ${father} had one job: stir. Instead, he walked into her time machine. Now laughing copies are everywhere, and ${player} must play the witch and bag the mess in two minutes.`,
    beats: [
      { id: 'experiment', kicker: '02:13 AM · QUALIFICATIONS: ONE WHATSAPP REMEDY', title: `${father}. Unpaid assistant.`, text: 'The witch is brewing eternal youth. His only job is to stir. Even that feels ambitious.' },
      { id: 'entrance', kicker: 'THE SIGN SAYS: DO NOT ENTER', title: 'He read: “Free AC.”', text: `${father} presses “yesterday” and walks into her time machine. Lungi secured. Common sense missing.` },
      { id: 'chaos', kicker: `ERROR: ${father.toUpperCase()} OVERFLOW`, title: 'Same idiot. Bulk delivery.', text: `The machine keeps coughing out laughing ${father}s. Not one of them has brought the spoon.` },
      { id: 'escape', kicker: 'HER BROOM. HIS WORST IDEA YET.', title: 'The house is an infestation.', text: 'One steals her broom. The rest squeeze into appliances and giggle. The witch slowly puts down her spoon.' },
      { id: 'dispatch', kicker: 'ONE VERY PISSED-OFF WITCH', title: `${player}, grab the sack.`, text: `“I asked for an assistant. I got a fucking infestation.” You are the witch. Hammer in hand. Two minutes to bag as many ${father}s as possible.` },
    ],
  };
}
