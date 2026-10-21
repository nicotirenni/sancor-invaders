// Estado del envío de mails: dice si la clave de Resend está cargada y si el dominio ya puede enviar (sin mostrar la clave).
// Prueba con la casilla de test de Resend (delivered@resend.dev) y guarda el resultado 10 minutos para no gastar envíos.
const { redis, ready } = require('./_redis');
const { sendMail, mailReady } = require('./_mail');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).end(); }
  if (!mailReady()) return res.status(200).json({ configured: false });
  try {
    if (ready()) { const [c] = await redis([['GET', 'sancor:mail:status']]); if (c) return res.status(200).json({ ...JSON.parse(c), cached: true }); }
    const r = await sendMail({ to: 'delivered@resend.dev', subject: 'Prueba de envío', text: 'Prueba de Drones Invasores.' });
    const out = { configured: true, canSend: r.ok, status: r.status || 200, detail: r.ok ? 'ok' : String(r.error).slice(0, 160) };
    if (ready()) await redis([['SET', 'sancor:mail:status', JSON.stringify(out), 'EX', 600]]);
    return res.status(200).json(out);
  } catch (e) { return res.status(502).end(); }
};
