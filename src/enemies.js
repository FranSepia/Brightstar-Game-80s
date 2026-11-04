// ─── ENEMIGOS ─────────────────────────────────────────────────────────────────
// Los enemigos no conviven con las columnas: son un encuentro aparte.
//
// Al terminar una tanda de 10 columnas de un tema con enemigo, las columnas
// dejan de salir, el enemigo entra volando y durante el tiempo equivalente a
// 5 columnas te bombardea. Sobrevivís, se va, cobrás BOSS_REWARD y vuelven las
// columnas. No tiene vida ni se derrota: la corrida sigue siendo infinita.
//
// Tanda de papeleo   -> DENI-BOT
// Tanda de reloj      -> CLOCKTITAN
// Tanda de edificios  -> uno de la competencia, rotando
// Después se repite, un poco más difícil cada vuelta.

import { asset } from './assets'

const W = 320

// La competencia. La tanda de edificios es la ciudad, o sea el mercado, así
// que es donde aparecen los rivales. Rotan por turno para que no te toque dos
// veces seguidas el mismo.
export const COMPETITORS = ['intralot', 'genlot', 'scigames']

// Qué jefes cierran una tanda. Los dos temas con obstáculo propio tienen el
// suyo, de a uno. El de edificios saca a los tres rivales juntos, porque la
// competencia no se enfrenta de a uno.
//
// lap = cuántas vueltas completas de temas llevás. La primera tanda de
// edificios (lap 0) queda de respiro: recién en la segunda vuelta, al cerrar
// el obstáculo 40, aparece la competencia.
// El orden en que se conocen los jefes es: papeleo (DENI-BOT), reloj
// (CLOCKTITAN) y recién tercero la competencia. Por eso la primera tanda de
// edificios (lap 0) va sin jefe: si ahí ya saliera la competencia, sería la
// primera en aparecer y no la tercera.
export function enemiesForTheme(theme, lap) {
  if (theme === 1) return ['denibot']
  if (theme === 2) return ['clocktitan']
  return lap === 0 ? [] : COMPETITORS
}

// footDy y legs salen de medir los PNG, no de estimarlos: los sprites tienen
// relleno transparente abajo, así que el contenido no llega al borde de la
// imagen y los pies caen bastante más arriba de lo que uno supondría.
// footDy = distancia del centro del sprite a la planta de los pies, en px de
// juego. legs = centro y ancho de cada pata, también en px de juego.
export const ENEMY_META = {
  denibot: {
    name: 'DENI-BOT',
    label: 'BUROCRACIA',
    src: asset('assets/retro/denibot.png'),
    shot: 'paper',
    volleyMs: 1900,
    glow: '#ff3b3b',
    jet: ['#ff5a3c', '#ffd06a'],
    footDy: 61,
    legs: [{ dx: -9, w: 40 }, { dx: 60, w: 32 }],
  },
  clocktitan: {
    name: 'CLOCKTITAN',
    label: 'TIEMPO',
    src: asset('assets/retro/clocktitan.png'),
    shot: 'hand',
    volleyMs: 2100,
    glow: '#ffb021',
    jet: ['#ffb021', '#fff0b0'],
    footDy: 55,
    legs: [{ dx: -6, w: 42 }, { dx: 52, w: 32 }],
  },

  // La competencia comparte etiqueta ('COMPETENCIA') y se distingue por `sub`,
  // que es el nombre que sale en la segunda línea del cartel.
  intralot: {
    name: 'INTRALOT',
    label: 'COMPETENCIA',
    sub: 'INTRALOT',
    src: asset('assets/retro/intralot.png'),
    shot: 'iorb',
    volleyMs: 2000,
    glow: '#ff3b3b',
    jet: ['#ff4b2b', '#ffb37a'],
    footDy: 84,
    legs: [{ dx: -36, w: 40 }, { dx: 33, w: 31 }],
  },
  genlot: {
    // La etiqueta del arte dice 'GELLOT GENLOT' y el bicho lleva GG en la
    // cabeza, así que el nombre es ese y no solo GENLOT.
    name: 'GELLOT GENLOT',
    label: 'COMPETENCIA',
    sub: 'GELLOT GENLOT',
    src: asset('assets/retro/genlot.png'),
    shot: 'loto',
    volleyMs: 1850,
    glow: '#2fe8e0',
    jet: ['#1ba8c8', '#9ff4ff'],
    footDy: 84,
    legs: [{ dx: -50, w: 24 }, { dx: -9, w: 22 }, { dx: 48, w: 24 }],
  },
  scigames: {
    name: 'SCIENTIFIC GAMES',
    label: 'COMPETENCIA',
    sub: 'SCIENTIFIC GAMES',
    src: asset('assets/retro/scigames.png'),
    shot: 'atom',
    volleyMs: 2150,
    glow: '#6cff4a',
    jet: ['#3fbf2a', '#d3ff9a'],
    footDy: 84,
    legs: [{ dx: -10, w: 28 }, { dx: 39, w: 21 }],
  },
}

