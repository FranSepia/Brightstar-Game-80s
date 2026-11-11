import { useEffect, useRef, useCallback, useState } from 'react'
import {
  HERO_IDS, HERO_META, HERO_ANCHOR_X, HERO_BASE_SCALE,
  heroScale, heroHitCircles, drawHero,
} from './heroes'
import {
  MAX_NAME, normalizeName, getScores, topScores, rankOf,
  submitScore, getPlayerName, setPlayerName, loadScores,
} from './leaderboard'
import {
  enemiesForTheme, ENEMY_META, BOSS_REWARD, createEncounter, updateEnemy, startExit,
  enemyGone, updateShots, shotHits, drawEnemy, drawShots, enemyLabelAlpha, COMPETITORS,
  enemySign,
  GUIDE_EVERY_MS, GUIDE_POINTS, spawnGuide, updateGuides, takeGuides,
} from './enemies'
import { playPipeSound } from './sfx'
import { asset } from './assets'

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const W = 320
const H = 568
const GROUND_H = 112
const GROUND_Y = H - GROUND_H

const GRAVITY = 0.5
const JUMP_VEL = -9
const PIPE_SPEED = 2.5

// ─── UN SOLO RELOJ ────────────────────────────────────────────────────────────
// GRAVITY, JUMP_VEL y PIPE_SPEED están tomadas en píxeles POR CUADRO con la
// pantalla a 60 fps, que es donde se afinó el juego. El problema es que el
// bucle corre a los cuadros que da el aparato, no a 60 fijos, y las columnas
// aparecían por tiempo real (cada PIPE_INTERVAL ms) mientras se movían por
// cuadro. Las dos cuentas no se hablaban:
//
//   60 fps  -> 150 px/s, una columna cada 225 px (lo afinado)
//   30 fps  ->  75 px/s, una columna cada 117 px (casi pegadas, y en cámara lenta)
//   120 fps -> 300 px/s, una columna cada 450 px (al doble de velocidad)
//
// Un teléfono en modo de bajo consumo dibuja a 30 fps y el juego se volvía
// injugable; uno de 120 Hz lo jugaba al doble. Como el ranking es compartido,
// encima no todos jugaban al mismo juego.
//
// k = cuántos cuadros de 60 fps pasaron desde el anterior. Multiplicando por
// él todo lo que se mueve, las medidas siguen siendo las mismas (un salto son
// 9 px de cuadro a 60 fps, como siempre) pero el avance va por tiempo real, y
// la separación entre columnas queda clavada en 225 px a cualquier cantidad de
// cuadros por segundo.
//
// Las velocidades se guardan en px por cuadro a 60 fps a propósito, en vez de
// pasarlas a px/s: así JUMP_VEL, el tope de inclinación del sprite (±5) y el
// resto de los números afinados siguen queriendo decir lo mismo.
const FRAME_MS = 1000 / 60

// Esperas que antes se contaban en cuadros y ahora en milisegundos, para que
// duren igual en todos los aparatos. Son los mismos valores de antes leídos a
// 60 fps: 60 cuadros = 1000 ms y 30 cuadros = 500 ms.
const PIPE_ENTER_MS = 1000      // cuánto dura la caída por el caño
const RESTART_LOCK_MS = 1000    // hasta acá el toque no reinicia la partida
const GAMEOVER_DELAY_MS = 500   // cuándo aparece el cartel de fin
const PIPE_W = 52
const PIPE_GAP = 206
const GAP_EASIEST = 290  // obstáculos 1-10
const GAP_EASY = 256     // obstáculos 11-20
const EASY_COUNT = 10     // cada tramo dura 10 obstáculos
const PIPE_INTERVAL = 1500

// ─── TECHO DE DIFICULTAD ──────────────────────────────────────────────────────
// Pasado este puntaje el juego deja de subir: las columnas no aceleran más y
// los jefes no suben de ciclo (misma andanada, mismo ritmo y misma velocidad
// de proyectil que tenían al llegar acá).
//
// La velocidad crece un 8% cada 10 puntos y no tenía tope, así que para el 200
// el mundo venía al doble que en el 100 y al triple en el 300: el hueco pasaba
// por el jugador antes de que terminara el salto, y aguantar dejaba de ser
// difícil para ser una lotería. Congelado en el 100 el juego corre a
// PIPE_SPEED * 1.8 (4.5 px por cuadro) para siempre, que es rápido pero
// legible: de acá en adelante lo que se mide es la resistencia, no el reflejo.
const DIFFICULTY_CAP_SCORE = 100
const SPEED_STEP_MAX = DIFFICULTY_CAP_SCORE / 10   // 10 escalones de 8%

const BIRD_X = 72
const BIRD_R = 17

const SCALE = 3          // resolución interna (nitidez), la lógica sigue en W x H
const FONT = '"Press Start 2P", "Courier New", monospace'
const CROWN_H = 26       // alto de la cornisa del edificio (igual que la colisión)
const BALL_R = 14
const GIRL_SCALE = 64 / 235   // 1 px del sprite = 0.27 px del juego
const GIRL_ANCHOR_X = 0.634  // posición del cuerpo dentro del sprite (la estela queda atrás)
const GIRL_ANCHOR_Y = 0.5024

// ─── HITBOXES ─────────────────────────────────────────────────────────────────
// Círculos [dx, dy, r] que siguen la silueta del sprite, relativos al ancla (x, y).
// Se rotan igual que el sprite. Usa ?debug en la URL para verlos dibujados.
// Brightstar lleva los suyos acá; los demás salen de heroHitCircles(), que ya
// resuelve si al héroe le sirve la silueta compartida o tiene una propia.
// Se recorre HERO_IDS a propósito en vez de escribir el mapa a mano: así, sumar
// un héroe y olvidarse de su entrada no vuelve a dejar a hitCircles() leyendo
// undefined, que tiraba una excepción y mataba el bucle de dibujo entero (no
// solo a ese personaje: se caían también los retratos y el fondo).
const HIT_CIRCLES = {
  bird: [[22, -9, 8], [-2, -17, 6], [8, 6, 10], [-8, 10, 7], [-14, 19, 5]],
  ...Object.fromEntries(
    HERO_IDS.filter(id => id !== 'bird').map(id => [id, heroHitCircles(id)])
  ),
}
const TILT = Object.fromEntries(HERO_IDS.map(id => [id, 0.06]))
const QUERY = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams()
// Los trucos de ?debug existen solo mientras desarrollás. En el sitio
// publicado esto queda en false fijo y Vite borra todo el código de debug del
// bundle: si no, cualquiera entrando con ?debug&god jugaba invencible y con
// ?debug&enemy=... se saltaba directo a los jefes.
const DEBUG = import.meta.env.DEV && QUERY.has('debug')
const DEBUG_GOD = DEBUG && QUERY.has('god')         // ?debug&god: sin colisiones
const DEBUG_SKIP = DEBUG ? Number(QUERY.get('skip')) || 0 : 0  // ?debug&skip=10 salta al tema siguiente
// ?debug&enemy=denibot | clocktitan: arranca directo en el encuentro con ese enemigo
// ?debug&enemy=<id> para uno solo, o ?debug&enemy=competencia para los tres.
const DEBUG_ENEMY_IDS = (() => {
  if (!DEBUG) return null
  const q = QUERY.get('enemy')
  if (q === 'competencia') return COMPETITORS
  return ENEMY_META[q] ? [q] : null
})()
// ?debug&hitbox: dibuja los círculos y rectángulos de colisión (los verdes)
const DEBUG_HITBOX = DEBUG && QUERY.has('hitbox')

function hitCircles(char, x, y, vel) {
  const a = Math.min(Math.max(vel, -5), 5) * TILT[char]
  const cos = Math.cos(a), sin = Math.sin(a)
  return HIT_CIRCLES[char].map(([dx, dy, r]) => ({
    x: x + dx * cos - dy * sin,
    y: y + dx * sin + dy * cos,
    r,
  }))
}

// Animación de cambio de tema: slide 0 = en su lugar, 1 = fuera de pantalla.
// Los edificios de arriba suben/bajan por arriba y los de abajo por abajo.
const ENTER_MS = 1000
const EXIT_MS = 800
const easeOut = (t) => 1 - (1 - t) ** 3
const easeIn = (t) => t ** 3

function slideOffsets(p) {
  const slide = p.slide || 0
  return {
    top: -slide * (p.topH + CROWN_H),
    bottom: slide * (H - (p.topH + p.gap - CROWN_H)),
  }
}

function updateSlide(p, dt) {
  if (p.enterT < 1) p.enterT = Math.min(1, p.enterT + dt / ENTER_MS)
  if (p.exiting) p.exitT = Math.min(1, p.exitT + dt / EXIT_MS)
  p.slide = Math.max(1 - easeOut(p.enterT), easeIn(p.exitT))
}

function circleHitsRect(c, rx, ry, rw, rh) {
  const nx = Math.max(rx, Math.min(c.x, rx + rw))
  const ny = Math.max(ry, Math.min(c.y, ry + rh))
  return (c.x - nx) ** 2 + (c.y - ny) ** 2 < c.r * c.r
}

// ─── IMAGE LOADER ─────────────────────────────────────────────────────────────

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

// ─── RETRO 80s ASSETS (pre-rendered once, procedural pixel art) ───────────────

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

const WINDOW_COLORS = ['#ffd23f', '#ffb000', '#ff8c1a', '#ffd23f', '#7ef0ff']

