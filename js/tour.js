// Recorrido guiado: oscurece y desenfoca la pantalla, deja a la vista un elemento y lo explica.
let activo = null;
export const tourActivo = () => !!activo;

export function iniciarTour(pasos, alCerrar) {
  if (activo) return;
  let i = 0;
  const raiz = document.createElement('div');
  raiz.className = 'tour';
  raiz.innerHTML = '<i class="t-velo"></i><i class="t-velo"></i><i class="t-velo"></i><i class="t-velo"></i><i class="t-aro"></i>'
    + '<section class="t-carta" role="dialog" aria-modal="true" aria-labelledby="t-titulo" aria-describedby="t-texto"></section>';
  document.body.append(raiz);
  const velos = [...raiz.querySelectorAll('.t-velo')];
  const aro = raiz.querySelector('.t-aro');
  const carta = raiz.querySelector('.t-carta');
  const caja = (el, x, y, w, h) => { el.style.cssText = `left:${x}px;top:${y}px;width:${Math.max(0, w)}px;height:${Math.max(0, h)}px`; };

  function ubicar() {
    const el = pasos[i].sel && document.querySelector(pasos[i].sel);
    const vw = window.innerWidth, vh = window.innerHeight;
    carta.style.cssText = '';
    if (!el || !el.getClientRects().length) {
      caja(velos[0], 0, 0, vw, vh);
      velos.slice(1).forEach((v) => caja(v, 0, 0, 0, 0));
      aro.hidden = true;
      raiz.classList.add('t-sin-foco');
      carta.classList.add('t-centro');
      return;
    }
    const r = el.getBoundingClientRect(), m = 6;
    const x = Math.max(0, r.left - m), y = Math.max(0, r.top - m);
    const w = Math.min(vw, r.right + m) - x, h = Math.min(vh, r.bottom + m) - y;
    caja(velos[0], 0, 0, vw, y);
    caja(velos[1], 0, y + h, vw, vh - y - h);
    caja(velos[2], 0, y, x, h);
    caja(velos[3], x + w, y, vw - x - w, h);
    aro.hidden = false;
    raiz.classList.remove('t-sin-foco');
    caja(aro, x, y, w, h);
    const radio = getComputedStyle(el).borderTopLeftRadius;
    aro.style.borderRadius = radio.endsWith('%') ? radio : `${parseFloat(radio) + m}px`;
    // La carta va debajo del elemento si cabe, y si no, encima.
    carta.classList.remove('t-centro');
    const ancho = Math.min(340, vw - 24), alto = carta.offsetHeight;
    const izq = Math.min(Math.max(12, r.left + r.width / 2 - ancho / 2), vw - ancho - 12);
    const abajo = vh - (y + h);
    let arriba = abajo >= alto + 24 || abajo > y ? y + h + 14 : y - alto - 14;
    arriba = Math.min(Math.max(12, arriba), vh - alto - 12);
    carta.style.cssText = `left:${izq}px;top:${arriba}px;width:${ancho}px`;
  }

  function mostrar() {
    const p = pasos[i], ultimo = i === pasos.length - 1;
    carta.innerHTML = `<div class="t-paso">${i + 1} de ${pasos.length}</div><h3 id="t-titulo"></h3><p id="t-texto"></p>
      <div class="t-botones"><button type="button" class="enlace" data-t="saltar">${ultimo ? 'Ahora no' : 'Saltar'}</button><span></span>
      ${i ? '<button type="button" class="btn mini sec" data-t="atras">Atrás</button>' : ''}
      <button type="button" class="btn mini" data-t="sig"></button></div>`;
    carta.querySelector('h3').textContent = p.titulo;
    carta.querySelector('p').textContent = p.texto;
    carta.querySelector('[data-t=sig]').textContent = p.boton || (ultimo ? 'Listo' : 'Siguiente');
    const el = p.sel && document.querySelector(p.sel);
    if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' });
    ubicar();
    carta.querySelector('[data-t=sig]').focus({ preventScroll: true });
  }

  function cerrar(resultado) {
    window.removeEventListener('resize', ubicar);
    window.removeEventListener('scroll', ubicar, true);
    document.removeEventListener('keydown', tecla, true);
    raiz.remove();
    activo = null;
    alCerrar?.(resultado);
  }
  const avanzar = () => { if (i === pasos.length - 1) cerrar(pasos[i].accion || 'fin'); else { i++; mostrar(); } };
  const volver = () => { if (i) { i--; mostrar(); } };
  function tecla(e) {
    if (e.key === 'Escape') { e.stopPropagation(); cerrar('saltar'); }
    if (e.key === 'ArrowRight') avanzar();
    if (e.key === 'ArrowLeft') volver();
  }
  raiz.addEventListener('click', (e) => {
    e.stopPropagation();
    const t = e.target.closest('[data-t]')?.dataset.t;
    if (t === 'sig') avanzar();
    if (t === 'atras') volver();
    if (t === 'saltar') cerrar('saltar');
  });
  window.addEventListener('resize', ubicar);
  window.addEventListener('scroll', ubicar, true);
  document.addEventListener('keydown', tecla, true);
  activo = { cerrar };
  mostrar();
}
