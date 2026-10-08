# Drones Invasores

Juego estático (`index.html`) + una función serverless para el ranking global (`api/scores.js`).

## Deploy en Vercel
1. Importar el repo en vercel.com/new (Framework: **Other**, sin build).
2. Para activar el **ranking global**: en el proyecto, *Storage* → *Create Database* → **Upstash Redis** (plan gratuito) → *Connect Project*.
   Vercel agrega las variables `KV_REST_API_URL` / `KV_REST_API_TOKEN` (o `UPSTASH_REDIS_REST_*`). Redeploy.
3. Sin eso el juego funciona igual: el ranking se guarda solo en el dispositivo de cada jugador.

La imagen para compartir (`og.jpg`) usa la URL completa https://drones-invasores.vercel.app; si cambia el dominio, actualizarla en las etiquetas `og:` y `twitter:` de index.html.
