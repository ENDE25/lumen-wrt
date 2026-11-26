// A small QR code encoder: byte mode, error correction level L, versions 1 to 40. Used to show a WireGuard
// client configuration as a code that a phone can scan. Nothing leaves the browser.

// Per version: [blocks, codewords per block, data codewords per block] for up to two block sizes.
const BLOCKS: number[][] = [
  [1,26,19,0,0,0],[1,44,34,0,0,0],[1,70,55,0,0,0],[1,100,80,0,0,0],
  [1,134,108,0,0,0],[2,86,68,0,0,0],[2,98,78,0,0,0],[2,121,97,0,0,0],
  [2,146,116,0,0,0],[2,86,68,2,87,69],[4,101,81,0,0,0],[2,116,92,2,117,93],
  [4,133,107,0,0,0],[3,145,115,1,146,116],[5,109,87,1,110,88],[5,122,98,1,123,99],
  [1,135,107,5,136,108],[5,150,120,1,151,121],[3,141,113,4,142,114],[3,135,107,5,136,108],
  [4,144,116,4,145,117],[2,139,111,7,140,112],[4,151,121,5,152,122],[6,147,117,4,148,118],
  [8,132,106,4,133,107],[10,142,114,2,143,115],[8,152,122,4,153,123],[3,147,117,10,148,118],
  [7,146,116,7,147,117],[5,145,115,10,146,116],[13,145,115,3,146,116],[17,145,115,0,0,0],
  [17,145,115,1,146,116],[13,145,115,6,146,116],[12,151,121,7,152,122],[6,151,121,14,152,122],
  [17,152,122,4,153,123],[4,152,122,18,153,123],[20,147,117,4,148,118],[19,148,118,6,149,119],
];
// Alignment pattern centres per version.
const ALIGN: number[][] = [
  [], [6,18], [6,22], [6,26], [6,30],
  [6,34], [6,22,38], [6,24,42], [6,26,46], [6,28,50],
  [6,30,54], [6,32,58], [6,34,62], [6,26,46,66], [6,26,48,70],
  [6,26,50,74], [6,30,54,78], [6,30,56,82], [6,30,58,86], [6,34,62,90],
  [6,28,50,72,94], [6,26,50,74,98], [6,30,54,78,102], [6,28,54,80,106], [6,32,58,84,110],
  [6,30,58,86,114], [6,34,62,90,118], [6,26,50,74,98,122], [6,30,54,78,102,126], [6,26,52,78,104,130],
  [6,30,56,82,108,134], [6,34,60,86,112,138], [6,30,58,86,114,142], [6,34,62,90,118,146], [6,30,54,78,102,126,150],
  [6,24,50,76,102,128,154], [6,28,54,80,106,132,158], [6,32,58,84,110,136,162], [6,26,54,82,110,138,166], [6,30,58,86,114,142,170],
];

function mul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
  return z;
}
function divisor(degree: number): number[] {
  const r = new Array(degree).fill(0); r[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) { r[j] = mul(r[j], root); if (j + 1 < degree) r[j] ^= r[j + 1]; }
    root = mul(root, 2);
  }
  return r;
}
function remainder(data: number[], div: number[]): number[] {
  const r = new Array(div.length).fill(0);
  for (const b of data) {
    const f = b ^ r.shift()!; r.push(0);
    for (let i = 0; i < r.length; i++) r[i] ^= mul(div[i], f);
  }
  return r;
}

const dataWords = (v: number) => BLOCKS[v - 1].reduce((a, _, i, b) => (i % 3 === 0 ? a + b[i] * b[i + 2] : a), 0);

