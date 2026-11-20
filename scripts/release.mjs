#!/usr/bin/env node
// Builds a signed Lumen release.
//
//   node scripts/release.mjs --init-key         one-time: create the signing key (kept OUTSIDE the repo)
//   node scripts/release.mjs                    build + package + sign the version in package.json
//   node scripts/release.mjs --version 0.9.0    override the version (e.g. for tests)
//   options: --out DIR (default release/)  --base URL  --notes "text"  --no-build
//
// Output in --out: lumen-<ver>.tar.gz (+ .sig), latest.json and install.sh. Commit and push `release/` to publish.
// Routers verify the SHA-256 and the Ed25519 signature (OpenWrt's own `usign`) before touching anything.
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const flag = (n) => args.includes(`--${n}`);
const KEY = process.env.LUMEN_RELEASE_KEY ?? join(homedir(), '.config', 'lumen', 'release-key.pem');
const PUB = join(ROOT, 'openwrt', 'release-key.pub');
const DEFAULT_BASE = 'https://raw.githubusercontent.com/ENDE25/lumen-wrt/main/release';
const b64 = (b) => Buffer.from(b).toString('base64');
const run = (cmd, a, o = {}) => { const r = spawnSync(cmd, a, { stdio: 'inherit', cwd: ROOT, ...o }); if (r.status !== 0) { console.error(`failed: ${cmd} ${a.join(' ')}`); process.exit(1); } };

// usign-compatible key material: "Ed" + 8-byte fingerprint + data
function rawPublic(priv) { return createPublicKey(priv).export({ format: 'der', type: 'spki' }).subarray(-32); }
const fingerprint = (raw) => createHash('sha256').update(raw).digest().subarray(0, 8);
const pubFile = (raw) => `untrusted comment: Lumen release key\n${b64(Buffer.concat([Buffer.from('Ed'), fingerprint(raw), raw]))}\n`;

if (flag('init-key')) {
  if (existsSync(KEY)) { console.error(`A key already exists at ${KEY}. Refusing to overwrite it.`); process.exit(1); }
  const { privateKey } = generateKeyPairSync('ed25519');
  mkdirSync(dirname(KEY), { recursive: true, mode: 0o700 });
  writeFileSync(KEY, privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600 });
  writeFileSync(PUB, pubFile(rawPublic(privateKey)));
  console.log(`Private key: ${KEY}  (keep it secret and back it up: without it you cannot publish updates)`);
  console.log(`Public key : ${PUB}  (commit this one)`);
  process.exit(0);
}

if (!existsSync(KEY)) { console.error(`No signing key at ${KEY}. Run: node scripts/release.mjs --init-key`); process.exit(1); }
if (!existsSync(PUB)) { console.error(`Missing ${PUB}. Run --init-key first.`); process.exit(1); }
const privateKey = createPrivateKey(readFileSync(KEY));
if (pubFile(rawPublic(privateKey)) !== readFileSync(PUB, 'utf8')) { console.error(`${PUB} does not match the private key ${KEY}.`); process.exit(1); }

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const version = opt('version', pkg.version);
if (!/^\d+\.\d+\.\d+$/.test(version)) { console.error(`Bad version "${version}" (use MAJOR.MINOR.PATCH)`); process.exit(1); }
const out = resolve(ROOT, opt('out', 'release'));
const base = opt('base', DEFAULT_BASE);
const notes = opt('notes', '');

if (!flag('no-build')) run('npm', ['run', 'build', '--silent'], { env: { ...process.env, LUMEN_VERSION: version } });

// ---- stage the files exactly as they will land on the router
const stage = join(tmpdir(), `lumen-release-${process.pid}`);
rmSync(stage, { recursive: true, force: true });
const rootDir = join(stage, 'root');
const manifest = [];
const put = (src, dst, mode = 0o644) => {
  const to = join(rootDir, dst); mkdirSync(dirname(to), { recursive: true });
  copyFileSync(src, to); chmodSync(to, mode); manifest.push(dst);
};
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
for (const f of walk(join(ROOT, 'dist'))) put(f, join('www/lumen', relative(join(ROOT, 'dist'), f)));
put(join(ROOT, 'openwrt/rpcd/lumen'), 'usr/share/rpcd/ucode/lumen');
put(join(ROOT, 'openwrt/acl/lumen.json'), 'usr/share/rpcd/acl.d/lumen.json');
put(join(ROOT, 'openwrt/bin/lumen-history.uc'), 'usr/libexec/lumen/history.uc');
put(join(ROOT, 'openwrt/bin/lumen-pkg-job.sh'), 'usr/libexec/lumen/pkg-job.sh', 0o755);
put(join(ROOT, 'openwrt/bin/lumen-term-login.sh'), 'usr/libexec/lumen/term-login.sh', 0o755);
put(join(ROOT, 'openwrt/init/lumen-history'), 'etc/init.d/lumen-history', 0o755);
put(join(ROOT, 'openwrt/config/lumen'), 'etc/config/lumen');

