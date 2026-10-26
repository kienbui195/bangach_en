#!/usr/bin/env node
// Test theo AC trên hệ thống thật. Điều kiện:
//  - Docker local đang chạy:  bash dev/up.sh   (game :3402, máy chủ :3401, MySQL container wd-dev-mysql-app)
//  - Ngăn xếp hub thử (node) ở :3200 và game :3300:  bash <hub-reset-dev.sh>   (xem MyDocs/.../viet-lai-be-nestjs/_tools)
//  - SSH tới VPS không mật khẩu (alias ssh_vpsgiare_server) cho các kiểm tra CHỈ ĐỌC trên VPS.
// Dùng: node ac-suite.mjs [nhóm...]   nhóm: game | ops | vps | hub   (mặc định: tất cả). Kết quả: results.json
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { chromium } from 'playwright-core';
import * as OTPAuth from 'otpauth';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const WEB = 'http://127.0.0.1:3402', API = 'http://127.0.0.1:3401';
const HUB = 'http://127.0.0.1:3200', HUB_GAME = 'http://127.0.0.1:3300', HUB_TOKEN = 't'.repeat(40);
const VPS = 'root@103.77.209.156';
const groups = new Set(process.argv.slice(2).length ? process.argv.slice(2) : ['game', 'ops', 'vps', 'hub']);
const results = [];
const rec = (ac, ok, note) => { results.push({ ac, status: ok ? 'PASS' : 'FAIL', note }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${ac}  ${note}`); };
const sh = (cmd, args, opt = {}) => execFileSync(cmd, args, { encoding: 'utf8', ...opt }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ssh = (cmd) => sh('ssh', ['-o', 'BatchMode=yes', VPS, cmd]);
const http = async (url, init) => { try { const r = await fetch(url, init); return { status: r.status, text: await r.text() }; } catch { return { status: 0, text: '' }; } };
async function waitStatus(url, want, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await http(url)).status === want) return (Date.now() - t0) / 1000; await sleep(1000); } return null; }
const started = (name) => sh('docker', ['inspect', '-f', '{{.State.StartedAt}}', name]);

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });

// ---------------------------------------------------------------- nhóm game: giao diện game ở trình duyệt thật
async function gameGroup() {
  const open = async (ctx, setup) => {
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    if (setup) await page.route('**/api/content', setup);
    const t0 = Date.now();
    await page.goto(WEB, { waitUntil: 'commit' });
    await page.waitForFunction(() => (document.getElementById('root')?.children.length ?? 0) > 0, null, { timeout: 15000 });
    return { page, errs, secs: (Date.now() - t0) / 1000, cache: await page.evaluate(() => { const j = JSON.parse(localStorage.getItem('wd_remote_content') || 'null'); return j && { stages: j.stages.length, levels: j.stages[0]?.levels.length }; }) };
  };
  // AC-01.4: chưa có cache → chờ tối đa 4 giây rồi dùng dữ liệu có sẵn
  let ctx = await browser.newContext();
  let r = await open(ctx, async (route) => { await sleep(2000); await route.continue(); });
  rec('AC-01.4a', r.secs >= 1.8 && r.secs < 4 && r.cache?.levels === 15, `máy chủ trả sau 2 giây: giao diện hiện sau ${r.secs.toFixed(1)}s, nội dung máy chủ (${JSON.stringify(r.cache)})`);
  await ctx.close();
  ctx = await browser.newContext();
  r = await open(ctx, async (route) => { await sleep(7000); await route.continue().catch(() => {}); });
  rec('AC-01.4b', r.secs >= 3.8 && r.secs < 5.5 && r.cache === null && r.errs.length === 0, `máy chủ trả sau 7 giây: giao diện hiện sau ${r.secs.toFixed(1)}s bằng dữ liệu có sẵn, không lỗi trang, chưa có cache`);
  await ctx.close();
  // AC-01.5: máy chủ tắt (có cache rồi không cache)
  ctx = await browser.newContext();
  await (await open(ctx)).page.close(); // nạp bình thường để có cache
  r = await open(ctx, (route) => route.abort());
  rec('AC-01.5a', r.secs < 3 && r.errs.length === 0 && r.cache?.levels === 15, `máy chủ tắt, có cache: giao diện hiện sau ${r.secs.toFixed(1)}s dùng cache (${JSON.stringify(r.cache)}), không lỗi trang`);
  await ctx.close();
  ctx = await browser.newContext();
  r = await open(ctx, (route) => route.abort());
  rec('AC-01.5b', r.secs < 5.5 && r.errs.length === 0, `máy chủ tắt, không cache: giao diện hiện sau ${r.secs.toFixed(1)}s bằng dữ liệu có sẵn, không lỗi trang`);
  await ctx.close();
  // AC-01.6: chặng không có màn bị bỏ, chặng khác vẫn chơi được
  ctx = await browser.newContext();
  const real = JSON.parse((await http(`${API}/api/content`)).text);
  real.topics.push({ slug: 'rong', title: 'Chặng rỗng', description: '', themeColor: '#000000', order: 2, levels: [] });
  r = await open(ctx, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(real) }));
  const titles = await r.page.evaluate(() => JSON.parse(localStorage.getItem('wd_remote_content')).stages.map((s) => s.title));
  rec('AC-01.6', titles.length === 1 && !titles.join().includes('rỗng'), `gói có thêm một chặng không màn: game còn ${titles.length} chặng (${titles[0]?.slice(0, 40)}...)`);
  await ctx.close();
}

// ---------------------------------------------------------------- nhóm ops: vận hành trên Docker local
async function opsGroup() {
  const hubUp = () => http('http://127.0.0.1:3400/api/auth/status');
  // AC-11.2: dừng rồi bật một dịch vụ, dịch vụ khác không bị ảnh hưởng
  const [m0, h0] = [started('wd-dev-mysql-app'), started('wd-dev-hub')];
  sh('docker', ['stop', 'wd-dev-api']);
  const during = (await hubUp()).status;
  sh('docker', ['start', 'wd-dev-api']);
  const back = await waitStatus(`${API}/api/content`, 200, 60000);
  rec('AC-11.2', started('wd-dev-mysql-app') === m0 && started('wd-dev-hub') === h0 && during === 200 && back !== null, `stop/start máy chủ game: MySQL và hub giữ nguyên (không khởi động lại), hub trả ${during} trong lúc dừng, game trả lại sau ${back}s`);
  // AC-11.4: process chính của container sập giữa chừng (giả lập bằng SIGKILL từ host, giống bị OOM hoặc crash) thì Docker tự chạy lại.
  // Lưu ý: `docker kill` do người dùng gõ được Docker 29 coi là dừng thủ công nên KHÔNG tự chạy lại; chỉ sập thật mới chạy lại.
  const before = sh('docker', ['inspect', '-f', '{{.State.StartedAt}}', 'wd-dev-api']);
  // Giết node (tiến trình chạy máy chủ) từ bên trong; npm (PID 1) thoát với mã lỗi nên Docker coi là sập, không phải dừng thủ công.
  sh('docker', ['exec', 'wd-dev-api', 'sh', '-c', 'for p in /proc/[0-9]*; do grep -q "dist/main" $p/cmdline 2>/dev/null && [ "${p#/proc/}" != "$$" ] && kill -9 ${p#/proc/}; done; true']);
  const t = await waitStatus(`${API}/api/content`, 200, 90000);
  const restarts = sh('docker', ['inspect', '-f', '{{.RestartCount}}', 'wd-dev-api']);
  rec('AC-11.4', t !== null && started('wd-dev-api') !== before && Number(restarts) >= 1, `process chính của game bị SIGKILL: Docker tự chạy lại (RestartCount ${restarts}), /api/content trả 200 sau ${t}s`);
  // AC-11.6: MySQL dừng rồi bật
  const apiStart = started('wd-dev-api');
  sh('docker', ['stop', 'wd-dev-mysql-app']);
  await sleep(1500);
  const down = await http(`${API}/api/content`);
  const code = down.status;
  sh('docker', ['start', 'wd-dev-mysql-app']);
  const rec6 = await waitStatus(`${API}/api/content`, 200, 120000);
  rec('AC-11.6', code === 503 && rec6 !== null && started('wd-dev-api') === apiStart, `MySQL dừng: /api/content trả ${code} (cần 503); bật lại: game tự nối lại sau ${rec6}s, không phải khởi động lại container`);
  // AC-11.5: container vượt giới hạn RAM chỉ chính nó bị dừng
  let exit = null;
  try { sh('docker', ['run', '--rm', '--name', 'wd-oom-test', '--memory', '64m', '--memory-swap', '64m', 'node:22-slim', 'node', '-e', 'const a=[];setInterval(()=>a.push(Buffer.alloc(8*1024*1024,1)),20)'], { stdio: 'pipe' }); exit = 0; } catch (e) { exit = e.status; }
  const ok2 = (await http(`${API}/api/content`)).status === 200 && (await hubUp()).status === 200;
  rec('AC-11.5', exit === 137 && ok2, `container thử vượt giới hạn 64MB bị dừng (mã ${exit}, 137 = OOM); game và hub vẫn phản hồi`);
}

// ---------------------------------------------------------------- nhóm vps: kiểm tra CHỈ ĐỌC trên VPS thật
async function vpsGroup() {
  const st = ssh('svc status');
  const up = ['mysql', 'worddefender-api', 'admin-hub', 'worddefender-web'].every((n) => new RegExp(`^${n}\\s+Up`, 'm').test(st));
  const content = await http('https://bangach-server.baodom.xyz/api/content');
  const game = await http('https://bangach.baodom.xyz/');
  let words = 0; try { words = JSON.parse(content.text).vocabulary.length; } catch { /* để 0 */ }
  rec('AC-11.1', up && content.status === 200 && game.status === 200 && words > 0, `svc status: 4 dịch vụ Up; game ${game.status}; /api/content ${content.status} (${words} từ)`);
  // BR3: gói nội dung nén, một lần gọi, đến trong vài giây (đo trên domain thật)
  const t0 = Date.now();
  const gz = await fetch('https://bangach-server.baodom.xyz/api/content', { headers: { 'Accept-Encoding': 'gzip, br, zstd' } });
  const body = await gz.arrayBuffer();
  const secs = (Date.now() - t0) / 1000;
  const enc = gz.headers.get('content-encoding');
  rec('BR3', !!enc && secs < 4, `domain thật: nén ${enc}, ${(body.byteLength / 1024).toFixed(0)}KB tải về, ${secs.toFixed(2)}s (giới hạn 4s)`);
  // BR39: giới hạn RAM từng container trên VPS
  const mem = Object.fromEntries(ssh("docker inspect worddefender-api admin-hub mysql worddefender-web --format '{{.Name}} {{.HostConfig.Memory}}'").split('\n').map((l) => l.trim().replace('/', '').split(' ')));
  const mb = (n) => Math.round(Number(n) / 1048576);
  rec('BR39', mb(mem['worddefender-api']) === 256 && mb(mem['admin-hub']) === 256 && mb(mem['mysql']) === 700 && mb(mem['worddefender-web']) > 0, `giới hạn RAM trên VPS: game ${mb(mem['worddefender-api'])}MB, hub ${mb(mem['admin-hub'])}MB, MySQL ${mb(mem['mysql'])}MB, giao diện game ${mb(mem['worddefender-web'])}MB`);
  // AC-09.6: /admin-api và /healthz không tới được từ internet
  const probes = [];
  for (const host of ['bangach-server.baodom.xyz', 'bangach.baodom.xyz', 'admin.baodom.xyz']) for (const p of ['/admin-api/health', '/admin-api/meta', '/healthz']) {
    const r = await http(`https://${host}${p}`);
    probes.push({ host, p, leaked: /"status"\s*:\s*"ok"|"resources"|"contractVersion"/.test(r.text) });
  }
  rec('AC-09.6 (BR31)', probes.every((x) => !x.leaked), `${probes.length} đường thử từ internet qua 3 domain: không đường nào trả dữ liệu hợp đồng/sức khỏe`);
  // AC-08.5: hub không có docker.sock và giao diện không có nút bật/tắt
  const mounts = ssh("docker inspect admin-hub --format '{{json .Mounts}}'");
  rec('AC-08.5 (docker.sock)', !mounts.includes('docker.sock'), 'container admin-hub trên VPS không gắn docker.sock');
  // AC-11.8: không bí mật trong repo, quyền thư mục bí mật
  const perms = ssh("stat -c '%a %F %n' /srv/secrets /srv/secrets/* /srv/secrets/hub /srv/secrets/hub/* /srv/secrets/hub/games/* 2>/dev/null");
  const dirsOk = perms.split('\n').filter((l) => l.includes('directory')).every((l) => l.startsWith('700'));
  const filesOk = perms.split('\n').filter((l) => l.includes('regular')).every((l) => l.startsWith('600'));
  let leaks = '';
  try { leaks = sh('git', ['-C', REPO, 'grep', '-nIE', '(AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY|gh[po]_[A-Za-z0-9]{30,}|ADMIN_API_TOKEN=[A-Za-z0-9+/=_-]{20,})', '--', '.', ':!*package-lock.json']); } catch { leaks = ''; }
  const envs = sh('git', ['-C', REPO, 'ls-files']).split('\n').filter((f) => /(^|\/)\.env(\.|$)/.test(f) && !f.endsWith('.example'));
  rec('AC-11.8 (BR41)', dirsOk && filesOk && !leaks && envs.length === 0, `thư mục bí mật 700, file 600; repo không có token/khóa/.env thật (${envs.length} file .env, ${leaks ? 'CÓ khớp mẫu bí mật' : 'không khớp mẫu bí mật'})`);
  // AC-06.6 (BR22): hằng số luật chơi chỉ được định nghĩa một chỗ ở game (bản dự phòng gameRules.ts); nơi khác chỉ đọc GAME_RULES
  let dup = '';
  try { dup = sh('git', ['-C', REPO, 'grep', '-nE', '(lossPerMiss|perFail|maxFails|comboReward|maxPendingBlanks|fallDurationClampSec|spawnIntervalClampSec|newRatio)\\s*:', '--', 'worddefender/src', ':!worddefender/src/config/gameRules.ts']); } catch { dup = ''; }
  rec('AC-06.6 (BR22)', dup === '', dup ? `định nghĩa trùng: ${dup.split('\n')[0]}` : 'không có định nghĩa hằng số luật nào ngoài worddefender/src/config/gameRules.ts (bản dự phòng khi mất kết nối)');
  // AC-11.7: khôi phục sao lưu MySQL vào database tạm, so số bản ghi (không đụng database thật)
  const script = `svc backup >/dev/null 2>&1; f=$(ls -t /srv/backups/mysql-*.sql.gz | head -1); M='mysql -uroot -p"$MYSQL_ROOT_PASSWORD"'
docker exec mysql sh -c "$M -e 'DROP DATABASE IF EXISTS tmp_wd_restore; CREATE DATABASE tmp_wd_restore CHARACTER SET utf8mb4'" 2>/dev/null
(echo 'SET FOREIGN_KEY_CHECKS=0;'; zcat "$f" | awk '/^-- Current Database: .worddefender./{on=1;next} /^-- Current Database:/{on=0} on' | sed -e '/^CREATE DATABASE/d' -e '/^USE /d') | docker exec -i mysql sh -c "$M --default-character-set=utf8mb4 tmp_wd_restore" 2>/dev/null
for t in topics levels vocabularies word_reports game_config; do a=$(docker exec mysql sh -c "$M -N -e 'select count(*) from worddefender.$t'" 2>/dev/null); b=$(docker exec mysql sh -c "$M -N -e 'select count(*) from tmp_wd_restore.$t'" 2>/dev/null); echo "$t $a $b"; done
echo "FILE $(basename $f)"
docker exec mysql sh -c "$M -e 'DROP DATABASE tmp_wd_restore'" 2>/dev/null`;
  const out = ssh(script).split('\n');
  const rows = out.filter((l) => /^(topics|levels|vocabularies|word_reports|game_config) /.test(l)).map((l) => l.split(' '));
  const same = rows.length === 5 && rows.every((r) => r[1] === r[2] && r[2] !== '');
  rec('AC-11.7 (BR40)', same, `khôi phục ${out.find((l) => l.startsWith('FILE'))?.slice(5)} vào database tạm rồi xóa: ${rows.map((r) => `${r[0]} ${r[1]}=${r[2]}`).join(', ')}`);
}