function buildBuildingTexture(seed) {
  const rnd = mulberry32(seed)
  const c = makeCanvas(PIPE_W + 10, H)
  const g = c.getContext('2d')
  const bx = 5

  // Body
  g.fillStyle = '#16246a'
  g.fillRect(bx, CROWN_H, PIPE_W, H - CROWN_H)
  g.fillStyle = '#2f5fb0'
  g.fillRect(bx, CROWN_H, 3, H - CROWN_H)
  g.fillStyle = '#4a93d6'
  g.fillRect(bx, CROWN_H, 1, H - CROWN_H)
  g.fillStyle = '#0c1245'
  g.fillRect(bx + PIPE_W - 4, CROWN_H, 4, H - CROWN_H)

  // Body windows (4 columns)
  for (let y = CROWN_H + 6; y + 7 < H; y += 12) {
    for (let col = 0; col < 4; col++) {
      const wx = bx + 7 + col * 10
      const lit = rnd() < 0.6
      g.fillStyle = lit ? WINDOW_COLORS[Math.floor(rnd() * WINDOW_COLORS.length)] : '#101a55'
      g.fillRect(wx, y, 6, 7)
    }
  }

  // Crown (wider ledge, faces the gap)
  g.fillStyle = '#22389a'
  g.fillRect(0, 0, PIPE_W + 10, CROWN_H)
  g.fillStyle = '#3a56c4'
  g.fillRect(0, 0, 2, CROWN_H)
  g.fillStyle = '#f2a58e'
  g.fillRect(0, 0, PIPE_W + 10, 3)
  g.fillStyle = '#b5527f'
  g.fillRect(0, 3, PIPE_W + 10, 2)
  g.fillStyle = '#0d1440'
  g.fillRect(0, CROWN_H - 4, PIPE_W + 10, 4)
  for (let col = 0; col < 5; col++) {
    g.fillStyle = rnd() < 0.7 ? WINDOW_COLORS[Math.floor(rnd() * WINDOW_COLORS.length)] : '#101a55'
    g.fillRect(6 + col * 10, 10, 6, 8)
  }
  return c
}

// ─── OBSTACLE THEMES (cambian cada 10 obstáculos): 0 edificios, 1 papeleo, 2 reloj ──
//
// El orden es fijo y es parte del diseño, NO un descuido: los primeros 10
// obstáculos son de Lotería Nacional y van sin jefe, de calentamiento. El
// ciclo de verdad arranca con la primera tanda de papeles y de ahí se repite:
//
//    1-10   Lotería Nacional   (sin jefe, es la entrada)
//   11-20   burocracia         -> DENI-BOT
//   21-30   reloj              -> CLOCKTITAN
//   31-40   Lotería Nacional   -> LA COMPETENCIA
//   41-50   burocracia         -> DENI-BOT ... y así
//
// Cada jefe sale del tema que le toca, así que barajar los temas desarma el
// ciclo: no lo conviertas en aleatorio.

const THEME_EVERY = 10
const THEME_COUNT = 3

// Pinta en coordenadas "distancia al borde del hueco" (d). Si flip=true la textura
// queda con la cornisa abajo (edificio de arriba), pero los dibujos siguen derechos.
function makePainter(g, flip) {
  const Y = (d, h = 0) => (flip ? H - d - h : d)
  const cy = (d) => (flip ? H - d : d)
  return {
    g, Y, cy,
    rect(x, d, w, h, color) { g.fillStyle = color; g.fillRect(x, Y(d, h), w, h) },
    circle(cx, d, r, color) {
      g.fillStyle = color
      g.beginPath()
      g.arc(cx, cy(d), r, 0, Math.PI * 2)
      g.fill()
    },
    poly(pts, color) {
      g.fillStyle = color
      g.beginPath()
      pts.forEach(([x, d], i) => (i ? g.lineTo(x, cy(d)) : g.moveTo(x, cy(d))))
      g.closePath()
      g.fill()
    },
    text(str, cx, d, size, color) {
      g.font = `bold ${size}px "Courier New", monospace`
      g.textAlign = 'center'
      g.textBaseline = 'top'
      g.fillStyle = color
      g.fillText(str, cx, Y(d, size))
    },
  }
}

function buildPaperTexture(seed, flip) {
  const rnd = mulberry32(seed)
  const c = makeCanvas(PIPE_W + 10, H)
  const P = makePainter(c.getContext('2d'), flip)
  const papers = ['#e9e0c6', '#d8ccab', '#f4efdd']

  P.rect(5, CROWN_H, PIPE_W, H - CROWN_H, '#8d8368')
  for (let d = CROWN_H; d < H;) {
    const th = 5 + Math.floor(rnd() * 4)
    const x = 5 + Math.floor(rnd() * 5) - 2
    P.rect(x, d, PIPE_W, th, papers[Math.floor(rnd() * papers.length)])
    P.rect(x, d + th - 1, PIPE_W, 1, '#a89b78')
    if (rnd() < 0.5) {
      for (let k = 0; k < 3; k++) P.rect(x + 4 + k * 15, d + 2, 7 + Math.floor(rnd() * 6), 1, '#9a947c')
    }
    d += th
  }
  P.rect(5, CROWN_H, 3, H - CROWN_H, 'rgba(255,255,255,0.25)')
  P.rect(53, CROWN_H, 4, H - CROWN_H, 'rgba(60,40,10,0.35)')

  // Cintas rojas con "RED TAPE" + formularios / sellos
  let seg = 0
  for (let ty = CROWN_H + 26 + rnd() * 20; ty < H - 30; ty += 78 + rnd() * 24, seg++) {
    const s = rnd() < 0.5 ? 5 : -5
    P.poly([[3, ty], [59, ty + s], [59, ty + s + 10], [3, ty + 10]], '#c8202a')
    P.poly([[3, ty + 10], [59, ty + s + 10], [59, ty + s + 12], [3, ty + 12]], '#6e0f16')
    P.poly([[3, ty], [59, ty + s], [59, ty + s + 1], [3, ty + 1]], '#ff6a6a')
    P.text('RED TAPE', 31, ty + 2 + s / 2, 7, '#ffe6e6')

    const fd = ty + 24
    if (seg % 2 === 0) {
      const fx = 10 + Math.floor(rnd() * 12)
      P.rect(fx - 1, fd - 1, 32, 36, '#8d8870')
      P.rect(fx, fd, 30, 34, '#f8f6ee')
      P.text('FORM 104', fx + 15, fd + 3, 5, '#333333')
      P.rect(fx + 4, fd + 12, 6, 6, '#6b6b6b'); P.rect(fx + 5, fd + 13, 4, 4, '#ffffff')
      P.rect(fx + 4, fd + 21, 6, 6, '#6b6b6b'); P.rect(fx + 5, fd + 22, 4, 4, '#ffffff')
      P.rect(fx + 13, fd + 13, 12, 1, '#9a947c'); P.rect(fx + 13, fd + 22, 12, 1, '#9a947c')
      P.rect(fx + 20, fd + 25, 8, 8, '#c8202a'); P.rect(fx + 21, fd + 26, 6, 6, '#ffffff')
      P.text('X', fx + 24, fd + 26, 6, '#c8202a')
    } else {
      P.rect(8, fd + 4, 46, 13, '#b3202a')
      P.rect(10, fd + 6, 42, 9, '#f0e6c8')
      P.text('APPROVED', 31, fd + 8, 6, '#b3202a')
    }
  }

  // Cornisa: pila ancha de papeles con cinta
  for (let k = 0; k < 4; k++) {
    P.rect(0, k * 6, PIPE_W + 10, 5, k % 2 ? '#e9e0c6' : '#f4efdd')
    P.rect(0, k * 6 + 5, PIPE_W + 10, 1, '#a89b78')
  }
  P.rect(0, 0, PIPE_W + 10, 2, '#ffffff')
  P.rect(0, 10, PIPE_W + 10, 6, '#c8202a')
  P.rect(0, 16, PIPE_W + 10, 1, '#6e0f16')
  P.rect(0, 22, PIPE_W + 10, 4, '#8d8368')
  return c
}

function buildClockTexture(seed, flip) {
  const rnd = mulberry32(seed)
  const c = makeCanvas(PIPE_W + 10, H)
  const P = makePainter(c.getContext('2d'), flip)
  const g = P.g

  // Torre de piedra estilo Big Ben
  P.rect(5, CROWN_H, PIPE_W, H - CROWN_H, '#b8955a')
  for (let d = CROWN_H + 4; d < H; d += 8) {
    P.rect(5, d, PIPE_W, 1, '#a07f48')
    const off = Math.floor(rnd() * 4) * 8 + 6
    for (let x = off; x < 57; x += 14) P.rect(x, d - 7, 1, 7, '#a07f48')
  }
  P.rect(5, CROWN_H, 3, H - CROWN_H, '#d8b676')
  P.rect(53, CROWN_H, 4, H - CROWN_H, '#8a6a38')
  P.rect(12, CROWN_H, 2, H - CROWN_H, '#8a6a38')   // pilastras
  P.rect(48, CROWN_H, 2, H - CROWN_H, '#8a6a38')

  // Ventanas ojivales y cintas doradas lejos de la cara
  for (let d = CROWN_H + 78; d < H; d += 46) {
    for (const x of [19, 37]) {
      P.rect(x, d, 6, 12, '#2a1a08')
      P.circle(x + 3, d + 12, 3, '#2a1a08')
      P.rect(x + 2, d + 2, 2, 4, '#f6d27a')
    }
    if (rnd() < 0.7) P.rect(5, d + 24, PIPE_W, 3, '#d9a441')
  }

  // Marco cuadrado dorado con la única cara del reloj
  const cd = CROWN_H + 33
  const cy = P.cy(cd)
  P.rect(5, cd - 27, PIPE_W, 54, '#5a3f1a')
  P.rect(7, cd - 25, PIPE_W - 4, 50, '#d9a441')
  P.rect(9, cd - 23, PIPE_W - 8, 46, '#6e4f22')
  P.circle(31, cd, 23, '#d9a441')
  P.circle(31, cd, 21, '#3d2208')
  P.circle(31, cd, 20, '#f4e9c8')
  g.fillStyle = '#3d2208'
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2
    const big = k % 3 === 0
    const r = 17
    const sz = big ? 3 : 2
    g.fillRect(Math.round(31 + Math.cos(a) * r - sz / 2), Math.round(cy + Math.sin(a) * r - sz / 2), sz, sz)
  }
  // Cara furiosa: ojos rojos, cejas y ceño fruncido
  g.fillStyle = '#e8271a'
  g.beginPath(); g.arc(24, cy - 3, 4.5, 0, Math.PI * 2); g.fill()
  g.beginPath(); g.arc(38, cy - 3, 4.5, 0, Math.PI * 2); g.fill()
  g.fillStyle = '#2a0a0a'
  g.fillRect(24, cy - 4, 3, 3); g.fillRect(36, cy - 4, 3, 3)
  g.fillStyle = '#ffffff'
  g.fillRect(21, cy - 7, 1, 1); g.fillRect(35, cy - 7, 1, 1)
  g.strokeStyle = '#2a0a0a'
  g.lineWidth = 2
  g.beginPath()
  g.moveTo(16, cy - 12); g.lineTo(28, cy - 7)
  g.moveTo(46, cy - 12); g.lineTo(34, cy - 7)
  g.stroke()
  g.beginPath()
  g.arc(31, cy + 14, 8, Math.PI * 1.15, Math.PI * 1.85)
  g.stroke()

  // Cornisa de piedra con borde dorado
  P.rect(0, 0, PIPE_W + 10, CROWN_H, '#a8844a')
  P.rect(0, 0, PIPE_W + 10, 3, '#e6c88a')
  P.rect(0, 3, PIPE_W + 10, 1, '#c9a56a')
  P.rect(0, 9, PIPE_W + 10, 4, '#d9a441')
  for (let x = 2; x < PIPE_W + 10; x += 8) P.rect(x, 14, 5, 5, '#8a6a38')
  P.rect(0, 22, PIPE_W + 10, 4, '#5a3f1a')
  return c
}

