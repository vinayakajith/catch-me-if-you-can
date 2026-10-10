import { BALAJI } from './house.ts';
import type { CaseStory, CharacterPack } from './types.ts';

// Names and art travel together. A generated pack can replace the sample without
// changing the intro, house, HUD, or results. Never bake a name into the artwork.
export function createFatherProfile(name: string, art: CharacterPack = BALAJI): CharacterPack {
  return { ...art, name: name.trim().replace(/\s+/g, ' ').slice(0, 32) || BALAJI.name, expressions: { ...art.expressions } };
}

export function createTimeMachineCase(father: string, detective: string): CaseStory {
  return {
    id: 'time-machine', title: `The ${father} Incident`, stamp: 'TEMPORAL SHITSHOW',
    story: `Dr. ${father} walked into his homemade time machine. Six hyperactive idiots came out. The government sent Detective ${detective} with one sack.`,
    beats: [
      { id: 'experiment', kicker: '02:13 AM · ABSOLUTELY NO SUPERVISION', title: `Dr. ${father}. Unsupervised.`, text: 'He built a time machine to win an argument from 1998. Then the idiot climbed in.' },
      { id: 'chaos', kicker: 'THE EXPERIMENT WAS TECHNICALLY A SUCCESS', title: 'One dad in. Six lunatics out.', text: 'One stole a pitchfork. Two are chasing each other. Nobody knows why they’re laughing. All six have escaped into the house.' },
      { id: 'dispatch', kicker: 'GOVERNMENT BUREAU OF TEMPORAL NONSENSE', title: `Detective ${detective}, you’re up.`, text: `Six copies of ${father} are loose. The government sent you with one sack. Put all six in the bloody bag.` },
    ],
  };
}
