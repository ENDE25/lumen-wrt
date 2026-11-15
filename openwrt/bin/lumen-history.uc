#!/usr/bin/ucode
// Lumen traffic history collector (runs under procd, see openwrt/init/lumen-history).
// Samples /proc/net/dev every `interval` seconds and keeps byte deltas per device in two tiers:
//   fine : one bucket per sample, 7 days
//   hour : one bucket per hour, 90 days
// Data lives in RAM (/tmp) so it never wears flash; optionally mirrored to `persist` once an hour.
'use strict';

import { readfile, writefile, rename, mkdir, access } from 'fs';
import * as uloop from 'uloop';
import { cursor } from 'uci';

const DIR = '/tmp/lumen', FILE = DIR + '/history.json';
const FINE_DAYS = 7, HOUR_DAYS = 90, PERSIST_EVERY = 3600, MIN_VALID_TIME = 1600000000;
const SKIP = /^(lo|ifb|teql|bonding|bond|dummy|erspan|gre|gretap|ip6tnl|ip6gre|sit|tunl|ip_vti|ip6_vti)[0-9]*$/;

let cfg = { interval: 300, persist: '' };
function load_cfg() {
	let c = cursor();
	let iv = int(c.get('lumen', 'history', 'interval') ?? 300);
	if (iv < 5) iv = 5;
	cfg = { interval: iv, persist: c.get('lumen', 'history', 'persist') ?? '' };
}

function empty_tier() { return { t: [], rx: {}, tx: {} }; }
function fresh() { return { v: 1, step: cfg.interval, last: {}, lastT: 0, fine: empty_tier(), hour: empty_tier() }; }

let st = fresh();
let lastPersist = 0;

// ---- pure helpers (kept free of I/O so they are easy to test)

function zeros(n) { let a = []; for (let i = 0; i < n; i++) push(a, 0); return a; }

/** Append one bucket. `d` is { dev: [rxDelta, txDelta] }. Series stay aligned with `t`. */
function append(tier, t, d) {
	let len = length(tier.t);
	for (let dev in keys(d)) {
		if (!(dev in tier.rx)) {
			tier.rx[dev] = zeros(len);
			tier.tx[dev] = zeros(len);
		}
	}
	push(tier.t, t);
	for (let dev in keys(tier.rx)) {
		push(tier.rx[dev], d[dev]?.[0] ?? 0);
		push(tier.tx[dev], d[dev]?.[1] ?? 0);
	}
}

/** Add deltas into the bucket starting at `t` (creating it when the hour changes). */
function accumulate(tier, t, d) {
	let n = length(tier.t);
	if (n && tier.t[n - 1] == t) {
		for (let dev in keys(d)) {
			if (!(dev in tier.rx)) {
				tier.rx[dev] = zeros(n);
				tier.tx[dev] = zeros(n);
			}
			tier.rx[dev][n - 1] += d[dev][0];
			tier.tx[dev][n - 1] += d[dev][1];
		}
	} else append(tier, t, d);
}

function trim_tier(tier, keep) {
	let extra = length(tier.t) - keep;
	if (extra <= 0) return;
	splice(tier.t, 0, extra);
	for (let dev in keys(tier.rx)) { splice(tier.rx[dev], 0, extra); splice(tier.tx[dev], 0, extra); }
}

/** Counter delta that survives wraps / interface resets: a smaller value means the counter restarted. */
function delta(cur, prev) { return cur >= prev ? cur - prev : cur; }

function read_counters() {
	let out = {};
	let txt = readfile('/proc/net/dev');
	if (!txt) return out;
	let first = 0;
	for (let line in split(txt, '\n')) {
		if (first++ < 2) continue;
		let m = match(line, /^\s*([^:\s]+):\s*(.*)$/);
		if (!m || match(m[1], SKIP)) continue;
		let f = split(trim(m[2]), /\s+/);
		if (length(f) < 9) continue;
		out[m[1]] = [int(f[0]), int(f[8])];
	}
	return out;
}

function save() {
	mkdir(DIR);
	writefile(FILE + '.tmp', sprintf('%J', st));
	rename(FILE + '.tmp', FILE);
}

function persist() {
	if (!cfg.persist) return;
	let dir = replace(cfg.persist, /\/[^\/]*$/, '');
	if (dir != '') mkdir(dir);
	writefile(cfg.persist + '.tmp', sprintf('%J', st));
	rename(cfg.persist + '.tmp', cfg.persist);
}

function restore() {
	for (let p in [FILE, cfg.persist]) {
		if (!p || !access(p)) continue;
		let d = json(readfile(p));
		// A different sampling interval would make old buckets meaningless: start over.
		if (d?.v == 1 && d.step == cfg.interval) { st = d; return true; }
	}
	return false;
}

function sample() {
	let now = time();
	if (now < MIN_VALID_TIME) return;               // clock not set yet (before NTP)
	let cur = read_counters(), d = {};
	if (st.lastT && now > st.lastT) {
		for (let dev in keys(cur)) {
			let p = st.last[dev];
			if (p) d[dev] = [delta(cur[dev][0], p[0]), delta(cur[dev][1], p[1])];
		}
		append(st.fine, now, d);
		accumulate(st.hour, now - (now % 3600), d);
		trim_tier(st.fine, int(FINE_DAYS * 86400 / cfg.interval));
		trim_tier(st.hour, HOUR_DAYS * 24);
	}
	st.last = cur; st.lastT = now;
	save();
	if (cfg.persist && now - lastPersist >= PERSIST_EVERY) { persist(); lastPersist = now; }
}

// exported for tests when imported as a module; ignored when run as a script
if (!global.LUMEN_TEST) {
	load_cfg();
	if (!restore()) st = fresh();
	uloop.init();
	sample();
	let tm;
	tm = uloop.timer(cfg.interval * 1000, function() { sample(); tm.set(cfg.interval * 1000); });
	uloop.run();
}