// ---------------------------------------------------------------- nhóm hub: giao diện hub ở trình duyệt thật (ngăn xếp node :3200/:3300)
async function hubGroup() {
  const PW = 'Bitwarden-Sinh!Ra#Mat$Khau^Rat&Dai*2026';
  const post = async (path, body, cookie) => { const r = await fetch(`${HUB}/api${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: HUB, ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => null), cookie: r.headers.get('set-cookie')?.split(';')[0] }; };
  const b = await post('/setup/begin', { setupToken: readFileSync('/tmp/hub-dev/setup-token', 'utf8').trim(), username: 'chungcake69', password: PW });
  const totp = (secret) => new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30, algorithm: 'SHA1' }).generate();
  const cookie = (await post('/setup/confirm', { username: 'chungcake69', code: totp(b.json.secret) })).cookie;
  await post('/games', { gameKey: 'worddefender', name: 'WordDefender', baseUrl: HUB_GAME, token: HUB_TOKEN }, cookie);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const [n, v] = cookie.split('=');
  await ctx.addCookies([{ name: n, value: v, domain: '127.0.0.1', path: '/' }]);
  const page = await ctx.newPage();
  // AC-04.10: game trả hợp đồng sai phiên bản → cảnh báo, không dựng bảng
  await page.route('**/api/games/worddefender/admin/meta', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ game: { key: 'worddefender', name: 'WordDefender', version: '9' }, contractVersion: 2, resources: [] }) }));
  await page.goto(`${HUB}/g/worddefender`);
  await page.getByRole('alert').waitFor();
  const alert = await page.getByRole('alert').innerText();
  rec('AC-04.10 (E4)', /phiên bản 2/.test(alert) && (await page.locator('table').count()) === 0, `cảnh báo hiện: "${alert.slice(0, 70)}..."; số bảng dựng: ${await page.locator('table').count()}`);
  await page.unroute('**/api/games/worddefender/admin/meta');
  // AC-08.5: trang trạng thái không có nút bật/tắt/khởi động lại
  await page.goto(`${HUB}/`);
  await page.getByText('Đang chạy').first().waitFor();
  const buttons = (await page.getByRole('button').allInnerTexts()).join(' | ');
  rec('AC-08.5 (giao diện)', !/Bật|Tắt|Khởi động|Dừng|Restart|Start|Stop/i.test(buttons.replace('Đăng xuất', '')), `các nút trên trang Trạng thái: ${buttons}`);
  // AC-08.2: dừng game, thẻ tự chuyển "Không phản hồi" không cần tải lại
  const pid = readFileSync('/tmp/hub-dev/wd.pid', 'utf8').trim();
  process.kill(Number(pid));
  const t0 = Date.now();
  let flipped = false;
  try { await page.getByText('Không phản hồi').first().waitFor({ timeout: 50000 }); flipped = true; } catch { /* hết hạn */ }
  rec('AC-08.2', flipped, `dừng WordDefender: thẻ chuyển "Không phản hồi" sau ${((Date.now() - t0) / 1000).toFixed(0)}s mà không tải lại trang`);
  // AC-03.14: lệnh reset-totp thật (chạy lệnh trong tiến trình hub giống `docker exec`): mã cũ hết dùng, mã mới dùng được
  const env = { ...process.env, DATABASE_URL: 'mysql://root:devroot@127.0.0.1:33061/hub_dev', HUB_ORIGIN: HUB, COOKIE_SECURE: 'false', HUB_MASTER_KEY_FILE: '/tmp/hub-dev/master.key', HUB_SETUP_TOKEN_FILE: '/tmp/hub-dev/setup-token' };
  const cli = sh('node', [`${REPO}/admin-hub/dist/cli/reset-totp.js`], { env, cwd: `${REPO}/admin-hub` });
  const newSecret = /Khóa nhập tay vào Authenticator: (\S+)/.exec(cli)?.[1];
  await sleep(31000); // sang bước 30 giây mới để mã không trùng bước đã dùng lúc thiết lập
  const login = async (secret) => { const s1 = await post('/auth/login', { username: 'chungcake69', password: PW }); return (await post('/auth/totp', { challenge: s1.json?.challenge, code: totp(secret) })).status; };
  const oldCode = await login(b.json.secret);
  const newCode = newSecret ? await login(newSecret) : 0;
  const stale = await fetch(`${HUB}/api/auth/me`, { headers: { Cookie: cookie } });
  rec('AC-03.14', !!newSecret && oldCode === 401 && newCode === 200 && stale.status === 401, `lệnh in khóa mới; mã điện thoại cũ → ${oldCode}; mã mới → ${newCode}; phiên cũ → ${stale.status}`);
  await ctx.close();
}

try {
  if (groups.has('game')) await gameGroup();
  if (groups.has('ops')) await opsGroup();
  if (groups.has('vps')) await vpsGroup();
  if (groups.has('hub')) await hubGroup();
} catch (e) {
  rec('SUITE', false, `lỗi chạy bộ test: ${e.message.split('\n')[0]}`);
} finally {
  await browser.close();
  writeFileSync(new URL(`./results-${[...groups].join('-')}.json`, import.meta.url), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  const bad = results.filter((r) => r.status !== 'PASS').length;
  console.log(`\n${results.length - bad}/${results.length} đạt`);
  process.exit(bad ? 1 : 0);
}
