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

## Lo que falta: dos cosas

### 1. Decidir dónde vive el ranking — PENDIENTE

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

Si se queda en Supabase, el proyecto es `nmxurvcxkrrszafqqosv` y las
credenciales van en `.env.local` (no versionado; ver `.env.example`). El SQL de
la tabla, el RLS y la función de alta están en `supabase/schema.sql`.

### 2. Integrar en la landing

1. Compilar acá (ver abajo) → genera `dist/`.
2. Copiar el contenido de `dist/` a `site/Brightstar-Game-80s/` en la landing.
3. Decidir si la página entra al sitemap. **Siendo temporal, lo razonable es
   dejarla fuera** y que no la indexen: si se borra en unas semanas, no
   conviene que quede en buscadores. Vale revisar `robots.txt` y `_work/build.py`.
4. Correr `python _work/build.py` en la landing.
5. Commit y deploy.

## Compilar

**`npm run dev` y `npm run build` NO funcionan en esta carpeta.** La ruta tiene
un `&` (`Y&iF PROYECTS`) que rompe el shim de npm en cmd. Usar node directo:

```
node node_modules/vite/bin/vite.js build     # genera dist/
node node_modules/vite/bin/vite.js --port 5173   # desarrollo
node node_modules/vite/bin/vite.js preview       # sirve dist/ en la subcarpeta
```

## Cómo quitarlo cuando se termine la campaña

Hecho así, retirarlo es:

1. Borrar `site/Brightstar-Game-80s/` de la landing.
2. Quitar el enlace al juego de donde se haya puesto.
3. Correr `python _work/build.py` y desplegar.
4. Si se usó D1: borrar la tabla del ranking. Si se usó Supabase: pausar o
   borrar el proyecto.

No hace falta tocar `worker/index.js` ni `_headers` salvo que se haya agregado
algo específico para el juego. **Si en la integración hiciera falta tocarlos,
dejarlo anotado acá** para que el retiro no se olvide de deshacerlo.
