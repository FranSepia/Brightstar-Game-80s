// ─── LEADERBOARD ──────────────────────────────────────────────────────────────
// Tabla de puntajes estilo arcade. Por ahora vive en localStorage con datos de
// relleno; cuando haya base de datos solo hay que reemplazar readScores() y
// submitScore() por llamadas al servidor. El resto del juego no se entera: lee
// siempre de la cache sincrónica que mantiene este módulo.
//
// Reglas del usuario: se entra escribiendo un nombre, sin contraseña. Dos
// jugadores con el mismo nombre son el mismo jugador — las entradas se fusionan
// en una sola y queda el mejor puntaje.

const SCORES_KEY = 'fb_scores'
const NAME_KEY = 'fb_name'

// ─── SUPABASE ─────────────────────────────────────────────────────────────────
// Si las variables están definidas, la tabla vive en Supabase; si no, el juego
// anda igual con el ranking guardado solo en este navegador. Eso permite
// desarrollar sin credenciales y que una caída de la base no rompa el juego.
//
// Se habla con la API REST por fetch en vez de usar @supabase/supabase-js: son
// dos llamadas (leer y escribir), y así no sumamos una dependencia de decenas
// de kB ni más superficie de terceros a un juego que no tiene login.
//
// La anon key viaja en el bundle y es pública: eso es normal, PERO solo es
// seguro con Row Level Security activo en la tabla. Sin RLS, esa misma clave
// deja borrar la tabla entera desde la consola del navegador.
// El panel de Supabase muestra la URL de la API ya con /rest/v1/ al final, que
// es lo que se copia sin pensar. Acá se recorta: el código arma esa parte solo,
// y con la URL completa quedaría /rest/v1/rest/v1/... y no andaría nada.
const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || '')
  .trim()
  .replace(/\/+$/, '')
  .replace(/\/rest\/v1$/, '')
const SUPABASE_KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()

// Red de seguridad contra el error más caro posible: pegar acá la clave
// equivocada. La "secret key" (y la vieja service_role) saltean el RLS, y todo
// lo que es VITE_ queda dentro del bundle a la vista de cualquiera. Si aparece
// una de esas, se corta la conexión y se avisa fuerte, en vez de publicar un
// sitio que le regala la base entera a quien abra la consola.
const CLAVE_PELIGROSA =
  SUPABASE_KEY.startsWith('sb_secret_') || SUPABASE_KEY.includes('service_role')

if (CLAVE_PELIGROSA) {
  console.error(
    '[leaderboard] La clave de VITE_SUPABASE_ANON_KEY es una clave SECRETA. ' +
    'Esa nunca va en el frontend: saltea el RLS y da acceso total a la base. ' +
    'Usá la publishable key (sb_publishable_...). Ranking remoto desactivado.'
  )
}

export const usaSupabase = Boolean(SUPABASE_URL && SUPABASE_KEY && !CLAVE_PELIGROSA)

const REMOTE_ROWS = 20

// Supabase está cambiando el esquema de claves: la vieja `anon` es un JWT
// (empieza con eyJ) y va también como Bearer; la nueva `publishable`
// (sb_publishable_...) no es un JWT y va solo en apikey. Se detecta por la
// forma de la clave para que sirvan las dos sin tener que tocar nada.
function headers(extra) {
  const h = { apikey: SUPABASE_KEY, ...extra }
  if (SUPABASE_KEY.startsWith('eyJ')) h.Authorization = `Bearer ${SUPABASE_KEY}`
  return h
}

export const MAX_NAME = 10

// Relleno hasta que exista la base de datos, para que la tabla no arranque vacía.
const SEED = [
  { name: 'NOVA',   score: 248 },
  { name: 'DREX',   score: 191 },
  { name: 'KIRA',   score: 156 },
  { name: 'ONYX',   score: 132 },
  { name: 'VEGA',   score: 118 },
  { name: 'MILO',   score: 97 },
  { name: 'ZAX',    score: 84 },
  { name: 'LUNA',   score: 73 },
  { name: 'AXL',    score: 61 },
  { name: 'RYU',    score: 45 },
]

