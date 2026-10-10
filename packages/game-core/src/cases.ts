import { BALAJI } from './house.ts';
import type { CaseStory, CharacterPack } from './types.ts';

export function createFatherProfile(name: string, art: CharacterPack = BALAJI): CharacterPack {
  return { ...art, name: name.trim().replace(/\s+/g, ' ').slice(0, 32) || BALAJI.name, expressions: { ...art.expressions }, ...(art.palette ? { palette: { ...art.palette } } : {}) };
}

export function createTimeMachineCase(father: string, agent: string): CaseStory {
  return {
    id: 'time-machine', title: `The ${father} Incident`, stamp: 'TEMPORAL SHITSHOW',
    story: `Dr. ${father}, desi witch-scientist, put a broom engine in a time machine. Now laughing copies of him are loose. The government sent Agent ${agent} with a wooden hammer, a sack and two minutes.`,
    beats: [
      { id: 'experiment', kicker: '02:13 AM · PEER REVIEW: HIS OWN WHATSAPP GROUP', title: `Dr. ${father}. Witch-scientist.`, text: 'Pressure cooker + broom engine = time machine. Destination: 1998. Mission: prove his wife wrong.' },
      { id: 'entrance', kicker: 'SAFETY OFFICER: ALSO HIM', title: '“I know what I’m doing.”', text: 'Lungi secured. Common sense missing. He presses “yesterday” and walks straight in.' },
      { id: 'chaos', kicker: 'THE MACHINE HAS SELECTED: MORE DAD', title: 'Oh, for fuck’s sake.', text: 'The machine won’t send him back. It just keeps sending him out. Same face. Zero shame.' },
      { id: 'escape', kicker: 'CONTAINMENT STATUS: LAUGHING AT YOU', title: 'The house is now his problem.', text: 'One steals the broom. The rest cram themselves into appliances. Every idiot thinks this is fucking hilarious.' },
      { id: 'dispatch', kicker: 'GOVERNMENT BUREAU OF TEMPORAL NONSENSE', title: `Agent ${agent}, you’re up.`, text: `Your equipment: one giant wooden hammer, one sack. Your deadline: two minutes. Bag as many ${father}s as you can. The overtime request has already been rejected.` },
    ],
  };
}