const themeCache = {}
function getThemeTextures(theme, variant) {
  const key = `${theme}-${variant}`
  if (!themeCache[key]) {
    const build = theme === 1 ? buildPaperTexture : buildClockTexture
    const seed = theme * 1000 + variant * 77
    themeCache[key] = { up: build(seed, false), down: build(seed, true) }
  }
  return themeCache[key]
}

const BALL_COLORS = [
  { hi: '#ff6a5a', mid: '#d9221f', lo: '#8e1010', rim: '#7a0f14', glow: 'rgba(255,60,60,0.7)' },
  { hi: '#6aa8ff', mid: '#1f5fd9', lo: '#0f2f80', rim: '#0b1f5a', glow: 'rgba(60,120,255,0.7)' },
  { hi: '#6aff8a', mid: '#1fa83a', lo: '#0f6020', rim: '#0b4016', glow: 'rgba(60,255,120,0.7)' },
  { hi: '#ffe27a', mid: '#e0a20f', lo: '#8a5a05', rim: '#5a3a03', glow: 'rgba(255,200,60,0.7)' },
  { hi: '#c88aff', mid: '#8a2fd0', lo: '#4a1480', rim: '#300c58', glow: 'rgba(170,80,255,0.7)' },
  { hi: '#ffaa5a', mid: '#f07818', lo: '#9a4108', rim: '#6a2a05', glow: 'rgba(255,140,40,0.7)' },
]

function buildSkylineLayer(seed, bodyColor, edgeColor, maxH, minH, windowChance) {
  const rnd = mulberry32(seed)
  const c = makeCanvas(W, maxH + 20)
  const g = c.getContext('2d')
  const base = c.height
  let x = 0
  while (x < W) {
    let bw = 16 + Math.floor(rnd() * 20)
    if (W - (x + bw) < 14) bw = W - x
    const bh = minH + Math.floor(rnd() * (maxH - minH))
    g.fillStyle = bodyColor
    g.fillRect(x, base - bh, bw, bh)
    g.fillStyle = edgeColor
    g.fillRect(x, base - bh, bw, 1)
    if (rnd() < 0.35 && bw > 8) {
      g.fillStyle = bodyColor
      g.fillRect(x + Math.floor(bw / 2), base - bh - 10, 2, 10)
    }
    for (let wy = base - bh + 5; wy < base - 4; wy += 7) {
      for (let wx = x + 3; wx + 3 < x + bw; wx += 6) {
        if (rnd() < windowChance) {
          g.fillStyle = rnd() < 0.7 ? '#ffb347' : '#ff5fa8'
          g.fillRect(wx, wy, 3, 3)
        }
      }
    }
    x += bw
  }
  return c
}

function buildSky() {
  const rnd = mulberry32(80)
  const c = makeCanvas(W, GROUND_Y)
  const g = c.getContext('2d')

  const grad = g.createLinearGradient(0, 0, 0, GROUND_Y)
  grad.addColorStop(0, '#0b0b3b')
  grad.addColorStop(0.32, '#2a1a6e')
  grad.addColorStop(0.55, '#6a2c91')
  grad.addColorStop(0.75, '#c2418f')
  grad.addColorStop(0.92, '#ff7a6e')
  grad.addColorStop(1, '#ffb347')
  g.fillStyle = grad
  g.fillRect(0, 0, W, GROUND_Y)

  // Stars
  for (let i = 0; i < 45; i++) {
    g.fillStyle = rnd() < 0.5 ? '#ffffff' : '#c9b8ff'
    g.fillRect(Math.floor(rnd() * W), Math.floor(rnd() * GROUND_Y * 0.5), 1, 1)
  }

  // Striped retro sun
  const sunX = 62, sunY = 345, sunR = 44
  const sun = makeCanvas(sunR * 2, sunR * 2)
  const sg = sun.getContext('2d')
  const sunGrad = sg.createLinearGradient(0, 0, 0, sunR * 2)
  sunGrad.addColorStop(0, '#ffe066')
  sunGrad.addColorStop(1, '#ff7a4d')
  sg.fillStyle = sunGrad
  sg.beginPath()
  sg.arc(sunR, sunR, sunR, 0, Math.PI * 2)
  sg.fill()
  sg.globalCompositeOperation = 'destination-out'
  for (let i = 0; i < 6; i++) {
    sg.fillRect(0, sunR + 6 + i * 8, sunR * 2, 1 + i * 0.7)
  }
  g.drawImage(sun, sunX - sunR, sunY - sunR)

  // Mountains
  const mountain = (color, base, amp, seed) => {
    const r = mulberry32(seed)
    g.fillStyle = color
    g.beginPath()
    g.moveTo(0, GROUND_Y)
    let y = base
    for (let x = 0; x <= W; x += 16) {
      y = base - r() * amp
      g.lineTo(x, y)
    }
    g.lineTo(W, GROUND_Y)
    g.closePath()
    g.fill()
  }
  mountain('#5a2f92', 400, 26, 5)
  mountain('#40237a', 416, 22, 9)
  return c
}

// ─── SEÑAL DE LA ESTRELLA ─────────────────────────────────────────────────────
// Una batiseñal, pero proyectando la estrella del logo en vez del murciélago.
// El haz nace entre los edificios y sube en diagonal hasta el emblema. Se
// dibuja antes de las capas de skyline, así los edificios le tapan la base y
// parece que sale de atrás de ellos y no flotando sobre la ciudad.
const SIGNAL = { x: 246, y: 104, r: 30 }
const SIGNAL_BASE = { x: 84, y: GROUND_Y }

// El emblema es el logo recortado tal cual (star_signal.png), no una estrella
// generada: sus ocho puntas son todas de largo y ancho distintos y el mango
// sale en diagonal, así que cualquier estrella dibujada por fórmula quedaba
// parecida pero no igual. Estas medidas son del PNG: dónde cae el centro del
// aro y cuánto mide su radio exterior, para poder escalarlo a SIGNAL.r.
const SIGNAL_IMG = { cx: 74, cy: 69.5, r: 69.75 }

function buildStarSignal(emblem) {
  const c = makeCanvas(W, GROUND_Y)
  const g = c.getContext('2d')
  const { x: sx, y: sy, r } = SIGNAL

  // Haz: un cono que se abre desde los edificios hasta el emblema. Arranca
  // transparente abajo para que no se note dónde nace entre las azoteas.
  const ang = Math.atan2(sy - SIGNAL_BASE.y, sx - SIGNAL_BASE.x)
  const nx = Math.cos(ang + Math.PI / 2)
  const ny = Math.sin(ang + Math.PI / 2)
  const beam = (halfBase, halfTop, alpha) => {
    const grad = g.createLinearGradient(SIGNAL_BASE.x, SIGNAL_BASE.y, sx, sy)
    grad.addColorStop(0, 'rgba(150, 220, 255, 0)')
    grad.addColorStop(0.5, `rgba(170, 225, 255, ${alpha * 0.5})`)
    grad.addColorStop(1, `rgba(220, 245, 255, ${alpha})`)
    g.fillStyle = grad
    g.beginPath()
    g.moveTo(SIGNAL_BASE.x + nx * halfBase, SIGNAL_BASE.y + ny * halfBase)
    g.lineTo(SIGNAL_BASE.x - nx * halfBase, SIGNAL_BASE.y - ny * halfBase)
    g.lineTo(sx - nx * halfTop, sy - ny * halfTop)
    g.lineTo(sx + nx * halfTop, sy + ny * halfTop)
    g.closePath()
    g.fill()
  }
  // Los dos conos superpuestos leen como tres haces: el núcleo brillante y, a
  // los costados, lo que sobra del cono ancho. El ancho de arriba del cono
  // exterior es exactamente r, o sea que el haz termina midiendo lo mismo que
  // la señal: más abierto que eso se veía más grande que el propio emblema.
  beam(12, r, 0.15)          // cono ancho y tenue
  beam(3.5, r * 0.33, 0.30)  // núcleo del haz

  // Resplandor del emblema. Se apaga justo en el borde del aro, no más afuera:
  // desbordado se veía como una mancha redonda alrededor de la señal en vez de
  // un disco de luz proyectado.
  const halo = g.createRadialGradient(sx, sy, 0, sx, sy, r)
  halo.addColorStop(0, 'rgba(200, 240, 255, 0.55)')
  halo.addColorStop(0.6, 'rgba(150, 205, 255, 0.28)')
  halo.addColorStop(1, 'rgba(120, 180, 255, 0)')
  g.fillStyle = halo
  g.beginPath()
  g.arc(sx, sy, r, 0, Math.PI * 2)
  g.fill()

  // Disco del emblema. Va bastante opaco a propósito: con poco relleno las
  // nubes que pasan por detrás se veían a través y ensuciaban la estrella.
  g.fillStyle = 'rgba(200, 236, 255, 0.36)'
  g.beginPath()
  g.arc(sx, sy, r, 0, Math.PI * 2)
  g.fill()

  // El logo, escalado para que su aro mida SIGNAL.r y centrado en la señal.
  const k = r / SIGNAL_IMG.r
  const ex = sx - SIGNAL_IMG.cx * k
  const ey = sy - SIGNAL_IMG.cy * k
  const ew = emblem.width * k
  const eh = emblem.height * k

  // El brillo del emblema va en una pasada aparte recortada al disco, así el
  // halo tampoco se escapa del perímetro. Después se dibuja el logo nítido sin
  // recortar, porque el mango sale del aro y tiene que verse entero.
  // El desenfoque es corto a propósito: con uno grande el brillo se amontonaba
  // sobre el borde interno y el aro se veía bastante más grueso que en el logo.
  g.save()
  g.beginPath()
  g.arc(sx, sy, r, 0, Math.PI * 2)
  g.clip()
  g.shadowColor = '#9fe4ff'
  g.shadowBlur = 4
  g.drawImage(emblem, ex, ey, ew, eh)
  g.restore()

  g.drawImage(emblem, ex, ey, ew, eh)

  return c
}

