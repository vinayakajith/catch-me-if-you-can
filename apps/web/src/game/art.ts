import type { PropKind } from '@father-hunter/game-core';

const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><g stroke="#484135" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
const rect = (x: number, y: number, w: number, h: number, fill: string, r = 7) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"/>`;
const ellipse = (x: number, y: number, rx: number, ry: number, fill: string) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}"/>`;
const line = (x1: number, y1: number, x2: number, y2: number, color?: string) => `<path d="M${x1} ${y1}L${x2} ${y2}" fill="none" ${color ? `stroke="${color}"` : ''}/>`;

export function propSvg(kind: PropKind, open = false): string {
  const shadow = `<ellipse cx="80" cy="145" rx="69" ry="10" fill="#332e26" opacity=".12" stroke="none"/>`;
  let a = '';
  switch (kind) {
    case 'sofa': a = rect(17, 25, 126, 102, '#b25f48', 18) + rect(23, 27, 114, 45, '#d78462', 14) + rect(25, 75, 52, 48, '#d88f6d', 12) + rect(81, 75, 52, 48, '#d88f6d', 12) + rect(6, 64, 22, 73, '#c47452', 10) + rect(132, 64, 22, 73, '#c47452', 10) + rect(27, 131, 10, 13, '#725042', 2) + rect(123, 131, 10, 13, '#725042', 2) + `<path d="M48 48l15 8m43-13l-12 12" stroke="#f1c18f"/>`; break;
    case 'tv': a = rect(13, 22, 135, 88, '#5e6256', 12) + rect(23, 32, 103, 65, '#8aaba4', 6) + `<path d="M31 43l83 45M31 62l47 27" stroke="#c4dad0" stroke-width="9"/>` + ellipse(138, 49, 4, 4, '#e8c38b') + ellipse(138, 72, 4, 4, '#e8c38b') + line(73, 23, 55, 6) + line(80, 24, 104, 6) + rect(8, 116, 144, 21, '#a07851', 4) + line(25, 138, 25, 149) + line(136, 138, 136, 149); break;
    case 'cabinet': case 'wardrobe': case 'shelf': {
      a = rect(18, 12, 126, 132, '#98714e') + rect(25, 19, 111, 118, '#b58c61');
      if (kind === 'shelf' || open) {
        a += rect(31, 25, 98, 106, '#725b47', 2) + line(30, 66, 130, 66) + line(30, 105, 130, 105) + rect(37, 31, 17, 32, '#b4b597', 2) + rect(58, 38, 22, 25, '#d7ae7b', 2) + rect(91, 29, 24, 34, '#c57959', 3) + rect(39, 79, 42, 23, '#e0d2a8', 2) + ellipse(107, 91, 12, 12, '#809e8a');
      } else a += line(80, 21, 80, 134) + line(70, 65, 70, 85) + line(91, 65, 91, 85) + `<path d="M37 35v76m85-76v76" stroke="#c8a477"/>`;
      break;
    }
    case 'plant': a = `<path d="M49 107h62l-9 40H57z" fill="#c47b50"/>` + ellipse(80, 105, 34, 9, '#875f45') + line(80, 107, 80, 43) + `<path d="M79 74C24 76 18 39 27 24c37-3 55 20 52 50M81 66c-3-36 22-55 48-52 14 29-8 51-48 52M80 96c-43 8-64-14-66-36 29-12 56 3 66 36M83 97c4-28 29-42 59-35-1 29-23 38-59 35" fill="#6b9170"/>` + line(43, 45, 79, 77, '#b8c797') + line(85, 68, 117, 30, '#b8c797'); break;
    case 'curtain': case 'shower': a = rect(20, 21, 123, 117, kind === 'shower' ? '#b9d3cd' : '#719887', 3) + rect(15, 14, 132, 9, '#d7b784', 3) + `<path d="M38 25v105m27-105v105m29-105v105m28-105v105" stroke="${kind === 'shower' ? '#84b2aa' : '#4a776a'}" stroke-width="8"/>` + `<path d="M21 135q15 13 30 0q15 13 30 0q15 13 30 0q15 13 30 0" fill="none"/>`; if (kind === 'shower') a += '<path d="M14 12V6h16" fill="none"/>'; break;
    case 'papers': a = rect(10, 69, 131, 65, '#c6b491', 3) + rect(18, 55, 130, 65, '#ebdfc0', 3) + `<path d="M24 40l118 5-5 70-118-5z" fill="#f8ecd1"/>` + line(78, 49, 73, 108, '#b0a382') + rect(29, 52, 40, 14, '#797f68', 1) + `<path d="M29 75h36m-37 8h38m-38 8h25m33-35h43m-43 10h40m-41 10h42m-42 10h35m-35 10h40" stroke="#aa9d7f" stroke-width="3"/>`; break;
    case 'fridge': a = rect(30, 9, 102, 140, '#dae0c9', 12) + line(31, 65, 131, 65) + rect(43, 30, 7, 22, '#858e79', 3) + rect(43, 81, 7, 37, '#858e79', 3) + `<path d="M87 78l24 4-4 29-24-4z" fill="#efc865"/>` + line(91, 90, 104, 91) + ellipse(100, 26, 7, 7, '#d67852'); if (open) a += rect(43, 72, 73, 60, '#667a67', 3) + rect(56, 93, 25, 32, '#c1ba81', 3); break;
    case 'stove': a = rect(11, 22, 139, 124, '#aaa992') + rect(12, 25, 137, 64, '#dad8be') + ellipse(51, 55, 21, 16, '#4d5148') + ellipse(111, 55, 21, 16, '#4d5148') + ellipse(52, 46, 21, 12, '#aabdb2') + `<path d="M31 43q21-30 43 0" fill="#c2d0c4"/>` + line(52, 28, 52, 20) + rect(27, 103, 106, 28, '#72786a') + ellipse(26, 93, 4, 4, '#484135') + ellipse(49, 93, 4, 4, '#484135'); break;
    case 'sink': a = rect(9, 36, 143, 95, '#b1c5bb') + rect(16, 40, 128, 64, '#e8e9d3', 15) + ellipse(80, 76, 46, 22, '#90ada7') + `<path d="M80 53V29q0-17 17-16q15 2 15 18" fill="none" stroke="#758a7e" stroke-width="10"/>` + line(81, 115, 81, 128) + ellipse(80, 79, 6, 4, '#5e7e76'); break;
    case 'pots': a = ellipse(58, 116, 39, 18, '#719183') + rect(19, 57, 78, 58, '#94b0a0', 13) + ellipse(58, 56, 39, 15, '#c1ccc0') + line(60, 44, 60, 32) + line(14, 70, 3, 70) + line(102, 70, 112, 70) + ellipse(118, 116, 28, 13, '#bd865b') + ellipse(118, 104, 28, 13, '#e0b782') + line(118, 94, 118, 84); break;
    case 'rice': a = `<path d="M38 45Q14 81 23 135Q82 157 138 133Q144 82 115 45l5-24-37 8-46-9z" fill="#d9be86"/>` + `<path d="M39 45q40 12 74 0m-24 4l19 28M60 53L46 76" fill="none"/>` + rect(43, 83, 75, 34, '#e8d4a6', 2) + `<text x="80" y="106" text-anchor="middle" stroke="none" fill="#8b7450" font-family="serif" font-size="17" font-weight="bold">RICE</text>`; break;
    case 'table': case 'desk': a = line(24, 96, 20, 150) + line(137, 96, 142, 150) + rect(6, 50, 148, 56, '#bd9568', 8) + rect(22, 25, 69, 44, '#ebddba', 3) + line(32, 40, 79, 40, '#9d997c') + line(32, 51, 70, 51, '#9d997c') + ellipse(116, 63, 19, 10, '#dbd6b8') + `<path d="M105 46h24v15q-13 12-24 0z" fill="#f3e5c8"/>` + `<path d="M129 47q18-1 10 13h-10" fill="none"/>`; break;
    case 'bed': a = rect(15, 9, 130, 141, '#9a724e', 11) + rect(21, 22, 118, 120, '#e9ddba', 7) + rect(29, 26, 48, 31, '#f8edd4', 9) + rect(84, 26, 48, 31, '#f8edd4', 9) + rect(21, 63, 118, 77, '#aa7e89', 4) + `<path d="M27 91h106M27 123h106m-85-56v67m34-67v67m30-67v67" stroke="#d1a9b0" stroke-width="7"/>`; break;
    case 'mirror': a = rect(33, 6, 95, 138, '#b99362', 42) + rect(42, 15, 77, 119, '#b8d1c9', 36) + `<path d="M51 59l48-34M51 81l60-44m-31 81l28-20" stroke="#e0e5d3" stroke-width="10"/>`; break;
    case 'laundry': a = `<path d="M26 59h110l-9 88H36z" fill="#c7a477"/>` + ellipse(81, 61, 58, 18, '#e3c89b') + `<path d="M27 58q12-35 35-12q9-46 41-13q37-8 30 32L38 70z" fill="#b6c9b1"/>` + `<path d="M45 87h72M42 108h77M42 128h74m-57-42v56m27-56v56m22-56v56" stroke="#9e805b"/>`; break;
    case 'toilet': a = rect(40, 9, 80, 45, '#eeeadd', 10) + rect(92, 22, 16, 7, '#aaa99e', 3) + `<path d="M46 75h70l-10 66H56z" fill="#d8dfd4"/>` + ellipse(80, 80, 52, 47, '#f7f1dd') + ellipse(80, 82, 35, 32, '#adc9c0') + ellipse(80, 88, 23, 19, '#729d98'); a += open ? `<path d="M38 57Q21-8 80 3q59-11 42 54z" fill="#fcf5e6"/>` + ellipse(80, 30, 28, 22, '#e5e6da') : ellipse(80, 76, 46, 41, '#f8f1e0') + `<path d="M50 95q29 21 60 0" fill="none" stroke="#d6d6c9"/>`; break;
    case 'towels': a = rect(14, 98, 134, 39, '#a9b5c1', 12) + rect(23, 64, 122, 36, '#edc383', 12) + rect(15, 27, 125, 38, '#e6b0a1', 12) + `<path d="M35 37v16m86-16v16M43 76v12m75-12v12M32 110v13m93-13v13" stroke="#fff1ce" stroke-width="4"/>`; break;
    case 'bucket': a = `<path d="M30 43h102l-14 102H43z" fill="#799e9b"/>` + ellipse(81, 45, 52, 16, '#b5cbc3') + ellipse(81, 45, 40, 9, '#658986') + `<path d="M30 48q0-70 49-43q49-26 53 44" fill="none" stroke="#9caca0" stroke-width="6"/>` + `<path d="M66 89h38l-6 34H71z" fill="#e2bf77"/>` + line(57, 72, 101, 134, '#c3dac8'); break;
    case 'boxes': a = rect(13, 72, 74, 74, '#c8a46b', 2) + rect(78, 81, 70, 65, '#c09a61', 2) + rect(41, 12, 93, 70, '#dec18a', 2) + rect(76, 14, 20, 65, '#eddbaf', 0) + rect(37, 74, 17, 68, '#e3c797', 0) + `<path d="M98 111h28m-25 17h20M55 40h13" stroke="#8e724c"/>`; break;
    case 'trunk': a = rect(9, 51, 143, 94, '#6e8776', 8) + rect(9, 38, 143, 35, '#8ca38a', 10) + rect(30, 39, 13, 103, '#c1ae77', 2) + rect(118, 39, 13, 103, '#c1ae77', 2) + rect(69, 66, 24, 30, '#d5bd7c', 3) + ellipse(81, 80, 3, 5, '#555b46'); if (open) a += rect(18, 55, 125, 46, '#45584e'); break;
    case 'suitcase': a = rect(24, 37, 115, 109, '#b77b5d', 14) + `<path d="M61 36V19h39v17" fill="none" stroke-width="9"/>` + line(48, 43, 48, 140, '#ddb78b') + line(115, 43, 115, 140, '#ddb78b') + rect(63, 73, 37, 24, '#e4ce9e', 3); break;
    case 'fan': a = ellipse(80, 139, 46, 11, '#909e83') + rect(74, 60, 12, 73, '#71836a', 2) + ellipse(80, 58, 49, 49, '#c2d0b3') + `<path d="M80 58q-55-56-27-40q35-5 27 40q55-36 47-1q-14 32-47 1q-7 65-32 37q-22-24 32-37" fill="#779a89"/>` + ellipse(80, 58, 9, 9, '#c9cda8') + ellipse(80, 58, 40, 40, 'none') + line(30, 58, 130, 58, '#778a74') + line(80, 8, 80, 107, '#778a74'); break;
  }
  return svg(shadow + a);
}

