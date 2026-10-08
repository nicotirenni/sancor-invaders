# Drones Invasores

Juego estático (`index.html`) + una función serverless para el ranking global (`api/scores.js`).

## Deploy en Vercel
1. Importar el repo en vercel.com/new (Framework: **Other**, sin build).
2. Para activar el **ranking global**: en el proyecto, *Storage* → *Create Database* → **Upstash Redis** (plan gratuito) → *Connect Project*.
   Vercel agrega las variables `KV_REST_API_URL` / `KV_REST_API_TOKEN` (o `UPSTASH_REDIS_REST_*`). Redeploy.
3. Sin eso el juego funciona igual: el ranking se guarda solo en el dispositivo de cada jugador.

La imagen para compartir el link (`og-home.jpg`) usa la URL completa https://drones-invasores.vercel.app; si cambia el dominio, actualizarla en las etiquetas `og:` y `twitter:` de index.html.

## Compartir puntaje
- `/r?p=PUNTOS&r=RONDA&k=lvl|over[&q=PUESTO-TOTAL]` (`api/share.js`): página que se comparte. A las redes (X, LinkedIn, Facebook) les da título, texto e imagen con el puntaje; a las personas las redirige al juego.
- `/api/og?...` (`api/og.js`): genera esa imagen (1200x630) con `@vercel/og`, sobre `og.jpg` (fondo de las imágenes con puntaje), con las fuentes de `api/_fonts`.
- Instagram: la historia (1080x1920) se genera en el navegador y se comparte con el menú del celular.

## Cuentas y álbum
- `api/account.js`: cuentas opcionales (nombre + contraseña con scrypt) en el mismo Upstash Redis. Guardan el álbum en la nube y reservan el nombre en el ranking (`api/scores.js` rechaza con 403 un nombre con cuenta si no viene el token de su dueño).
- El álbum (9 figuritas de una sola imagen) se guarda siempre en el dispositivo; con cuenta además se sincroniza.
