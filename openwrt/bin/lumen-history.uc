#!/usr/bin/ucode
// Lumen traffic history collector (runs under procd, see openwrt/init/lumen-history).
// Samples /proc/net/dev every `interval` seconds and keeps byte deltas per device in two tiers:
//   fine : one bucket per sample, 7 days
//   hour : one bucket per hour, 90 days
// Data lives in RAM (/tmp) so it never wears flash; optionally mirrored to `persist` once an hour.
//
// It also does per-client accounting: an nftables table `inet lumen` with dynamic sets that carry per-element
// counters (one per client IP, per direction). Each sample reads them, maps IP -> MAC through the neighbour
// tables and accumulates hourly buckets for 30 days in /tmp/lumen/clients.json.
'use strict';

import { readfile, writefile, rename, mkdir, access, popen } from 'fs';
import { connect } from 'ubus';
import * as uloop from 'uloop';
import { cursor } from 'uci';

const DIR = '/tmp/lumen', FILE = DIR + '/history.json', CL_FILE = DIR + '/clients.json', RULES_FILE = DIR + '/nft.rules';
const CLIENT_DAYS = 30;
const FINE_DAYS = 7, HOUR_DAYS = 90, PERSIST_EVERY = 3600, MIN_VALID_TIME = 1600000000;
const SKIP = /^(lo|ifb|teql|bonding|bond|dummy|erspan|gre|gretap|ip6tnl|ip6gre|sit|tunl|ip_vti|ip6_vti)[0-9]*$/;