// La etiqueta del enemigo (ENEMY_META[id].label) aparece apenas entra y se
// apaga antes de la primera andanada: dice contra qué estás peleando sin
// quedar tapando la pista justo cuando hay que empezar a esquivar.
const LABEL_HOLD_MS = 1600
const LABEL_FADE_MS = 800

export function enemyLabelAlpha(e) {
  if (e.t <= LABEL_HOLD_MS) return 1
  return Math.max(0, 1 - (e.t - LABEL_HOLD_MS) / LABEL_FADE_MS)
}

// El encuentro dura lo mismo que 5 columnas (PIPE_INTERVAL = 1500 ms).
export const BOSS_MS = 7500
// Bonus por sobrevivir al encuentro. Es la mitad de lo que era: la otra mitad
// ahora se junta durante la pelea agarrando las bolitas guía, así morir a la
// mitad del encuentro ya no paga lo mismo que morir al principio.
export const BOSS_REWARD = 5

const SCALE = 0.9           // 200px de origen -> 180px en pantalla
const HOME_X = 240          // bien a la derecha: deja pista para ver venir el tiro

// Apoya los pies sobre la segunda línea de la grilla del suelo contando desde
// abajo. La grilla se dibuja en y = GROUND_Y + GROUND_H * (i/5)^2, o sea en
// 460, 474, 496, 528 y 568; la segunda desde abajo es 496.
const FOOT_Y = 496
const SLIDE_MS = 850
const CHARGE_MS = 520       // aviso antes de cada andanada

// Proyectiles grandes y lentos: se esquivan leyendo la trayectoria, no de reflejo.
// Con el jugador en x=72 y el disparo saliendo en x~270, el papel tarda ~2 s en
// llegar y la aguja ~1,6 s. Ese es el margen para maniobrar.
//
// Ese margen es una medida de TIEMPO, no de velocidad, y en grupo cada rival
// dispara desde una x distinta: el de más a la izquierda tiene 126 px de
// recorrido contra los 198 de referencia, o sea un tercio menos de margen para
// la misma velocidad. Por eso la velocidad de cada tiro se corrige por su
// distancia de salida (distanceK) y todos tardan lo mismo en llegar, venga de
// quien venga.
const BIRD_X = 72
const REF_SHOT_DIST = 270 - BIRD_X

function distanceK(launchX) {
  return Math.max(0.5, Math.min(1.6, (launchX - BIRD_X) / REF_SHOT_DIST))
}
const SHOTS = {
  paper: { speed: 96, r: 13, wobble: 30, spin: 0.0028, size: 26 },
  hand:  { speed: 126, r: 11, wobble: 0, spin: 0, size: 24 },
  // Los tres de la competencia: cada uno tira lo suyo.
  iorb:  { speed: 120, r: 12, wobble: 0, spin: 0.002, size: 26 },   // INTRALOT
  atom:  { speed: 104, r: 13, wobble: 18, spin: 0.005, size: 28 },  // SCIENTIFIC GAMES
  loto:  { speed: 96, r: 12, wobble: 26, spin: 0.0012, size: 26 },  // GELLOT GENLOT
}

// Franja jugable donde se reparten los carriles de la andanada.
const LANE_LO = 70
const LANE_HI = 410

const easeOut = (t) => 1 - (1 - t) ** 3

