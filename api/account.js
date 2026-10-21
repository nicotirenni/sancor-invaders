// Cuentas de Drones Invasores: con Google o con mail + contraseña, y un apodo obligatorio y único (el nombre público del ranking).
// Guardan el álbum en la nube y reservan el nick en el ranking. El mail nunca se devuelve a otros jugadores.
const crypto = require('crypto');
const { redis, ready, cleanName, nickKey, acctKey, ipOf, bodyOf, userOfToken } = require('./_redis');
const { sendMail, mailReady } = require('./_mail');
const { codeMailHtml } = require('./_mailtpl');
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
// Historial del Torneo: resumen en la cuenta + las últimas 30 partidas en una lista aparte
const histKey = key => 'sancor:hist:' + key.slice('sancor:acct:'.length);
const cleanStats = st => { st = st && typeof st === 'object' ? st : {}; const n = (v, m) => Math.max(0, Math.min(m, Math.floor(Number(v) || 0)));
  return { games: n(st.games, 1e6), wins: n(st.wins, 1e6), best: n(st.best, 15e5), maxWave: n(st.maxWave, 20), total: n(st.total, 1e12) }; };
const out = async (key, u, extra = {}) => ({ token: await newToken(key), nick: u.nick, email: u.email, google: !!u.google, pass: !!u.hash, progress: cleanProgress(u.progress), ...extra });

