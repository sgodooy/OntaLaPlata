// Efectos de televisor: encendido al abrir, números que ruedan, pulso de las barras y pantalla «fuera del aire».
// Todo se apaga si la persona desactiva las animaciones o si el sistema pide reducir el movimiento.
let activas = true;
const quieto = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const puede = () => activas && !quieto();

export function usarAnimaciones(v) {
  activas = !!v;
  try { localStorage.setItem('vainas-anim', v ? 'si' : 'no'); } catch (e) { /* sin almacenamiento: queda solo en memoria */ }
}
// Se lee antes de cargar los datos, para decidir si mostrar el encendido.
export function animacionesGuardadas() {
  try { return localStorage.getItem('vainas-anim') !== 'no'; } catch (e) { return true; }
}

// El televisor se prende: una línea de luz se abre y aparece el logo.
export function encender() {
  if (!puede()) return;
  const el = document.createElement('div');
  el.className = 'encendido';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<div class="e-pantalla"><div class="e-barras"><i></i><i></i><i></i><i></i><i></i></div><div class="e-logo">VAINAS</div><div class="e-frase">Dejémonos de vainas</div></div>';
  document.body.append(el);
  const quitar = () => el.remove();
  el.addEventListener('click', quitar);
  setTimeout(quitar, 1900);
}

// Hace rodar un número desde un valor hasta otro, como un contador.
export function contar(el, de, a, fmt) {
  if (!el || !puede() || de === a) return;
  const t0 = performance.now(), dur = 750;
  const paso = (t) => {
    if (!el.isConnected) return;
    const k = Math.min(1, (t - t0) / dur), suave = 1 - (1 - k) ** 3;
    el.textContent = fmt(k < 1 ? Math.round(de + (a - de) * suave) : a);
    if (k < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

// Las barras de colores de arriba saltan cada vez que se guarda algo.
export function pulso() {
  const b = document.querySelector('.barras');
  if (!b || !puede()) return;
  b.classList.remove('pulso'); void b.offsetWidth; b.classList.add('pulso');
}

// Pantalla «fuera del aire»: aparece tras un rato sin tocar la app y de paso tapa las cifras.
let protector = null, reiniciarReposo = () => {};
export function fueraDelAire(forzar = false) {
  if (protector || (!forzar && !puede())) return;
  const el = document.createElement('div');
  protector = el;
  el.className = 'reposo';
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', 'Fuera del aire. Toque para volver a sus cuentas.');
  el.innerHTML = '<div class="r-barras"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>'
    + '<div class="r-x"><div class="r-y"><div class="r-logo"><b>VAINAS</b><span class="r-hora"></span></div></div></div>'
    + '<div class="r-pie"><b>FUERA DEL AIRE</b><span>Toque para volver a sus cuentas</span></div>';
  const reloj = () => { el.querySelector('.r-hora').textContent = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()); };
  reloj();
  const iv = setInterval(reloj, 10000);
  const cerrar = (e) => {
    e?.stopPropagation(); e?.preventDefault();
    clearInterval(iv); window.removeEventListener('keydown', cerrar, true);
    el.remove(); protector = null; reiniciarReposo();
  };
  el.addEventListener('click', cerrar);
  window.addEventListener('keydown', cerrar, true);
  document.body.append(el);
}
export function vigilarReposo(ms, bloqueado = () => false) {
  let t;
  reiniciarReposo = () => {
    clearTimeout(t);
    if (protector) return;
    t = setTimeout(() => { if (!document.hidden && !bloqueado()) fueraDelAire(); reiniciarReposo(); }, ms);
  };
  for (const ev of ['pointerdown', 'keydown', 'scroll', 'touchstart']) window.addEventListener(ev, reiniciarReposo, { passive: true, capture: true });
  document.addEventListener('visibilitychange', reiniciarReposo);
  reiniciarReposo();
}
