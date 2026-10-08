// Cuentas de Drones Invasores: nombre + contraseña. Guardan el álbum en la nube y reservan el nombre en el ranking.
const crypto = require('crypto');
const { redis, ready, cleanName, nameKey, ipOf, bodyOf, userOfToken } = require('./_redis');
const YEAR = 365 * 24 * 3600, TILES = 9;

const hash = (pass, salt) => crypto.scryptSync(String(pass), salt, 32).toString('hex');
function cleanProgress(p) { // solo se guarda lo que el juego usa, con límites
  p = p && typeof p === 'object' ? p : {};
  const got = Array.from({ length: TILES }, (_, i) => !!(Array.isArray(p.got) && p.got[i]));
  const n = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
  return { got, drones: n(p.drones, 1e6), powers: n(p.powers, 1e6), best: n(p.best, 2e6) };
}
function merge(a, b) { // nunca se pierde nada: une figuritas y se queda con los máximos
  a = cleanProgress(a); b = cleanProgress(b);
  return { got: a.got.map((g, i) => g || b.got[i]), drones: Math.max(a.drones, b.drones), powers: Math.max(a.powers, b.powers), best: Math.max(a.best, b.best) };
}
async function newToken(key) { const t = crypto.randomBytes(24).toString('base64url'); await redis([['SET', 'sancor:tok:' + t, key, 'EX', YEAR]]); return t; }

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!ready()) return res.status(501).json({ error: 'cuentas no disponibles' });
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'método no permitido' }); }
  try {
    const b = bodyOf(req), action = b.action;
    if (action === 'register' || action === 'login') {
      const ip = ipOf(req);
      const [tries] = await redis([['INCR', `sancor:rl:acc:${ip}`], ['EXPIRE', `sancor:rl:acc:${ip}`, 3600]]);
      if (tries > 30) return res.status(429).json({ error: 'Demasiados intentos. Probá en un rato.' });
      const name = cleanName(b.name), pass = String(b.pass || '');
      if (name.length < 2) return res.status(400).json({ error: 'El nombre tiene que tener al menos 2 letras.' });
      if (pass.length < 6 || pass.length > 64) return res.status(400).json({ error: 'La contraseña tiene que tener entre 6 y 64 caracteres.' });
      const key = nameKey(name);
      if (action === 'register') {
        const salt = crypto.randomBytes(16).toString('hex'), progress = cleanProgress(b.progress);
        const user = { name, salt, hash: hash(pass, salt), progress, created: Date.now() };
        const [ok] = await redis([['SET', key, JSON.stringify(user), 'NX']]);
        if (!ok) return res.status(409).json({ error: 'Ese nombre ya tiene cuenta. Iniciá sesión o elegí otro.' });
        return res.status(200).json({ token: await newToken(key), name, progress });
      }
      const [raw] = await redis([['GET', key]]);
      const user = raw && JSON.parse(raw);
      const bad = () => res.status(401).json({ error: 'Nombre o contraseña incorrectos.' });
      if (!user) return bad();
      const a = Buffer.from(hash(pass, user.salt), 'hex'), c = Buffer.from(user.hash, 'hex');
      if (a.length !== c.length || !crypto.timingSafeEqual(a, c)) return bad();
      user.progress = merge(user.progress, b.progress);
      await redis([['SET', key, JSON.stringify(user)]]);
      return res.status(200).json({ token: await newToken(key), name: user.name, progress: user.progress });
    }
    if (action === 'sync' || action === 'me') {
      const key = await userOfToken(b.token);
      if (!key) return res.status(401).json({ error: 'Sesión vencida. Volvé a iniciar sesión.' });
      const [raw] = await redis([['GET', key]]); if (!raw) return res.status(401).json({ error: 'La cuenta no existe.' });
      const user = JSON.parse(raw);
      if (action === 'sync') { user.progress = merge(user.progress, b.progress); await redis([['SET', key, JSON.stringify(user)]]); }
      return res.status(200).json({ name: user.name, progress: cleanProgress(user.progress) });
    }
    if (action === 'logout') { if (typeof b.token === 'string') await redis([['DEL', 'sancor:tok:' + b.token]]); return res.status(200).json({ ok: true }); }
    return res.status(400).json({ error: 'acción inválida' });
  } catch (e) {
    return res.status(502).json({ error: 'No se pudo conectar. Probá de nuevo.' });
  }
};