const pubText = readFileSync(PUB, 'utf8').trim();
const managerSrc = readFileSync(join(ROOT, 'openwrt/bin/lumen-manage.sh'), 'utf8').replace('__LUMEN_PUBKEY__', pubText).replace('__LUMEN_BASE__', base);
const managerPath = join(rootDir, 'usr/libexec/lumen/manage.sh');
mkdirSync(dirname(managerPath), { recursive: true }); writeFileSync(managerPath, managerSrc); chmodSync(managerPath, 0o755); manifest.push('usr/libexec/lumen/manage.sh');
mkdirSync(join(rootDir, 'usr/bin'), { recursive: true }); symlinkSync('/usr/libexec/lumen/manage.sh', join(rootDir, 'usr/bin/lumen')); manifest.push('usr/bin/lumen');

writeFileSync(join(stage, 'MANIFEST'), manifest.sort().join('\n') + '\n');
writeFileSync(join(stage, 'VERSION'), version + '\n');

// ---- reproducible tarball
mkdirSync(out, { recursive: true });
const tarball = `lumen-${version}.tar.gz`, tarPath = join(out, tarball);
run('sh', ['-c', `tar --sort=name --owner=0 --group=0 --numeric-owner --mtime=@0 -cf - -C '${stage}' MANIFEST VERSION root | gzip -n -9 > '${tarPath}'`]);
const data = readFileSync(tarPath);
const sha256 = createHash('sha256').update(data).digest('hex');
const rawPub = rawPublic(privateKey), sig = sign(null, data, privateKey);
writeFileSync(`${tarPath}.sig`, `untrusted comment: signature from Lumen release key\n${b64(Buffer.concat([Buffer.from('Ed'), fingerprint(rawPub), sig]))}\n`);
writeFileSync(join(out, 'latest.json'), JSON.stringify({ version, released: new Date().toISOString(), tarball, sha256, size: data.length, notes }, null, 2) + '\n');
writeFileSync(join(out, 'install.sh'), managerSrc); chmodSync(join(out, 'install.sh'), 0o755);
// the installer's fingerprint, for people who check it before running it (also shown in the README)
const installSha = createHash('sha256').update(managerSrc).digest('hex');
writeFileSync(join(out, 'install.sh.sha256'), `${installSha}  install.sh\n`);
if (out === join(ROOT, 'release')) {
  const readme = join(ROOT, 'README.md');
  const txt = readFileSync(readme, 'utf8').replace(/<!-- install-sha256 -->[\s\S]*?<!-- \/install-sha256 -->/, `<!-- install-sha256 -->The fingerprint of the current installer is \`${installSha}\`.<!-- /install-sha256 -->`);
  writeFileSync(readme, txt);
}
rmSync(stage, { recursive: true, force: true });

// keep the three newest versions, drop the rest
const vnum = (f) => f.match(/lumen-(\d+)\.(\d+)\.(\d+)\.tar\.gz$/)?.slice(1).map(Number);
const old = readdirSync(out).filter((f) => vnum(f)).sort((a, b) => { const x = vnum(a), y = vnum(b); return y[0] - x[0] || y[1] - x[1] || y[2] - x[2]; }).slice(3);
for (const f of old) { rmSync(join(out, f)); rmSync(join(out, f + '.sig'), { force: true }); }

console.log(`Lumen ${version}: ${tarball} ${(data.length / 1024) | 0} KB, ${manifest.length} files\nsha256 ${sha256}\ninstall.sh sha256 ${installSha}\nout    ${out}`);
if (out === join(ROOT, 'release')) console.log('\nNext: git add release README.md && git commit -m "release ' + version + '" && git push');
