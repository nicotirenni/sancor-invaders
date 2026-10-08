// Página que se comparte (/r?p=...): a las redes les da título, texto e imagen con el puntaje; a las personas las lleva al juego.
const { params } = require('./_share');
const BOTS = /bot|crawl|spider|facebookexternalhit|facebot|linkedin|twitter|slack|whatsapp|telegram|discord|embedly|preview|vkshare|pinterest|skype/i;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

module.exports = (req, res) => {
  const d = params(req.query || {}), host = req.headers['x-forwarded-host'] || req.headers.host || 'drones-invasores.vercel.app';
  const site = `https://${host}`;
  if (!BOTS.test(req.headers['user-agent'] || '')) { res.statusCode = 302; res.setHeader('Location', '/'); res.setHeader('Cache-Control', 'no-store'); return res.end(); }
  const title = `🛸 ${d.pts} puntos en Drones Invasores 🇦🇷`;
  const desc = (d.k === 'lvl' ? `Voy por la ronda ${d.r + 1}. ` : `${d.sub}. `) + '¿Me superás? Destruí al invasor y cuidá lo nuestro. #DronesInvasores';
  const img = `${site}/api/og?${d.qs}`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');   // la respuesta depende de quién pide (red o persona): no se cachea
  res.end(`<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Drones Invasores">
<meta property="og:url" content="${esc(`${site}/r?${d.qs}`)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(img)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(`${d.pts} puntos en Drones Invasores`)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${esc(img)}">
</head><body><a href="/">Jugar Drones Invasores</a><script>location.replace('/')</script></body></html>`);
};
