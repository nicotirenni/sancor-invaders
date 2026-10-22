// Panel del dueño del juego (/admin): buscar jugadores y activarles las naves que pagaron con un cafecito.
// Protegido con la clave ADMIN_KEY (variable de entorno de Vercel). Sin la clave cargada, el panel no funciona.
const crypto = require('crypto');
const { redis, ready, cleanName, nickKey, acctKey, ipOf, bodyOf } = require('./_redis');
const SHIPS = ['colectivo', 'hornero', 'fernet'];
const keyOk = k => { const a = Buffer.from(String(k || '')), b = Buffer.from(String(process.env.ADMIN_KEY || '')); return b.length >= 16 && a.length === b.length && crypto.timingSafeEqual(a, b); };
const view = (key, u) => ({ id: key.slice('sancor:acct:'.length), nick: u.nick || '', email: u.email, google: !!u.google, ships: SHIPS.filter(x => (u.ships || []).includes(x)),
  created: u.created || 0, games: (u.stats && u.stats.games) || 0, best: (u.stats && u.stats.best) || 0 });

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!ready()) return res.status(501).json({ error: 'base de datos no disponible' });
  if (!process.env.ADMIN_KEY) return res.status(501).json({ error: 'Falta cargar ADMIN_KEY en Vercel.' });
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end(); }
  try {
    const ip = ipOf(req), b = bodyOf(req);
    if (!keyOk(req.headers['x-admin-key'])) {   // clave incorrecta: se limita por IP para que no se pueda adivinar
      const [n] = await redis([['INCR', `sancor:rl:admin:${ip}`], ['EXPIRE', `sancor:rl:admin:${ip}`, 3600]]);
      return res.status(n > 20 ? 429 : 401).json({ error: n > 20 ? 'Demasiados intentos. Probá en una hora.' : 'Clave incorrecta.' });
    }
    if (b.action === 'find') { // por apodo (sin importar mayúsculas) o por mail
      const q = String(b.q || '').trim(); if (q.length < 2) return res.status(400).json({ error: 'Escribí al menos 2 letras.' });
      let key = q.includes('@') ? acctKey(q) : null;
      if (!key) { const [owner] = await redis([['GET', nickKey(cleanName(q))]]); key = owner; }
      const [raw] = key ? await redis([['GET', key]]) : [null];
      if (!raw) return res.status(404).json({ error: 'No encontré a nadie con ese apodo o mail.' });
      return res.status(200).json({ user: view(key, JSON.parse(raw)) });
    }
    if (b.action === 'owners') { // quiénes tienen alguna nave activada (lista corta, para control)
      const [list] = await redis([['SMEMBERS', 'sancor:ship-owners']]); const keys = (list || []).slice(0, 200);
      const raws = keys.length ? await redis(keys.map(k => ['GET', k])) : [];
      return res.status(200).json({ users: raws.map((r, i) => r ? view(keys[i], JSON.parse(r)) : null).filter(Boolean) });
    }
    if (b.action === 'set') { // activar o desactivar una nave
      const id = String(b.id || ''), ship = String(b.ship || ''); if (!SHIPS.includes(ship) || !id.includes('@')) return res.status(400).json({ error: 'datos inválidos' });
      const key = acctKey(id), [raw] = await redis([['GET', key]]); if (!raw) return res.status(404).json({ error: 'La cuenta ya no existe.' });
      const u = JSON.parse(raw), has = new Set((u.ships || []).filter(x => SHIPS.includes(x)));
      if (b.on) has.add(ship); else has.delete(ship); u.ships = SHIPS.filter(x => has.has(x));
      await redis([['SET', key, JSON.stringify(u)], u.ships.length ? ['SADD', 'sancor:ship-owners', key] : ['SREM', 'sancor:ship-owners', key]]);
      return res.status(200).json({ user: view(key, u) });
    }
    return res.status(400).json({ error: 'acción inválida' });
  } catch (e) { return res.status(502).json({ error: 'No se pudo conectar. Probá de nuevo.' }); }
};