export const hunterSvg = svg(`<ellipse cx="81" cy="145" rx="30" ry="9" fill="#403d33" opacity=".18" stroke="none"/>${rect(52, 116, 22, 28, '#4d6e67', 8)}${rect(87, 116, 22, 28, '#4d6e67', 8)}${rect(42, 72, 76, 55, '#e8aa4f', 21)}<path d="M46 93l-15 24m83-24l16 21" fill="none" stroke="#c99069" stroke-width="15"/>${ellipse(79, 52, 34, 35, '#dba77a')}<path d="M46 45Q37 7 82 12q40 1 33 35l-14-9-21 4-25-6z" fill="#4c473c"/>${ellipse(65, 54, 3, 4, '#393b34')}${ellipse(93, 54, 3, 4, '#393b34')}<path d="M72 72q9 7 18-1" fill="none"/><path d="M70 90h21v22H70z" fill="#f4d489" stroke="none"/>`);

// Foreground half of the seat: the revealed dad sits behind this lip, in the bowl.
export const toiletRimSvg = svg('<path d="M28 80A52 47 0 0 0 132 80L115 82A35 32 0 0 1 45 82Z" fill="#f7f1dd"/>');

// Phaser's SVG loader decodes data URLs as base64, including in its Canvas fallback.
export const svgUri = (source: string) => `data:image/svg+xml;base64,${btoa(String.fromCharCode(...new TextEncoder().encode(source)))}`;

