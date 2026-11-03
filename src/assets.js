// ─── RUTAS DE ASSETS ──────────────────────────────────────────────────────────
// El juego no siempre vive en la raíz del dominio: publicado queda colgando de
// /Brightstar-Game-80s/. Con rutas escritas a mano como '/assets/retro/x.png'
// el navegador las buscaría en la raíz del sitio y no cargaría ningún sprite.
//
// import.meta.env.BASE_URL lo resuelve Vite en cada build: vale '/' en
// desarrollo y la subcarpeta en producción. Siempre termina en barra.
export function asset(path) {
  return import.meta.env.BASE_URL + path
}
