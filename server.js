'use strict';
// Minigames Hub server: accounts, friends, chat and the website itself.
// No dependencies. Needs Node 18 or newer.  Start with:  node server.js
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const PORT = process.env.PORT || 3000;
const DIR = process.env.DATA_DIR || __dirname;
const FILE = path.join(DIR, 'data.json');
const OWNER = (process.env.OWNER_NAME || '').trim().toLowerCase();

const RURL = (process.env.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/$/, '');
const RTOK = (process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
const REMOTE = !!(RURL && RTOK);   // true = save to Upstash Redis, so accounts survive restarts
const KEY = 'minigames-hub-db';
const rcmd = async cmd => {
  const r = await fetch(RURL, { method: 'POST', headers: { Authorization: 'Bearer ' + RTOK, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || 'HTTP ' + r.status);
  return j.result;
};

let db = { users: {}, tokens: {}, chats: {}, reads: {}, groups: {}, gchats: {}, mid: 0 };
async function init() {
  await loadDb();
  if (!db.vapid) {   // keys that let the server send "incoming call" alerts to phones and laptops
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const j = publicKey.export({ format: 'jwk' });
    db.vapid = { priv: privateKey.export({ type: 'pkcs8', format: 'pem' }), pub: b64u(Buffer.concat([Buffer.from([4]), unb64u(j.x), unb64u(j.y)])) };
    save();
  }
}
async function loadDb() {
  if (REMOTE) {
    // If this fails we stop on purpose, so we never overwrite saved data with an empty copy.
    const v = await rcmd(['GET', KEY]);
    if (v) db = Object.assign(db, JSON.parse(v));
    console.log('Saving to Upstash Redis: accounts survive restarts.');
  } else {
    try { db = Object.assign(db, JSON.parse(fs.readFileSync(FILE, 'utf8'))); } catch (e) {}
    console.log('Saving to a local file. If your host wipes files on restart, accounts will be lost.');
  }
}
let dirty = false, saving = false;
const save = () => { dirty = true; };
function trim() {   // keeps the saved copy under 1 MB
  const keys = Object.keys(db.tokens);
  if (keys.length > 3000) keys.slice(0, keys.length - 3000).forEach(k => delete db.tokens[k]);
  let s = JSON.stringify(db);
  for (const keep of [300, 150, 60, 20]) {
    if (s.length < 900000) break;
    for (const k in db.chats) db.chats[k] = db.chats[k].slice(-keep);
    for (const k in db.gchats) db.gchats[k] = db.gchats[k].slice(-keep);
    s = JSON.stringify(db);
  }
  if (s.length > 950000) console.error('Warning: saved data is ' + s.length + ' bytes, close to the 1 MB limit of the free database.');
  return s;
}
async function flush() {
  if (!dirty || saving) return;
  dirty = false; saving = true;
  try {
    const s = trim();
    if (REMOTE) await rcmd(['SET', KEY, s]);
    else { fs.writeFileSync(FILE + '.tmp', s); fs.renameSync(FILE + '.tmp', FILE); }
  } catch (e) { dirty = true; console.error('Could not save data:', e.message); }
  saving = false;
}
setInterval(flush, +process.env.SAVE_EVERY_MS || (REMOTE ? 10000 : 2000));
['SIGTERM', 'SIGINT'].forEach(sg => process.on(sg, async () => {
  await Promise.race([flush(), new Promise(r => setTimeout(r, 4000))]);
  process.exit(0);
}));

const scrypt = (p, s) => new Promise((ok, no) => crypto.scrypt(p, s, 32, (e, k) => e ? no(e) : ok(k.toString('hex'))));
const byName = n => Object.values(db.users).find(u => u.name.toLowerCase() === String(n || '').trim().toLowerCase());
const NAME = /^[\p{L}\p{N}_. -]{2,20}$/u;
const isOwner = u => !!OWNER && u.name.toLowerCase() === OWNER;
const me = u => ({ name: u.name, bio: u.bio, best: u.best, owner: isOwner(u), avatar: u.avatar || '' });
const total = u => Object.values(u.best).reduce((a, b) => a + b, 0);
const AV_OK = x => {
  if (typeof x !== 'string' || x.length > 12000 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(x)) return false;
  const b = Buffer.from(x.split(',')[1], 'base64');
  return (b[0] === 0xFF && b[1] === 0xD8) || (b[0] === 0x89 && b[1] === 0x50) || (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP');
};
const pair = (a, b) => [a, b].sort().join('|');
// people who added this user as a friend but haven't been added back yet
const incoming = u => Object.values(db.users).filter(x => x.id !== u.id && x.friends.includes(u.id) && !u.friends.includes(x.id));
const blocks = (a, b) => (a.blocked || []).includes(b.id);   // has a blocked b?
// everyone this user has a direct message thread with
const partners = u => Object.keys(db.chats).filter(k => db.chats[k].length && k.split('|').includes(u.id))
  .map(k => db.users[k.split('|').find(i => i !== u.id)]).filter(Boolean);
// unread chat messages for a user: one entry per person who wrote since the chat was last opened
const unreadFor = u => partners(u).filter(f => !blocks(u, f)).map(f => {
  const k = pair(u.id, f.id), r = db.reads[k + ':' + u.id] || 0;
  const ms = (db.chats[k] || []).filter(x => x.f === f.id && x.id > r);
  return ms.length ? { name: f.name, count: ms.length, text: ms[ms.length - 1].t.slice(0, 80), id: ms[ms.length - 1].id } : null;
}).filter(Boolean);
// unread group messages for a user: one entry per group
const unreadGroups = u => Object.values(db.groups).filter(g => g.members.includes(u.id)).map(g => {
  const r = db.reads['g:' + g.id + ':' + u.id] || 0;
  const ms = (db.gchats[g.id] || []).filter(x => x.f !== u.id && x.id > r);
  if (!ms.length) return null;
  const l = ms[ms.length - 1], who = db.users[l.f];
  return { gid: g.id, name: g.name, count: ms.length, text: (who ? who.name : '?') + ': ' + l.t.slice(0, 80), id: l.id };
}).filter(Boolean);

const hits = {}, lastMsg = new Map(), mail = new Map();
const limited = ip => {
  const now = Date.now();
  const h = hits[ip] = (hits[ip] && hits[ip].r > now) ? hits[ip] : { n: 0, r: now + 60000 };
  return ++h.n > 20;
};
setInterval(() => { const n = Date.now(); for (const k in hits) if (hits[k].r < n) delete hits[k]; }, 60000);

// <push-crypto>
const b64u = b => Buffer.from(b).toString('base64url');
const unb64u = x => Buffer.from(String(x), 'base64url');
// Web Push message encryption (RFC 8291, aes128gcm). "test" lets a test fix the random parts.
function encryptPush(sub, text, test) {
  const uaPub = unb64u(sub.p256dh), auth = unb64u(sub.auth);
  const ecdh = crypto.createECDH('prime256v1');
  if (test && test.priv) ecdh.setPrivateKey(test.priv); else ecdh.generateKeys();
  const asPub = ecdh.getPublicKey();
  const secret = ecdh.computeSecret(uaPub);
  const salt = (test && test.salt) || crypto.randomBytes(16);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', secret, auth, Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub]), 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const enc = Buffer.concat([c.update(Buffer.concat([Buffer.from(text), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const hdr = Buffer.alloc(21); salt.copy(hdr, 0); hdr.writeUInt32BE(4096, 16); hdr[20] = 65;
  return Buffer.concat([hdr, asPub, enc]);
}
// </push-crypto>
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@minigames-hub.example';
const PUSH_HOSTS = ['.googleapis.com', '.mozilla.com', '.push.apple.com', '.windows.com'];   // only real push services
function vapidHeader(endpoint) {
  const h = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const p = b64u(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: VAPID_SUBJECT }));
  const sig = crypto.sign('sha256', Buffer.from(h + '.' + p), { key: crypto.createPrivateKey(db.vapid.priv), dsaEncoding: 'ieee-p1363' });
  return 'vapid t=' + h + '.' + p + '.' + b64u(sig) + ', k=' + db.vapid.pub;
}
async function pushTo(t, msg) {   // fire and forget: a failed alert never breaks the app
  if (!t || !t.subs || !t.subs.length) return;
  const body = JSON.stringify(msg);
  await Promise.all(t.subs.map(async sub => {
    try {
      const r = await fetch(sub.endpoint, {
        method: 'POST',
        headers: { Authorization: vapidHeader(sub.endpoint), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: String(msg.call ? 45 : 3600), Urgency: msg.call ? 'high' : 'normal' },
        body: encryptPush(sub, body), signal: AbortSignal.timeout(8000)
      });
      if (r.status === 404 || r.status === 410) { t.subs = t.subs.filter(x => x.endpoint !== sub.endpoint); save(); }
      else if (!r.ok) console.error('Push failed:', r.status);
    } catch (e) { console.error('Push error:', e.message); }
  }));
}
const ringing = new Map();   // callee id -> who is ringing them (to send a "missed call" alert)

class E extends Error { constructor(c, m) { super(m); this.c = c; } }
const send = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(obj));
};
const body = req => new Promise((ok, no) => {
  let s = '';
  req.on('data', c => { s += c; if (s.length > 20000) { no(new E(400, 'Request too big')); req.destroy(); } });
  req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { no(new E(400, 'Bad request')); } });
});

