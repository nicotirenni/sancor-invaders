// Utilidades compartidas por /api/og y /api/share: lee y valida los datos del puntaje que vienen en la URL
function params(q) {
  const int = (v, lo, hi) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo; };
  const p = int(q.p, 0, 500000), r = int(q.r, 1, 99), k = q.k === 'lvl' ? 'lvl' : 'over';
  const pos = /^\d{1,6}-\d{1,7}$/.test(q.q || '') ? q.q.split('-').map(Number) : null;
  const pts = p.toLocaleString('es-AR');
  const sub = k === 'lvl' ? `Ronda ${r} superada` : pos ? `Puesto ${pos[0]} de ${pos[1]}` : `Llegó a la ronda ${r}`;
  return { p, r, k, pos, pts, sub, qs: `p=${p}&r=${r}&k=${k}` + (pos ? `&q=${pos[0]}-${pos[1]}` : '') };
}
module.exports = { params };