// Códigos de confirmación por mail (6 dígitos, vencen en 10 minutos, 5 intentos). Sin clave de Resend no se piden.
const mailId = email => crypto.createHash('sha256').update(email).digest('hex').slice(0, 32);
const codeKey = (purpose, email) => `sancor:code:${purpose}:${mailId(email)}`;
const codeHash = c => crypto.createHash('sha256').update('sancor-code:' + c).digest('hex');
const CODE_ERR = { expired: 'El código venció o no lo pediste. Pedí uno nuevo.', locked: 'Demasiados intentos con ese código. Pedí uno nuevo.', bad: 'El código no es correcto. Revisá el mail.' };
async function checkCode(purpose, email, code, consume) {
  const k = codeKey(purpose, email), [raw] = await redis([['GET', k]]); if (!raw) return 'expired';
  const c = JSON.parse(raw); if (c.tries >= 5) return 'locked';
  const ok = /^\d{6}$/.test(String(code || '')) && crypto.timingSafeEqual(Buffer.from(codeHash(String(code)), 'hex'), Buffer.from(c.h, 'hex'));
  if (!ok) { c.tries++; await redis([['SET', k, JSON.stringify(c), 'KEEPTTL']]); return c.tries >= 5 ? 'locked' : 'bad'; }
  if (consume) await redis([['DEL', k]]);
  return 'ok';
}
const codeMail = (code, purpose, email) => {
  const what = purpose === 'reset' ? 'cambiar tu contraseña' : 'crear tu cuenta';
  return { subject: `Tu código de Drones Invasores: ${code}`,
    text: `Tu código para ${what} en Drones Invasores es ${code}. Vence en 10 minutos. Si no lo pediste, ignorá este mail.`,
    html: codeMailHtml(code, purpose, email) };
};

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
    if (['register', 'login', 'google', 'sendCode', 'checkCode', 'reset'].includes(action)) {
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
    if (action === 'sendCode' || action === 'checkCode') { // pedir o comprobar el código de confirmación
      const email = String(b.email || '').trim().toLowerCase(), purpose = b.purpose === 'reset' ? 'reset' : 'register';
      if (!EMAIL_RE.test(email) || email.length > 254) return res.status(400).json({ error: 'Revisá el mail: parece que no es válido.' });
      if (!mailReady()) return res.status(200).json({ skip: true });   // sin envío de mails configurado: se sigue sin código
      if (action === 'checkCode') { const r = await checkCode(purpose, email, b.code, false); return r === 'ok' ? res.status(200).json({ ok: true }) : res.status(400).json({ error: CODE_ERR[r], reason: r }); }
      const id = mailId(email), [n] = await redis([['INCR', `sancor:rl:code:${id}`], ['EXPIRE', `sancor:rl:code:${id}`, 3600]]);
      if (n > 5) return res.status(429).json({ error: 'Pediste muchos códigos para este mail. Probá en una hora.' });
      const u = await getUser(acctKey(email));
      if (purpose === 'register' && u) return res.status(409).json({ error: 'Ese mail ya tiene cuenta: iniciá sesión con tu contraseña.', emailTaken: true });
      if (purpose === 'reset' && !u) return res.status(404).json({ notFound: true });
      if (purpose === 'reset' && !u.hash) return res.status(400).json({ error: 'Esa cuenta se creó con Google: entrá con "Continuar con Google".' });
      const [free] = await redis([['SET', `sancor:code:cd:${purpose}:${id}`, '1', 'EX', 45, 'NX']]);
      if (!free) return res.status(429).json({ error: 'Esperá unos segundos para pedir otro código.', wait: true });
      const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
      await redis([['SET', codeKey(purpose, email), JSON.stringify({ h: codeHash(code), tries: 0 }), 'EX', 600]]);
      const sent = await sendMail({ to: email, ...codeMail(code, purpose, email) });
      if (!sent.ok) { await redis([['DEL', codeKey(purpose, email)], ['DEL', `sancor:code:cd:${purpose}:${id}`]]); return res.status(502).json({ error: 'No pudimos mandar el mail. Probá de nuevo en un rato.' }); }
      return res.status(200).json({ sent: true });
    }
    if (action === 'reset') { // olvidé mi contraseña: código + contraseña nueva, y entra
      const email = String(b.email || '').trim().toLowerCase(), pass = String(b.pass || '');
      if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Revisá el mail: parece que no es válido.' });
      if (pass.length < 6 || pass.length > 64) return res.status(400).json({ error: 'La contraseña tiene que tener entre 6 y 64 caracteres.' });
      if (!mailReady()) return res.status(501).json({ error: 'Por ahora no se puede recuperar la contraseña.' });
      const key = acctKey(email), u = await getUser(key); if (!u) return res.status(404).json({ notFound: true });
      const r = await checkCode('reset', email, b.code, true); if (r !== 'ok') return res.status(400).json({ error: CODE_ERR[r], reason: r });
      u.salt = crypto.randomBytes(16).toString('hex'); u.hash = hash(pass, u.salt); u.progress = merge(u.progress, b.progress); await putUser(key, u);
      return res.status(200).json(await out(key, u));
    }
    if (action === 'register' || action === 'login') {
      const email = String(b.email || '').trim().toLowerCase(), pass = String(b.pass || '');
      if (!EMAIL_RE.test(email) || email.length > 254) return res.status(400).json({ error: 'Revisá el mail: parece que no es válido.' });
      if (pass.length < 6 || pass.length > 64) return res.status(400).json({ error: 'La contraseña tiene que tener entre 6 y 64 caracteres.' });
      const key = acctKey(email);
      if (action === 'register') {
        if (mailReady()) { const c = await checkCode('register', email, b.code, false); if (c !== 'ok') return res.status(400).json({ error: CODE_ERR[c], reason: c }); }   // mail confirmado con el código
        const want = cleanName(b.nick);   // el apodo es obligatorio y único: si está tomado, no se crea la cuenta y se pide otro
        if (want.length < 2) return res.status(400).json({ error: 'Elegí un apodo de al menos 2 letras.', field: 'nick' });
        const [taken] = await redis([['EXISTS', nickKey(want)]]);
        if (taken) return res.status(409).json({ error: 'Ese apodo ya lo usa otra persona. Probá con otro.', nickTaken: true });
        const salt = crypto.randomBytes(16).toString('hex');
        const u = { email, salt, hash: hash(pass, salt), nick: want, progress: cleanProgress(b.progress), created: Date.now() };
        const [ok] = await redis([['SET', key, JSON.stringify(u), 'NX']]);
        if (!ok) return res.status(409).json({ error: 'Ese mail ya tiene cuenta: iniciá sesión con tu contraseña.' });
        if (!(await claimNick(want, key))) { await redis([['DEL', key]]); return res.status(409).json({ error: 'Ese apodo ya lo usa otra persona. Probá con otro.', nickTaken: true }); }   // lo tomó otro en el mismo instante
        if (mailReady()) await redis([['DEL', codeKey('register', email)]]);
        return res.status(200).json(await out(key, u, { isNew: true }));
      }
      const u = await getUser(key), bad = () => res.status(401).json({ error: 'Mail o contraseña incorrectos.' });
      if (!u) return res.status(404).json({ notFound: true });   // mail sin cuenta: el juego ofrece crearla
      if (!u.hash) return res.status(401).json({ error: 'Esa cuenta se creó con Google: tocá "Continuar con Google".' });
      const a = Buffer.from(hash(pass, u.salt), 'hex'), c = Buffer.from(u.hash, 'hex');
      if (a.length !== c.length || !crypto.timingSafeEqual(a, c)) return bad();
      u.progress = merge(u.progress, b.progress); await putUser(key, u);
      return res.status(200).json(await out(key, u));
    }
    if (['sync', 'me', 'nick', 'game', 'history', 'delete'].includes(action)) {
      const key = await userOfToken(b.token);
      if (!key) return res.status(401).json({ error: 'Sesión vencida. Volvé a iniciar sesión.' });
      const u = await getUser(key); if (!u) return res.status(401).json({ error: 'La cuenta no existe.' });
      if (action === 'nick') {
        const want = cleanName(b.nick);
        if (want.length < 2) return res.status(400).json({ error: 'El apodo tiene que tener al menos 2 letras.' });
        if (want.toLowerCase() !== String(u.nick || '').toLowerCase()) {
          if (!(await claimNick(want, key))) return res.status(409).json({ error: 'Ese apodo ya lo usa otra persona. Probá con otro.', nickTaken: true });
          if (u.nick) await redis([['DEL', nickKey(u.nick)]]);
        }
        u.nick = want; await putUser(key, u);
      }
      if (action === 'delete') { // eliminar la cuenta: mail, contraseña, apodo, álbum, historial y sus puntajes en el ranking
        if (u.hash) { const a = Buffer.from(hash(String(b.pass || ''), u.salt), 'hex'), c = Buffer.from(u.hash, 'hex');
          if (a.length !== c.length || !crypto.timingSafeEqual(a, c)) return res.status(401).json({ error: 'La contraseña no es correcta.' }); }
        else if (String(b.confirm || '').trim().toLowerCase() !== 'drones invasores') return res.status(400).json({ error: 'Escribí "Drones Invasores" para confirmar.' });   // cuenta de Google: confirma escribiendo el nombre del juego
        const cmds = [['DEL', key], ['DEL', histKey(key)], ['DEL', 'sancor:tok:' + b.token], ['DEL', codeKey('register', u.email)], ['DEL', codeKey('reset', u.email)]];
        if (u.nick) { const [owner] = await redis([['GET', nickKey(u.nick)]]); if (owner === key) cmds.push(['DEL', nickKey(u.nick)]); }
        await redis(cmds);
        if (u.nick) { // saca del ranking los puntajes con su apodo (cada entrada es "apodo␁fecha␁azar")
          const pre = u.nick + '\u0001'; let cur = '0';
          for (let i = 0; i < 50; i++) { const [[next, items]] = await redis([['ZSCAN', 'sancor:scores', cur, 'COUNT', 500]]);
            const mine = items.filter((m, j) => j % 2 === 0 && m.startsWith(pre)); if (mine.length) await redis([['ZREM', 'sancor:scores', ...mine]]);
            cur = String(next); if (cur === '0') break; }
        }
        return res.status(200).json({ deleted: true });
      }
      if (action === 'sync') { u.progress = merge(u.progress, b.progress); await putUser(key, u); }
      if (action === 'game') { // partida de Torneo terminada
        const score = Math.floor(Number(b.score)), wave = Math.floor(Number(b.wave)), won = !!b.won;
        if (!Number.isFinite(score) || score < 0 || score > 15e5 || !(wave >= 1 && wave <= 20)) return res.status(400).json({ error: 'datos inválidos' });
        const [n] = await redis([['INCR', `sancor:rl:game:${key}`], ['EXPIRE', `sancor:rl:game:${key}`, 3600]]);
        if (n > 60) return res.status(429).json({ error: 'demasiadas partidas' });
        const st = cleanStats(u.stats); st.games++; if (won) st.wins++; st.best = Math.max(st.best, score); st.maxWave = Math.max(st.maxWave, wave); st.total += score; u.stats = st;
        const g = { t: Date.now(), s: score, w: wave, won };
        await redis([['SET', key, JSON.stringify(u)], ['LPUSH', histKey(key), JSON.stringify(g)], ['LTRIM', histKey(key), 0, 29], ['EXPIRE', histKey(key), 2 * YEAR]]);
        return res.status(200).json({ stats: st });
      }
      if (action === 'history') {
        const [list] = await redis([['LRANGE', histKey(key), 0, 29]]);
        return res.status(200).json({ stats: cleanStats(u.stats), games: (list || []).map(x => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean) });
      }
      return res.status(200).json({ nick: u.nick, email: u.email, google: !!u.google, pass: !!u.hash, progress: cleanProgress(u.progress) });
    }
    if (action === 'checkNick') { // ¿está libre este apodo? (para avisar mientras se escribe)
      const ip = ipOf(req), want = cleanName(b.nick);
      const [n] = await redis([['INCR', `sancor:rl:nick:${ip}`], ['EXPIRE', `sancor:rl:nick:${ip}`, 3600]]);
      if (n > 400) return res.status(429).json({ error: 'Demasiadas consultas. Probá en un rato.' });
      if (want.length < 2) return res.status(200).json({ free: false, short: true });
      const [owner] = await redis([['GET', nickKey(want)]]); const mine = owner && owner === (await userOfToken(b.token));
      return res.status(200).json({ free: !owner || !!mine });
    }
    if (action === 'logout') { if (typeof b.token === 'string') await redis([['DEL', 'sancor:tok:' + b.token]]); return res.status(200).json({ ok: true }); }
    return res.status(400).json({ error: 'acción inválida' });
  } catch (e) {
    return res.status(502).json({ error: 'No se pudo conectar. Probá de nuevo.' });
  }
};
