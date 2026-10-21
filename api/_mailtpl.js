// Plantilla del mail con el código (Resend). HTML para clientes de mail: tablas, estilos en línea y colores fijos (fondo oscuro del juego).
const SITE = 'https://www.dronesinvasores.com';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// link del botón: abre el juego con el código ya cargado. Va después del # para que no llegue al servidor ni quede en registros.
const verifyLink = (code, purpose, email) => `${SITE}/#v=${purpose === 'reset' ? 'p' : 'r'}.${Buffer.from(String(email)).toString('base64url')}.${code}`;

function codeMailHtml(code, purpose, email) {
  const reset = purpose === 'reset', link = verifyLink(code, purpose, email);
  const cta = reset ? 'Cambiar contraseña en el juego' : 'Validar en el juego';
  const title = reset ? 'Cambiá tu contraseña' : 'Confirmá tu mail';
  const lead = reset ? 'Usá este código para elegir una contraseña nueva en Drones Invasores.' : 'Usá este código para terminar de crear tu cuenta en Drones Invasores.';
  const font = "'Roboto','Helvetica Neue',Helvetica,Arial,sans-serif";
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#05060f" bgcolor="#05060f">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#05060f">Tu código es ${esc(code)}. Vence en 10 minutos.&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#05060f" style="background:#05060f">
<tr><td align="center" style="padding:40px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">
    <tr><td align="center" style="padding:0 0 28px"><a href="${SITE}" style="text-decoration:none"><img src="${SITE}/img/mail-logo.png" width="300" alt="Drones Invasores" style="display:block;width:300px;max-width:80%;height:auto;border:0;color:#f4f7ff;font:700 22px ${font}"></a></td></tr>
    <tr><td bgcolor="#0e1433" style="background:#0e1433;border:1px solid #232c5a;border-radius:16px;padding:36px 32px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" style="font:800 26px/1.2 ${font};color:#ffffff;padding:0 0 10px">${esc(title)}</td></tr>
        <tr><td align="center" style="font:400 16px/1.5 ${font};color:#c9d2f0;padding:0 0 28px">${esc(lead)}</td></tr>
        <tr><td align="center" style="padding:0 0 12px">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#171c30" style="background:#171c30;border:1px solid #ffc928;border-radius:12px;padding:16px 26px 16px 36px;font:700 40px/1 'SF Mono',Menlo,Consolas,'Courier New',monospace;letter-spacing:10px;color:#ffc928">${esc(code)}</td></tr></table>
        </td></tr>
        <tr><td align="center" style="font:400 14px/1.5 ${font};color:#8fa0d0;padding:0 0 24px">Vence en 10 minutos.</td></tr>
        <tr><td align="center" style="padding:0 0 28px">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#d62068" style="background:#d62068;border-radius:10px">
            <a href="${esc(link)}" target="_blank" style="display:inline-block;padding:14px 28px;font:700 16px/1 ${font};color:#ffffff;text-decoration:none;border-radius:10px">${esc(cta)}</a>
          </td></tr></table>
          <div style="font:400 12px/1.5 ${font};color:#5d6a95;padding:10px 0 0">Abre dronesinvasores.com con el código ya cargado.</div>
        </td></tr>
        <tr><td style="border-top:1px solid #232c5a;padding:22px 0 0;font:400 13px/1.55 ${font};color:#8fa0d0" align="center">Si no pediste este código, ignorá este mail: nadie puede usar tu cuenta sin él.</td></tr>
      </table>
    </td></tr>
    <tr><td align="center" style="padding:24px 0 0;font:400 12px/1.6 ${font};color:#5d6a95">
      <a href="${SITE}" style="color:#8fa0d0;text-decoration:underline">dronesinvasores.com</a> · Juego gratis, hecho por Nico Tirenni<br>
      Este mail se envió porque alguien pidió un código con esta dirección.
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}
module.exports = { codeMailHtml };
