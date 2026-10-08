// Acceso a Upstash Redis (REST) compartido por las funciones del juego
const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
async function redis(cmds) {
  const r = await fetch(`${URL_}/pipeline`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmds)
  });
  if (!r.ok) throw new Error('redis ' + r.status);
  return (await r.json()).map(x => { if (x.error) throw new Error(x.error); return x.result; });
}
const ready = () => !!(URL_ && TOKEN);
const cleanName = n => String(n || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 16);
const nickKey = n => 'sancor:nick:' + cleanName(n).toLowerCase();       // nick reservado → cuenta dueña
const acctKey = email => 'sancor:acct:' + String(email).trim().toLowerCase();
const ipOf = req => String(req.headers['x-forwarded-for'] || 'x').split(',')[0].trim();
function bodyOf(req) { let b = req.body; if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } } return b || {}; }
async function userOfToken(token) { // devuelve la clave de la cuenta dueña del token (o null)
  if (typeof token !== 'string' || !/^[\w-]{20,64}$/.test(token)) return null;
  const [k] = await redis([['GET', 'sancor:tok:' + token]]); return k || null;
}
module.exports = { redis, ready, cleanName, nickKey, acctKey, ipOf, bodyOf, userOfToken };
