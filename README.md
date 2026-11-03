# Brightstar Game 80s

Juego arcade en canvas para la campaña de Y&iF. React + Vite, sin backend
propio: el único servicio externo es Supabase, y solo para el ranking.

Se publica colgando de una subcarpeta del sitio:
**https://www.why-and-if.solutions/Brightstar-Game-80s**

Para desplegarlo o retirarlo, ver [`DESPLIEGUE.md`](DESPLIEGUE.md). Este
archivo es el mapa del código.

## Cómo está armado

| Archivo | Qué hace |
| --- | --- |
| `src/BrightstarGame.jsx` | El juego entero: bucle de dibujo, física, colisiones, pantallas. Es el archivo grande. |
| `src/heroes.js` | Los personajes jugables (sprites, escalas, círculos de colisión). |
| `src/enemies.js` | Enemigos, jefes, disparos y los coleccionables que dan puntos. |
| `src/leaderboard.js` | Ranking. Única parte que habla con la red. |
| `src/sfx.js` | Sonidos, sintetizados con Web Audio (no hay archivos de audio). |
| `src/assets.js` | `asset()`: arma las rutas de los sprites respetando la subcarpeta. |
| `vite.config.js` | Base de la URL y la Content-Security-Policy del build. |

El dibujo va sobre un canvas de 320×568 escalado ×3; la lógica siempre trabaja
en esas coordenadas, así que las medidas del código son píxeles de juego, no de
pantalla.

## Las tres cosas que no son obvias

**La subcarpeta.** El juego no vive en la raíz del dominio. `vite.config.js`
compila con `base = '/Brightstar-Game-80s/'` y los 13 sprites pasan por
`asset()`. Si escribes una ruta a mano (`'/assets/retro/x.png'`) el navegador la
busca en la raíz del sitio y ese sprite no carga. Siempre `asset('assets/...')`.

**El ranking no es obligatorio.** Si no hay variables de Supabase, el juego
funciona igual con los puntajes guardados solo en el navegador. Eso permite
desarrollar sin credenciales, y que una caída de la base no rompa el juego.
Copia `.env.example` a `.env.local` para conectarlo.

**La clave de Supabase viaja en el bundle.** Es la `publishable` y así se usa,
pero solo es segura con Row Level Security activo: el insert directo está
prohibido y los puntajes entran por la función `submit_score`, que valida en el
servidor. El SQL está en `supabase/schema.sql`. La clave `secret` /
`service_role` **nunca** va acá; `leaderboard.js` la detecta y corta la conexión
si aparece.

## Correr el proyecto

> `npm run dev` y `npm run build` **no funcionan en esta carpeta**: la ruta
> tiene un `&` (`Y&iF PROYECTS`) que rompe el shim de npm en cmd. Hay que
> llamar a vite directo.

```
npm install

node node_modules/vite/bin/vite.js              # desarrollo, localhost:5173
node node_modules/vite/bin/vite.js build        # genera dist/
node node_modules/vite/bin/vite.js preview      # sirve dist/ en la subcarpeta
```

Usa `preview` y no `dev` para revisar cómo se verá publicado: `dev` sirve desde
la raíz y no prueba la base de la URL.

En desarrollo hay modo debug por query string (`?debug` dibuja los círculos de
colisión, `?god` hace invulnerable). Vite lo borra del bundle de producción.

## Sobre el origen del juego

La mecánica base es la del género de *endless flyer* de un botón. El código, los
sprites y los personajes son propios; no se usa ningún recurso, nombre ni marca
de los juegos que popularizaron el género.