// La señal depende de un PNG que llega por el cargador de imágenes, así que no
// puede armarse junto al resto de los assets: se arma una sola vez, en el
// primer cuadro en que el emblema ya está disponible.
let signalCache = null
function getStarSignal(emblem) {
  if (!signalCache && emblem) signalCache = buildStarSignal(emblem)
  return signalCache
}

let assetCache = null
function getAssets() {
  if (assetCache) return assetCache
  assetCache = {
    sky: buildSky(),
    far: buildSkylineLayer(11, '#2c2275', '#4b3aa0', 120, 50, 0.25),
    near: buildSkylineLayer(23, '#1a1456', '#2e2290', 84, 30, 0.35),
    buildings: [buildBuildingTexture(101), buildBuildingTexture(202), buildBuildingTexture(303)],
  }
  return assetCache
}

// ─── RETRO DRAWERS ────────────────────────────────────────────────────────────

function drawCloudCanvas(ctx, x, y, s) {
  const u = 4 * s
  ctx.fillStyle = '#ff7bb0'
  ctx.fillRect(x, y, 10 * u, u)
  ctx.fillRect(x + 2 * u, y - u, 6 * u, u)
  ctx.fillRect(x + 4 * u, y - 2 * u, 3 * u, u)
  ctx.fillStyle = '#c04a9a'
  ctx.fillRect(x + u, y + u, 9 * u, u)
  ctx.fillStyle = '#ffb3d1'
  ctx.fillRect(x + 3 * u, y - u, 2 * u, u)
}

function drawBuilding(ctx, imgs, p) {
  const theme = p.theme || 0
  const texW = PIPE_W + 10
  const x = Math.round(p.x)
  const off = slideOffsets(p)
  const botY = Math.round(p.topH + p.gap - CROWN_H + off.bottom)
  const topBottom = Math.round(p.topH + CROWN_H + off.top)
  const topH = p.topH + CROWN_H   // alto del edificio de arriba
  const botH = H - (p.topH + p.gap - CROWN_H)
  ctx.imageSmoothingEnabled = false

  if (theme === 0) {
    const tex = getAssets().buildings[p.n % 3]
    // Edificio de abajo (cornisa arriba)
    ctx.drawImage(tex, 0, 0, texW, botH, x, botY, texW, botH)
    // Edificio de arriba (volteado para que la cornisa quede abajo)
    ctx.save()
    ctx.translate(x, topBottom)
    ctx.scale(1, -1)
    ctx.drawImage(tex, 0, 0, texW, topH, 0, 0, texW, topH)
    ctx.restore()
  } else {
    const t = getThemeTextures(theme, p.n % 3)
    ctx.drawImage(t.up, 0, 0, texW, botH, x, botY, texW, botH)
    ctx.drawImage(t.down, 0, H - topH, texW, topH, x, topBottom - topH, texW, topH)
  }
  ctx.imageSmoothingEnabled = true

  const logo = imgs['logo']
  if (theme === 0 && logo) {
    const lw = 46
    const lh = Math.round(lw * logo.height / logo.width)
    const lx = x + 5 + (PIPE_W - lw) / 2
    ctx.drawImage(logo, lx, p.topH + off.top - 4 - lh, lw, lh)
    ctx.drawImage(logo, lx, botY + CROWN_H + 4, lw, lh)
  }
}

