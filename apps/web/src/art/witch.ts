// One shared six-pose rig for the introduction and playable witch.
// Idle, two walking poses, inspect/stir, hammer wind-up, and sack.
export function witchSvg(frame = 0): string {
  const stride = frame === 1 ? 11 : frame === 2 ? -11 : 0;
  const bend = frame === 5 ? 9 : frame === 3 ? 4 : 0;
  const handX = frame === 4 ? 120 : frame === 3 ? 143 : frame === 5 ? 113 : 133;
  const handY = frame === 4 ? 57 : frame === 3 ? 123 : frame === 5 ? 167 : 153;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 220"><g stroke="#272130" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M62 175L${60 + stride} 201M98 175L${100 - stride} 201" stroke="#403444" stroke-width="12"/>
    <path d="M${62 + stride} 204Q${41 + stride} 212 ${33 + stride} 197M${98 - stride} 204Q${122 - stride} 214 ${130 - stride} 197" stroke-width="11" fill="none"/>
    <g transform="rotate(${bend} 80 180)">
      <path d="M50 81Q30 104 32 131L46 119 43 143 61 131H110L127 147 123 119 134 130Q131 95 111 78" fill="#c0bac3"/>
      <path d="M59 106Q80 98 104 107L126 182Q81 198 32 182Z" fill="#743bac"/>
      <path d="M57 128L46 181M80 137L79 190M103 128L113 181" fill="none" stroke="#9859c5" stroke-width="5"/>
      <path d="M49 131Q80 143 111 131L114 141Q79 150 46 140Z" fill="#312936"/>
      <rect x="71" y="134" width="18" height="13" rx="2" fill="#d5ae57" stroke-width="2"/><rect x="76" y="137" width="8" height="7" fill="#46304d" stroke="none"/>
      <path d="M54 112L${frame === 5 ? '31 145 44 168' : `30 ${127 + stride / 2} 23 ${149 + stride}`}" fill="none" stroke="#743bac" stroke-width="18"/>
      <path d="M106 112L${frame === 4 ? '133 90 120 57' : frame === 3 ? '121 134 143 123' : frame === 5 ? '132 146 113 167' : `127 ${130 - stride / 2} 133 ${153 - stride}`}" fill="none" stroke="#743bac" stroke-width="18"/>
      <path d="M${frame === 5 ? 44 : 23} ${frame === 5 ? 168 : 151 + stride}l-5 7 9 -2 3 -7" fill="#b8b78a" stroke-width="2"/>
      <circle cx="${handX}" cy="${frame === 0 || frame === 1 || frame === 2 ? handY - stride : handY}" r="8" fill="#b8b78a"/>
      <path d="M52 56Q80 35 111 57L113 80Q107 102 87 117L75 108Q51 107 46 83Z" fill="#c3c395"/>
      <path d="M52 64L76 69M88 67L109 58" stroke-width="5"/>
      <path d="M55 71Q65 66 74 74Q67 87 56 78ZM90 72Q99 63 109 66Q110 79 95 80Z" fill="#effa97" stroke-width="2"/>
      <path d="M66 72V78M100 69V76" stroke="#35232f" stroke-width="4"/>
      <path d="M83 69Q84 85 103 83Q105 94 85 94L78 87" fill="#b4b180" stroke-width="2"/>
      <circle cx="99" cy="86" r="2.6" fill="#5d5540" stroke="none"/>
      <path d="M63 98Q80 93 95 100Q80 111 63 98" fill="#463047" stroke-width="2"/><path d="M72 98V104H77V98" fill="#f3e5b4" stroke-width="1"/>
      <path d="M52 87L62 89M103 94L109 90M70 59L86 56" stroke="#969368" stroke-width="2"/>
      <path d="M48 62L45 93 57 84 54 103M112 57L119 82 110 90" fill="#d0cbd0"/>
      <path d="M47 49L73 3 91 17 106 47Z" fill="#292333"/><path d="M52 37L98 33 106 47 47 49Z" fill="#9854bc"/>
      <rect x="70" y="35" width="17" height="12" rx="2" fill="#d5ae57" stroke-width="2"/><path d="M75 38H82V43H75Z" fill="#3c2e42" stroke="none"/>
      <path d="M20 53Q54 38 113 45L143 53Q127 71 87 62Q45 70 20 53Z" fill="#30273c"/>
      <path d="M38 52Q81 45 119 53" stroke="#5c4968" stroke-width="2" fill="none"/>
    </g></g></svg>`;
}

export const hammerHeadSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 64"><g stroke="#553c28" stroke-width="3.5" stroke-linejoin="round"><path d="M18 8L102 3 116 13V50L102 59 18 56 4 46V18Z" fill="#be8950"/><path d="M18 8L102 3 103 17 18 22 4 18Z" fill="#e5b979"/><path d="M18 22L103 17V59L18 56Z" fill="#bf8a51"/><path d="M103 17L116 13V50L103 59Z" fill="#996136"/><path d="M18 8V56L4 46V18Z" fill="#e7bd7f"/><path d="M28 32L90 27M39 42Q61 35 89 41M30 49L77 48" stroke="#935f35" stroke-width="2" fill="none"/><path d="M8 27Q14 21 14 36Q13 50 8 39" fill="none" stroke="#b1814a" stroke-width="2"/></g></svg>`;
