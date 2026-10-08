// Ranking global de Drones Invasores (función serverless de Vercel).
// Guarda los puntajes en Upstash Redis (integración gratuita de Vercel). Sin esas variables, responde 501 y el juego usa un ranking local.
const { redis, ready, cleanName, nameKey, ipOf, bodyOf, userOfToken } = require('./_redis');
const KEY = 'sancor:scores';
const MAX_SCORE = 1500000;      // tope de plausibilidad (20 rondas)
const MAX_PER_HOUR = 40;        // envíos por IP por hora

function parseTop(flat) {
  const out = [];
  for (let i = 0; i < (flat || []).length; i += 2) out.push({ name: String(flat[i]).split('\u0001')[0], score: Number(flat[i + 1]) });
  return out;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!ready()) return res.status(501).json({ error: 'ranking global no configurado' });
  try {
    if (req.method === 'GET') {
      const [flat, total] = await redis([['ZREVRANGE', KEY, 0, 9, 'WITHSCORES'], ['ZCARD', KEY]]);
      return res.status(200).json({ top: parseTop(flat), total });
    }
    if (req.method === 'POST') {
      const body = bodyOf(req);
      const name = cleanName(body && body.name), score = Math.floor(Number(body && body.score));
      if (!name || !Number.isFinite(score) || score < 0 || score > MAX_SCORE) return res.status(400).json({ error: 'datos inválidos' });
      // los nombres con cuenta están reservados: solo su dueño (con sesión iniciada) suma con ese nombre
      const [owner] = await redis([['EXISTS', nameKey(name)]]);
      if (owner && (await userOfToken(body.token)) !== nameKey(name)) return res.status(403).json({ error: 'nombre reservado' });
      const ip = ipOf(req);
      const [count] = await redis([['INCR', `sancor:rl:${ip}`], ['EXPIRE', `sancor:rl:${ip}`, 3600]]);
      if (count > MAX_PER_HOUR) return res.status(429).json({ error: 'demasiados envíos' });
      const member = `${name}\u0001${Date.now()}\u0001${Math.random().toString(36).slice(2, 8)}`;
      const [, higher, total, flat] = await redis([
        ['ZADD', KEY, score, member], ['ZCOUNT', KEY, `(${score}`, '+inf'], ['ZCARD', KEY], ['ZREVRANGE', KEY, 0, 9, 'WITHSCORES']
      ]);
      return res.status(200).json({ rank: higher + 1, total, top: parseTop(flat) });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'método no permitido' });
  } catch (e) {
    return res.status(502).json({ error: 'ranking no disponible' });
  }
};
