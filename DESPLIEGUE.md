# Brightstar Game — contexto de despliegue

> **Esto es temporal.** El juego se publica por unas semanas como pieza de
> campaña y después se retira. Todo lo que se toque en la landing debe poder
> borrarse en minutos: una carpeta y unas pocas líneas. La sección
> "Cómo quitarlo" al final es parte del encargo, no un extra.

## Qué es

Un juego arcade en canvas (React + Vite) que ya está terminado y probado.
Vive en su propio repo, separado de la landing.

- **Repo del juego:** esta carpeta (`Pruebas Y&iF/jueguito`)
- **Repo de la landing:** https://github.com/FranSepia/YiF-landingpage
  (clon local en `Y&iF PROYECTS/Duplicado Landing Page Y&iF`)
- **URL de destino:** https://www.why-and-if.solutions/Brightstar-Game-80s

## Cómo está armada la landing

Cloudflare Workers sirviendo estáticos:

- `wrangler.jsonc` — config del Worker. Es la única fuente de verdad de
  bindings y variables: lo que se toque a mano en el dashboard se pierde en el
  siguiente deploy (salvo los Secrets).
- `site/` — todo lo público. Ahí va el juego.
- `worker/index.js` — redirecciones, 404 con status real, y el formulario de
  contacto.
- `site/_headers` — cabeceras de seguridad del sitio. **Ya trae** HSTS,
  `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` y
  `Permissions-Policy`. No tiene CSP a propósito: Webflow deja scripts en línea
  y una CSP estricta rompería las páginas.
- `d1_databases` — ya hay una base D1 conectada (`yif-landingpage-leads`).
- `python _work/build.py` — regenera sitemap, `llms.txt` y las versiones en
  inglés. Hay que correrlo tras agregar páginas a `site/`.

## Estado del juego: listo

- **Ruta base.** `vite.config.js` compila con `base = '/Brightstar-Game-80s/'`.
  Las 13 rutas de sprites pasan por `asset()` (en `src/assets.js`), que respeta
  esa base. Sin eso el navegador buscaría los sprites en la raíz del dominio y
  no cargaría ninguno. Probado sirviendo el build en esa subcarpeta.
- **CSP propia.** Se inyecta como `<meta>` solo en el build (en desarrollo
  rompería el hot-reload). Al ir en la página del juego y no en `_headers`, no
  afecta al resto del sitio.
- **Modo debug fuera de producción.** `?debug&god` y compañía solo existen en
  desarrollo; Vite los borra del bundle publicado.
- **Dependencias sin vulnerabilidades** (`npm audit`): 0.

## Decisiones tomadas

### 1. Dónde vive el ranking — RESUELTO: se queda en Supabase

Supabase ya está conectado y probado de punta a punta (lee, escribe, el RLS
bloquea inserts directos, el servidor valida). Pero **D1 es mejor para este
caso**, y la landing ya lo tiene:

|                          | Supabase (hecho)   | D1 + Worker        |
| ------------------------ | ------------------ | ------------------ |
| Clave en el bundle       | Sí (publishable)   | Ninguna            |
| Llamada                  | A otro dominio     | Mismo origen       |
| Excepción en la CSP      | Necesaria          | No hace falta      |
| Se pausa sola            | Sí, 7 días sin uso | No                 |

Lo del pausado pesa acá: una landing con tráfico irregular puede pasar una
semana sin que nadie juegue, y el ranking se congela hasta reactivarlo a mano.

Migrar es acotado: todo el acceso a datos está en `src/leaderboard.js`, detrás
de `loadScores()` y `submitScore()`. El resto del juego no se entera.

**Se decidió quedarse en Supabase** (noviembre 2026): ya estaba probado de
punta a punta y el juego es temporal, así que no compensaba migrar. El proyecto
es `nmxurvcxkrrszafqqosv` y las credenciales van en `.env.local` (no
versionado; ver `.env.example`). El SQL de la tabla, el RLS y la función de
alta están en `supabase/schema.sql`.

> **El pausado sigue siendo el riesgo.** Supabase pausa el proyecto tras 7 días
> sin consultas y el ranking se congela hasta reactivarlo a mano desde el
> panel. Si durante la campaña pasa una semana floja, hay que revisarlo. El
> juego no se rompe: sin base, cada quien ve su propia tabla local.

Si algún día se migra a D1, todo el acceso a datos está detrás de
`loadScores()` y `submitScore()` en `src/leaderboard.js`; además habría que
quitar el origen de Supabase del `connect-src` de la CSP en `vite.config.js`.

### 2. Integrar en la landing — HECHO (noviembre 2026)

Publicado en https://www.why-and-if.solutions/Brightstar-Game-80s

El proceso, por si hay que repetirlo tras un cambio en el juego:

1. Compilar acá (ver abajo) → genera `dist/`.
2. Copiar el contenido de `dist/` a `site/Brightstar-Game-80s/` en la landing.
3. Correr `python _work/build.py` en la landing.
4. Commit y deploy.

**No entra al sitemap y no se indexa**, por ser temporal: si se borra en unas
semanas, no conviene que queden resultados rotos en Google. Se llega solo con
el enlace. Se hace con `X-Robots-Tag: noindex, nofollow` en `site/_headers` más
un `<meta name="robots">` que inyecta `vite.config.js` en el build. A
propósito **no** se agregó un `Disallow` en `robots.txt`: un `Disallow` impide
que el buscador lea la página, y entonces nunca ve el `noindex` — la URL puede
seguir apareciendo en los resultados si alguien la enlaza.

La URL sin barra final (`/Brightstar-Game-80s`) responde con un 301 a
`/Brightstar-Game-80s/`, que es donde el enrutador de assets sirve el
`index.html` de la carpeta. Las dos funcionan; se dejó así para que haya una
sola copia del HTML y no se desincronice al recompilar.

**No se puso ningún enlace al juego desde la landing**: se comparte por URL.

## Compilar

**`npm run dev` y `npm run build` NO funcionan en esta carpeta.** La ruta tiene
un `&` (`Y&iF PROYECTS`) que rompe el shim de npm en cmd. Usar node directo:

```
node node_modules/vite/bin/vite.js build     # genera dist/
node node_modules/vite/bin/vite.js --port 5173   # desarrollo
node node_modules/vite/bin/vite.js preview       # sirve dist/ en la subcarpeta
```

## Cómo quitarlo cuando se termine la campaña

Son cuatro cosas, todas en el repo de la landing. Están marcadas con el nombre
`Brightstar-Game-80s`, así que un `grep -ri brightstar` las encuentra todas.

1. Borrar la carpeta `site/Brightstar-Game-80s/`.
2. En `site/_headers`, borrar el bloque "Brightstar Game 80s" (las dos reglas
   de `X-Robots-Tag` y la de `Cache-Control`).
3. En `wrangler.jsonc`, quitar `"!/Brightstar-Game-80s/assets/*"` de
   `run_worker_first` y dejarlo en `["/*", "!/assets/*"]`.
4. Correr `python _work/build.py` y desplegar.

Después, en Supabase: pausar o borrar el proyecto `nmxurvcxkrrszafqqosv`.

No hay enlace al juego en ninguna página de la landing, así que no hay nada
más que quitar. `worker/index.js`, `robots.txt` y `sitemap.xml` no se tocaron.

> Lo de `run_worker_first` es solo rendimiento: sin esa excepción cada sprite
> del juego gasta una invocación del Worker en vez de salir directo del
> enrutador de assets. Dejarla puesta de más no rompe nada, pero sobra.
