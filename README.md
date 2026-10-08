# Drones Invasores

Juego estático (`index.html`) + una función serverless para el ranking global (`api/scores.js`).

## Deploy en Vercel
1. Importar el repo en vercel.com/new (Framework: **Other**, sin build).
2. Para activar el **ranking global**: en el proyecto, *Storage* → *Create Database* → **Upstash Redis** (plan gratuito) → *Connect Project*.
   Vercel agrega las variables `KV_REST_API_URL` / `KV_REST_API_TOKEN` (o `UPSTASH_REDIS_REST_*`). Redeploy.
3. Sin eso el juego funciona igual: el ranking se guarda solo en el dispositivo de cada jugador.

Para que los links compartidos muestren la imagen (`og.png`), cambiar `/og.png` por la URL completa del sitio en las metaetiquetas de `index.html`.