function drawBall(ctx, x, y, n, color) {
  const r = BALL_R
  ctx.save()
  ctx.shadowColor = color.glow
  ctx.shadowBlur = 8
  ctx.fillStyle = color.rim
  ctx.beginPath()
  ctx.arc(x, y, r + 1, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  const body = ctx.createRadialGradient(x - 4, y - 4, 2, x, y, r)
  body.addColorStop(0, color.hi)
  body.addColorStop(0.6, color.mid)
  body.addColorStop(1, color.lo)
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()

  const inner = ctx.createRadialGradient(x - 2, y - 2, 1, x, y, r * 0.62)
  inner.addColorStop(0, '#ffffff')
  inner.addColorStop(1, '#e6dcc8')
  ctx.fillStyle = inner
  ctx.beginPath()
  ctx.arc(x, y, r * 0.62, 0, Math.PI * 2)
  ctx.fill()

  const label = String(n)
  const size = label.length <= 2 ? 10 : label.length === 3 ? 8 : 6
  ctx.font = `${size}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#14052e'
  ctx.fillText(label, x + 1, y + 1)
  ctx.textBaseline = 'alphabetic'
}

// ─── IMAGE-BASED DRAWERS ──────────────────────────────────────────────────────

function drawBirdImg(ctx, imgs, x, y, vel) {
  const angle = Math.min(Math.max(vel * 0.06, -0.5), 1.2)
  const img = imgs['bird']
  if (!img) return

  // El sprite incluye la estela completa; (x, y) queda sobre el cuerpo de la chava
  const w = img.width * GIRL_SCALE
  const h = img.height * GIRL_SCALE
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.drawImage(img, -w * GIRL_ANCHOR_X, -h * GIRL_ANCHOR_Y, w, h)
  ctx.restore()
}

// ─── SHARED DRAW FUNCTIONS ────────────────────────────────────────────────────

function neonText(ctx, text, x, y, size, color, glow, align = 'center') {
  ctx.save()
  ctx.font = `${size}px ${FONT}`
  ctx.textAlign = align
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#14052e'
  ctx.lineWidth = Math.max(3, size / 3)
  ctx.strokeText(text, x, y)
  ctx.shadowColor = glow
  ctx.shadowBlur = 8
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
  ctx.restore()
}

// Cartel con el problema que viene: BUROCRACIA, TIEMPO o COMPETENCIA. Cuando
// pelean varios, la etiqueta es una sola (es el mismo problema) y debajo van
// los nombres de los rivales, uno por línea. Apilados y no en una fila: los
// tres seguidos no entran en 320 px sin achicar la letra hasta no leerse.
// El panel se mide sobre el texto más ancho en vez de usar una medida fija.
function drawEnemyLabel(ctx, enemies) {
  const alpha = enemyLabelAlpha(enemies[0])
  if (alpha <= 0) return

  const meta = ENEMY_META[enemies[0].id]
  const subs = enemies.map(e => ENEMY_META[e.id].sub).filter(Boolean)
  const size = 14
  const subSize = 8
  const subLine = 12

  ctx.save()
  ctx.font = `${size}px ${FONT}`
  let w = ctx.measureText(meta.label).width
  ctx.font = `${subSize}px ${FONT}`
  subs.forEach(t => { w = Math.max(w, ctx.measureText(t).width) })
  ctx.restore()

  w += 36
  const h = 32 + (subs.length ? subs.length * subLine + 8 : 8)
  const x = (W - w) / 2
  const y = 96

  ctx.save()
  ctx.globalAlpha = alpha
  drawPanel(ctx, x, y, w, h, 8)
  neonText(ctx, meta.label, W / 2, y + 25, size, '#ffffff', meta.glow)
  // Cada nombre va en el color de su dueño, no todos en el mismo amarillo: es
  // la única pista de qué bicho es cuál antes de que empiecen a disparar.
  subs.forEach((t, i) => {
    const m = ENEMY_META[enemies[i].id]
    neonText(ctx, t, W / 2, y + 41 + i * subLine, subSize, m.ink || '#ffe44e', m.glow)
  })
  ctx.restore()
}

// Letrero de neón con el nombre de un rival, apoyado en el suelo debajo de él.
// Está copiado de los carteles que ya trae el arte de los sprites: chapa
// oscura, borde del color del bicho y las letras del mismo color encendidas.
//
// Lleva su propio dibujo en vez de usar drawPanel() porque aquel tiene el
// marco doble y el violeta fijos de los paneles de la interfaz; acá el marco
// es de un solo trazo y del color de cada uno.
function drawSignPlate(ctx, x, y, w, h, color) {
  const r = 4
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.lineTo(x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.lineTo(x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.lineTo(x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.closePath()
  ctx.fillStyle = 'rgba(10, 7, 32, 0.92)'
  ctx.fill()
  ctx.shadowColor = color
  ctx.shadowBlur = 6
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.restore()
}

// Los carteles de los tres rivales. El texto no pasa por neonText(): con una
// letra de 6 px su contorno oscuro (3 px de grosor mínimo) la empasta hasta no
// leerse. Acá el realce es solo el resplandor del propio color.
function drawEnemySigns(ctx, enemies) {
  enemies.forEach(e => {
    const sign = enemySign(e)
    if (!sign || sign.alpha <= 0) return

    const size = 6
    const h = 13
    ctx.save()
    ctx.font = `${size}px ${FONT}`
    const w = Math.ceil(ctx.measureText(sign.text).width) + 12
    ctx.restore()

    // El sitio donde queda parado va centrado bajo su dueño, pero recortado
    // contra los bordes: SCIENTIFIC GAMES mide casi 100 px y le toca el rival
    // más pegado al borde derecho. El corrimiento de la entrada y la salida se
    // suma DESPUÉS del recorte, así el cartel viaja con el rival en vez de
    // quedarse clavado en el borde mientras él todavía viene llegando.
    const restX = Math.max(3, Math.min(W - w - 3, sign.homeX - w / 2))
    const x = restX + sign.offset

    ctx.save()
    ctx.globalAlpha = sign.alpha
    drawSignPlate(ctx, x, sign.y, w, h, sign.color)
    ctx.font = `${size}px ${FONT}`
    ctx.textAlign = 'center'
    ctx.shadowColor = sign.color
    ctx.shadowBlur = 5
    ctx.fillStyle = sign.color
    ctx.fillText(sign.text, x + w / 2, sign.y + 9)
    ctx.restore()
  })
}

// El cielo es siempre el mismo. Antes, mientras duraban los fuegos
// artificiales, se oscurecía todo durante 3 segundos y volvía: se veía como un
// parpadeo raro en medio de la partida, no como un efecto.
function drawBackground(ctx, clouds, imgs, bgX) {
  const { sky, far, near } = getAssets()
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(sky, 0, 0)

  clouds.forEach(c => drawCloudCanvas(ctx, c.x, c.y, c.s))

  // La señal se proyecta sobre las nubes, así que va después de ellas y opaca:
  // con globalAlpha las nubes se transparentaban justo encima de la estrella y
  // le teñían el centro de rosa. La intensidad ya viene en el propio asset.
  const signal = getStarSignal(imgs.signal)
  if (signal) ctx.drawImage(signal, 0, 0)

  const layer = (img, factor) => {
    const off = -((bgX * factor) % W)
    const y = GROUND_Y - img.height
    ctx.drawImage(img, Math.round(off), y)
    ctx.drawImage(img, Math.round(off) + W, y)
  }
  layer(far, 0.15)
  layer(near, 0.4)
  ctx.imageSmoothingEnabled = true
}

function drawGround(ctx, groundX) {
  const grad = ctx.createLinearGradient(0, GROUND_Y, 0, H)
  grad.addColorStop(0, '#2b0f5e')
  grad.addColorStop(1, '#0a0420')
  ctx.fillStyle = grad
  ctx.fillRect(0, GROUND_Y, W, GROUND_H)

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, GROUND_Y, W, GROUND_H)
  ctx.clip()
  ctx.strokeStyle = 'rgba(255, 60, 172, 0.55)'
  ctx.lineWidth = 1
  for (let i = 1; i <= 5; i++) {
    const y = GROUND_Y + GROUND_H * (i / 5) * (i / 5)
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
    ctx.stroke()
  }
  for (let i = -3; i <= 8; i++) {
    const xb = i * 64 + groundX
    const xt = W / 2 + (xb - W / 2) * 0.3
    ctx.beginPath()
    ctx.moveTo(xt, GROUND_Y)
    ctx.lineTo(xb, H)
    ctx.stroke()
  }
  ctx.restore()

  ctx.save()
  ctx.shadowColor = '#ff3cac'
  ctx.shadowBlur = 8
  ctx.fillStyle = '#ff5fc8'
  ctx.fillRect(0, GROUND_Y, W, 2)
  ctx.restore()
}

function drawScore(ctx, score) {
  drawPanel(ctx, 8, 8, 112, 46, 4)
  neonText(ctx, 'SCORE', 18, 26, 8, '#ffb3f0', '#ff3cac', 'left')
  neonText(ctx, String(score).padStart(5, '0'), 18, 46, 18, '#ffffff', '#c04dff', 'left')
}

function drawPanel(ctx, x, y, w, h, radius = 6) {
  const path = (ix, iy, iw, ih, r) => {
    ctx.beginPath()
    ctx.moveTo(ix + r, iy)
    ctx.lineTo(ix + iw - r, iy)
    ctx.lineTo(ix + iw, iy + r)
    ctx.lineTo(ix + iw, iy + ih - r)
    ctx.lineTo(ix + iw - r, iy + ih)
    ctx.lineTo(ix + r, iy + ih)
    ctx.lineTo(ix, iy + ih - r)
    ctx.lineTo(ix, iy + r)
    ctx.closePath()
  }
  ctx.save()
  path(x, y, w, h, radius)
  ctx.fillStyle = 'rgba(16, 12, 58, 0.92)'
  ctx.fill()
  ctx.shadowColor = '#c04dff'
  ctx.shadowBlur = 8
  ctx.strokeStyle = '#c04dff'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.shadowBlur = 0
  path(x + 3, y + 3, w - 6, h - 6, radius)
  ctx.strokeStyle = 'rgba(255, 122, 217, 0.6)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.restore()
}

// ─── PANTALLA DE INICIO ───────────────────────────────────────────────────────
// De arriba abajo: logo, fila del nombre, tabla de puntajes, TAP TO START y el
// selector de héroes. El suelo arranca en GROUND_Y (456): todo entra arriba.

// El personaje flota a la izquierda (llega hasta x=104), así que la fila del
// nombre y la tabla van corridas a la derecha para no taparlo.
const NAME_ROW = { x: 110, y: 126, w: 200, h: 32 }
const NAME_BTN = { x: NAME_ROW.x + NAME_ROW.w - 66, y: NAME_ROW.y + 6, w: 54, h: 20 }
const LB_PANEL = { x: 110, y: 170, w: 200, h: 150 }
const LB_ROWS = 5

// La fila de heroes entra siempre en el ancho de pantalla: la casilla se achica
// sola cuando se suman personajes, hasta el tope de 70 px con el que se dibujo
// el selector original de cuatro.
const SEL_H = 58
const SEL_GAP = 6
const SEL_Y = 386
const SEL_MARGIN = 6
const SEL_W = Math.min(
  70,
  Math.floor((W - SEL_MARGIN * 2 - (HERO_IDS.length - 1) * SEL_GAP) / HERO_IDS.length)
)
const SEL_X0 = (W - (HERO_IDS.length * SEL_W + (HERO_IDS.length - 1) * SEL_GAP)) / 2

function inRect(r, lx, ly) {
  return lx >= r.x && lx <= r.x + r.w && ly >= r.y && ly <= r.y + r.h
}

function selSlot(i) {
  return { x: SEL_X0 + i * (SEL_W + SEL_GAP), y: SEL_Y, w: SEL_W, h: SEL_H }
}

// Devuelve el id del héroe tocado, o null si el toque fue fuera del selector.
function selHitTest(lx, ly) {
  for (let i = 0; i < HERO_IDS.length; i++) {
    if (inRect(selSlot(i), lx, ly)) return HERO_IDS[i]
  }
  return null
}

function heroLabel(id) {
  return id === 'bird' ? 'BRIGHT' : HERO_META[id].name
}

function loadCharacter() {
  const saved = localStorage.getItem('fb_char')
  return HERO_IDS.includes(saved) ? saved : 'bird'
}

// Retrato chico dentro de una casilla del selector.
function drawPortrait(ctx, id, imgs, cx, cy) {
  const src = imgs[id]
  if (!src) return
  const anchorX = id === 'bird' ? GIRL_ANCHOR_X : HERO_ANCHOR_X
  // El retrato también usa la escala relativa del héroe, para que en el
  // selector se vean del mismo tamaño que se ven jugando.
  const ratio = id === 'bird' ? 1 : heroScale(id) / HERO_BASE_SCALE
  const s = (SEL_W / src.width) * ratio
  ctx.drawImage(src, cx - src.width * s * anchorX, cy - src.height * s * 0.5, src.width * s, src.height * s)
}

// Fila del nombre, con su botón de CAMBIAR. Se puede tocar el botón o la fila.
function drawNameRow(ctx, playerName) {
  const r = NAME_ROW
  drawPanel(ctx, r.x, r.y, r.w, r.h, 6)

  ctx.save()
  ctx.textAlign = 'left'
  ctx.font = `6px ${FONT}`
  ctx.fillStyle = '#ffb3f0'
  ctx.fillText('JUGADOR', r.x + 12, r.y + 13)

  ctx.font = `10px ${FONT}`
  ctx.fillStyle = playerName ? '#ffe44e' : '#9b8bc9'
  ctx.fillText(playerName || 'SIN NOMBRE', r.x + 12, r.y + 26)
  ctx.restore()

  const b = NAME_BTN
  ctx.save()
  ctx.fillStyle = '#c04dff'
  ctx.strokeStyle = '#ff7ad9'
  ctx.lineWidth = 1
  ctx.fillRect(b.x, b.y, b.w, b.h)
  ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1)
  ctx.font = `6px ${FONT}`
  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffffff'
  ctx.fillText('CAMBIAR', b.x + b.w / 2, b.y + 13)
  ctx.restore()
}

// Tabla de puntajes estilo arcade: puesto, nombre y score.
function drawLeaderboard(ctx, playerName) {
  const p = LB_PANEL
  drawPanel(ctx, p.x, p.y, p.w, p.h, 8)
  neonText(ctx, 'HIGH SCORES', p.x + p.w / 2, p.y + 22, 9, '#7ef0ff', '#00b7ff')

  ctx.save()
  ctx.strokeStyle = 'rgba(255, 122, 217, 0.6)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(p.x + 12, p.y + 32)
  ctx.lineTo(p.x + p.w - 12, p.y + 32)
  ctx.stroke()
  ctx.restore()

  const key = normalizeName(playerName)
  const medal = ['#ffd23f', '#d8d8e8', '#e08a3c']   // oro, plata, bronce

  const row = (e, place, y, mine) => {
    ctx.fillStyle = mine ? '#7cffb2' : '#9b8bc9'
    ctx.textAlign = 'left'
    ctx.fillText(String(place), p.x + 12, y)
    ctx.fillStyle = mine ? '#7cffb2' : (medal[place - 1] || '#cbbdf0')
    ctx.fillText(e.name, p.x + 30, y)
    ctx.textAlign = 'right'
    ctx.fillText(String(e.score), p.x + p.w - 12, y)
  }

  ctx.save()
  ctx.font = `8px ${FONT}`
  topScores(LB_ROWS).forEach((e, i) => {
    row(e, i + 1, p.y + 48 + i * 17, key && normalizeName(e.name) === key)
  })

  // Si el jugador quedó fuera del top, su puesto va abajo de todo.
  const rank = rankOf(playerName)
  if (rank > LB_ROWS) {
    ctx.strokeStyle = 'rgba(255, 122, 217, 0.35)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(p.x + 12, p.y + 124)
    ctx.lineTo(p.x + p.w - 12, p.y + 124)
    ctx.stroke()
    row(getScores()[rank - 1], rank, p.y + 140, true)
  }
  ctx.restore()
}

function drawStartScreen(ctx, flashAlpha, character, imgs, playerName) {
  neonText(ctx, 'BRIGHTSTAR', W / 2, 70, 24, '#ffe44e', '#ff8c1a')
  neonText(ctx, 'GAME', W / 2, 110, 32, '#ffffff', '#ff3cac')

  drawNameRow(ctx, playerName)
  drawLeaderboard(ctx, playerName)

  if (flashAlpha > 0.3) {
    drawPanel(ctx, W / 2 - 110, 330, 220, 46, 8)
    neonText(ctx, 'TAP TO START', W / 2, 360, 12, '#ffffff', '#c04dff')
  }

  HERO_IDS.forEach((id, i) => {
    const r = selSlot(i)
    const on = id === character

    ctx.save()
    ctx.globalAlpha = on ? 1 : 0.5
    drawPanel(ctx, r.x, r.y, r.w, r.h, 6)
    drawPortrait(ctx, id, imgs, r.x + r.w / 2, r.y + 24)
    ctx.restore()

    ctx.save()
    ctx.font = `6px ${FONT}`
    ctx.textAlign = 'center'
    ctx.fillStyle = on ? '#ffe44e' : '#a596cc'
    ctx.fillText(heroLabel(id), r.x + r.w / 2, r.y + r.h - 8)
    ctx.restore()

    if (on) {
      ctx.save()
      ctx.strokeStyle = '#ffe44e'
      ctx.shadowColor = '#ff8c1a'
      ctx.shadowBlur = 8
      ctx.lineWidth = 2
      ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2)
      ctx.restore()
    }
  })
}

function drawGameOver(ctx, score, best) {
  ctx.fillStyle = 'rgba(10, 4, 32, 0.6)'
  ctx.fillRect(0, 0, W, H)

  const bannerY = 150
  drawPanel(ctx, W / 2 - 140, bannerY, 280, 60, 8)
  neonText(ctx, 'GAME OVER', W / 2, bannerY + 38, 20, '#ff5a6e', '#ff1744')

  const panelX = W / 2 - 130
  const panelY = 230
  drawPanel(ctx, panelX, panelY, 260, 120, 8)

  neonText(ctx, 'SCORE', panelX + 20, panelY + 38, 12, '#ffb3f0', '#ff3cac', 'left')
  neonText(ctx, String(score), panelX + 240, panelY + 40, 20, '#ffffff', '#c04dff', 'right')

  ctx.strokeStyle = 'rgba(255, 122, 217, 0.6)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(panelX + 15, panelY + 60)
  ctx.lineTo(panelX + 245, panelY + 60)
  ctx.stroke()

  neonText(ctx, 'BEST', panelX + 20, panelY + 100, 12, '#ffb3f0', '#ff3cac', 'left')
  neonText(ctx, String(best), panelX + 240, panelY + 100, 20, '#ffd23f', '#ff8c1a', 'right')

  if (score >= 10) {
    const medal = score >= 40 ? '#ffd700' : score >= 20 ? '#c0c0c0' : '#cd7f32'
    ctx.save()
    ctx.beginPath()
    ctx.arc(panelX + 55, panelY + 72, 14, 0, Math.PI * 2)
    ctx.fillStyle = medal
    ctx.fill()
    ctx.strokeStyle = '#ff7ad9'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.font = '12px Arial'
    ctx.textAlign = 'center'
    ctx.fillStyle = '#fff'
    ctx.fillText(score >= 40 ? '🏆' : score >= 20 ? '🥈' : '🥉', panelX + 55, panelY + 77)
    ctx.restore()
  }

  const btnY = 378
  drawPanel(ctx, W / 2 - 90, btnY, 180, 56, 8)
  neonText(ctx, 'PLAY AGAIN', W / 2, btnY + 34, 12, '#ffffff', '#c04dff')
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export default function BrightstarGame() {
  const canvasRef = useRef(null)
  const stateRef = useRef(null)
  const imgsRef = useRef({})
  const rafRef = useRef(null)
  const lastTimeRef = useRef(null)
  const pipeTimerRef = useRef(0)

  const [playerName, setName] = useState(() => getPlayerName())
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [canvasSize, setCanvasSize] = useState({ w: W, h: H })

  // El bucle de render no se recrea cuando cambia el nombre, así que lo lee de
  // un ref en vez de capturarlo.
  const nameRef = useRef(playerName)
  useEffect(() => { nameRef.current = playerName }, [playerName])

  // Primera visita: se pide el nombre antes de jugar.
  useEffect(() => {
    if (!getPlayerName()) setEditingName(true)
  }, [])

  // La tabla de puntajes se trae una vez al abrir. No hace falta avisarle a
  // React: el ranking se dibuja en el canvas cuadro a cuadro, así que en
  // cuanto la cache se actualiza aparece solo.
  useEffect(() => { loadScores() }, [])

  const openNameEditor = useCallback(() => {
    setNameDraft(nameRef.current)
    setEditingName(true)
  }, [])

  const commitName = useCallback(() => {
    setName(setPlayerName(nameDraft))
    setEditingName(false)
  }, [nameDraft])

  const initState = useCallback(() => ({
    phase: 'start',
    character: loadCharacter(),  // Brightstar o uno de los tres héroes
    birdY: H / 2 - 40,
    birdVel: 0,
    pipes: [],
    score: 0,
    best: parseInt(localStorage.getItem('fb_best') || '0'),
    groundX: 0,
    clouds: [
      { x: 60,  y: 80,  s: 1 },
      { x: 190, y: 55,  s: 0.8 },
      { x: 260, y: 100, s: 0.7 },
    ],
    fireworksTimer: 0,
    particles: [],
    rainbowBirdTimer: 0,
    wingFrame: 0,
    wingTimer: 0,
    flashAlpha: 1,
    flashTimer: 0,
    deadTimer: 0,
    scoreSent: false,
    mode: DEBUG_ENEMY_IDS ? 'boss' : 'columns',   // 'columns' | 'boss'
    bossCycle: 0,
    enemies: DEBUG_ENEMY_IDS ? createEncounter(DEBUG_ENEMY_IDS, 0) : [],
    guides: [],          // bolitas que marcan el carril seguro durante el encuentro
    guideTimer: 0,
    shots: [],
    scored: new Set(),
    pipeCount: DEBUG_SKIP,
    bgX: 0,
  }), [])

  const spawnPipe = useCallback((n) => {
    const gap = n <= EASY_COUNT ? GAP_EASIEST : n <= EASY_COUNT * 2 ? GAP_EASY : PIPE_GAP
    const minTopH = 60
    const maxTopH = GROUND_Y - gap - 60
    const topH = Math.floor(Math.random() * (maxTopH - minTopH)) + minTopH
    return { x: W + 10, topH, gap, slide: 0, enterT: 1, exitT: 0, exiting: false }
  }, [])

  const checkCollision = useCallback((birdY, vel, char, pipes) => {
    if (DEBUG_GOD) return { hit: false }
    const circles = hitCircles(char, BIRD_X, birdY, vel)
    const CAP_W = PIPE_W + 10

    // Suelo / techo
    // La banda del suelo es decorado: se puede volar por encima. Solo mata el
    // borde de abajo de la pantalla (y el techo).
    if (circles.some(c => c.y - c.r <= 0 || c.y + c.r >= H)) return { hit: true, type: 'normal' }

    for (const p of pipes) {
      const bodyX = p.x + 5
      const capX = p.x
      const botY = p.topH + p.gap
      const off = slideOffsets(p)
      const isCentered = BIRD_X > capX + 5 && BIRD_X < capX + CAP_W - 5

      // Edificio de arriba: cuerpo + cornisa
      const top = [[bodyX, -100 + off.top, PIPE_W, p.topH + 100], [capX, p.topH + off.top, CAP_W, CROWN_H]]
      // Edificio de abajo: cornisa + cuerpo
      const bottom = [[capX, botY - CROWN_H + off.bottom, CAP_W, CROWN_H], [bodyX, botY + off.bottom, PIPE_W, H]]

      if (circles.some(c => top.some(r => circleHitsRect(c, ...r)))) {
        return { hit: true, type: isCentered ? 'enter_top' : 'normal', pipe: p }
      }
      if (circles.some(c => bottom.some(r => circleHitsRect(c, ...r)))) {
        return { hit: true, type: isCentered ? 'enter_bottom' : 'normal', pipe: p }
      }
    }
    return { hit: false }
  }, [])

  const jump = useCallback(() => {
    const s = stateRef.current
    if (!s) return
    if (s.phase === 'start') {
      s.phase = 'playing'
      s.birdVel = JUMP_VEL
      pipeTimerRef.current = 0
      return
    }
    if (s.phase === 'playing') {
      s.birdVel = JUMP_VEL
    }
    if (s.phase === 'dead' && s.deadTimer > RESTART_LOCK_MS) {
      const best = s.best
      stateRef.current = initState()
      stateRef.current.best = best
    }
  }, [initState])

  // Load images on mount
  useEffect(() => {
    const paths = {
      bird:      asset('assets/retro/girl.png'),
      logo:      asset('assets/retro/logo_banner.png'),
      signal:    asset('assets/retro/star_signal.png'),
      scarlet:    HERO_META.scarlet.src,
      aegis:      HERO_META.aegis.src,
      tempest:    HERO_META.tempest.src,
      gtech:      HERO_META.gtech.src,
      mrmexico:   HERO_META.mrmexico.src,
      denibot:    ENEMY_META.denibot.src,
      clocktitan: ENEMY_META.clocktitan.src,
      intralot:   ENEMY_META.intralot.src,
      genlot:     ENEMY_META.genlot.src,
      scigames:   ENEMY_META.scigames.src,
    }
    const keys = Object.keys(paths)
    keys.forEach(async (k) => {
      // Reintenta: por un túnel o red lenta alguna petición puede fallar
      for (let attempt = 0; attempt < 6; attempt++) {
        const img = await loadImage(paths[k])
        if (img) { imgsRef.current[k] = img; return }
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
      }
    })
  }, [])

  useEffect(() => {
    stateRef.current = initState()
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    const pickCharacter = (id) => {
      stateRef.current.character = id
      localStorage.setItem('fb_char', id)
    }

    // En la pantalla de inicio hay zonas que no hacen saltar: la fila del
    // nombre y el selector de héroes.
    const tappedUI = (clientX, clientY) => {
      const s = stateRef.current
      if (!s || s.phase !== 'start') return false
      const rect = canvas.getBoundingClientRect()
      const lx = (clientX - rect.left) / rect.width * W
      const ly = (clientY - rect.top) / rect.height * H

      if (inRect(NAME_ROW, lx, ly)) {
        openNameEditor()
        return true
      }
      const id = selHitTest(lx, ly)
      if (id) {
        pickCharacter(id)
        return true
      }
      return false
    }

    const onKey = (e) => {
      // Mientras se escribe el nombre, el teclado no controla el juego.
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return
      const s = stateRef.current
      if (s && s.phase === 'start' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
        e.preventDefault()
        const step = e.code === 'ArrowRight' ? 1 : -1
        const i = HERO_IDS.indexOf(s.character)
        pickCharacter(HERO_IDS[(i + step + HERO_IDS.length) % HERO_IDS.length])
        return
      }
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault()
        jump()
      }
    }
    const onTouch = (e) => {
      e.preventDefault()
      const t = e.changedTouches[0]
      if (t && tappedUI(t.clientX, t.clientY)) return
      jump()
    }
    const onClick = (e) => {
      if (tappedUI(e.clientX, e.clientY)) return
      jump()
    }

    window.addEventListener('keydown', onKey)
    canvas.addEventListener('touchstart', onTouch, { passive: false })
    canvas.addEventListener('mousedown', onClick)

    const loop = (timestamp) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp
      // El tope de 32 ms es el freno de mano de siempre: si la pestaña estuvo
      // dormida o el aparato se clavó, el juego no da un salto gigante de una
      // vez. Por debajo de ~31 fps eso hace que todo vaya en cámara lenta,
      // pero parejo: las columnas también aparecen más lento, así que la
      // separación entre ellas no cambia y se sigue pudiendo jugar.
      const dt = Math.min(timestamp - lastTimeRef.current, 32)
      lastTimeRef.current = timestamp
      const k = dt / FRAME_MS

      const s = stateRef.current
      const imgs = imgsRef.current
      const steps = Math.min(Math.floor(s.score / 10), SPEED_STEP_MAX)
      const speed = PIPE_SPEED * (1 + steps * 0.08)

      const renderChar = (c, x, y, vel) => (
        s.character === 'bird'
          ? drawBirdImg(c, imgs, x, y, vel)
          : drawHero(c, s.character, imgs[s.character], x, y, vel)
      )

      // ── UPDATE ──
      if (s.phase === 'playing') {
        s.birdVel += GRAVITY * k
        s.birdY += s.birdVel * k

        // Durante un encuentro no salen columnas: las que quedan se van solas.
        if (s.mode === 'columns') pipeTimerRef.current += dt
        if (s.mode === 'columns' && pipeTimerRef.current >= PIPE_INTERVAL) {
          const np = spawnPipe(s.pipeCount + 1)
          np.n = ++s.pipeCount
          np.theme = Math.floor((np.n - 1) / THEME_EVERY) % THEME_COUNT
          np.ballColor = Math.floor(Math.random() * BALL_COLORS.length)
          // La bolita muestra el puntaje con el que vas a quedar al agarrarla,
          // no el número de columna: así después de un enemigo sigue la cuenta
          // del score (que subió 10) en vez de volver al número viejo. Hay que
          // sumar las que ya están en pantalla sin cobrar, porque van antes.
          np.label = s.score + s.pipes.filter(o => !o.collected).length + 1
          if (np.n > 1 && (np.n - 1) % THEME_EVERY === 0) {
            // Cambio de tema: los actuales se van y el nuevo entra
            s.pipes.forEach(o => { o.exiting = true })
            np.enterT = 0
            np.slide = 1
          }
          s.pipes.push(np)
          pipeTimerRef.current = 0
        }
        s.pipes.forEach(p => { p.x -= speed * k; updateSlide(p, dt) })
        s.pipes = s.pipes.filter(p => p.x > -80)

        // ── Encuentro con enemigos ──
        if (s.enemies.length) {
          // Comparten el reloj de la pelea, así que terminan juntos: en cuanto
          // uno cumple su tiempo se van todos, y no queda uno solo bombardeando
          // después de que los demás se fueron.
          let over = false
          s.enemies.forEach(e => {
            // Les pasamos las bolitas para que no disparen al carril que
            // marcan: si no, la guía lleva al jugador justo al proyectil.
            const volley = updateEnemy(e, dt, s.birdY, s.guides)
            s.shots.push(...volley.shots)
            if (volley.done) over = true
          })
          if (over) s.enemies.forEach(startExit)

          // Las bolitas guía salen mientras haya pelea, nunca durante la salida:
          // si no, quedaban cruzando la pantalla con los jefes ya yéndose.
          if (!over) {
            s.guideTimer += dt
            if (s.guideTimer >= GUIDE_EVERY_MS) {
              s.guideTimer = 0
              // Lleva el puntaje con el que vas a quedar al agarrarla, igual
              // que las bolitas de los obstáculos: hay que contar las que ya
              // están en pantalla sin cobrar, porque van antes que esta.
              const label = s.score + s.guides.length * GUIDE_POINTS + GUIDE_POINTS
              const color = Math.floor(Math.random() * BALL_COLORS.length)
              const prev = s.guides[s.guides.length - 1]
              s.guides.push(spawnGuide(s.shots, label, color, prev && prev.y))
            }
          }

          // Las columnas no vuelven mientras quede un proyectil en el aire.
          // Son más rápidas que los tiros (aceleran con el puntaje, los tiros
          // no), así que la primera columna alcanza al rezagado y se lo lleva
          // puesto dentro del hueco: si el carril del tiro coincide con el
          // hueco, no hay por dónde pasar.
          //
          // El corte de andanadas tardías de updateEnemy() ya hace que casi
          // nunca quede nada, así que en la práctica esto no agrega espera;
          // está para que el encuentro no pueda terminar en una pantalla
          // imposible si algún día se tocan las velocidades.
          if (s.enemies.every(enemyGone) && !s.shots.length) {
            // Sobrevivir a tres paga por los tres.
            const scoreAntes = s.score
            s.score += BOSS_REWARD * s.enemies.length
            s.enemies = []
            s.guides = []
            s.guideTimer = 0
            s.mode = 'columns'
            // El ciclo es lo que sube la dificultad del encuentro (tamaño de
            // andanada, ritmo y velocidad de los tiros). Pasado el techo deja
            // de contar: todos los encuentros siguientes salen clavados en el
            // ciclo con el que llegaste al 100.
            if (scoreAntes < DIFFICULTY_CAP_SCORE) s.bossCycle++
            if (s.score > s.best) {
              s.best = s.score
              localStorage.setItem('fb_best', s.best)
            }
            pipeTimerRef.current = PIPE_INTERVAL   // la primera columna vuelve enseguida
          }
        }
        s.shots = updateShots(s.shots, dt)
        s.guides = updateGuides(s.guides, dt)

        const hc = hitCircles(s.character, BIRD_X, s.birdY, s.birdVel)

        // Bolitas guía: suman mientras dura la pelea, así el puntaje del
        // encuentro depende de cuánto aguantaste y no solo de si sobreviviste.
        if (s.guides.length) {
          const { got, left } = takeGuides(s.guides, hc)
          s.guides = left
          for (const g of got) {
            s.score += GUIDE_POINTS
            for (let i = 0; i < 8; i++) {
              const a = Math.random() * Math.PI * 2
              const v = Math.random() * 1.8 + 0.8
              s.particles.push({
                x: g.x, y: g.y,
                vx: Math.cos(a) * v, vy: Math.sin(a) * v,
                color: i % 2 ? '#ffe44e' : '#ffffff',
                life: 0.5,
              })
            }
          }
          if (got.length && s.score > s.best) {
            s.best = s.score
            localStorage.setItem('fb_best', s.best)
          }
        }

        s.pipes.forEach(p => {
          const ballX = p.x + 5 + PIPE_W / 2
          const ballY = p.topH + p.gap / 2
          if (!p.collected && hc.some(c => Math.hypot(ballX - c.x, ballY - c.y) < c.r + BALL_R)) {
            p.collected = true
            for (let i = 0; i < 14; i++) {
              const a = Math.random() * Math.PI * 2
              const v = Math.random() * 2 + 1
              s.particles.push({
                x: ballX, y: ballY,
                vx: Math.cos(a) * v, vy: Math.sin(a) * v,
                color: i % 2 ? '#ff3b3b' : '#ffffff',
                life: 0.6
              })
            }
            s.score++
            if (s.score === 10 || (s.score % 100 === 0 && s.score >= 100)) {
              s.fireworksTimer = 3000
            }
            if (s.score === 1000) {
              s.rainbowBirdTimer = 10000
            }
            if (s.score > s.best) {
              s.best = s.score
              localStorage.setItem('fb_best', s.best)
            }

            // Última columna de una tanda con enemigo: arranca el encuentro.
            // lap = vueltas completas de temas ya jugadas. La competencia sale
            // recién desde la segunda (obstáculo 40), no en la primera tanda de
            // edificios, que queda de respiro.
            const lap = Math.floor((p.n - 1) / (THEME_EVERY * THEME_COUNT))
            const bossIds = p.n % THEME_EVERY === 0 ? enemiesForTheme(p.theme, lap) : []
            if (bossIds.length && s.mode === 'columns') {
              s.mode = 'boss'
              s.enemies = createEncounter(bossIds, s.bossCycle)
              // La siguiente columna ya venía en camino: se va deslizándose en
              // vez de quedar cruzada en medio del encuentro. slideOffsets()
              // mueve también su colisión, así que deja de estorbar.
              // Arranca la salida avanzada porque easeIn empieza muy lento y la
              // columna llegaría al jugador antes de haberse apartado.
              s.pipes.forEach(o => { o.exiting = true; o.exitT = Math.max(o.exitT, 0.7) })
            }
          }
        })

        const col = checkCollision(s.birdY, s.birdVel, s.character, s.pipes)
        if (col.hit) {
          if (col.type === 'enter_bottom' || col.type === 'enter_top') {
            // Alinear la tubería perfectamente al centro horizontal del pájaro
            col.pipe.x = BIRD_X - (5 + PIPE_W / 2)

            s.phase = 'pipe_enter'
            s.pipeEnterType = col.type
            s.birdVel = 0
            s.deadTimer = 0
            playPipeSound()
          } else {
            s.phase = 'dead'
            s.birdVel = JUMP_VEL * 0.4
          }
        }

        // Un proyectil enemigo mata igual que un obstáculo.
        if (!DEBUG_GOD && s.phase === 'playing' && shotHits(s.shots, hc)) {
          s.phase = 'dead'
          s.birdVel = JUMP_VEL * 0.4
        }
      }

      if (s.phase === 'pipe_enter') {
        s.deadTimer += dt
        // Disminuimos la velocidad (1 en lugar de 2) para que sea 50% más lenta
        if (s.pipeEnterType === 'enter_bottom') {
          s.birdY += 1 * k
        } else {
          s.birdY -= 1 * k
        }
        if (s.deadTimer > PIPE_ENTER_MS) {
          s.phase = 'dead'
          s.deadTimer = 0
          s.birdVel = 0
          s.isHidden = true
        }
      }

      if (s.phase === 'dead') {
        s.deadTimer += dt
        // El puntaje entra a la tabla una sola vez, al morir.
        if (!s.scoreSent) {
          s.scoreSent = true
          submitScore(nameRef.current, s.score)
        }
        if (!s.isHidden) {
          s.birdVel += GRAVITY * k
          s.birdY = Math.min(s.birdY + s.birdVel * k, H - 24)
        }
      }

      if (s.phase !== 'dead' && s.phase !== 'pipe_enter') {
        s.groundX = (s.groundX - speed * k) % 64
        s.bgX += speed * k
      }

      if (s.phase === 'playing' || s.phase === 'pipe_enter') {
        if (s.rainbowBirdTimer > 0) {
          s.rainbowBirdTimer -= dt
        }
        if (s.fireworksTimer > 0) {
          s.fireworksTimer -= dt
          if (Math.random() < 0.08 * k) {
            const cx = Math.random() * W
            const cy = Math.random() * (GROUND_Y - 100) + 20
            const colors = ['#ff0044', '#00ff44', '#0044ff', '#ffff00', '#ff00ff', '#00ffff']
            const color = colors[Math.floor(Math.random() * colors.length)]
            for (let i = 0; i < 30; i++) {
              const angle = Math.random() * Math.PI * 2
              const speed = Math.random() * 2 + 1
              if (!s.particles) s.particles = []
              s.particles.push({
                x: cx, y: cy,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                color,
                life: 1.0
              })
            }
          }
        }
        if (s.particles && s.particles.length > 0) {
          s.particles.forEach(p => {
            p.x += p.vx * k
            p.y += p.vy * k
            p.vy += GRAVITY * 0.1 * k
            p.life -= dt * 0.001
          })
          s.particles = s.particles.filter(p => p.life > 0)
        }
      }

      if (s.phase === 'playing') {
        s.clouds.forEach(c => {
          c.x -= 0.5 * k
          if (c.x < -80) c.x = W + 80
        })
      }

      s.wingTimer += dt
      if (s.wingTimer > 120) {
        s.wingFrame = (s.wingFrame + 1) % 3
        s.wingTimer = 0
      }

      s.flashTimer += dt
      if (s.flashTimer > 600) s.flashTimer = 0
      s.flashAlpha = s.flashTimer < 300 ? 1 : 0

      // ── DRAW ──
      ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0)
      drawBackground(ctx, s.clouds, imgs, s.bgX)

      if (s.particles && s.particles.length > 0) {
        s.particles.forEach(p => {
          ctx.globalAlpha = Math.max(0, p.life)
          ctx.fillStyle = p.color
          ctx.beginPath()
          ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2)
          ctx.fill()
        })
        ctx.globalAlpha = 1.0
      }

      // Si está entrando a la tubería, dibujamos el pájaro ANTES de la tubería
      if (s.phase === 'pipe_enter' && !s.isHidden) {
        ctx.save()
        if (s.rainbowBirdTimer && s.rainbowBirdTimer > 0) {
          ctx.filter = `hue-rotate(${(Date.now() / 4) % 360}deg) saturate(200%)`
        }
        renderChar(ctx, BIRD_X, s.birdY, Math.min(Math.max(s.birdVel, -5), 5))
        ctx.restore()
      }

      drawGround(ctx, s.groundX)

      // Va después del suelo: apoya los pies sobre la grilla en vez de quedar
      // con las piernas tapadas por la banda del piso.
      s.enemies.forEach(e => drawEnemy(ctx, imgs[e.id], e))
      // Después de los rivales: los carteles van apoyados en el suelo, delante
      // de la grilla y por debajo de los pies de cada uno.
      drawEnemySigns(ctx, s.enemies)

      s.pipes.forEach(p => {
        drawBuilding(ctx, imgs, p)
        if (!p.collected) drawBall(ctx, p.x + 5 + PIPE_W / 2, p.topH + p.gap / 2, p.label, BALL_COLORS[p.ballColor])
      })

      // Las guías son las mismas bolitas de los obstáculos, a propósito: lo que
      // es redondo y numerado se agarra, y lo que no, mata. Van detrás de los
      // proyectiles porque primero hay que mirar lo que te mata.
      s.guides.forEach(g => drawBall(ctx, g.x, g.y, g.label, BALL_COLORS[g.color]))

      // Los proyectiles van adelante de los obstáculos, para que se vean bien.
      drawShots(ctx, s.shots)

      ctx.save()
      if (s.rainbowBirdTimer && s.rainbowBirdTimer > 0) {
        ctx.filter = `hue-rotate(${(Date.now() / 4) % 360}deg) saturate(200%)`
      }

      if (s.phase === 'start') {
        const floatY = s.birdY + Math.sin(Date.now() / 300) * 6
        renderChar(ctx, BIRD_X, floatY, 0)
        ctx.restore()
        drawStartScreen(ctx, s.flashAlpha, s.character, imgs, nameRef.current)
      } else {
        if (!s.isHidden && s.phase !== 'pipe_enter') {
          renderChar(ctx, BIRD_X, s.birdY, Math.min(Math.max(s.birdVel, -5), 5))
        }
        ctx.restore()

        drawScore(ctx, s.score)

        // El cartel va último: ni los edificios, ni los tiros, ni el personaje
        // lo tapan. Va acá adentro y no junto al enemigo porque con ?debug&enemy
        // el enemigo ya existe en la pantalla de inicio, y ahí no tiene sentido.
        if (s.enemies.length) drawEnemyLabel(ctx, s.enemies)
      }

      if (DEBUG_HITBOX) {
        ctx.strokeStyle = '#00ff66'
        ctx.lineWidth = 1
        hitCircles(s.character, BIRD_X, s.birdY, s.birdVel).forEach(c => {
          ctx.beginPath()
          ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2)
          ctx.stroke()
        })
        s.pipes.forEach(p => {
          const off = slideOffsets(p)
          ctx.strokeRect(p.x + 5, off.top, PIPE_W, p.topH)
          ctx.strokeRect(p.x, p.topH + off.top, PIPE_W + 10, CROWN_H)
          ctx.strokeRect(p.x, p.topH + p.gap - CROWN_H + off.bottom, PIPE_W + 10, CROWN_H)
          ctx.strokeRect(p.x + 5, p.topH + p.gap + off.bottom, PIPE_W, H)
          ctx.beginPath()
          ctx.arc(p.x + 5 + PIPE_W / 2, p.topH + p.gap / 2, BALL_R, 0, Math.PI * 2)
          ctx.stroke()
        })
      }

      if (s.phase === 'dead' && s.deadTimer > GAMEOVER_DELAY_MS) {
        drawGameOver(ctx, s.score, s.best)
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('keydown', onKey)
      canvas.removeEventListener('touchstart', onTouch)
      canvas.removeEventListener('mousedown', onClick)
    }
  }, [initState, spawnPipe, checkCollision, jump, openNameEditor])

  useEffect(() => {
    const resize = () => {
      const scale = Math.min(window.innerWidth / W, window.innerHeight / H)
      setCanvasSize({ w: W * scale, h: H * scale })
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  return (
    <div style={{ position: 'relative', width: canvasSize.w, height: canvasSize.h }}>
      <canvas
        ref={canvasRef}
        width={W * SCALE}
        height={H * SCALE}
        style={{ display: 'block', width: '100%', height: '100%', cursor: 'pointer' }}
      />

      {editingName && (
        <div
          style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            background: 'rgba(10, 4, 32, 0.85)',
          }}
        >
          <form
            onSubmit={(e) => { e.preventDefault(); commitName() }}
            style={{
              width: '80%', padding: '18px 16px', textAlign: 'center',
              fontFamily: FONT, background: '#1a0b3d',
              border: '2px solid #c04dff', borderRadius: 8,
              boxShadow: '0 0 14px #c04dff',
            }}
          >
            <div style={{ fontSize: 10, color: '#ffb3f0', marginBottom: 14 }}>TU NOMBRE</div>

            <input
              autoFocus
              value={nameDraft}
              maxLength={MAX_NAME}
              onChange={(e) => setNameDraft(e.target.value.toUpperCase().slice(0, MAX_NAME))}
              style={{
                width: '100%', boxSizing: 'border-box', padding: 8,
                fontFamily: FONT, fontSize: 12, textAlign: 'center',
                color: '#ffe44e', background: '#0a0420',
                border: '1px solid #ff7ad9', borderRadius: 4, outline: 'none',
              }}
            />

            <button
              type="submit"
              disabled={!nameDraft.trim()}
              style={{
                fontFamily: FONT, fontSize: 10, padding: '8px 18px', marginTop: 20, color: '#fff',
                background: nameDraft.trim() ? '#c04dff' : '#4a3a6a',
                border: 'none', borderRadius: 4,
                cursor: nameDraft.trim() ? 'pointer' : 'default',
              }}
            >
              LISTO
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
