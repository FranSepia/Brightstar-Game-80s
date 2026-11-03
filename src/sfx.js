// ─── SONIDO ───────────────────────────────────────────────────────────────────
// Los efectos se sintetizan con WebAudio en vez de cargar archivos. Antes el
// sonido de tubería venía de una URL de myinstants.com que hoy devuelve 404: el
// Audio fallaba con NotSupportedError y, como play() rechaza una promesa, el
// try/catch que lo envolvía no la atrapaba y la excepción llegaba a la consola.
//
// Sintetizarlo saca la dependencia de un host ajeno, no pide archivos nuevos y
// suena igual de bien para un juego de 320x568.

let ctx = null

// El AudioContext se crea en el primer sonido, ya dentro de un gesto del
// usuario, que es cuando el navegador deja arrancarlo.
function audio() {
  if (ctx) return ctx
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  try {
    ctx = new AC()
  } catch (e) {
    ctx = null
  }
  return ctx
}

// "Bwoooop" descendente, el clásico de entrar a una tubería.
export function playPipeSound() {
  const ac = audio()
  if (!ac) return
  if (ac.state === 'suspended') ac.resume().catch(() => {})

  const t = ac.currentTime
  const osc = ac.createOscillator()
  const gain = ac.createGain()

  osc.type = 'square'
  osc.frequency.setValueAtTime(1180, t)
  osc.frequency.exponentialRampToValueAtTime(190, t + 0.22)

  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(0.18, t + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.26)

  osc.connect(gain).connect(ac.destination)
  osc.start(t)
  osc.stop(t + 0.28)
}