async function route(req, res, url) {
  const p = url.pathname, m = req.method;
  const FILES = {
    '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json'],
    '/sw.js': ['sw.js', 'application/javascript; charset=utf-8'],
    '/icon-192.png': ['icon-192.png', 'image/png'],
    '/icon-512.png': ['icon-512.png', 'image/png'],
    '/apple-touch-icon.png': ['apple-touch-icon.png', 'image/png']
  };
  if (m === 'GET' && FILES[p]) {
    res.writeHead(200, { 'Content-Type': FILES[p][1], 'Cache-Control': p === '/sw.js' ? 'no-cache' : 'public, max-age=86400' });
    return res.end(fs.readFileSync(path.join(__dirname, 'public', FILES[p][0])));
  }
  if (m === 'GET' && (p === '/' || p === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(path.join(__dirname, 'public', 'index.html')));
  }
  if (!p.startsWith('/api/')) throw new E(404, 'Not found');
  if (p === '/api/ping') return send(res, 200, { ok: true });
  if (p === '/api/top') {
    const g = String(url.searchParams.get('game') || '').slice(0, 20);
    const rows = Object.values(db.users).filter(x => x.best[g] > 0)
      .sort((a, b) => b.best[g] - a.best[g]).slice(0, 10)
      .map(x => ({ name: x.name, score: x.best[g], owner: isOwner(x) }));
    return send(res, 200, { rows });
  }
  const b = m === 'POST' ? await body(req) : {};
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

  if (p === '/api/signup' || p === '/api/login') {
    if (limited(ip)) throw new E(429, 'Too many tries. Wait a minute and try again.');
    const name = String(b.name || '').trim(), pw = String(b.password || '');
    if (!NAME.test(name)) throw new E(400, 'Username must be 2 to 20 letters, numbers, spaces or . _ -');
    if (pw.length < 4 || pw.length > 64) throw new E(400, 'Password must be 4 to 64 characters.');
    let u = byName(name);
    if (p === '/api/signup') {
      if (u) throw new E(409, 'That username is taken.');
      const salt = crypto.randomBytes(16).toString('hex'), id = crypto.randomBytes(8).toString('hex');
      u = db.users[id] = { id, name, salt, hash: await scrypt(pw, salt), bio: String(b.bio || '').slice(0, 120), friends: [], best: {} };
    } else if (!u || !crypto.timingSafeEqual(Buffer.from(await scrypt(pw, u.salt)), Buffer.from(u.hash))) {
      throw new E(401, 'Wrong username or password.');
    }
    const token = crypto.randomBytes(32).toString('hex');
    db.tokens[token] = u.id; save();
    return send(res, 200, { token, me: me(u) });
  }

  const tok = (req.headers.authorization || '').replace('Bearer ', '');
  const u = db.users[db.tokens[tok]];
  if (!u) throw new E(401, 'Please sign in again.');

  if (p === '/api/me') return send(res, 200, { me: me(u) });
  if (p === '/api/best') {
    const g = String(b.game || '').slice(0, 20), s = Number(b.score);
    if (!g || !Number.isFinite(s) || s < 0 || s > 1e7) throw new E(400, 'Bad score');
    if (s > (u.best[g] || 0)) { u.best[g] = Math.floor(s); save(); }
    return send(res, 200, { ok: true });
  }
  if (p === '/api/profile') { u.bio = String(b.bio || '').slice(0, 120); save(); return send(res, 200, { me: me(u) }); }
  if (p === '/api/rename') {
    const name = String(b.name || '').trim();
    if (!NAME.test(name)) throw new E(400, 'Username must be 2 to 20 letters, numbers, spaces or . _ -');
    const o = byName(name);
    if (o && o.id !== u.id) throw new E(409, 'That username is taken.');
    u.name = name; save();
    return send(res, 200, { me: me(u) });
  }
  if (p === '/api/friends' && m === 'GET') {
    const un = Object.fromEntries(unreadFor(u).map(x => [x.name, x.count]));
    const friends = u.friends.map(id => db.users[id]).filter(Boolean)
      .map(f => ({ name: f.name, bio: f.bio, total: total(f), owner: isOwner(f), mutual: f.friends.includes(u.id), unread: un[f.name] || 0, avatar: f.avatar || '' }));
    return send(res, 200, { friends, requests: incoming(u).map(x => ({ name: x.name, bio: x.bio, owner: isOwner(x), avatar: x.avatar || '' })) });
  }
  if (p === '/api/friends/add') {
    const t = byName(b.name);
    if (!t) throw new E(404, 'No player with that username.');
    if (t.id === u.id) throw new E(400, 'That\u2019s you!');
    if (u.friends.includes(t.id)) throw new E(400, 'Already your friend.');
    if (u.friends.length >= 100) throw new E(400, 'Friend list is full.');
    u.friends.push(t.id); save();
    if (!t.friends.includes(u.id)) pushTo(t, { title: '\uD83D\uDC4B Friend request', body: u.name + ' wants to be your friend', tag: 'req-' + u.id });
    return send(res, 200, { name: t.name, mutual: t.friends.includes(u.id) });
  }
  if (p === '/api/friends/remove') {
    const t = byName(b.name);
    if (t) { u.friends = u.friends.filter(i => i !== t.id); save(); }
    return send(res, 200, { ok: true });
  }
  if (p === '/api/friends/decline') {
    const t = byName(b.name);
    if (t && t.friends.includes(u.id)) { t.friends = t.friends.filter(i => i !== u.id); save(); }
    return send(res, 200, { ok: true });
  }
  if (p === '/api/dms') {   // inbox: newest conversation first
    const un = Object.fromEntries(unreadFor(u).map(x => [x.name, x.count]));
    const dms = partners(u).map(f => { const l = db.chats[pair(u.id, f.id)].slice(-1)[0];
      return { name: f.name, avatar: f.avatar || '', owner: isOwner(f), text: l.t.slice(0, 60), mine: l.f === u.id, id: l.id, unread: un[f.name] || 0, blocked: blocks(u, f) }; })
      .sort((a, b) => b.id - a.id);
    return send(res, 200, { dms });
  }
  if (p === '/api/block') {
    const t = byName(b.name);
    if (!t || t.id === u.id) throw new E(404, 'No player with that username.');
    u.blocked = (u.blocked || []).filter(i => i !== t.id);
    if (b.on) u.blocked.push(t.id);
    save();
    return send(res, 200, { ok: true });
  }
  if (p === '/api/chat') {
    const t = byName(m === 'GET' ? url.searchParams.get('with') : b.to);
    if (!t) throw new E(404, 'No player with that username.');
    if (t.id === u.id) throw new E(400, 'That\u2019s you!');
    if (m === 'POST' && blocks(u, t)) throw new E(403, 'Unblock this player to message them.');
    if (m === 'POST' && blocks(t, u)) throw new E(403, 'You can\u2019t message this player.');
    const k = pair(u.id, t.id), th = db.chats[k] || [];
    if (m === 'POST') {
      const text = String(b.text || '').trim().slice(0, 300);
      if (!text) throw new E(400, 'Empty message');
      if (Date.now() - (lastMsg.get(u.id) || 0) < 400) throw new E(429, 'Slow down a little.');
      lastMsg.set(u.id, Date.now());
      db.chats[k] = th;
      th.push({ id: ++db.mid, f: u.id, t: text, ts: Date.now() });
      pushTo(t, { title: '\uD83D\uDCAC ' + u.name, body: text.slice(0, 100), tag: 'chat-' + u.id });
      if (th.length > 500) th.splice(0, th.length - 500);
      save();
      return send(res, 200, { ok: true });
    }
    const last = th.length ? th[th.length - 1].id : 0;   // opening the chat counts as reading it
    if ((db.reads[k + ':' + u.id] || 0) < last) { db.reads[k + ':' + u.id] = last; save(); }
    return send(res, 200, { blocked: blocks(u, t), msgs: th.slice(-100).map(x => ({ id: x.id, mine: x.f === u.id, t: x.t, ts: x.ts })) });
  }
  if (p === '/api/push/key') return send(res, 200, { key: db.vapid.pub });
  if (p === '/api/push/subscribe') {
    const sb = b.sub || {}, k = sb.keys || {};
    const ep = String(sb.endpoint || ''), p256 = String(k.p256dh || ''), au = String(k.auth || '');
    let host = '';
    try { host = new URL(ep).hostname; } catch (e) {}
    if (!ep.startsWith('https://') || ep.length > 700 || !PUSH_HOSTS.some(h => host.endsWith(h))) throw new E(400, 'Unsupported alert service');
    if (unb64u(p256).length !== 65 || unb64u(au).length < 16 || au.length > 100) throw new E(400, 'Bad subscription');
    Object.values(db.users).forEach(x => { if (x.subs) x.subs = x.subs.filter(y => y.endpoint !== ep); });   // one device, one account
    u.subs = (u.subs || []).concat([{ endpoint: ep, p256dh: p256, auth: au }]).slice(-5);
    save();
    return send(res, 200, { ok: true });
  }
  if (p === '/api/push/unsubscribe') {
    u.subs = (u.subs || []).filter(y => y.endpoint !== String(b.endpoint || '')); save();
    return send(res, 200, { ok: true });
  }
  if (p === '/api/avatar') {
    const a = String(b.avatar || '');
    if (a && !AV_OK(a)) throw new E(400, 'That picture can\u2019t be used. Try another photo.');
    u.avatar = a; save();
    return send(res, 200, { me: me(u) });
  }

  // ----- groups -----
  const gOf = id => { const g = db.groups[String(id || '')]; if (!g || !g.members.includes(u.id)) throw new E(404, 'Group not found.'); return g; };
  const mutual = t => !!t && u.friends.includes(t.id) && t.friends.includes(u.id);
  const gInfo = (g, full) => Object.assign({ id: g.id, name: g.name, bio: g.bio, avatar: g.avatar || '', owner: g.owner === u.id, count: g.members.length },
    full ? { members: g.members.map(id => db.users[id]).filter(Boolean).map(x => ({ name: x.name, avatar: x.avatar || '', isOwner: x.id === g.owner })) } : {});
  const gName = x => { const n = String(x || '').trim(); if (n.length < 1 || n.length > 30) throw new E(400, 'Group name must be 1 to 30 characters.'); return n; };
  const gNotify = (g, ids, msg) => ids.forEach(id => pushTo(db.users[id], Object.assign({ tag: 'g-' + g.id }, msg)));
  if (p === '/api/groups' && m === 'GET') {
    const un = Object.fromEntries(unreadGroups(u).map(x => [x.gid, x.count]));
    return send(res, 200, { groups: Object.values(db.groups).filter(g => g.members.includes(u.id)).map(g => Object.assign(gInfo(g), { unread: un[g.id] || 0 })) });
  }
  if (p === '/api/groups/create') {
    const name = gName(b.name), bio = String(b.bio || '').trim().slice(0, 120), av = String(b.avatar || '');
    if (av && !AV_OK(av)) throw new E(400, 'That picture can\u2019t be used. Try another photo.');
    if (Object.values(db.groups).filter(g => g.members.includes(u.id)).length >= 200) throw new E(400, 'You\u2019re in the maximum number of groups (200).');
    const ids = [];
    for (const n of (Array.isArray(b.members) ? b.members : []).slice(0, 49)) {
      const t = byName(n);
      if (!mutual(t)) throw new E(400, 'You can only add friends who have added you back.');
      if (!ids.includes(t.id)) ids.push(t.id);
    }
    const id = crypto.randomBytes(6).toString('hex');
    const g = db.groups[id] = { id, name, bio, avatar: av, owner: u.id, members: [u.id].concat(ids), created: Date.now() };
    db.gchats[id] = []; save();
    gNotify(g, ids, { title: '\uD83D\uDC65 New group', body: u.name + ' added you to ' + name });
    return send(res, 200, { group: gInfo(g, true) });
  }
  if (p === '/api/group' && m === 'GET') return send(res, 200, { group: gInfo(gOf(url.searchParams.get('id')), true) });
  if (p === '/api/group/update') {
    const g = gOf(b.id);
    if (g.owner !== u.id) throw new E(403, 'Only the group owner can change the group.');
    if (b.name !== undefined) g.name = gName(b.name);
    if (b.bio !== undefined) g.bio = String(b.bio || '').trim().slice(0, 120);
    if (b.avatar !== undefined) { const av = String(b.avatar || ''); if (av && !AV_OK(av)) throw new E(400, 'That picture can\u2019t be used. Try another photo.'); g.avatar = av; }
    save();
    return send(res, 200, { group: gInfo(g, true) });
  }
  if (p === '/api/group/add') {
    const g = gOf(b.id), t = byName(b.name);
    if (!mutual(t)) throw new E(400, 'You can only add friends who have added you back.');
    if (g.members.includes(t.id)) throw new E(400, 'Already in the group.');
    if (g.members.length >= 50) throw new E(400, 'The group is full (50 members).');
    g.members.push(t.id); save();
    gNotify(g, [t.id], { title: '\uD83D\uDC65 New group', body: u.name + ' added you to ' + g.name });
    return send(res, 200, { group: gInfo(g, true) });
  }
  if (p === '/api/group/remove') {
    const g = gOf(b.id), t = byName(b.name);
    if (g.owner !== u.id) throw new E(403, 'Only the group owner can remove people.');
    if (!t || t.id === u.id || !g.members.includes(t.id)) throw new E(400, 'Can\u2019t remove that person.');
    g.members = g.members.filter(x => x !== t.id); delete db.reads['g:' + g.id + ':' + t.id]; save();
    return send(res, 200, { group: gInfo(g, true) });
  }
  if (p === '/api/group/leave') {
    const g = gOf(b.id);
    g.members = g.members.filter(x => x !== u.id); delete db.reads['g:' + g.id + ':' + u.id];
    if (!g.members.length) { delete db.groups[g.id]; delete db.gchats[g.id]; }
    else if (g.owner === u.id) g.owner = g.members[0];   // the longest-standing member takes over
    save();
    return send(res, 200, { ok: true });
  }
  if (p === '/api/group/chat') {
    const g = gOf(m === 'GET' ? url.searchParams.get('id') : b.id), th = db.gchats[g.id] = db.gchats[g.id] || [];
    if (m === 'POST') {
      const text = String(b.text || '').trim().slice(0, 300);
      if (!text) throw new E(400, 'Empty message');
      if (Date.now() - (lastMsg.get(u.id) || 0) < 400) throw new E(429, 'Slow down a little.');
      lastMsg.set(u.id, Date.now());
      th.push({ id: ++db.mid, f: u.id, t: text, ts: Date.now() });
      if (th.length > 500) th.splice(0, th.length - 500);
      save();
      gNotify(g, g.members.filter(x => x !== u.id), { title: '\uD83D\uDCAC ' + g.name, body: u.name + ': ' + text.slice(0, 100) });
      return send(res, 200, { ok: true });
    }
    const last = th.length ? th[th.length - 1].id : 0, rk = 'g:' + g.id + ':' + u.id;
    if ((db.reads[rk] || 0) < last) { db.reads[rk] = last; save(); }
    return send(res, 200, { group: gInfo(g), msgs: th.slice(-100).map(x => { const w = db.users[x.f]; return { id: x.id, from: w ? w.name : 'Former member', mine: x.f === u.id, t: x.t, ts: x.ts }; }) });
  }
  if (p === '/api/call/send') {
    const t = byName(b.to);
    if (!t || !u.friends.includes(t.id) || !t.friends.includes(u.id)) throw new E(403, 'You can call once you both add each other.');
    if (blocks(u, t) || blocks(t, u)) throw new E(403, 'You can\u2019t call this player.');
    const type = String(b.type || '');
    if (!['offer', 'answer', 'ice', 'hangup', 'decline'].includes(type)) throw new E(400, 'Bad call message');
    if (JSON.stringify(b.data === undefined ? null : b.data).length > 12000) throw new E(400, 'Call message too big');
    const box = mail.get(t.id) || [];
    box.push({ from: u.name, type, data: b.data === undefined ? null : b.data, ts: Date.now() });
    mail.set(t.id, box.slice(-100));
    if (type === 'offer') {
      ringing.set(t.id, { from: u.id, ts: Date.now() });
      pushTo(t, { title: '\uD83D\uDCDE ' + u.name + ' is calling you', body: 'Tap to answer', call: true, tag: 'call' });
    } else if (type === 'answer' || type === 'decline') ringing.delete(u.id);
    else if (type === 'hangup') {
      const r = ringing.get(t.id);
      if (r && r.from === u.id && Date.now() - r.ts < 60000) {
        ringing.delete(t.id);
        pushTo(t, { title: '\uD83D\uDCF5 Missed call', body: u.name + ' called you', tag: 'call' });
      }
    }
    return send(res, 200, { ok: true });
  }
  if (p === '/api/call/poll') {
    const now = Date.now(), box = (mail.get(u.id) || []).filter(x => now - x.ts < 60000);
    mail.delete(u.id);
    return send(res, 200, { signals: box, requests: incoming(u).slice(0, 50).map(x => x.name), unread: unreadFor(u), gunread: unreadGroups(u) });
  }
  throw new E(404, 'Not found');
}

const server = http.createServer(async (req, res) => {
  try { await route(req, res, new URL(req.url, 'http://x')); }
  catch (e) {
    const c = e.c || 500;
    if (c === 500) console.error(e);
    if (!res.headersSent) send(res, c, { error: c === 500 ? 'Server error' : e.message });
  }
});

init()
  .then(() => server.listen(PORT, () => console.log('Minigames Hub is running on port ' + PORT)))
  .catch(e => { console.error('Could not load saved data, so the server did not start:', e.message); process.exit(1); });
