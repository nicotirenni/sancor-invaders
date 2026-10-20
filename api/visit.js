// Contador de visitantes únicos: cada navegador manda un id al azar (sin datos personales) una vez por día.
// Se cuenta con HyperLogLog (PFADD/PFCOUNT): no se guarda la lista de ids, solo una estimación del total (error ~1%).
// GET devuelve el total histórico, el de hoy y los últimos 30 días (hora de Argentina).
const { redis, ready, bodyOf } = require('./_redis');
const day = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!ready()) return res.status(501).json({ error: 'sin contador' });
  try {
    if (req.method === 'POST') {
      const id = String(bodyOf(req).id || '');
      if (!/^[a-z0-9]{8,32}$/.test(id)) return res.status(400).end();
      const k = 'sancor:uv:d:' + day();
      await redis([['PFADD', 'sancor:uv:all', id], ['PFADD', k, id], ['EXPIRE', k, 60 * 60 * 24 * 400]]);
      return res.status(204).end();
    }
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET, POST'); return res.status(405).end(); }
    const days = Array.from({ length: 30 }, (_, i) => day(new Date(Date.now() - i * 864e5))).reverse();
    const r = await redis([['PFCOUNT', 'sancor:uv:all'], ...days.map(d => ['PFCOUNT', 'sancor:uv:d:' + d])]);
    return res.status(200).json({ total: r[0], today: r[r.length - 1], days: days.map((d, i) => ({ d, n: r[i + 1] })) });
  } catch (err) {
    return res.status(502).end();
  }
};
