// ─── HÉROES ───────────────────────────────────────────────────────────────────
// Los personajes extra. Son sprites PNG en pose de vuelo, con la estela de
// energía ya dibujada y el fondo recortado, igual que girl.png (Brightstar).

import { asset } from './assets'

export const HERO_IDS = ['bird', 'scarlet', 'aegis', 'tempest', 'gtech', 'mrmexico']

// Cada sprite trae el cuerpo de un tamaño distinto dentro de la misma imagen de
// 200x133, así que con una escala común se veían de tamaños diferentes: medido,
// había hasta 35% de diferencia de altura entre Aegis y Brightstar.
//
// La escala de cada uno sale de igualar la MASA VISUAL (la media geométrica de
// ancho por alto del cuerpo) con la de Brightstar, que es 43.9 px. No se iguala
// la altura sola porque Brightstar vuela en pose compacta y la mayoría en pose
// más horizontal: emparejar alturas dejaría a los anchos enormes.
//
// GTECH y Mr.México se ajustaron comparándolos contra los otros cuatro ya
// dibujados a escala de juego: GTECH es chibi (cabeza grande, cuerpo corto) y
// con la masa calculada se veía chica, así que va un poco más grande.
export const HERO_META = {
  scarlet:  { name: 'SCARLET', src: asset('assets/retro/scarlet.png'),  scale: 0.508 },
  aegis:    { name: 'AEGIS',   src: asset('assets/retro/aegis.png'),    scale: 0.575 },
  tempest:  { name: 'TEMPEST', src: asset('assets/retro/tempest.png'),  scale: 0.535 },
  gtech:    { name: 'GTECH',   src: asset('assets/retro/gtech.png'),    scale: 0.470 },
  mrmexico: { name: 'MR.MEX',  src: asset('assets/retro/mrmexico.png'), scale: 0.760 },
}

// Escala con la que se midieron los círculos de colisión de abajo.
export const HERO_BASE_SCALE = 0.545

export const HERO_ANCHOR_X = 0.75
export const HERO_ANCHOR_Y = 0.47

// Círculos de colisión [dx, dy, r] relativos al ancla, en píxeles de juego,
// a HERO_BASE_SCALE. heroHitCircles() los ajusta a la escala de cada héroe.
const BASE_HIT_CIRCLES = [
  [20, -6, 5],    // puño adelantado
  [16, -10, 7],   // cabeza
  [-1, -1, 10],   // torso
  [-12, 6, 7],    // caderas
  [-22, 11, 5],   // piernas
]

// GTECH no comparte la silueta de arriba: es chibi (cabeza grande, cuerpo
// corto, piernas recogidas) y vuela más erguida que el resto, así que con los
// círculos compartidos le quedaban la cabeza y las botas fuera del hitbox.
// Los suyos se midieron sobre su sprite y se guardan a HERO_BASE_SCALE igual
// que los de arriba, así que se siguen ajustando solos si cambia su escala.
const OWN_HIT_CIRCLES = {
  gtech: [
    [22, 1, 5],     // puño adelantado
    [5, -15, 10],   // cabeza
    [-6, 5, 9],     // torso con la G
    [-16, 14, 7],   // caderas y pierna de adelante
    [-29, 17, 6],   // bota de atrás
  ],
}

export function heroScale(id) {
  return HERO_META[id] ? HERO_META[id].scale : HERO_BASE_SCALE
}

// El hitbox tiene que encoger y crecer junto con el sprite.
export function heroHitCircles(id) {
  const k = heroScale(id) / HERO_BASE_SCALE
  const base = OWN_HIT_CIRCLES[id] || BASE_HIT_CIRCLES
  return base.map(([dx, dy, r]) => [dx * k, dy * k, r * k])
}

export function drawHero(ctx, id, img, x, y, vel) {
  if (!img) return
  const scale = heroScale(id)
  const angle = Math.min(Math.max(vel * 0.06, -0.5), 1.2)
  const w = img.width * scale
  const h = img.height * scale
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.drawImage(img, -w * HERO_ANCHOR_X, -h * HERO_ANCHOR_Y, w, h)
  ctx.restore()
}
