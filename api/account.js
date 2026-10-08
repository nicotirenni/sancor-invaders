// Cuentas de Drones Invasores: con Google o con mail + contraseña, y un nick opcional (el nombre público del ranking).
// Guardan el álbum en la nube y reservan el nick en el ranking. El mail nunca se devuelve a otros jugadores.
const crypto = require('crypto');
const { redis, ready, cleanName, nickKey, acctKey, ipOf, bodyOf, userOfToken } = require('./_redis');
const YEAR = 365 * 24 * 3600, TILES = 9;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '673518924318-4ht3mfa852s6vh3q84jfukul79oae93k.apps.googleusercontent.com';
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

const hash = (pass, salt) => crypto.scryptSync(String(pass), salt, 32).toString('hex');
function cleanProgress(p) { // solo se guarda lo que el juego usa, con límites
  p = p && typeof p === 'object' ? p : {};
  const got = Array.from({ length: TILES }, (_, i) => !!(Array.isArray(p.got) && p.got[i]));
  const n = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
  const pend = [...new Set((Array.isArray(p.pend) ? p.pend : []).map(Number))].filter(i => Number.isInteger(i) && i >= 0 && i < TILES && !got[i]);
  return { got, pend, drones: n(p.drones, 1e6), powers: n(p.powers, 1e6), best: n(p.best, 2e6) };
}
function merge(a, b) { // nunca se pierde nada: une figuritas y se queda con los máximos
  a = cleanProgress(a); b = cleanProgress(b);
  const got = a.got.map((g, i) => g || b.got[i]);
  return cleanProgress({ got, pend: [...a.pend, ...b.pend], drones: Math.max(a.drones, b.drones), powers: Math.max(a.powers, b.powers), best: Math.max(a.best, b.best) });
}
async function newToken(key) { const t = crypto.randomBytes(24).toString('base64url'); await redis([['SET', 'sancor:tok:' + t, key, 'EX', YEAR]]); return t; }
const getUser = async key => { const [raw] = await redis([['GET', key]]); return raw ? JSON.parse(raw) : null; };
const putUser = (key, u) => redis([['SET', key, JSON.stringify(u)]]);
const out = async (key, u, extra = {}) => ({ token: await newToken(key), nick: u.nick, email: u.email, google: !!u.google, progress: cleanProgress(u.progress), ...extra });