let cfg = { interval: 300, persist: '', clients: true, local: false };
function load_cfg() {
	let c = cursor();
	let iv = int(c.get('lumen', 'history', 'interval') ?? 300);
	if (iv < 5) iv = 5;
	cfg = {
		interval: iv, persist: c.get('lumen', 'history', 'persist') ?? '',
		clients: (c.get('lumen', 'history', 'clients') ?? '1') != '0',       // per-client accounting
		local: (c.get('lumen', 'history', 'count_local') ?? '0') == '1',     // also count router-local traffic
	};
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


// ================= per-client accounting =================
let cl = { v: 1, last: {}, hour: { t: [], d: {} }, meta: {} };   // d: { mac: { rx: [download], tx: [upload] } }; meta: { mac: { ip, name } } of devices seen
let appliedRules = '';
let warned = false;

function cl_bucket(tier, t) {
	let n = length(tier.t);
	if (!n || tier.t[n - 1] != t) {
		push(tier.t, t);
		for (let m in keys(tier.d)) { push(tier.d[m].rx, 0); push(tier.d[m].tx, 0); }
		n++;
	}
	return n - 1;
}

function cl_add(tier, t, mac, rx, tx) {
	let i = cl_bucket(tier, t), len = length(tier.t);
	if (!(mac in tier.d)) tier.d[mac] = { rx: zeros(len), tx: zeros(len) };
	tier.d[mac].rx[i] += rx;
	tier.d[mac].tx[i] += tx;
}

function cl_trim(tier, keep) {
	let extra = length(tier.t) - keep;
	if (extra > 0) {
		splice(tier.t, 0, extra);
		for (let m in keys(tier.d)) { splice(tier.d[m].rx, 0, extra); splice(tier.d[m].tx, 0, extra); }
	}
	// forget clients that have been silent for the whole window
	for (let m in keys(tier.d)) {
		let any = false;
		for (let v in tier.d[m].rx) if (v) { any = true; break; }
		if (!any) for (let v in tier.d[m].tx) if (v) { any = true; break; }
		if (!any) delete tier.d[m];
	}
}

/** Devices of the LAN zone (e.g. br-lan): what clients sit behind. Falls back to "every non-WAN interface". */
function lan_devices() {
	let nets = [];
	cursor().foreach('firewall', 'zone', function(z) {
		if (z.name == 'lan') nets = type(z.network) == 'array' ? z.network : (z.network ? split(z.network, ' ') : []);
	});
	let bus = connect();
	if (!bus) return [];
	let dump = bus.call('network.interface', 'dump') ?? {};
	bus.disconnect();
	let devs = {};
	for (let i in dump.interface ?? []) {
		if (i.interface == 'loopback' || !i.up) continue;
		let isWan = false;
		for (let r in i.route ?? []) if (r.target == '0.0.0.0' && r.mask == 0) isWan = true;
		let use = length(nets) ? (i.interface in nets) : !isWan;
		let dev = i.l3_device ?? i.device;
		if (use && dev) devs[dev] = true;
	}
	return sort(keys(devs));
}

function build_rules(devs) {
	let ifs = join(', ', map(devs, (d) => `"${d}"`));
	let set = (n, t) => `\tset ${n} { type ${t}; size 4096; flags dynamic,timeout; timeout 2d; counter; }\n`;
	let r = `table inet lumen {\n\tset lan_if { type ifname; elements = { ${ifs} } }\n` +
		set('up4', 'ipv4_addr') + set('down4', 'ipv4_addr') + set('up6', 'ipv6_addr') + set('down6', 'ipv6_addr') +
		`\t# forwarded traffic only (after fw4 has accepted it), counted per client address\n` +
		`\tchain forward_count { type filter hook forward priority 1; policy accept;\n` +
		`\t\tiifname @lan_if meta nfproto ipv4 update @up4 { ip saddr }\n` +
		`\t\tiifname @lan_if meta nfproto ipv6 update @up6 { ip6 saddr }\n` +
		`\t\toifname @lan_if meta nfproto ipv4 update @down4 { ip daddr }\n` +
		`\t\toifname @lan_if meta nfproto ipv6 update @down6 { ip6 daddr }\n\t}\n`;
	if (cfg.local)
		r += `\tchain input_count { type filter hook input priority 1; policy accept;\n` +
			`\t\tiifname @lan_if meta nfproto ipv4 update @up4 { ip saddr }\n` +
			`\t\tiifname @lan_if meta nfproto ipv6 update @up6 { ip6 saddr }\n\t}\n` +
			`\tchain output_count { type filter hook output priority 1; policy accept;\n` +
			`\t\toifname @lan_if meta nfproto ipv4 update @down4 { ip daddr }\n` +
			`\t\toifname @lan_if meta nfproto ipv6 update @down6 { ip6 daddr }\n\t}\n`;
	return r + '}\n';
}

function apply_rules(rules) {
	mkdir(DIR);
	writefile(RULES_FILE, rules);
	system('nft delete table inet lumen 2>/dev/null');
	let rc = system(['nft', '-f', RULES_FILE]);
	if (rc != 0) { warn(`lumen-history: could not load nftables rules (exit ${rc})\n`); return false; }
	appliedRules = rules;
	return true;
}

function drop_table() { system('nft delete table inet lumen 2>/dev/null'); appliedRules = ''; }

/** { up: {ip: bytes}, down: {ip: bytes} } from the live sets, or null if the table is missing. */
function read_nft() {
	let p = popen('nft -j list table inet lumen 2>/dev/null', 'r');
	if (!p) return null;
	let txt = p.read('all');
	p.close();
	if (!txt || txt == '') return null;
	let j = json(txt);
	if (!j?.nftables) return null;
	let out = { up: {}, down: {} };
	for (let o in j.nftables) {
		let s = o.set;
		if (!s) continue;
		let tgt = match(s.name, /^up[46]$/) ? out.up : match(s.name, /^down[46]$/) ? out.down : null;
		if (!tgt) continue;
		for (let e in s.elem ?? []) { let el = e.elem ?? e; tgt[el.val] = el.counter?.bytes ?? 0; }
	}
	return out;
}

/** address -> lower-case MAC from the IPv4 ARP table and IPv6 neighbour cache */
function neigh_map() {
	let m = {};
	let first = true;
	for (let line in split(readfile('/proc/net/arp') ?? '', '\n')) {
		if (first) { first = false; continue; }
		let f = split(trim(line), /\s+/);
		if (length(f) >= 6 && f[2] != '0x0') m[f[0]] = lc(f[3]);
	}
	let p = popen('ip -6 neigh show 2>/dev/null', 'r');
	if (p) {
		for (let line in split(p.read('all') ?? '', '\n')) {
			let x = match(line, /^([0-9a-fA-F:.]+) dev [^ ]+ lladdr ([0-9a-fA-F:]+)/);
			if (x) m[lc(x[1])] = lc(x[2]);
		}
		p.close();
	}
	return m;
}

/** lower-case MAC -> DHCP host name, from dnsmasq's lease file (lines: expiry mac ip name client-id) */
function lease_names() {
	let m = {};
	for (let line in split(readfile('/tmp/dhcp.leases') ?? '', '\n')) {
		let f = split(trim(line), ' ');
		if (length(f) >= 4 && f[3] != '*') m[lc(f[1])] = substr(f[3], 0, 63);
	}
	return m;
}

function sample_clients(now) {
	let devs = lan_devices();
	if (!length(devs)) {
		if (!warned) { warn('lumen-history: no LAN devices found, per-client accounting idle\n'); warned = true; }
		if (appliedRules != '') drop_table();
		return;
	}
	warned = false;
	let want = build_rules(devs);
	if (want != appliedRules && !apply_rules(want)) return;
	let snap = read_nft();
	if (!snap) { apply_rules(want); return; }      // someone removed our table: rebuild, counters restart from zero

	let nb = neigh_map(), d = {}, last = {};
	for (let dir in ['down', 'up']) {
		let idx = dir == 'down' ? 0 : 1;
		for (let ip in keys(snap[dir])) {
			let key = dir + '|' + ip, b = snap[dir][ip], prev = cl.last[key] ?? 0;
			last[key] = b;
			let dlt = delta(b, prev);
			if (!dlt) continue;
			let mac = nb[lc(ip)] ?? '?';
			if (!(mac in d)) d[mac] = [0, 0];
			d[mac][idx] += dlt;
		}
	}
	cl.last = last;
	let hour = now - (now % 3600);
	for (let mac in keys(d)) cl_add(cl.hour, hour, mac, d[mac][0], d[mac][1]);
	cl_trim(cl.hour, CLIENT_DAYS * 24);
	// Remember who these devices were (last IPv4 address and DHCP name), so a device that has left the network
	// keeps its name in the traffic lists. Forgotten together with its counters.
	let names = lease_names(), ips = {};
	for (let a in keys(nb)) if (match(a, /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/) && !(nb[a] in ips)) ips[nb[a]] = a;
	for (let mac in keys(d)) {
		if (mac == '?') continue;
		let who = cl.meta[mac] ?? {};
		if (ips[mac]) who.ip = ips[mac];
		if (names[mac]) who.name = names[mac];
		cl.meta[mac] = who;
	}
	for (let mac in keys(cl.meta)) if (!(mac in cl.hour.d)) delete cl.meta[mac];
	mkdir(DIR);
	writefile(CL_FILE + '.tmp', sprintf('%J', cl));
	rename(CL_FILE + '.tmp', CL_FILE);
}

function restore_clients() {
	for (let p in [CL_FILE, cfg.persist ? cfg.persist + '.clients' : null]) {
		if (!p || !access(p)) continue;
		let d = json(readfile(p));
		if (d?.v == 1 && d.hour) { cl = d; if (!cl.meta) cl.meta = {}; return; }
	}
}

function persist_clients() {
	if (cfg.persist) { writefile(cfg.persist + '.clients.tmp', sprintf('%J', cl)); rename(cfg.persist + '.clients.tmp', cfg.persist + '.clients'); }
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
	if (cfg.clients) sample_clients(now);
	if (cfg.persist && now - lastPersist >= PERSIST_EVERY) { persist(); if (cfg.clients) persist_clients(); lastPersist = now; }
}

// exported for tests when imported as a module; ignored when run as a script
if (!global.LUMEN_TEST) {
	load_cfg();
	if (!restore()) st = fresh();
	if (cfg.clients) restore_clients(); else drop_table();
	uloop.init();
	sample();
	let tm;
	tm = uloop.timer(cfg.interval * 1000, function() { sample(); tm.set(cfg.interval * 1000); });
	uloop.run();
}