// Dónde se para cada rival y de qué tamaño, según cuántos peleen juntos.
//
// Los tres van agrupados a la derecha y no repartidos por la pantalla: el
// proyectil sale del cuerpo de quien dispara, así que un rival parado a la
// izquierda tendría la mitad del recorrido y te caería encima sin margen para
// leerlo. Juntos, los tres disparan desde la misma franja que un jefe solo.
// Se superponen un poco a propósito: leen como un grupo plantado.
// Los puestos salen de medir los sprites, no de tantear. Los tres de la
// competencia miden 200, 174 y 119 px de contenido (INTRALOT es el más ancho
// por la capa), o sea 493 px juntos. Entre x=130 (dejando pista al jugador) y
// x=318 (el borde) hay 188, así que van a escala 0.46 y pisándose 20 px entre
// vecinos: 493*0.46 - 2*20 = 187. Con escalas más grandes el de la derecha se
// cortaba contra el borde de la pantalla.
const LINEUP = {
  1: [{ x: HOME_X, scale: SCALE }],
  3: [
    { x: 176, scale: 0.46 },
    { x: 242, scale: 0.46 },
    { x: 290, scale: 0.46 },
  ],
}

// cycle = cuántos encuentros ya peleaste. Sube la dificultad de a poco.
export function createEncounter(ids, cycle = 0) {
  const spots = LINEUP[ids.length] || LINEUP[1]
  return ids.map((id, i) => {
    const spot = spots[Math.min(i, spots.length - 1)]
    return {
      id,
      cycle,
      groupSize: ids.length,
      homeX: spot.x,
      scale: spot.scale,
      t: 0,
      phase: 'in',
      slide: 1,
      fightMs: 0,
      // Disparan por turnos: si los tres soltaran la andanada en el mismo
      // instante no habría forma de leerla. El turno de cada uno es
      // i * intervalo / cantidad, y como volleyEvery() ya estira el intervalo
      // por la cantidad de rivales, eso se reduce a i * volleyMs.
      //
      // El arranque lleva un corrimiento al azar: sin él, dos peleas contra el
      // mismo rival disparaban en los mismos milisegundos exactos y se podían
      // aprender de memoria. Es chico (±10%) para no romper el turnado.
      fireTimer: i * ENEMY_META[id].volleyMs + (Math.random() - 0.5) * ENEMY_META[id].volleyMs * 0.2,
      // Se vuelve a sortear después de cada andanada (ver updateEnemy).
      volleyJitter: 0,
      charge: 0,
    }
  })
}

// Cuánto hay que encoger las medidas de ENEMY_META (footDy, legs), que están
// tomadas con el sprite a SCALE, para este rival en particular.
function sizeK(e) {
  return e.scale / SCALE
}

export function enemyPos(e) {
  // El centro se despeja desde la planta de los pies, que es lo que tiene que
  // caer sobre la línea de la grilla.
  const homeY = FOOT_Y - ENEMY_META[e.id].footDy * sizeK(e)
  return {
    x: e.homeX + e.slide * (W + 150 - e.homeX),
    // Apoyado en el suelo, así que apenas respira en lugar de flotar.
    y: homeY + Math.sin(e.t / 540) * 3,
  }
}

// Arranca con un solo proyectil por andanada y sube muy de a poco. En grupo se
// reparte: lo que tiene que quedar esquivable es el total en el aire, no lo que
// tira cada rival, así que tres juntos disparan uno cada uno.
function volleySize(e) {
  const solo = Math.min(3, 1 + Math.floor(e.cycle / 3))
  return Math.max(1, Math.round(solo / (e.groupSize || 1)))
}

// Cada cuánto dispara este rival. Repartir el tamaño de la andanada no alcanza:
// con tres tirando a su ritmo normal salían tres veces más proyectiles que
// contra un jefe solo y el encuentro se volvía una lluvia imposible de leer.
// El intervalo se estira por la cantidad de rivales, así que EL GRUPO dispara
// al mismo ritmo que dispararía uno solo.
//
// Estirarlo y nada más dejaba al encuentro de la competencia clavado en la
// dificultad del primer día, mientras los jefes solos sí suben andanada con
// los ciclos. Por eso el estirón se afloja de a poco: empieza igual de
// tranquilo que un jefe solo y para el ciclo 9 ya tira casi al mismo ritmo.
function volleyEvery(e) {
  const group = e.groupSize || 1
  if (group === 1) return ENEMY_META[e.id].volleyMs
  const tighten = Math.max(0.55, 1 - e.cycle * 0.05)
  return ENEMY_META[e.id].volleyMs * group * tighten
}

function speedMul(e) {
  return 1 + e.cycle * 0.06
}

