// Envío de mails con Resend (https://resend.com). Sin RESEND_API_KEY no se manda nada y el juego sigue sin confirmar mails.
const FROM = 'Drones Invasores <no-responder@dronesinvasores.com>';
const mailReady = () => !!process.env.RESEND_API_KEY;
async function sendMail({ to, subject, html, text }) {
  if (!mailReady()) return { ok: false, error: 'sin clave' };
  const ctl = new AbortController(), to_ = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', signal: ctl.signal,
      headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], subject, html, text }) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, id: j.id } : { ok: false, status: r.status, error: j.message || j.name || 'error' };
  } catch (e) { return { ok: false, error: 'sin conexión' }; } finally { clearTimeout(to_); }
}
module.exports = { sendMail, mailReady, FROM };