async function claimNick(nick, key) { // reserva el nick para la cuenta; true si quedó suyo
  const [ok] = await redis([['SET', nickKey(nick), key, 'NX']]);
  if (ok) return true;
  const [owner] = await redis([['GET', nickKey(nick)]]); return owner === key;
}
async function autoNick(base, key) { // nick por defecto a partir del mail o del nombre de Google; si está tomado, le suma números
  base = cleanName(String(base || '').replace(/[^\p{L}\p{N} _.-]/gu, '')).slice(0, 12) || 'Jugador';
  if (base.length < 2) base = 'Jugador';
  if (await claimNick(base, key)) return base;
  for (let i = 0; i < 8; i++) { const n = base + Math.floor(10 + Math.random() * 990); if (await claimNick(n, key)) return n; }
  return null;
}
async function verifyGoogle(credential) { // valida el ID token de Google con Google
  if (typeof credential !== 'string' || credential.length > 4096) return null;
  const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential));
  if (!r.ok) return null;
  const t = await r.json();
  const okIss = t.iss === 'accounts.google.com' || t.iss === 'https://accounts.google.com';
  if (t.aud !== GOOGLE_CLIENT_ID || !okIss || String(t.email_verified) !== 'true' || !t.email || Number(t.exp) * 1000 < Date.now()) return null;
  return { email: String(t.email).toLowerCase(), sub: String(t.sub), name: t.given_name || t.name || '' };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!ready()) return res.status(501).json({ error: 'cuentas no disponibles' });
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'método no permitido' }); }
  try {
    const b = bodyOf(req), action = b.action;
    if (['register', 'login', 'google'].includes(action)) {
      const ip = ipOf(req);
      const [tries] = await redis([['INCR', `sancor:rl:acc:${ip}`], ['EXPIRE', `sancor:rl:acc:${ip}`, 3600]]);
      if (tries > 40) return res.status(429).json({ error: 'Demasiados intentos. Probá en un rato.' });
    }
    if (action === 'google') {
      const g = await verifyGoogle(b.credential);
      if (!g) return res.status(401).json({ error: 'No se pudo validar tu cuenta de Google. Probá de nuevo.' });
      const key = acctKey(g.email); let u = await getUser(key), isNew = false;
      if (!u) {
        isNew = true;
        u = { email: g.email, google: g.sub, nick: null, progress: cleanProgress(b.progress), created: Date.now() };
        await putUser(key, u); u.nick = await autoNick(g.name || g.email.split('@')[0], key);
      } else { u.google = g.sub; u.progress = merge(u.progress, b.progress); }
      await putUser(key, u);
      return res.status(200).json(await out(key, u, { isNew }));
    }
    if (action === 'register' || action === 'login') {
      const email = String(b.email || '').trim().toLowerCase(), pass = String(b.pass || '');
      if (!EMAIL_RE.test(email) || email.length > 254) return res.status(400).json({ error: 'Revisá el mail: parece que no es válido.' });
      if (pass.length < 6 || pass.length > 64) return res.status(400).json({ error: 'La contraseña tiene que tener entre 6 y 64 caracteres.' });
      const key = acctKey(email);
      if (action === 'register') {
        const salt = crypto.randomBytes(16).toString('hex');
        const u = { email, salt, hash: hash(pass, salt), nick: null, progress: cleanProgress(b.progress), created: Date.now() };
        const [ok] = await redis([['SET', key, JSON.stringify(u), 'NX']]);
        if (!ok) return res.status(409).json({ error: 'Ese mail ya tiene cuenta. Tocá "Entrar".' });
        const want = cleanName(b.nick);
        u.nick = (want.length >= 2 && await claimNick(want, key)) ? want : await autoNick(email.split('@')[0], key);
        await putUser(key, u);
        return res.status(200).json(await out(key, u, { isNew: true, nickTaken: want.length >= 2 && u.nick !== want }));
      }
      const u = await getUser(key), bad = () => res.status(401).json({ error: 'Mail o contraseña incorrectos.' });
      if (!u) return res.status(404).json({ notFound: true });   // mail sin cuenta: el juego ofrece crearla
      if (!u.hash) return res.status(401).json({ error: 'Esa cuenta se creó con Google: tocá "Continuar con Google".' });
      const a = Buffer.from(hash(pass, u.salt), 'hex'), c = Buffer.from(u.hash, 'hex');
      if (a.length !== c.length || !crypto.timingSafeEqual(a, c)) return bad();
      u.progress = merge(u.progress, b.progress); await putUser(key, u);
      return res.status(200).json(await out(key, u));
    }
    if (['sync', 'me', 'nick'].includes(action)) {
      const key = await userOfToken(b.token);
      if (!key) return res.status(401).json({ error: 'Sesión vencida. Volvé a iniciar sesión.' });
      const u = await getUser(key); if (!u) return res.status(401).json({ error: 'La cuenta no existe.' });
      if (action === 'nick') {
        const want = cleanName(b.nick);
        if (want.length < 2) return res.status(400).json({ error: 'El nick tiene que tener al menos 2 letras.' });
        if (want.toLowerCase() !== String(u.nick || '').toLowerCase()) {
          if (!(await claimNick(want, key))) return res.status(409).json({ error: 'Ese nick ya lo usa otra persona. Probá con otro.' });
          if (u.nick) await redis([['DEL', nickKey(u.nick)]]);
        }
        u.nick = want; await putUser(key, u);
      }
      if (action === 'sync') { u.progress = merge(u.progress, b.progress); await putUser(key, u); }
      return res.status(200).json({ nick: u.nick, email: u.email, google: !!u.google, progress: cleanProgress(u.progress) });
    }
    if (action === 'logout') { if (typeof b.token === 'string') await redis([['DEL', 'sancor:tok:' + b.token]]); return res.status(200).json({ ok: true }); }
    return res.status(400).json({ error: 'acción inválida' });
  } catch (e) {
    return res.status(502).json({ error: 'No se pudo conectar. Probá de nuevo.' });
  }
};