// Cuánto tarda, en ms, un disparo de este rival en llegar hasta el jugador.
// Se calcula con la misma fórmula con la que después se dispara, así que si se
// toca la velocidad de los proyectiles esto la sigue solo.
function shotReachMs(e) {
  const launchX = e.homeX + 30 * sizeK(e)
  const speed = SHOTS[ENEMY_META[e.id].shot].speed * speedMul(e) * distanceK(launchX)
  return (launchX - BIRD_X) / speed * 1000
}

// Avanza el enemigo. Devuelve { shots, done }: done avisa que terminó la pelea.
// guides = las bolitas guía que hay en pantalla. El enemigo las necesita para
// no disparar al carril que marcan.
export function updateEnemy(e, dt, targetY, guides = []) {
  e.t += dt
  const shots = []
  const meta = ENEMY_META[e.id]

  if (e.phase === 'in') {
    e.slide = Math.max(0, e.slide - dt / SLIDE_MS)
    if (e.slide === 0) e.phase = 'fight'
    return { shots, done: false }
  }

  if (e.phase === 'out') {
    e.slide = Math.min(1, e.slide + dt / SLIDE_MS)
    return { shots, done: false }
  }

  // ── Peleando ──
  e.fightMs += dt
  e.fireTimer += dt

  // El intervalo lleva una variación que se sortea tras cada andanada, así que
  // el ritmo de la pelea nunca es el mismo dos veces. Va acotada a ±15% para
  // que siga siendo un ritmo reconocible y no un goteo errático.
  const every = volleyEvery(e) + (e.volleyJitter || 0)

  // No se empieza una andanada que no llegue a tiempo: el proyectil tiene que
  // alcanzar al jugador antes de que se acabe la pelea. Si no, queda cruzando
  // la pantalla con los rivales ya yéndose y las columnas a punto de volver.
  //
  // No es un detalle estético. Las columnas aceleran con el puntaje (un 8%
  // más cada 10 puntos, hasta el techo del punto 100) y los proyectiles no,
  // así que pasados los ~100 puntos la primera columna ALCANZA al tiro
  // rezagado y se lo lleva puesto dentro del hueco. Cuando el carril del tiro caía justo en el hueco, no había por
  // dónde pasar: el obstáculo era imposible, no difícil.
  //
  // El corte es "que llegue al jugador", no "que salga de pantalla": con la
  // segunda condición el rival de más a la izquierda, que es el más lento, se
  // quedaba sin disparar ni una vez en el encuentro.
  const aTiempo = e.fightMs + shotReachMs(e) <= BOSS_MS

  // La carga es el aviso de que viene la andanada: si no va a haber andanada,
  // tampoco hay aviso. Si no, el rival se iluminaba y no salía nada.
  e.charge = aTiempo && e.fireTimer > every - CHARGE_MS
    ? (e.fireTimer - (every - CHARGE_MS)) / CHARGE_MS
    : 0

  if (e.fireTimer >= every && aTiempo) {
    e.fireTimer = 0
    e.charge = 0
    e.volleyJitter = (Math.random() - 0.5) * volleyEvery(e) * 0.3
    const p = enemyPos(e)
    const n = volleySize(e)
    const launchY = p.y - 30 * sizeK(e)   // a la altura del brazo, no de los pies

    const launchX = p.x + 30 * sizeK(e)
    const fire = (aimY) => shots.push({
      kind: meta.shot,
      mul: speedMul(e) * distanceK(launchX),
      x: launchX,
      y: launchY,
      baseY: launchY,
      aimY: Math.max(LANE_LO, Math.min(LANE_HI, aimY)),
      travelled: 0,
      rot: 0,
      r: SHOTS[meta.shot].r,
      // Solo lo usa la bolilla de lotería, pero va en todos para no tener que
      // ramificar el disparo por tipo.
      n: 1 + Math.floor(Math.random() * 56),
    })

    const bands = n === 1 ? 3 : 5
    const bandH = (LANE_HI - LANE_LO) / bands
    const bandOf = (y) => Math.max(0, Math.min(bands - 1, Math.floor((y - LANE_LO) / bandH)))
    const here = bandOf(targetY)

    // El carril que marcan las bolitas NO se dispara. Sin esto la guía no
    // servía: el enemigo apunta siempre a donde está el jugador, y como el
    // jugador va siguiendo las bolitas, le caía el tiro justo encima de ellas.
    //
    // Se bloquean las bolitas más cercanas al jugador, no todas. El proyectil
    // tarda ~2 s en llegar y las bolitas salen cada 0,9 s, así que en ese rato
    // el jugador va a pasar por unas tres: ésas son las que hay que proteger.
    // Con solo dos quedaba un agujero — un tiro apuntado al carril de una
    // bolita todavía lejana llegaba justo cuando el jugador ya se había movido
    // ahí — y bloquear la fila entera deja al enemigo sin dónde tirar.
    const GUARDED = 3
    const cerca = [...guides].sort((a, b) => a.x - b.x).slice(0, GUARDED)
    const blocked = new Set(cerca.map(g => bandOf(g.y)))

    // También se bloquea la franja donde está el jugador cuando viene siguiendo
    // la guía. Sin esto quedaba un hueco: mientras cambia de un carril al otro
    // está EN TRÁNSITO, su franja no es la de ninguna bolita, y el enemigo le
    // tiraba justo ahí. Era el único caso en que seguir las bolitas no bastaba.
    const lead = cerca[0]
    const siguiendo = lead && Math.abs(targetY - lead.y) < 100
    if (siguiendo) blocked.add(here)

    let freeBands = []
    for (let i = 0; i < bands; i++) if (!blocked.has(i)) freeBands.push(i)

    // Si de tanto bloquear no queda ninguna franja, se libera la del jugador:
    // antes de no disparar, prefiero que el encuentro siga teniendo peligro.
    if (!freeBands.length && siguiendo) {
      blocked.delete(here)
      freeBands = [here]
    }

    // Si el jugador está parado en el carril seguro, el tiro va a otro lado:
    // ahí la respuesta es quedarse, no moverse. Si se salió de la guía, el
    // proyectil lo busca como siempre.
    const first = blocked.has(here)
      ? (freeBands.length ? freeBands[Math.floor(Math.random() * freeBands.length)] : here)
      : here

    // Los demás van a franjas separadas por al menos dos posiciones (136 px).
    // Como las franjas pegadas a una elegida nunca se usan, siempre queda una
    // salida libre a 68 px de donde estás.
    const chosen = [first]
    while (chosen.length < n) {
      const free = freeBands.filter(i => chosen.every(c => Math.abs(i - c) >= 2))
      if (!free.length) break
      chosen.push(free[Math.floor(Math.random() * free.length)])
    }

    // Dentro de su franja, cada tiro se corre un poco al azar en vez de ir
    // siempre al centro exacto. Sin esto los proyectiles sólo aparecían en 3 o
    // 5 alturas, siempre las mismas, y la pelea se veía calcada.
    //
    // El corrimiento es chico (±30% de la franja) y entra en aimY, así que la
    // guía lo ve: safeLane() mide el hueco contra el aimY de verdad y las
    // bolitas siguen marcando un carril despejado.
    chosen.forEach(i => {
      const centro = LANE_LO + bandH * (i + 0.5)
      fire(centro + (Math.random() - 0.5) * bandH * 0.6)
    })
  }

  return { shots, done: e.fightMs >= BOSS_MS }
}

