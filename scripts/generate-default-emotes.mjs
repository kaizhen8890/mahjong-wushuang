import { mkdir, writeFile } from 'node:fs/promises';

// Original, self-contained SVG samples. Existing custom images are never touched.
const samples = [
  ['1000', '微笑', '<path d="M39 50q7-8 14 0m22 0q7-8 14 0M42 70q22 23 44 0"/>'],
  ['1001', '大笑', '<path d="M37 49q9 10 18 0m18 0q9 10 18 0"/><path d="M42 68q22 34 44 0Z" fill="#66305f"/>'],
  ['1002', '惊讶', '<circle cx="49" cy="51" r="3"/><circle cx="79" cy="51" r="3"/><ellipse cx="64" cy="75" rx="11" ry="15" fill="#66305f"/>'],
  ['1003', '思考', '<path d="M39 47h17m18-3 16 5M45 75q18-10 37-1"/><circle cx="78" cy="51" r="3"/>'],
  ['1004', '难过', '<path d="M39 54q7-8 14 0m22 0q7-8 14 0M43 84q21-24 42 0"/><path d="M92 59q8 12 0 17-8-5 0-17Z" fill="#8cd9ec" stroke="none"/>'],
  ['1005', '加油', '<path d="m64 29 7 18 19 1-15 12 5 20-16-11-16 11 5-20-15-12 19-1Z" fill="#ffe3a0"/><path d="M49 89h30"/>'],
  ['1006', '好牌', '<rect x="43" y="27" width="42" height="55" rx="5" fill="#fff1c5"/><path d="M51 38h26m-26 8h26m-26 8h26m-26 8h26"/>'],
  ['1007', '辛苦了', '<path d="M64 79 43 58q-11-13 2-19 10-4 19 7 9-11 19-7 13 6 2 19Z" fill="#ffb3c8"/><path d="M46 86q18 7 36 0"/>'],
];

await mkdir('public/emotes', { recursive: true });
for (const [id, label, art] of samples) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="${label}">
<defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#574071"/><stop offset="1" stop-color="#241a42"/></linearGradient><radialGradient id="face"><stop stop-color="#fff2c7"/><stop offset="1" stop-color="#e8b962"/></radialGradient></defs>
<rect x="3" y="3" width="122" height="122" rx="25" fill="url(#bg)" stroke="#d8b671" stroke-width="3"/>
<circle cx="64" cy="61" r="43" fill="url(#face)" stroke="#fff3bf" stroke-width="2"/>
<g fill="none" stroke="#64375a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">${art}</g>
<path d="M18 101q46 23 92 0" fill="none" stroke="#eacb80" stroke-opacity=".55" stroke-width="2"/>
</svg>\n`;
  await writeFile(`public/emotes/${id}.svg`, svg, 'utf8');
}
console.log(`Generated ${samples.length} original emote SVGs.`);