// Un nombre es su versión normalizada: así "ana", "ANA " y "Ana" son el mismo
// jugador y sus entradas se fusionan solas.
export function normalizeName(raw) {
  return String(raw || '').trim().toUpperCase().replace(/\s+/g, ' ').slice(0, MAX_NAME)
}

let cache = null

function readScores() {
  try {
    const raw = localStorage.getItem(SCORES_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch (e) {
    // JSON corrupto o localStorage bloqueado: se arranca del relleno.
  }
  return SEED.map(e => ({ ...e }))
}

function persist(list) {
  try {
    localStorage.setItem(SCORES_KEY, JSON.stringify(list))
  } catch (e) {
    // Sin localStorage la tabla igual funciona en memoria durante la partida.
  }
}

function sorted(list) {
  return [...list].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
}

export function getScores() {
  if (!cache) cache = sorted(readScores())
  return cache
}

// Trae la tabla de Supabase y refresca la cache. Es la única función async del
// módulo: el juego la llama una vez al arrancar y después sigue leyendo de la
// cache sincrónica, así el bucle de dibujo no espera a la red.
//
// Si falla (sin conexión, base caída, clave mal puesta) no rompe nada: se
// queda con lo que había guardado localmente.
export async function loadScores() {
  if (!usaSupabase) return getScores()
  try {
    const url = `${SUPABASE_URL}/rest/v1/scores`
      + `?select=name,score&order=score.desc&limit=${REMOTE_ROWS}`
    const res = await fetch(url, { headers: headers() })
    if (!res.ok) return getScores()
    const rows = await res.json()
    if (Array.isArray(rows) && rows.length) {
      cache = sorted(rows.map(r => ({ name: r.name, score: r.score })))
      persist(cache)
    }
  } catch (e) {
    // Sin red el juego sigue: la tabla local alcanza para jugar.
  }
  return getScores()
}

// El puntaje se manda por una función de Postgres (submit_score), no por un
// insert directo. El insert directo está prohibido por RLS a propósito: así la
// validación del nombre y del puntaje ocurre en el servidor, donde el jugador
// no la puede saltear.
function pushScore(name, score) {
  if (!usaSupabase) return
  fetch(`${SUPABASE_URL}/rest/v1/rpc/submit_score`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ p_name: name, p_score: score }),
  }).catch(() => {
    // Se pierde ese envío y ya está; el puntaje local igual quedó guardado.
  })
}

export function topScores(n) {
  return getScores().slice(0, n)
}

// Devuelve la posición (1-based) del jugador, o 0 si no está en la tabla.
export function rankOf(name) {
  const key = normalizeName(name)
  if (!key) return 0
  const i = getScores().findIndex(e => normalizeName(e.name) === key)
  return i < 0 ? 0 : i + 1
}

// Guarda el puntaje fusionando por nombre: si ya existe, queda el mejor.
export function submitScore(name, score) {
  const key = normalizeName(name)
  if (!key || !Number.isFinite(score) || score <= 0) return getScores()

  const list = getScores().filter(e => normalizeName(e.name) !== key)
  const previous = getScores().find(e => normalizeName(e.name) === key)
  list.push({ name: key, score: Math.max(score, previous ? previous.score : 0) })

  cache = sorted(list)
  persist(cache)
  pushScore(key, Math.max(score, previous ? previous.score : 0))
  return cache
}

export function getPlayerName() {
  try {
    return normalizeName(localStorage.getItem(NAME_KEY))
  } catch (e) {
    return ''
  }
}

export function setPlayerName(name) {
  const key = normalizeName(name)
  try {
    localStorage.setItem(NAME_KEY, key)
  } catch (e) {
    // Si no se puede guardar, el nombre dura lo que dure la pestaña.
  }
  return key
}