// ─── BOLITAS GUÍA ─────────────────────────────────────────────────────────────
// Durante el encuentro cruzan la pantalla unas bolitas que marcan por dónde
// conviene pasar: salen siempre por el carril más lejano a los proyectiles que
// están en el aire. Siguiéndolas esquivás.
//
// Además son las que dan los puntos del encuentro. Antes el jefe pagaba un
// bonus fijo al irse y nada más, así que morir al principio o a la mitad daba
// lo mismo: cero. Ahora los puntos se van juntando mientras peleás.
export const GUIDE_EVERY_MS = 900
export const GUIDE_POINTS = 1
const GUIDE_SPEED = 92
// Mismo radio que las bolitas de los obstáculos (BALL_R en BrightstarGame.jsx):
// son las mismas bolitas, así que la colisión tiene que coincidir con el dibujo.
const GUIDE_R = 14

// El carril más despejado: de varios candidatos repartidos por la franja
// jugable, gana el que esté más lejos del proyectil más cercano.
// El carril más despejado en ESTE momento: de varios candidatos repartidos por
// la franja jugable, gana el que esté más lejos del proyectil más cercano.
//
// Sin proyectiles en el aire no hay nada de qué escaparse, así que devuelve
// `actual` y la fila se queda donde está. Antes devolvía el centro, y cada vez
// que la pantalla se vaciaba las bolitas saltaban al medio de golpe: eso era
// buena parte de lo que las hacía ver salteadas.
// Un carril se considera SEGURO si está a esta distancia o más del proyectil
// más cercano. Es un umbral absoluto, no un margen respecto del mejor: con un
// margen relativo, cuando todos los carriles estaban comprometidos el "casi
// tan bueno como el mejor" podía quedar pegado a un tiro, y la guía mandaba al
// jugador justo ahí. El valor sale del propio diseño de las andanadas, que
// dejan siempre una salida a 68 px; 80 da aire de sobra.
const SAFE_GAP = 80

