// Shared vector rig: the dispatch scene and game use the same government agent.
// Six poses: idle, walk left, walk right, inspect, hammer wind-up, bag.
export function agentSvg(frame = 0): string {
  const walking = frame === 1 || frame === 2, stride = frame === 1 ? 14 : frame === 2 ? -14 : 0;
  const lean = frame === 3 ? 7 : frame === 5 ? 12 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 220"><g stroke="#1c2e2a" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M58 147L${57 - stride} 177 ${54 + stride} 201M99 147L${103 + stride} 179 ${108 - stride} 201" stroke="#263b36" stroke-width="20" fill="none"/>
    <path d="M${43 + stride} 206H${68 + stride}M${98 - stride} 206H${124 - stride}" stroke="#1a2a27" stroke-width="12"/>
    <path d="M${45 + stride} 208H${67 + stride}M${99 - stride} 208H${123 - stride}" stroke="#667468" stroke-width="2"/>
    <g transform="translate(${lean} ${frame === 5 ? 8 : 0}) rotate(${frame === 5 ? 8 : frame === 3 ? 4 : 0} 80 140)">
      <path d="M54 89Q80 79 108 91L118 151Q81 161 42 151Z" fill="#344640"/>
      <path d="M68 88L81 141 96 87" fill="#fff3d6"/>
      <path d="M78 92L87 94 89 101 84 104 90 133 81 142 76 132 80 103 75 99Z" fill="#bf704f" stroke-width="2"/>
      <path d="M66 86L53 101 65 105 60 114 80 148M98 87L108 100 97 106 103 114 86 149" fill="none" stroke="#7f8975" stroke-width="2"/>
      <path d="M49 102L${frame === 5 ? '30 139 37 169' : walking ? `${29 - stride / 2} 131 ${28 - stride} 155` : '28 124 24 151'}" fill="none" stroke="#344640" stroke-width="18"/>
      <path d="M109 102L${frame === 4 ? '122 77 109 53' : frame === 3 ? '127 122 143 113' : frame === 5 ? '126 139 112 163' : walking ? `${128 + stride / 2} 131 ${131 + stride} 155` : '127 125 132 151'}" fill="none" stroke="#344640" stroke-width="18"/>
      <circle cx="${frame === 5 ? 37 : walking ? 28 - stride : 24}" cy="${frame === 5 ? 169 : 157}" r="8" fill="#c38d61"/>
      <circle cx="${frame === 4 ? 109 : frame === 3 ? 143 : frame === 5 ? 112 : walking ? 131 + stride : 132}" cy="${frame === 4 ? 53 : frame === 3 ? 113 : frame === 5 ? 163 : 157}" r="8" fill="#c38d61"/>
      <path d="M101 113H114V130L108 135 101 130Z" fill="#d9bd71" stroke-width="2"/><path d="M105 119H110M106 124H110" stroke="#756540" stroke-width="1.5"/>
      <path d="M65 76V91Q81 99 95 88V73" fill="#c38d61"/>
      <path d="M48 33Q48 13 78 13Q108 13 115 38L111 70Q107 91 83 94Q57 91 49 70Z" fill="#d5a072"/>
      <path d="M49 46Q39 29 54 15Q76 -1 101 14L117 11 116 26 122 32 113 54 104 47 103 32Q76 44 53 34L55 54Z" fill="#26312b"/>
      <path d="M57 24Q84 13 104 24" fill="none" stroke="#64715b" stroke-width="3"/>
      <path d="M48 54L113 49" stroke-width="5"/>
      <path d="M53 49L77 49 76 64Q64 72 55 62ZM86 48L110 46 108 61Q97 69 88 61Z" fill="#172623" stroke-width="3"/>
      <path d="M58 53L70 52M91 52L103 50" stroke="#b6c9b1" stroke-width="3"/>
      <path d="M80 55L83 70 91 68" fill="none" stroke="#9b6848" stroke-width="2.5"/>
      <path d="M76 80Q89 82 99 77" fill="none" stroke-width="2.5"/>
      <path d="M111 47Q122 43 120 58L114 65" fill="none" stroke="#cfb363" stroke-width="3"/>
    </g></g></svg>`;
}

export const hammerHeadSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 64"><g stroke="#553c28" stroke-width="3.5" stroke-linejoin="round"><path d="M18 8L102 3 116 13V50L102 59 18 56 4 46V18Z" fill="#be8950"/><path d="M18 8L102 3 103 17 18 22 4 18Z" fill="#e5b979"/><path d="M18 22L103 17V59L18 56Z" fill="#bf8a51"/><path d="M103 17L116 13V50L103 59Z" fill="#996136"/><path d="M18 8V56L4 46V18Z" fill="#e7bd7f"/><path d="M28 32L90 27M39 42Q61 35 89 41M30 49L77 48" stroke="#935f35" stroke-width="2" fill="none"/><path d="M8 27Q14 21 14 36Q13 50 8 39" fill="none" stroke="#b1814a" stroke-width="2"/></g></svg>`;
