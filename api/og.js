// Imagen dinámica para compartir (1200x630): la foto del juego con el puntaje encima.
// X, LinkedIn y Facebook la muestran sola en la vista previa del link /r?p=...
const fs = require('fs'), path = require('path');
const { params } = require('./_share');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f));
let assets;
function load() {
  return assets || (assets = {
    anton: read('api/_fonts/anton.ttf'), chakra: read('api/_fonts/chakra-700.ttf'),
    bg: 'data:image/jpeg;base64,' + read('og.jpg').toString('base64')
  });
}
const h = (type, style, ...children) => ({ type, props: { style, children: children.length === 1 ? children[0] : children } });

module.exports = async (req, res) => {
  const { ImageResponse } = await import('@vercel/og');
  const a = load(), d = params(req.query || {});
  const img = new ImageResponse(
    h('div', { width: 1200, height: 630, display: 'flex', position: 'relative', fontFamily: 'Chakra' },
      { type: 'img', props: { src: a.bg, width: 1200, height: 630, style: { position: 'absolute', left: 0, top: 0 } } },
      h('div', { position: 'absolute', left: 0, top: 0, width: 1200, height: 380, display: 'flex', backgroundImage: 'linear-gradient(180deg, rgba(4,5,13,.97) 0%, rgba(4,5,13,.93) 62%, rgba(4,5,13,0) 100%)' }),
      h('div', { position: 'absolute', left: 0, top: 34, width: 1200, display: 'flex', flexDirection: 'column', alignItems: 'center' },
        h('div', { fontSize: 30, letterSpacing: 7, color: '#9fd4fa', textTransform: 'uppercase' }, d.sub),
        h('div', { fontFamily: 'Anton', fontSize: 168, lineHeight: 1.08, color: '#ffffff', textShadow: '0 0 34px rgba(214,32,104,.75)' }, d.pts),
        h('div', { fontSize: 32, letterSpacing: 9, color: '#ffb3cf' }, 'PUNTOS')),
      h('div', { position: 'absolute', left: 0, bottom: 8, width: 1200, display: 'flex', justifyContent: 'center', fontSize: 20, color: '#dfe6ff', opacity: .85 }, 'Realizado por Nico Tirenni')),
    { width: 1200, height: 630, fonts: [{ name: 'Anton', data: a.anton, weight: 400 }, { name: 'Chakra', data: a.chakra, weight: 700 }] }
  );
  const buf = Buffer.from(await img.arrayBuffer());
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.end(buf);
};