export function safeLane(shots, actual) {
  if (!shots.length) return actual
  const CANDIDATES = 7
  const step = (LANE_HI - LANE_LO) / (CANDIDATES - 1)

  const gaps = []
  for (let i = 0; i < CANDIDATES; i++) {
    // Cada candidato se corre dentro de su tramo en vez de caer siempre en la
    // misma altura exacta: así la fila de bolitas no repite las mismas 7
    // posiciones en todos los encuentros.
    //
    // Esto NO afloja la seguridad: el hueco se mide después de correr el
    // candidato, así que el filtro de SAFE_GAP de más abajo juzga la altura
    // real a la que va a salir la bolita, no la de la grilla.
    const corrido = step * (Math.random() - 0.5) * 0.6
    const y = Math.max(LANE_LO, Math.min(LANE_HI, LANE_LO + step * i + corrido))
    let gap = Infinity
    for (const s of shots) gap = Math.min(gap, Math.abs(s.aimY - y))
    gaps.push({ y, gap })
  }

  // Entre todos los que son seguros se sortea, y por eso el camino cambia de
  // encuentro en encuentro: quedándose con el máximo exacto, ante los mismos
  // proyectiles la guía repetía siempre la misma ruta.
  const seguros = gaps.filter(g => g.gap >= SAFE_GAP)
  if (seguros.length) return seguros[Math.floor(Math.random() * seguros.length)].y

  // Ninguno llega al umbral: se usa el menos malo, sin sortear.
  return gaps.reduce((a, b) => (b.gap > a.gap ? b : a)).y
}

// label = el puntaje con el que vas a quedar al agarrarla, igual que las
// bolitas de los obstáculos; color = índice de BALL_COLORS.
// Toda la decisión de carril pasa acá, una sola vez: después la bolita ya no se
// mueve de su altura.
//
// El salto respecto de la bolita anterior está limitado a propósito. Eligiendo
// el carril más seguro a secas, dos bolitas seguidas podían salir una arriba y
// la otra abajo, y la fila se veía como puntos sueltos al azar en vez de un
// camino. Acotando el paso, la fila avanza en escalera hacia el lado seguro:
// sigue marcando por dónde pasar, pero se puede volar siguiéndola.
const GUIDE_STEP = 85

// Dónde arranca la fila de bolitas de un encuentro. Antes era el centro exacto
// de la franja, siempre: como al empezar todavía no hay proyectiles en el aire,
// safeLane() devolvía ese mismo valor y la primera bolita de TODOS los
// encuentros salía clavada en la misma altura. Ahora se sortea.
//
// Se deja un margen en los bordes para que la fila no arranque pegada al techo
// o al suelo, donde casi no hay hacia dónde seguir subiendo o bajando.
function startLane() {
  const margen = (LANE_HI - LANE_LO) * 0.2
  return LANE_LO + margen + Math.random() * (LANE_HI - LANE_LO - margen * 2)
}

export function spawnGuide(shots, label, color, prevY) {
  const from = prevY == null ? startLane() : prevY
  const target = safeLane(shots, from)
  const d = target - from
  const y = Math.abs(d) <= GUIDE_STEP ? target : from + Math.sign(d) * GUIDE_STEP
  return { x: W + 20, y, t: 0, r: GUIDE_R, label, color }
}

// Las bolitas quedan clavadas en su carril y solo avanzan hacia el jugador: la
// altura ya la decidió spawnGuide(). Que no se muevan es lo que deja leer el
// camino de una, como una fila de monedas, en vez de tener que seguir algo que
// se corre mientras lo mirás.
export function updateGuides(list, dt) {
  const alive = []
  for (const g of list) {
    g.x -= GUIDE_SPEED * (dt / 1000)
    g.t += dt
    if (g.x > -20) alive.push(g)
  }
  return alive
}

