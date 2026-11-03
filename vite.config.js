import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// El juego es 100% estático: no tiene backend, ni base de datos, ni claves.
// Lo único que puede pasarle es que alguien le inyecte código desde afuera,
// así que la defensa es una Content-Security-Policy que diga exactamente de
// dónde puede cargar cosas y prohíba todo lo demás.
//
// Va inyectada SOLO en el build. Puesta fija en index.html rompería el modo
// desarrollo, que necesita websocket para el hot-reload y scripts en línea que
// en producción no queremos permitir.
function buildCSP(supabaseUrl) {
  // El juego solo habla con Supabase, y solo si está configurado. Declararlo
  // acá es lo que hace útil a connect-src: si algún día un script inyectado
  // intenta mandar datos a otro dominio, el navegador lo corta.
  // Se recorta igual que en leaderboard.js: en la CSP tiene que ir el origen,
  // no la ruta /rest/v1/ que muestra el panel.
  const origen = String(supabaseUrl || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '')
  const connect = ["'self'", origen].filter(Boolean).join(' ')
  return CSP_BASE.replace('__CONNECT__', connect)
}

const CSP_BASE = [
  "default-src 'self'",
  "script-src 'self'",
  // 'unsafe-inline' hace falta por el <style> que está dentro de index.html;
  // es para CSS, no para scripts, así que no abre la puerta a ejecutar código.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  // El juego no habla con ningún servidor. Si algún día aparece un fetch a un
  // dominio ajeno, el navegador lo bloquea y se nota enseguida.
  "connect-src __CONNECT__",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

function securityHeaders(supabaseUrl) {
  return {
    name: 'security-headers',
    apply: 'build',
    transformIndexHtml(html) {
      return {
        html,
        tags: [
          { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: buildCSP(supabaseUrl) }, injectTo: 'head-prepend' },
          // Que no se filtre la URL del juego a Google al pedir la tipografía.
          { tag: 'meta', attrs: { name: 'referrer', content: 'no-referrer' }, injectTo: 'head-prepend' },
        ],
      }
    },
  }
}

// El juego se publica colgando de una subcarpeta del sitio de Y&iF, no en la
// raíz del dominio. Vite reescribe con esto las rutas del index.html y lo
// expone en import.meta.env.BASE_URL, que es lo que usa asset() para los
// sprites. En desarrollo queda en '/' para seguir entrando por localhost:5173.
export const BASE = '/Brightstar-Game-80s/'

// isPreview va junto a 'build' a propósito: `vite preview` sirve los archivos
// ya construidos, que apuntan a la subcarpeta. Sin esto el preview los servía
// desde la raíz y la página salía en negro, que no es como se va a ver
// publicada. Solo el servidor de desarrollo queda en '/'.
export default defineConfig(({ command, mode, isPreview }) => ({
  base: command === 'build' || isPreview ? BASE : '/',
  // La URL de Supabase se lee del .env para meterla en la CSP: sin esto el
  // navegador bloquearía las llamadas al ranking y costaría entender por qué.
  plugins: [react(), securityHeaders(loadEnv(mode, process.cwd(), '').VITE_SUPABASE_URL)],
  // Solo para el servidor de desarrollo. OJO: exponer el dev server por un
  // túnel público lo deja accesible desde internet; para mostrarlo a alguien
  // conviene publicar el build (dist/) y no este servidor.
  server: { allowedHosts: ['.loca.lt'] },
}))
