// Ranking global de Sancor Invaders (función serverless de Vercel).
// Guarda los puntajes en Upstash Redis (integración gratuita de Vercel). Sin esas variables, responde 501 y el juego usa un ranking local.
const KEY = 'sancor:scores';
const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const MAX_SCORE = 500000;       // tope de plausibilidad
const MAX_PER_HOUR = 40;        // envíos por IP por hora

async function redis(cmds) {
  const r = await fetch(`${URL_}/pipeline`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmds)
  });
  if (!r.ok) throw new Error('redis ' + r.status);
  return (await r.json()).map(x => { if (x.error) throw new Error(x.error); return x.result; });
}
function parseTop(flat) {
  const out = [];
  for (let i = 0; i < (flat || []).length; i += 2) out.push({ name: String(flat[i]).split('\u0001')[0], score: Number(flat[i + 1]) });
  return out;
}
const cleanName = n => String(n || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 16);

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!URL_ || !TOKEN) return res.status(501).json({ error: 'ranking global no configurado' });
  try {
    if (req.method === 'GET') {
      const [flat, total] = await redis([['ZREVRANGE', KEY, 0, 9, 'WITHSCORES'], ['ZCARD', KEY]]);
      return res.status(200).json({ top: parseTop(flat), total });
    }
    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
      const name = cleanName(body && body.name), score = Math.floor(Number(body && body.score));
      if (!name || !Number.isFinite(score) || score < 0 || score > MAX_SCORE) return res.status(400).json({ error: 'datos inválidos' });
      const ip = String(req.headers['x-forwarded-for'] || 'x').split(',')[0].trim();
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