// Hideouts have a back and a transparent foreground. Balaji sits between them.
// Keep all layers in the same 160px coordinate system so the rim really overlaps him.
export function hideoutSvg(kind: PropKind, open: boolean, foreground = false): string {
  let back = '', front = '';
  const dark = '#605a47', cream = '#f0dfb8';
  switch (kind) {
    case 'vase':
      back = `<path d="M52 49h56l-8 25q49 48 15 70H45Q12 124 60 74z" fill="#cc8e60"/>` + ellipse(80, 51, 29, 12, dark);
      front = `<path d="M33 98q47 16 94 0q13 32-12 46H45q-25-14-12-46" fill="#dda572"/><path d="M40 118q39 19 79 0" fill="none" stroke="#f2d2a0" stroke-width="9"/>`;
      back += `<path d="M64 47L42 16m44 31l10-31m-14 30l44-22" stroke="#698d66" stroke-width="5"/>` + ellipse(41, 16, 16, 11, '#e7b557') + ellipse(96, 17, 15, 14, '#bf6857') + ellipse(127, 23, 13, 11, '#dfad74');
      if (!open) back += ellipse(80, 60, 29, 19, '#77956b') + ellipse(73, 47, 16, 13, '#d4a550');
      break;
    case 'cushion':
      back = rect(4, 15, 152, 136, '#b47057', 20) + rect(21, 32, 120, 108, '#e0b978', 25) + (open ? rect(30, 53, 102, 64, dark, 19) : line(37, 83, 124, 83));
      front = `<path d="M23 95q53 12 115 0v16q0 30-28 29H49q-28 1-26-45" fill="#e6c38b"/>` + `<path d="M30 94l9 7 9-7 9 7 9-7 9 7 9-7 9 7 9-7 9 7 9-7" fill="none" stroke="#99774b"/>` + rect(127, 78, 8, 25, '#f1ddad', 2); break;
    case 'curtain':
      back = rect(17, 14, 125, 10, '#ac8554', 3) + rect(24, 24, 112, 61, '#7b9c86', 5);
      front = rect(23, 26, 114, 52, '#89aa93', 23) + `<path d="M48 34v34m32-34v34m31-34v34" stroke="#4f796d"/>` + ellipse(27, 51, 14, 26, '#bdd0b2'); break;
    case 'statue':
      back = ellipse(80, 137, 69, 16, '#b4a16d') + rect(22, 119, 116, 25, '#d8c494', 3) + rect(34, 105, 91, 21, '#eee1b6', 3);
      front = rect(22, 134, 116, 12, '#ab905f', 2) + rect(55, 123, 52, 15, '#8d7752', 2) + `<text x="81" y="134" text-anchor="middle" stroke="none" fill="#f5e6b8" font-family="serif" font-size="8">NOT A DAD</text>`; break;
    case 'microwave':
      back = rect(4, 29, 152, 115, '#a6b1a0', 9) + rect(11, 41, 112, 85, '#465850', 4) + rect(19, 51, 94, 57, '#626251', 2) + ellipse(67, 108, 42, 7, '#c5c4a4') + rect(130, 46, 18, 20, '#506b56', 2) + ellipse(138, 86, 6, 6, '#e0bd73') + ellipse(138, 108, 6, 6, '#bf7858');
      front = `<path d="M11 41h112v85H11zM19 51v57h94V51z" fill="#6f8075" fill-rule="evenodd"/>` + (open ? `<path d="M9 45L0 35V127L9 120" fill="#bfd0b8"/>` : rect(19, 51, 94, 57, '#91c7bd22', 2) + `<path d="M23 57L77 101M54 54L108 95" stroke="#e6f4db" stroke-width="3" opacity=".2"/>` + rect(115, 62, 6, 35, '#d8d0aa', 2)); break;
    case 'bed':
      back = rect(15, 19, 130, 124, '#825d45', 8) + rect(24, 104, 113, 43, '#423f33', 2);
      front = rect(12, 8, 136, 108, '#ab7e87', 7) + rect(17, 16, 126, 29, '#f1e4c8', 6) + rect(21, 50, 118, 58, '#b38990', 4) + `<path d="M22 72h116M22 95h116M44 51v55M79 51v55M112 51v55" stroke="#e0bdbe" stroke-width="6"/>` + rect(14, 107, 132, 15, '#987052', 2) + rect(18, 121, 13, 27, '#987052', 2) + rect(130, 121, 13, 27, '#987052', 2); break;
    case 'wardrobe':
      back = rect(18, 7, 126, 141, '#98714e', 4) + rect(28, 18, 105, 116, '#524b3c', 2) + `<path d="M34 31H128" stroke="#b5a17a"/>`;
      front = open ? `<path d="M22 18L3 4V139L22 132M138 18L157 4V139L138 132" fill="#b18a5d"/>` + rect(21, 132, 118, 12, '#c8a16e', 1) : rect(25, 15, 55, 120, '#b58c61', 3) + rect(82, 15, 54, 120, '#b58c61', 3) + line(70, 65, 70, 84) + line(92, 65, 92, 84) + `<path d="M37 29V115M124 29V115" stroke="#cca873"/>`; break;
    case 'portrait':
      back = rect(18, 9, 126, 139, '#a0774d', 4) + rect(30, 22, 101, 113, '#b1bfa0', 2) + `<path d="M32 102l27-31 28 27 18-18 23 25v26H32z" fill="#819174" stroke="none"/>`;
      front = `<path d="M18 9h126v139H18zM31 23v110h99V23z" fill="#c19b62" fill-rule="evenodd"/>` + `<path d="M24 15h113v126H24z" fill="none" stroke="#edd49c"/>`; break;
    case 'jar':
      back = rect(29, 27, 104, 119, '#c9d0a0', 22) + (open ? rect(37, 35, 88, 99, '#a9b67e', 15) : rect(23, 15, 116, 26, '#bb6550', 6));
      if (open) back += rect(10, 7, 50, 14, '#bb6550', 4);
      front = `<path d="M31 41v83q0 22 24 22h53q23 0 23-22V41" fill="none" stroke="#758964" stroke-width="6"/><path d="M40 51v59" stroke="#f2edce" stroke-width="7" opacity=".65"/>` + rect(49, 120, 66, 21, '#e4cc91', 3) + `<path d="M60 130h44" stroke="#b17645"/>`; break;
    case 'cooker':
      back = rect(24, 55, 114, 81, '#92aaa1', 23) + ellipse(81, 57, 57, 21, dark) + line(24, 76, 4, 72) + line(138, 76, 155, 72);
      front = `<path d="M24 86q57 25 114 0v23q0 28-31 28H56q-32 0-32-28z" fill="#a6bbb0"/><path d="M43 111q36 15 75 0" fill="none" stroke="#d0d7bf" stroke-width="6"/>`;
      back += `<g transform="translate(0 ${open ? -32 : 0})">${ellipse(81, 51, 60, 19, '#c2cec0')}${rect(68, 20, 25, 20, '#535e50', 5)}${line(117, 35, 121, 21)}</g>`; break;
    case 'toaster':
      back = rect(13, 52, 134, 85, '#d1a26e', 18) + ellipse(80, 57, 53, 15, '#8b7050') + rect(34, 47, 92, 17, dark, 7);
      front = `<path d="M13 83q65 15 134 0v40q0 14-14 14H27q-14 0-14-14z" fill="#e9bf83"/>` + ellipse(127, 109, 7, 7, '#aa6950') + line(146, 66, 146, 108) + rect(140, 63, 16, 9, '#65786b', 3); break;
    case 'fruit':
      back = ellipse(80, 91, 71, 24, '#876e4e') + ellipse(38, 73, 24, 26, '#d7ad53') + ellipse(115, 67, 22, 25, '#a4ad62');
      front = `<path d="M10 91q70 22 140 0q-13 54-70 56Q24 142 10 91" fill="#c7815c"/><path d="M28 116q50 21 104 0" stroke="#eebc86" stroke-width="7" fill="none"/>` + ellipse(44, 88, 23, 20, '#bc6950') + `<path d="M95 86q25 0 39-21q2 31-36 38" fill="#eac65e"/>`; break;
    case 'pillow':
      back = rect(9, 13, 142, 135, '#b08a87', 11) + `<path d="M24 33q52-16 114 3l-5 83q-60 20-110-5z" fill="#eee2be"/>`;
      if (open) back += ellipse(83, 71, 54, 33, dark);
      front = `<path d="M23 92q64 12 112-1l-2 28q-65 25-111-5z" fill="#f4e8cb"/><path d="M30 104l96 6" stroke="#cbb793" stroke-dasharray="4 5"/>`; break;
    case 'drawer':
      back = rect(22, 17, 116, 128, '#b38a5d', 5) + rect(30, 25, 100, 47, '#d4b17c', 3) + ellipse(80, 49, 5, 5, '#725d42') + rect(30, 80, 100, 52, open ? dark : '#c49b68', 3);
      front = `<path d="M22 ${open ? 106 : 80}h116v40H22z" fill="#d2ae77"/>` + ellipse(80, open ? 126 : 100, 6, 5, '#74583d'); break;
    case 'slipper':
      back = `<path d="M42 27Q89 0 120 40l6 69q-11 47-55 40Q31 145 32 113z" fill="#cc9f70"/>` + ellipse(82, 57, 36, 31, dark);
      front = `<path d="M34 79q45-26 88 0l4 30q-13 46-55 40Q30 145 32 113z" fill="#af6d57"/><path d="M44 101q38-17 70 1" stroke="#e1b28a" fill="none" stroke-width="9"/>`; break;
    case 'laundry':
      back = `<path d="M19 121q-12-35 26-45q-9-49 35-43q24-21 46 15q37 14 13 65z" fill="#90a995"/>`;
      front = `<path d="M8 122q7-40 36-25q6-35 34-6q30-19 38 10q32-15 37 30l-15 17H23z" fill="#cc9a8e"/><path d="M47 116l11 25m39-26l-8 30" fill="none" stroke="#eed5b7" stroke-width="7"/>`; break;
    case 'toilet':
      back = propSvg('toilet', open); front = toiletRimSvg; return foreground ? (open ? front : svg('')) : back;
    case 'washer':
      back = rect(19, 11, 122, 139, '#d2d8bf', 11) + rect(26, 18, 108, 27, '#ece6cc', 4) + ellipse(116, 31, 8, 8, '#788c7b') + ellipse(81, 98, 45, 43, '#7f9e93') + ellipse(81, 98, 33, 33, dark);
      front = `<path d="M36 98a45 43 0 1 0 90 0a45 43 0 1 0-90 0m11 0a34 32 0 1 1 68 0a34 32 0 1 1-68 0" fill="#ecdfbd" fill-rule="evenodd"/>`;
      if (!open) front += ellipse(81, 98, 33, 33, '#91b0a622') + `<path d="M60 80L99 109" stroke="#c9d9c6" opacity=".3"/>`;
      else back += `<path d="M28 60q-40 33 0 72" fill="none" stroke="#afbea5" stroke-width="10"/>`; break;
    case 'bucket':
      back = `<path d="M30 45h102l-14 99H43z" fill="#779c98"/>` + ellipse(81, 45, 52, 17, '#b4c9be') + ellipse(81, 45, 42, 11, dark);
      front = `<path d="M32 73q48 18 97 0l-11 71H43z" fill="#88aca4"/><path d="M30 47q-17 53 51 55q66-3 52-55" fill="none" stroke="#ddc68e" stroke-width="5"/>`; break;
    case 'toiletries':
      back = rect(11, 12, 138, 18, '#9e7e54', 3) + rect(26, 35, 23, 38, '#a0b9a1', 4) + rect(25, 28, 25, 10, '#697b68', 3) + rect(93, 41, 34, 31, '#d49a75', 5) + rect(99, 28, 21, 13, '#dfbf92', 3);
      front = rect(10, 70, 140, 15, '#c5a171', 3) + line(22, 85, 32, 98) + line(138, 85, 128, 99); break;
    case 'suitcase':
      back = rect(10, 30, 140, 117, '#ac7056', 15) + `<path d="M62 28V14h37v14" fill="none" stroke-width="7"/>` + rect(23, 43, 114, 94, open ? dark : '#c0926c', 9);
      front = `<path d="M12 106h136v28q0 13-15 13H26q-14 0-14-13z" fill="#c4936f"/>` + rect(32, 107, 14, 34, '#e0c193', 2) + rect(116, 107, 14, 34, '#e0c193', 2);
      if (!open) back += rect(63, 69, 37, 30, '#e5d0a2', 3); break;
    case 'boxes':
      back = rect(23, 59, 117, 88, '#bd955e', 3) + (open ? `<path d="M23 58L7 32l64 8 15 16 57-21 12 27" fill="#dec08a"/>` + ellipse(80, 65, 50, 14, dark) : rect(19, 43, 124, 26, '#e1c38b', 3));
      front = `<path d="M23 97h117v50H23z" fill="#d4b17a"/>` + rect(68, 98, 21, 48, '#ead2a1', 0); break;
    case 'umbrella':
      back = `<path d="M36 11l11 71m24-70l2 75m36-71l-5 69m24-68l-21 78" stroke="#8e7655" stroke-width="7"/>` + rect(21, 75, 120, 73, '#7c9988', 17) + ellipse(81, 76, 60, 15, dark);
      front = `<path d="M21 98q59 17 120 0v31q0 19-24 19H45q-24 0-24-19z" fill="#94ad94"/><path d="M43 107v29m37-23v26m37-31v28" stroke="#c4cfa8" stroke-width="6"/>`; break;
    case 'carpet':
      back = `<path d="M21 34h96q42 4 37 48q-5 39-39 42H21z" fill="#ad7471"/>` + `<path d="M33 37v86m25-85v85m25-85v85" stroke="#d6b18a" stroke-width="11"/>` + ellipse(120, 80, 33, 43, dark);
      front = `<path d="M89 81a31 43 0 1 0 62 0a31 43 0 1 0-62 0m9 0a22 32 0 1 1 44 0a22 32 0 1 1-44 0" fill="#cfa18b" fill-rule="evenodd"/>`; break;
    default: return foreground ? svg('') : propSvg(kind, open);
  }
  return svg(foreground ? front : `<ellipse cx="80" cy="146" rx="66" ry="8" fill="#332e26" opacity=".13" stroke="none"/>${back}`);
}

export const sackSvg = svg(`<path d="M53 38L43 13l35 11 40-13-15 29q-2 13 14 35q35 58-6 72H46Q9 132 41 76q18-23 12-38" fill="#c9a76b"/><path d="M47 47q32 8 62-1" stroke="#745b39" stroke-width="8"/><path d="M61 64q-20 34-15 53m65-16l-10 30" fill="none" stroke="#e3c48c" stroke-width="7"/><path d="M50 104l60-8 4 31-59 8z" fill="#ead5a6"/><path d="M70 116q5-10 12-3q8-10 13-2q-6 12-14 4q-7 10-11 1" fill="#68553b" stroke="none"/>`);