// Devuelve las bolitas que el jugador tocó este cuadro, y deja el resto.
export function takeGuides(list, circles) {
  const got = []
  const left = []
  for (const g of list) {
    const hit = circles.some(c => Math.hypot(c.x - g.x, c.y - g.y) < c.r + g.r)
    if (hit) got.push(g)
    else left.push(g)
  }
  return { got, left }
}

export function startExit(e) {
  if (e.phase !== 'out') e.phase = 'out'
}

export function enemyGone(e) {
  return e.phase === 'out' && e.slide >= 1
}

export function updateShots(list, dt) {
  const alive = []
  for (const s of list) {
    const cfg = SHOTS[s.kind]
    const step = cfg.speed * s.mul * (dt / 1000)
    s.x -= step
    s.travelled += step
    s.rot += cfg.spin * dt

    // Se acomoda rápido en su carril: hay que poder leer adónde va desde lejos.
    const k = Math.min(1, s.travelled / 120)
    s.y = s.baseY + (s.aimY - s.baseY) * easeOut(k)
    if (cfg.wobble) s.y += Math.sin(s.travelled / 38) * cfg.wobble * (1 - k * 0.55)

    if (s.x > -40) alive.push(s)
  }
  return alive
}

export function shotHits(list, circles) {
  for (const s of list) {
    for (const c of circles) {
      if (Math.hypot(s.x - c.x, s.y - c.y) < s.r + c.r) return true
    }
  }
  return false
}

