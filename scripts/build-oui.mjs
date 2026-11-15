#!/usr/bin/env node
// Builds public/oui.bin: a compact, gzipped MAC-prefix -> vendor table from the IEEE OUI registry.
//   node scripts/build-oui.mjs [dir-with-csvs]    (downloads oui.csv, mam.csv, oui36.csv when no dir is given)
// Covers the three IEEE registries: MA-L (24-bit), MA-M (28-bit) and MA-S (36-bit) assignments.
// The generated file is committed, so normal builds need no network. Re-run now and then to refresh it.
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const SOURCES = { 'MA-L': ['oui.csv', 'https://standards-oui.ieee.org/oui/oui.csv', 6], 'MA-M': ['mam.csv', 'https://standards-oui.ieee.org/oui28/mam.csv', 7], 'MA-S': ['oui36.csv', 'https://standards-oui.ieee.org/oui36/oui36.csv', 9] };
const dir = process.argv[2];
const load = async ([file, url]) => (dir ? readFileSync(`${dir}/${file}`, 'utf8') : await (await fetch(url)).text());

// --- minimal CSV parser (quoted fields, embedded commas/newlines)
function* rows(text) {
  let f = '', row = [], q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f.replace(/\r$/, '')); f = ''; if (row.length > 1) yield row; row = []; }
    else f += c;
  }
}

// --- tidy company names: drop legal suffixes, fix SHOUTING
const SUFFIX = /[,.\s]+(?:inc|incorporated|ltd|limited|llc|l\.l\.c|corp|corporation|co|company|gmbh|ag|sa|s\.a|bv|b\.v|oy|ab|as|a\/s|plc|kg|srl|spa|s\.p\.a|pty|pte|sdn\.? bhd|bhd|ltda|nv|n\.v|technologies|technology|electronics|electronic|communications|communication|systems)\.?$/i;
function tidy(raw) {
  let n = raw.replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 4; i++) { const m = n.replace(SUFFIX, '').replace(/[,\s]+$/, ''); if (m === n || !m) break; n = m; }
  const SMALL = new Set(['AND', 'OF', 'THE', 'FOR', 'DE', 'DEL', 'LA', 'EL', 'Y', 'ET', 'UND', 'DI', 'DA', 'DO']);
  if (n === n.toUpperCase() && /[A-Z]/.test(n))
    n = n.split(' ').map((w, k) => (SMALL.has(w) && k > 0 ? w.toLowerCase() : w.length <= 3 ? w : w[0] + w.slice(1).toLowerCase())).join(' ');
  return n;
}

const vendors = [], index = new Map();
const vid = (name) => { const t = tidy(name); if (!index.has(t)) { index.set(t, vendors.length); vendors.push(t); } return index.get(t); };

/** One registry -> { p: delta-encoded sorted prefixes, i: vendor ids } */
function table(csv, reg, len) {
  const entries = [];
  for (const [r, assign, name] of rows(csv)) {
    if (r !== reg || assign.length !== len || !/^[0-9A-F]+$/i.test(assign) || /^private$/i.test(name.trim())) continue;
    entries.push([parseInt(assign, 16), vid(name)]);
  }
  entries.sort((a, b) => a[0] - b[0]);
  let prev = 0;
  return { n: entries.length, p: entries.map(([x]) => { const d = x - prev; prev = x; return d; }), i: entries.map(([, v]) => v) };
}

const out = { v: 2, vendors: null };
const counts = [];
for (const [reg, src] of Object.entries(SOURCES)) {
  const t = table(await load(src), reg, src[2]);
  out[reg === 'MA-L' ? 'l' : reg === 'MA-M' ? 'm' : 's'] = { p: t.p, i: t.i };
  counts.push(`${reg} ${t.n}`);
}
out.vendors = vendors;
const raw = JSON.stringify(out);
const gz = gzipSync(raw, { level: 9 });
writeFileSync(new URL('../public/oui.bin', import.meta.url), gz);
console.log(`${counts.join(', ')}; ${vendors.length} vendors -> public/oui.bin ${(raw.length / 1024) | 0} KB raw, ${(gz.length / 1024) | 0} KB gzipped`);