export function qrMatrix(text: string): boolean[][] {
  const bytes = [...new TextEncoder().encode(text)];
  let ver = 1;
  while (ver <= 40 && 4 + (ver < 10 ? 8 : 16) + 8 * bytes.length > 8 * dataWords(ver)) ver++;
  if (ver > 40) throw new Error('too much data for a QR code');

  // bit stream: mode, length, data, terminator, padding
  const bits: number[] = [];
  const put = (v: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  put(4, 4); put(bytes.length, ver < 10 ? 8 : 16); bytes.forEach((b) => put(b, 8));
  const cap = 8 * dataWords(ver);
  put(0, Math.min(4, cap - bits.length));
  while (bits.length % 8) bits.push(0);
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
  const words: number[] = [];
  for (let i = 0; i < bits.length; i += 8) words.push(parseInt(bits.slice(i, i + 8).join(''), 2));

  // split into blocks, add error correction, interleave
  const spec = BLOCKS[ver - 1], dataBlocks: number[][] = [], eccBlocks: number[][] = [];
  let at = 0;
  for (let g = 0; g < 6; g += 3) {
    for (let k = 0; k < spec[g]; k++) {
      const d = words.slice(at, at + spec[g + 2]); at += spec[g + 2];
      dataBlocks.push(d); eccBlocks.push(remainder(d, divisor(spec[g + 1] - spec[g + 2])));
    }
  }
  const out: number[] = [];
  for (let i = 0; i < Math.max(...dataBlocks.map((b) => b.length)); i++) for (const b of dataBlocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < eccBlocks[0].length; i++) for (const b of eccBlocks) out.push(b[i]);

  // function patterns
  const size = 17 + 4 * ver;
  const m: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x: number, y: number, dark: boolean) => { if (x >= 0 && y >= 0 && x < size && y < size) { m[y][x] = dark; fn[y][x] = true; } };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)); set(cx + dx, cy + dy, d !== 2 && d !== 4); }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  const pos = ALIGN[ver - 1];
  pos.forEach((px, i) => pos.forEach((py, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(px + dx, py + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  const format = (mask: number) => {
    const data = (1 << 3) | mask;                       // level L is 01
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const f = ((data << 10) | rem) ^ 0x5412, bit = (i: number) => ((f >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  format(0);
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const v = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) { const b = ((v >>> i) & 1) !== 0, a = size - 11 + (i % 3), c = Math.floor(i / 3); set(a, c, b); set(c, a, b); }
  }

  // data modules, zig-zag from the bottom right
  let bi = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
      if (!fn[y][x] && bi < out.length * 8) { m[y][x] = ((out[bi >>> 3] >>> (7 - (bi & 7))) & 1) !== 0; bi++; }
    }
  }

  // pick the mask with the lowest penalty
  const MASKS: ((x: number, y: number) => boolean)[] = [
    (x, y) => (x + y) % 2 === 0, (_x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  const masked = (mask: number) => m.map((row, y) => row.map((v, x) => (fn[y][x] ? v : v !== MASKS[mask](x, y))));
  let bestScore = Infinity, bestM = masked(0);
  for (let mask = 0; mask < 8; mask++) {
    const g = masked(mask), saved = m.map((r) => r.slice());
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) m[y][x] = g[y][x];
    format(mask);
    const f = m.map((r) => r.slice());
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) m[y][x] = saved[y][x];
    const s = penalty(f);
    if (s < bestScore) { bestScore = s; bestM = f; }
  }
  return bestM;
}

function penalty(g: boolean[][]): number {
  const n = g.length;
  let p = 0, dark = 0;
  const line = (get: (i: number) => boolean) => {
    let run = 1, bitsStr = '';
    for (let i = 0; i < n; i++) {
      bitsStr += get(i) ? '1' : '0';
      if (i > 0 && get(i) === get(i - 1)) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1;
    }
    for (let i = 0; i + 11 <= n; i++) { const s = bitsStr.slice(i, i + 11); if (s === '10111010000' || s === '00001011101') p += 40; }
  };
  for (let y = 0; y < n; y++) { line((i) => g[y][i]); line((i) => g[i][y]); }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (g[y][x]) dark++;
    if (x + 1 < n && y + 1 < n && g[y][x] === g[y][x + 1] && g[y][x] === g[y + 1][x] && g[y][x] === g[y + 1][x + 1]) p += 3;
  }
  p += (Math.ceil(Math.abs(dark * 20 - n * n * 10) / (n * n)) - 1) * 10;
  return p;
}