// Venteos bajo cada pata. Las posiciones salen de medir el sprite, así que
// quedan calzados con las patas de cada enemigo y no a ojo.
function drawJets(ctx, e, p) {
  const meta = ENEMY_META[e.id]
  const [hot, core] = meta.jet
  const k = sizeK(e)
  const baseY = p.y + meta.footDy * k - 2

  ctx.save()
  for (const leg of meta.legs) {
    const flick = 0.6 + Math.sin(e.t / 42 + leg.dx) * 0.4
    const len = 10 * k * flick
    const x = p.x + leg.dx * k
    const half = (leg.w * k) / 2

    ctx.globalAlpha = 0.35
    ctx.fillStyle = hot
    ctx.beginPath()
    ctx.moveTo(x - half, baseY)
    ctx.lineTo(x + half, baseY)
    ctx.lineTo(x, baseY + len)
    ctx.closePath()
    ctx.fill()

    ctx.globalAlpha = 0.75
    ctx.fillStyle = core
    ctx.beginPath()
    ctx.moveTo(x - half * 0.45, baseY)
    ctx.lineTo(x + half * 0.45, baseY)
    ctx.lineTo(x, baseY + len * 0.6)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

export function drawEnemy(ctx, img, e) {
  if (!img) return
  const p = enemyPos(e)
  const w = img.width * e.scale
  const h = img.height * e.scale

  drawJets(ctx, e, p)

  ctx.save()
  if (e.charge > 0) {
    ctx.shadowColor = ENEMY_META[e.id].glow
    ctx.shadowBlur = 8 + e.charge * 30
  }
  ctx.drawImage(img, p.x - w / 2, p.y - h / 2, w, h)
  ctx.restore()
}

function drawPaper(ctx, s) {
  const u = SHOTS.paper.size / 2
  ctx.save()
  ctx.translate(s.x, s.y)
  ctx.rotate(s.rot)
  ctx.fillStyle = '#1a0d2e'
  ctx.fillRect(-u, -u - 2, u * 2, u * 2 + 4)
  ctx.fillStyle = '#efe6cf'
  ctx.fillRect(-u + 2, -u, u * 2 - 4, u * 2)
  ctx.fillStyle = '#b9ac8d'
  ctx.fillRect(-u + 5, -u + 5, u * 2 - 10, 2)
  ctx.fillRect(-u + 5, -u + 11, u * 2 - 10, 2)
  ctx.fillStyle = '#d02030'
  ctx.fillRect(-u + 5, u - 9, u * 2 - 10, 6)
  ctx.restore()
}

function drawHand(ctx, s) {
  ctx.save()
  ctx.translate(s.x, s.y)
  ctx.fillStyle = 'rgba(255, 60, 40, 0.45)'
  ctx.fillRect(4, -3, 40, 6)
  ctx.fillStyle = '#1a0d2e'
  ctx.beginPath()
  ctx.moveTo(-22, 0); ctx.lineTo(9, -10); ctx.lineTo(9, 10)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#ffc93c'
  ctx.beginPath()
  ctx.moveTo(-18, 0); ctx.lineTo(7, -7); ctx.lineTo(7, 7)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#fff3c4'
  ctx.beginPath()
  ctx.moveTo(-15, 0); ctx.lineTo(2, -3); ctx.lineTo(2, 2)
  ctx.closePath(); ctx.fill()
  ctx.restore()
}

// Los disparos de la competencia NO son redondos a propósito. Las bolitas
// redondas son las que se agarran para sumar, así que si un proyectil parece
// una bolita el jugador se tira a buscarlo y se mata. Por eso uno es una barra
// y el otro un cuadrado, y ninguno lleva número.

// Barra roja con la I, el disparo de INTRALOT.
function drawIBar(ctx, s) {
  const w = 30, h = 14
  ctx.save()
  ctx.translate(s.x, s.y)

  ctx.fillStyle = 'rgba(255, 50, 60, 0.35)'
  ctx.fillRect(w / 2, -2, 30, 4)

  ctx.fillStyle = '#1a0d2e'
  ctx.fillRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4)
  ctx.fillStyle = '#ff2b3c'
  ctx.fillRect(-w / 2, -h / 2, w, h)
  ctx.fillStyle = '#ff8a92'
  ctx.fillRect(-w / 2, -h / 2, w, 2)

  // La I, que es la marca, no un número.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(-5, -4, 10, 2)
  ctx.fillRect(-1, -4, 2, 8)
  ctx.fillRect(-5, 2, 10, 2)
  ctx.restore()
}

// Átomo verde, el disparo de SCIENTIFIC GAMES: núcleo y dos órbitas que giran
// con el proyectil, así se nota que viene rotando.
function drawAtom(ctx, s) {
  const r = SHOTS.atom.r
  ctx.save()
  ctx.translate(s.x, s.y)

  ctx.fillStyle = 'rgba(90, 255, 80, 0.30)'
  ctx.fillRect(4, -2, 30, 4)

  ctx.strokeStyle = '#0d2a10'
  ctx.lineWidth = 4
  for (let i = 0; i < 2; i++) {
    ctx.save()
    ctx.rotate(s.rot + (i * Math.PI) / 2)
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.42, 0, 0, Math.PI * 2); ctx.stroke()
    ctx.restore()
  }
  ctx.strokeStyle = '#6cff4a'
  ctx.lineWidth = 2
  for (let i = 0; i < 2; i++) {
    ctx.save()
    ctx.rotate(s.rot + (i * Math.PI) / 2)
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.42, 0, 0, Math.PI * 2); ctx.stroke()
    ctx.restore()
  }

  ctx.fillStyle = '#0d2a10'
  ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#b9ff8a'
  ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}

// Cuadrado azul, el disparo de GELLOT GENLOT. Gira despacio para que se
// distinga de un pedazo de escenario.
function drawBlueBlock(ctx, s) {
  const u = 11
  ctx.save()
  ctx.translate(s.x, s.y)

  ctx.fillStyle = 'rgba(120, 200, 255, 0.30)'
  ctx.fillRect(u, -2, 28, 4)

  ctx.rotate(s.rot)
  ctx.fillStyle = '#1a0d2e'
  ctx.fillRect(-u - 2, -u - 2, u * 2 + 4, u * 2 + 4)
  ctx.fillStyle = '#2f7fd0'
  ctx.fillRect(-u, -u, u * 2, u * 2)
  ctx.fillStyle = '#9fd4ff'
  ctx.fillRect(-u, -u, u * 2, 3)
  ctx.fillStyle = '#19406e'
  ctx.fillRect(-u, u - 3, u * 2, 3)
  ctx.fillStyle = '#f2f6ff'
  ctx.fillRect(-4, -4, 8, 8)
  ctx.restore()
}

const SHOT_DRAWERS = {
  paper: drawPaper,
  hand: drawHand,
  iorb: drawIBar,
  atom: drawAtom,
  loto: drawBlueBlock,
}

export function drawShots(ctx, list) {
  for (const s of list) (SHOT_DRAWERS[s.kind] || drawHand)(ctx, s)
}
