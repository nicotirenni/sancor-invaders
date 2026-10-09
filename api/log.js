// Registro de errores del juego: el navegador avisa cuando algo falla o se traba, para poder diagnosticarlo sin pedirle nada al jugador.
// Guarda solo datos técnicos (tipo de evento, mensaje, versión, navegador); nada de nick, mail ni IP. GET devuelve los últimos 100.
const { redis, ready, ipOf, bodyOf } = require('./_redis');
const KEY = 'sancor:log';
const s = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, n);

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!ready()) return res.status(501).json({ error: 'sin registro' });
  try {
    if (req.method === 'GET') {
      const list = await redis([['LRANGE', KEY, 0, 99]]);
      return res.status(200).json((list[0] || []).map(x => { try { return JSON.parse(x); } catch { return x; } }));
    }
    if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).end(); }
    const ip = ipOf(req);
    const [n] = await redis([['INCR', `sancor:rl:log:${ip}`], ['EXPIRE', `sancor:rl:log:${ip}`, 3600]]);
    if (n > 30) return res.status(429).end();
    const b = bodyOf(req);
    const e = { t: new Date().toISOString(), k: s(b.k, 24), m: s(b.m, 300), s: s(b.s, 600), st: s(b.st, 12), w: Number(b.w) || 0, v: s(b.v, 12), ua: s(b.ua, 220), br: !!b.br, x: s(b.x, 300) };
    await redis([['LPUSH', KEY, JSON.stringify(e)], ['LTRIM', KEY, 0, 499]]);
    return res.status(204).end();
  } catch (err) {
    return res.status(502).end();
  }
};
