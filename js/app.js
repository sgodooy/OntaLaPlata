import * as C from './core.js';
import * as DB from './db.js';
import { iniciarTour, tourActivo } from './tour.js';

const VERSION_APP = 12; // sube con cada publicación; se muestra en Ajustes

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const f$ = C.fmt;
const num = (n, cls = '') => `<span class="num ${n < 0 ? 'neg' : ''} ${cls}">${f$(n)}</span>`;
const miles = (n) => (n ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '');

let state = null;      // datos que se están mostrando
let propio = null;     // datos del dispositivo mientras se revisa una copia
const FIJOS = '__fijos'; // en el filtro de categorías, los pagos de reservas
const filtrosVacios = () => ({ q: '', periodo: '', cats: [], cuenta: '', tipo: '', desde: '', hasta: '' });
const ui = { ruta: 'inicio', revision: false, filtros: filtrosVacios(), perPres: null, perAna: null, tipoAna: '', archivo: '' };

// ---------- infraestructura ----------
let tAviso;
function aviso(msg, error = false) {
  const el = $('#aviso');
  el.textContent = msg; el.className = 'aviso' + (error ? ' error' : ''); el.hidden = false;
  clearTimeout(tAviso); tAviso = setTimeout(() => { el.hidden = true; }, error ? 5000 : 3800);
}
async function commit(fn, msg) {
  if (ui.revision) { aviso('Está en modo revisión: solo lectura.', true); return false; }
  const copia = structuredClone(state);
  try {
    const r = fn();
    await DB.guardar(state);
    cerrarHoja(); render();
    if (msg) aviso(typeof msg === 'function' ? msg(r) : msg);
    return true;
  } catch (e) {
    state = copia;
    aviso(e.message || 'No se pudo guardar.', true);
    return false;
  }
}
function abrirHoja(titulo, html) {
  $('#hoja').innerHTML = `<h3>${esc(titulo)}<button class="cerrar" data-a="cerrar" aria-label="Cerrar">×</button></h3>${html}`;
  $('#fondo').hidden = false;
  $('#hoja').scrollTop = 0;
  marcarFechas();
}
// En el iPhone un campo de fecha vacío se ve en blanco: se marca para mostrarle un texto de guía.
function marcarFechas() { document.querySelectorAll('input[type=date]').forEach((el) => el.classList.toggle('vacia', !el.value)); }
function cerrarHoja() { $('#fondo').hidden = true; $('#hoja').innerHTML = ''; }
const activas = () => state.cuentas.filter((c) => !c.archivada);
const cats = () => state.categorias.filter((c) => !c.archivada);
const hoy = () => C.hoy();
const P = () => C.periodoDe(state, hoy());

function chips(name, items, sel, { requerido = false } = {}) {
  return `<div class="chips">${items.map((i) => `<label class="chip"><input type="radio" name="${name}" value="${esc(i.id)}" ${i.id === sel ? 'checked' : ''} ${requerido ? 'required' : ''}><span>${esc(i.nombre)}</span></label>`).join('')}</div>`;
}
const campo = (etq, html) => `<label class="campo">${esc(etq)}${html}</label>`;
const inMonto = (name, v = 0, extra = '') => `<input name="${name}" class="monto" inputmode="numeric" autocomplete="off" value="${miles(v)}" ${extra}>`;
function selPeriodo(name, sel, lista, vacio) {
  return `<select name="${name}" class="entrada" data-c="${name}">${vacio ? `<option value="">${vacio}</option>` : ''}${lista.map((p) => `<option value="${p}" ${p === sel ? 'selected' : ''}>${C.nombrePeriodo(state, p)}</option>`).join('')}</select>`;
}
function descargar(nombre, texto, tipo) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([texto], { type: tipo }));
  a.download = nombre; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------- vistas ----------
const TITULOS = { inicio: 'Dejémonos de vainas', movimientos: 'Movimientos', presupuestos: 'Presupuestos', reservas: 'Esta platica ya tiene dueño', analisis: 'Análisis', cuentas: 'Mis cuentas', ajustes: 'Ajustes' };
function render() {
  const setup = !state.config.setupDone;
  document.body.classList.toggle('sin-nav', setup);
  document.body.classList.toggle('revision', ui.revision);
  const ruta = setup ? 'setup' : ui.ruta;
  $('#titulo').textContent = setup ? 'Llevemos las cuentas claras' : TITULOS[ruta];
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('activa', a.dataset.r === ruta));
  const v = { setup: vSetup, inicio: vInicio, movimientos: vMovimientos, presupuestos: vPresupuestos, reservas: vReservas, analisis: vAnalisis, cuentas: vCuentas, ajustes: vAjustes }[ruta] || vInicio;
  $('#vista').innerHTML = (ui.revision ? `<div class="banda ok"><span><b>Modo revisión.</b> Está viendo una copia de seguridad, sin poder cambiarla.</span><button class="btn mini" data-a="salir-revision">Salir</button></div>` : '') + v();
  marcarFechas();
  if (setup) chequeoSetup();
  // Primera vez con la app ya configurada: se muestra el recorrido guiado.
  else if (ruta === 'inicio' && !state.config.tourVisto && !ui.revision && !tourActivo()) recorrido();
}

function filaReserva(r) {
  const vencida = r.estado === 'pendiente' && r.vence < hoy();
  const est = r.estado === 'pagada' ? '<span class="etiqueta verde">Pagada</span>' : r.estado === 'cancelada' ? '<span class="etiqueta">Cancelada</span>' : vencida ? '<span class="etiqueta rojo">Vencida</span>' : '';
  return `<div class="fila"><div><div class="nombre">${esc(r.nombre)} ${est}</div>
    <div class="suave">${r.estado === 'pendiente' ? 'Vence' : 'Vencía'} el ${C.fechaCorta(r.vence)}${r.estimado ? ' · estimado' : ''}${r.moneda === 'USD' ? ` · USD ${r.montoUSD} a ${f$(r.tasa)}` : ''}</div></div>
    <div class="der">${num(r.monto)}<div class="ed">${r.estado === 'pendiente' ? `<button class="btn mini" data-a="pagar" data-id="${r.id}">Pagar</button> ` : ''}${r.estado !== 'pagada' ? `<button class="enlace" data-a="ed-reserva" data-id="${r.id}">Editar</button>` : ''}</div></div></div>`;
}

function vInicio() {
  const r = C.resumen(state, hoy());
  const sal = C.saldos(state);
  let h = '';
  if (!ui.revision) {
    if (r.atrasado) h += `<div class="banda"><span><b>Ya pasaron 15 días desde su último pago.</b> La quincena sigue abierta hasta que le paguen.</span><button class="btn mini" data-a="me-pagaron">Me pagaron</button></div>`;
    const dc = state.config.ultimoCuadre ? C.diasEntre(state.config.ultimoCuadre, hoy()) : 99;
    if (dc >= 7) h += `<div class="banda ok"><span>Hace ${dc} días no cuadra caja. ¿Los saldos sí son los reales?</span><button class="btn mini" data-a="cuadre">Cuadrar</button></div>`;
    const db = state.config.ultimaCopia ? C.diasEntre(state.config.ultimaCopia, hoy()) : null;
    if ((db === null && state.movimientos.length >= 10) || db > 15) h += `<div class="banda ok"><span>${db === null ? 'Todavía no tiene copia de seguridad.' : `Su última copia de seguridad es de hace ${db} días.`}</span><button class="btn mini" data-a="copia">Descargar</button></div>`;
  }
  h += `<section class="heroe"><div class="pregunta">¿Onta la plata?</div>
    <div class="num libre ${r.libre < 0 ? 'neg' : ''}" id="libre">${f$(r.libre)}</div>
    <div class="sub">${r.libre < 0 ? `Le faltan ${f$(-r.libre)} para cubrir lo que ya tiene dueño.` : 'libres para gastar sin descuadrarse'}</div>
    <dl><dt>En cuentas</dt><dd class="num" id="en-cuentas">${f$(r.enCuentas)}</dd>
    <dt>Con dueño</dt><dd class="num" id="con-dueno">${f$(r.conDueno)}</dd>
    <dt class="hijo">Reservas pendientes</dt><dd class="hijo num">${f$(r.reservasPend)}</dd>
    <dt class="hijo">Presupuestos por gastar</dt><dd class="hijo num">${f$(r.presupRest)}</dd>
    </dl></section>`;
  h += `<div class="ritmo">${r.ritmo > 0 ? `Le quedan <span class="num">${f$(r.ritmo)}</span> ${r.atrasado ? 'mientras le pagan.' : `por día hasta el próximo pago, calculado para dentro de ${r.diasRestantes} ${r.diasRestantes === 1 ? 'día' : 'días'}.`}` : '¡Pilas pues! Ya no queda plata para gastar en esta quincena.'}</div>`;
  h += '<div class="rejilla"><div>';
  h += `<h2>Mis cuentas <a class="enlace" href="#cuentas">Ver todo</a></h2><div class="tarjeta">${activas().map((c) => `<div class="fila"><div class="nombre">${esc(c.nombre)}</div>${num(sal[c.id])}</div>`).join('')}</div>`;
  const pct = r.presupTotal ? Math.round((r.presupGastado / r.presupTotal) * 100) : 0;
  h += `<h2>Quincena ${C.nombrePeriodo(state, r.periodo)}</h2><div class="tarjeta">
    <div class="pres"><div class="cab"><span>Presupuesto ${num(r.presupTotal)}</span><span class="num">${pct} %</span></div>
    <div class="barra ${pct > 100 ? 'pasado' : pct >= 80 ? 'alerta' : ''}"><i style="width:${Math.min(100, pct)}%"></i></div>
    <div class="pie"><span>Gastado ${f$(r.presupGastado)}</span><span>Quedan ${f$(r.presupRest)}</span></div></div>
    <div class="fila"><div>Gastos del periodo<div class="suave">incluye pagos de reservas</div></div>${num(r.gastosPeriodo)}</div>
    <button class="fila" data-a="ingreso-inicial"><div>Ingresos del periodo<div class="suave">${C.ultimoPeriodo(state)?.ingresoInicial ? `incluye ${f$(C.ultimoPeriodo(state).ingresoInicial)} del pago con que empezó · ` : ''}<u class="ed">corregir</u></div></div>${num(r.ingresosPeriodo)}</button></div>`;
  h += '</div><div>';
  const pend = state.reservas.filter((x) => x.estado === 'pendiente').sort((a, b) => a.vence.localeCompare(b.vence)).slice(0, 6);
  h += `<h2>Próximas obligaciones <a class="enlace" href="#reservas">Calendario</a></h2><div class="tarjeta">${pend.length ? pend.map(filaReserva).join('') : '<div class="vacio">No hay obligaciones pendientes.</div>'}</div>`;
  const deben = state.porCobrar.filter((x) => x.estado === 'pendiente').reduce((a, x) => a + x.valor, 0);
  if (deben) h += `<div class="tarjeta"><div class="fila"><div>Le deben<div class="suave">No cuenta como plata suya hasta que la reciba</div></div>${num(deben)}</div></div>`;
  return h + '</div></div>';
}

function filaMov(m) {
  const cu = C.cuenta(state, m.cuentaId)?.nombre;
  const cat = C.categoria(state, m.categoriaId)?.nombre;
  let titulo, det, signo = 0;
  switch (m.tipo) {
    case 'gasto': titulo = m.descripcion || cat || 'Gasto'; det = `${m.reservaId ? 'Pago de reserva' : (cat || 'Sin categoría')} · ${cu}`; signo = -1; break;
    case 'ingreso': titulo = m.descripcion || 'Ingreso'; det = `Ingreso · ${cu}`; signo = 1; break;
    case 'transferencia': titulo = m.descripcion || 'Transferencia'; det = `${cu} → ${C.cuenta(state, m.cuentaDestinoId)?.nombre}`; break;
    case 'prestamo': titulo = `Le presté a ${m.persona}`; det = `${cu}${m.descripcion ? ' · ' + m.descripcion : ''}`; signo = -1; break;
    case 'cobro': titulo = `Me pagó ${m.persona}`; det = `${cu}${m.esIngreso ? ' · cuenta como ingreso' : ''}`; signo = 1; break;
    case 'ajuste': titulo = 'Cuadre de caja'; det = cu; signo = Math.sign(m.valor); break;
    case 'invitacion': titulo = `Me invitaron${m.descripcion ? ': ' + m.descripcion : ''}`; det = cat || 'Comida'; break;
  }
  const v = m.tipo === 'invitacion' ? '<span class="etiqueta amar">Gratis</span>' : `<span class="num ${signo < 0 ? 'neg' : ''}">${signo > 0 ? '+' : signo < 0 ? '-' : ''}${f$(Math.abs(m.valor))}</span>`;
  return `<button class="fila" data-a="ed-mov" data-id="${m.id}"><div><div class="nombre">${esc(titulo)}</div><div class="suave">${esc(det)}</div></div><div class="der">${v}</div></button>`;
}
const diaSemana = (f) => { const { y, m, d } = C.partes(f); return ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()]; };
function listaMovs() {
  const f = ui.filtros; const q = f.q.trim().toLowerCase();
  const l = state.movimientos.filter((m) => {
    if (f.tipo && m.tipo !== f.tipo) return false;
    if (f.cuenta && m.cuentaId !== f.cuenta && m.cuentaDestinoId !== f.cuenta) return false;
    if (f.cats.length && !f.cats.includes(m.reservaId ? FIJOS : m.categoriaId)) return false;
    if (f.periodo && C.periodoDe(state, m.fecha) !== f.periodo) return false;
    if (f.desde && m.fecha < f.desde) return false;
    if (f.hasta && m.fecha > f.hasta) return false;
    if (q && !`${m.descripcion} ${m.nota} ${m.persona || ''} ${C.categoria(state, m.categoriaId)?.nombre || ''}`.toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.creado || '').localeCompare(a.creado || ''));
  const quitar = Object.values(f).some((v) => (Array.isArray(v) ? v.length : v)) ? ' <button class="enlace" data-a="limpiar-filtros">Quitar filtros</button>' : '';
  if (!l.length) return `<div class="vacio">${state.movimientos.length ? `Ningún movimiento coincide con los filtros.<br>${quitar}` : 'Todavía no hay movimientos. Toque el botón + para registrar el primero.'}</div>`;
  let h = '', dia = '';
  const gastos = l.filter((m) => m.tipo === 'gasto').reduce((a, m) => a + m.valor, 0);
  h += `<div class="suave">${l.length} ${l.length === 1 ? 'movimiento' : 'movimientos'} · gastos por ${f$(gastos)}${quitar ? ' ·' + quitar : ''}</div>`;
  for (const m of l) {
    if (m.fecha !== dia) {
      if (dia) h += '</div>';
      dia = m.fecha;
      const delDia = l.filter((x) => x.fecha === dia && x.tipo === 'gasto').reduce((a, x) => a + x.valor, 0);
      h += `<div class="dia"><span>${diaSemana(dia)} ${C.fechaCorta(dia)} ${dia.slice(0, 4)}</span>${delDia ? `<span>gastos ${f$(delDia)}</span>` : ''}</div><div class="tarjeta">`;
    }
    h += filaMov(m);
  }
  return h + '</div>';
}
const catsFiltro = () => state.categorias.map((c) => ({ id: c.id, nombre: c.nombre })).concat({ id: FIJOS, nombre: 'Gastos fijos (reservas)' });
function resumenCats() {
  const n = catsFiltro().filter((c) => ui.filtros.cats.includes(c.id)).map((c) => c.nombre);
  if (!n.length) return 'Categorías: todas';
  return `Categorías (${n.length}): ${esc(n.slice(0, 2).join(', '))}${n.length > 2 ? ` y ${n.length - 2} más` : ''}`;
}
function vMovimientos() {
  const f = ui.filtros;
  const op = (lista, sel) => lista.map((x) => `<option value="${esc(x.id)}" ${x.id === sel ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('');
  return `<div class="filtros">
    <input class="entrada todo" type="search" placeholder="Buscar por descripción" value="${esc(f.q)}" data-f="q" aria-label="Buscar">
    <select class="entrada" data-f="periodo" aria-label="Quincena"><option value="">Todas las quincenas</option>${C.periodosConDatos(state).reverse().map((p) => `<option value="${p}" ${p === f.periodo ? 'selected' : ''}>${C.nombrePeriodo(state, p)}</option>`).join('')}</select>
    <select class="entrada" data-f="tipo" aria-label="Tipo"><option value="">Todos los tipos</option>${op(C.TIPOS.map((t) => ({ id: t, nombre: C.NOMBRE_TIPO[t] })), f.tipo)}</select>
    <select class="entrada todo" data-f="cuenta" aria-label="Cuenta"><option value="">Todas las cuentas</option>${op(state.cuentas, f.cuenta)}</select>
    <label>Desde<input class="entrada" type="date" data-f="desde" value="${f.desde}"></label>
    <label>Hasta<input class="entrada" type="date" data-f="hasta" value="${f.hasta}"></label>
    <details class="todo filtro-cats"><summary id="resumen-cats">${resumenCats()}</summary><div class="chips">${catsFiltro().map((c) => `<label class="chip"><input type="checkbox" data-fc="${esc(c.id)}" ${f.cats.includes(c.id) ? 'checked' : ''}><span>${esc(c.nombre)}</span></label>`).join('')}</div></details>
  </div><div id="lista-movs">${listaMovs()}</div>`;
}

function tarjetaPres(p, per) {
  const cls = p.pct > 100 ? 'pasado' : p.pct >= 80 ? 'alerta' : '';
  const cat = C.categoria(state, p.categoriaId);
  const uni = p.unidades !== null && !p.exceso ? ` · Le quedan ${p.unidades} ${esc(cat.nombre.toLowerCase())}` : '';
  return `<button class="tarjeta pres" data-a="ed-pres" data-cat="${p.categoriaId}" data-per="${per}">
    <div class="cab"><b>${esc(p.nombre)}</b><span class="num">${p.pct.toFixed(1).replace('.', ',')} %</span></div>
    <div class="barra ${cls}"><i style="width:${Math.min(100, p.pct)}%"></i></div>
    <div class="pie"><span>Gastado ${f$(p.gastado)} de ${f$(p.total)}</span><span>${p.exceso ? `<b class="neg">Se pasó por ${f$(p.exceso)}</b>` : `Quedan ${f$(p.resta)}`}</span></div>
    ${uni ? `<div class="suave"><b>${uni.slice(3)}</b></div>` : ''}${p.exceso ? '<div class="suave neg">No se me descuadre: el exceso sale de su plata libre.</div>' : ''}</button>`;
}
function navPeriodo(clave, per) {
  const l = C.periodosConDatos(state);
  if (!l.includes(per)) l.push(per);
  return `<label class="campo">Quincena${selPeriodo(clave, per, l.sort().reverse())}</label>`;
}
function vPresupuestos() {
  const per = ui.perPres || P();
  const pres = C.presupuestosDe(state, per);
  const sin = C.gastosSinPresupuesto(state, per);
  const total = pres.reduce((a, p) => a + p.total, 0), gast = pres.reduce((a, p) => a + p.gastado, 0), resta = pres.reduce((a, p) => a + p.resta, 0);
  let h = navPeriodo('perPres', per);
  h += `<div class="tarjeta"><div class="fila"><div>Presupuestado</div>${num(total)}</div><div class="fila"><div>Gastado</div>${num(gast)}</div><div class="fila"><div>Queda</div>${num(resta)}</div></div>`;
  h += `<div class="rejilla">${pres.map((p) => tarjetaPres(p, per)).join('')}</div>`;
  if (!pres.length) h += '<div class="vacio">Esta quincena no tiene presupuestos.</div>';
  const conPres = new Set(pres.map((p) => p.categoriaId));
  const libres = cats().filter((c) => !conPres.has(c.id));
  if (Object.keys(sin).length) {
    h += `<h2>Gastos no presupuestados</h2><div class="tarjeta">${Object.entries(sin).map(([id, v]) => `<div class="fila"><div class="nombre">${esc(C.categoria(state, id)?.nombre || 'Sin categoría')}<div class="suave">Salió de su plata libre</div></div>${num(v)}</div>`).join('')}</div>`;
  }
  h += `<h2 class="ed">Categorías sin presupuesto</h2><div class="tarjeta ed">${libres.map((c) => `<div class="fila"><div class="nombre">${esc(c.nombre)}</div><button class="btn mini sec" data-a="ed-pres" data-cat="${c.id}" data-per="${per}">Asignar</button></div>`).join('') || '<div class="vacio">Todas las categorías tienen presupuesto.</div>'}</div>
    <button class="btn sec ancho ed" data-a="nueva-cat">+ Crear categoría</button>
    <div class="botones ed"><button class="btn sec" data-a="abrir-periodo">Empezar quincena nueva</button>${state.periodos.length > 1 && per === C.ultimoPeriodo(state).id ? '<button class="btn peligro" data-a="deshacer-periodo">Deshacer esta quincena</button>' : ''}</div>`;
  return h;
}

function vReservas() {
  const per = P();
  const pend = state.reservas.filter((r) => r.estado === 'pendiente').sort((a, b) => a.vence.localeCompare(b.vence));
  const desde = C.rangoPeriodo(state, per).inicio;
  const hechas = state.reservas.filter((r) => r.estado !== 'pendiente' && r.vence >= desde).sort((a, b) => a.vence.localeCompare(b.vence));
  const total = C.resumen(state, hoy()).reservasPend;
  let h = calendario() + `<div class="tarjeta"><div class="fila"><div>Reservado y pendiente de pago<div class="suave">Sigue en sus cuentas, pero no es para gastar</div></div>${num(total)}</div></div><div class="rejilla"><div>`;
  h += `<h2>Pendientes <button class="btn mini ed" data-a="nueva-reserva">+ Reserva</button></h2><div class="tarjeta">${pend.map(filaReserva).join('') || '<div class="vacio">Nada pendiente. Qué descanso.</div>'}</div>`;
  if (hechas.length) h += `<h2>Ya resueltas en esta quincena</h2><div class="tarjeta">${hechas.map(filaReserva).join('')}</div>`;
  h += '</div><div>';
  h += `<h2>Obligaciones periódicas <button class="btn mini ed" data-a="nueva-ob">+ Obligación</button></h2><div class="tarjeta">${state.obligaciones.map((o) => `<div class="fila"><div><div class="nombre">${esc(o.nombre)} ${o.activa ? '' : '<span class="etiqueta">En pausa</span>'}</div>
    <div class="suave">${o.frecuencia === 'quincenal' ? `Cada quincena, ${o.dia === 1 ? 'el día del pago' : `${o.dia - 1} ${o.dia === 2 ? 'día' : 'días'} después del pago`}` : `Cada mes, el día ${o.dia}`}${o.estimado ? ' · estimado' : ''}${o.moneda === 'USD' ? ` · USD ${o.montoUSD}` : ''}</div></div>
    <div class="der">${num(C.montoObligacion(o, state.config.tasaUSD))}<div class="ed"><button class="enlace" data-a="ed-ob" data-id="${o.id}">Editar</button></div></div></div>`).join('') || '<div class="vacio">No hay obligaciones periódicas.</div>'}</div>`;
  const pc = [...state.porCobrar].sort((a, b) => (a.estado === b.estado ? b.fecha.localeCompare(a.fecha) : a.estado === 'pendiente' ? -1 : 1));
  h += `<h2>Me deben <button class="btn mini ed" data-a="nueva-deuda">+ Deuda</button></h2><div class="tarjeta">${pc.map((d) => `<div class="fila"><div><div class="nombre">${esc(d.persona)} ${d.estado === 'recibido' ? '<span class="etiqueta verde">Recibido</span>' : ''}</div>
    <div class="suave">${C.fechaCorta(d.fecha)}${d.concepto ? ' · ' + esc(d.concepto) : ''}${d.origen === 'prestamo' ? ' · préstamo' : ''}</div></div>
    <div class="der">${num(d.valor)}<div class="ed">${d.estado === 'pendiente' ? `<button class="btn mini" data-a="cobrar" data-id="${d.id}">Recibí</button>${d.origen === 'otro' ? ` <button class="enlace" data-a="quitar-deuda" data-id="${d.id}">Quitar</button>` : ''}` : ''}</div></div></div>`).join('') || '<div class="vacio">Nadie le debe plata.</div>'}
    <div class="suave">Lo que le deben no suma en sus cuentas ni en su plata libre hasta que lo reciba.</div></div>`;
  return h + '</div></div>';
}

const MESES_L = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
function calendario() {
  const h = hoy(), mes = ui.calMes || h.slice(0, 7), [y, m] = mes.split('-').map(Number);
  const ag = C.agenda(state, y, m, h), n = C.ultimoDia(y, m);
  const vacios = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // la semana empieza en lunes
  const sel = ui.calDia && ui.calDia.startsWith(mes) ? ui.calDia : (h.startsWith(mes) ? h : null);
  let celdas = '<i></i>'.repeat(vacios);
  for (let d = 1; d <= n; d++) {
    const f = `${mes}-${String(d).padStart(2, '0')}`, items = ag[f] || [];
    const fijos = items.filter((x) => x.clase !== 'pago');
    const total = fijos.filter((x) => x.clase !== 'cancelada').reduce((a, x) => a + x.monto, 0);
    const voz = `${d} de ${MESES_L[m - 1]}${items.some((x) => x.clase === 'pago') ? ', día de pago' : ''}${fijos.length ? `, ${fijos.length} ${fijos.length === 1 ? 'gasto fijo' : 'gastos fijos'} por ${f$(total)}` : ''}`;
    celdas += `<button class="cal-dia ${f === h ? 'hoy' : ''} ${f === sel ? 'sel' : ''} ${items.some((x) => x.clase === 'pago') ? 'pago' : ''}" data-a="cal-dia" data-f="${f}" aria-label="${voz}" aria-pressed="${f === sel}">
      <b>${d}</b><span>${fijos.slice(0, 4).map((x) => `<i class="p-${x.clase}"></i>`).join('')}</span></button>`;
  }
  let det = '';
  if (sel) {
    const items = ag[sel] || [];
    det = `<div class="cal-det"><div class="dia">${C.fechaCorta(sel)}${sel === h ? ' · hoy' : ''}</div>`
      + (items.some((x) => x.clase === 'pago') ? '<div class="fila"><div class="nombre">Día de pago</div><span class="etiqueta amar">Empezó la quincena</span></div>' : '')
      + items.filter((x) => x.id).map((x) => filaReserva(state.reservas.find((r) => r.id === x.id))).join('')
      + items.filter((x) => x.clase === 'previsto').map((x) => `<div class="fila"><div><div class="nombre">${esc(x.nombre)} <span class="etiqueta">Previsto</span></div><div class="suave">Se reserva cuando llegue la quincena en que vence</div></div><div class="der">${num(x.monto)}</div></div>`).join('')
      + (items.some((x) => x.clase !== 'pago') ? '' : '<div class="suave">Sin gastos fijos este día.</div>')
      + `<button class="btn sec ancho ed" data-a="cal-nuevo" data-f="${sel}" style="margin-top:10px">+ Anotar gasto fijo el ${C.fechaCorta(sel)}</button></div>`;
  }
  return `<section class="tarjeta cal" id="calendario"><div class="cal-cab"><button class="btn mini sec" data-a="cal-mes" data-d="-1" aria-label="Mes anterior">‹</button><h2>${MESES_L[m - 1]} ${y}</h2><button class="btn mini sec" data-a="cal-mes" data-d="1" aria-label="Mes siguiente">›</button></div>
    <div class="cal-sem">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d) => `<span>${d}</span>`).join('')}</div><div class="cal-mes">${celdas}</div>
    <div class="leyenda cal-ley"><span><i class="p-pendiente"></i>Pendiente</span><span><i class="p-pagada"></i>Pagado</span><span><i class="p-vencida"></i>Vencido</span><span><i class="p-previsto"></i>Previsto</span><span><i class="p-pago"></i>Día de pago</span></div>${det}</section>`;
}
function creditos(per) {
  const c = C.capitulo(state, per);
  return `<div class="creditos"><h4>CRÉDITOS FINALES</h4><p>Quincena ${C.nombrePeriodo(state, per)}</p><hr>
    <p>Entraron<br><span class="num">${f$(c.ingresos)}</span></p><p>Salieron<br><span class="num">${f$(c.gastos)}</span></p>
    <p class="suave" style="color:inherit;opacity:.8">De eso, ${f$(c.pagosReservas)} fueron obligaciones fijas${c.sinPresupuesto ? ` y ${f$(c.sinPresupuesto)} gastos no presupuestados` : ''}.</p><hr>
    ${c.pasados.length ? `<p><b>Se pasó en</b><br>${c.pasados.map((p) => `${esc(p.nombre)}: ${f$(p.exceso)}`).join('<br>')}</p>` : '<p><b>No se pasó en ningún presupuesto.</b></p>'}
    ${c.ahorros.length ? `<p><b>Le sobró en</b><br>${c.ahorros.slice(0, 5).map((p) => `${esc(p.nombre)}: ${f$(p.resta)}`).join('<br>')}</p>` : ''}
    ${c.invitaciones ? `<p>Lo invitaron ${c.invitaciones} ${c.invitaciones === 1 ? 'vez' : 'veces'}. Agradezca.</p>` : ''}</div>`;
}
function vAnalisis() {
  const per = ui.perAna || P();
  const pres = C.presupuestosDe(state, per);
  let h = navPeriodo('perAna', per) + '<div class="rejilla"><div>';
  const max1 = Math.max(1, ...pres.map((p) => Math.max(p.total, p.gastado)));
  h += `<h2>Presupuesto frente a gasto real</h2><div class="tarjeta"><div class="leyenda"><span><i class="plan"></i>Presupuesto</span><span><i></i>Gastado</span><span><i class="mal"></i>Se pasó</span></div>
    ${pres.map((p) => `<div class="g-fila"><div class="cab"><span>${esc(p.nombre)}</span><span class="num ${p.exceso ? 'neg' : ''}">${f$(p.gastado)} / ${f$(p.total)}</span></div>
      <div class="g-barra"><i class="${p.exceso ? 'mal' : ''}" style="width:${(p.gastado / max1) * 100}%"></i><i class="plan" style="width:${(p.total / max1) * 100}%"></i></div></div>`).join('') || '<div class="vacio">Sin presupuestos en esta quincena.</div>'}</div>`;
  const tipos = [['', 'Todo'], ['habitual', 'Habituales'], ['social', 'Sociales'], ['antojo', 'Antojos'], ['extraordinario', 'Extraordinarios'], ['fijo', 'Fijos']];
  const gc = C.gastoPorCategoria(state, per, ui.tipoAna);
  const max2 = Math.max(1, ...gc.map((g) => g.valor)); const tot2 = gc.reduce((a, g) => a + g.valor, 0);
  h += `<h2>Gastos por categoría</h2><div class="tarjeta"><div class="tabs" style="margin:0 0 8px;padding:0">${tipos.map(([id, n]) => `<button data-a="tipo-ana" data-t="${id}" class="${ui.tipoAna === id ? 'activa' : ''}">${n}</button>`).join('')}</div>
    ${gc.map((g) => `<div class="g-fila"><div class="cab"><span>${esc(g.nombre)}</span><span class="num">${f$(g.valor)}</span></div><div class="g-barra"><i style="width:${(g.valor / max2) * 100}%"></i></div></div>`).join('') || '<div class="vacio">Sin gastos de este tipo.</div>'}
    ${gc.length ? `<div class="fila"><b>Total</b>${num(tot2)}</div>` : ''}</div>`;
  h += '</div><div>';
  const pers = C.periodosConDatos(state).filter((p) => p <= per).slice(-6);
  const tots = pers.map((p) => C.capitulo(state, p).gastos); const max3 = Math.max(1, ...tots);
  h += `<h2>Comparación entre quincenas</h2><div class="tarjeta"><div class="suave">Gasto total de cada quincena</div><div class="columnas">${pers.map((p, i) => { const r = C.rangoPeriodo(state, p); return `<div><b>${f$(tots[i])}</b><i style="height:${(tots[i] / max3) * 100}%"></i><small>${C.fechaCorta(r.inicio)}</small></div>`; }).join('')}</div></div>`;
  h += `<h2>Capítulo</h2>${creditos(per)}`;
  return h + '</div></div>';
}

function vCuentas() {
  const sal = C.saldos(state); const per = P();
  let h = `<div class="tarjeta"><div class="fila"><div><b>En cuentas</b></div>${num(C.enCuentas(state))}</div></div><div class="rejilla">`;
  for (const c of state.cuentas) {
    if (c.archivada) continue;
    const t = { ing: 0, gas: 0, ent: 0, sal: 0 };
    for (const m of state.movimientos) {
      if (C.periodoDe(state, m.fecha) !== per) continue;
      if (m.cuentaId === c.id) { if (m.tipo === 'ingreso' || m.tipo === 'cobro') t.ing += m.valor; if (m.tipo === 'gasto') t.gas += m.valor; if (m.tipo === 'transferencia') t.sal += m.valor; }
      if (m.tipo === 'transferencia' && m.cuentaDestinoId === c.id) t.ent += m.valor;
    }
    h += `<div class="tarjeta"><div class="fila"><div class="nombre">${esc(c.nombre)}</div>${num(sal[c.id])}</div>
      <div class="suave">En esta quincena: ingresos ${f$(t.ing)} · gastos ${f$(t.gas)} · transferencias recibidas ${f$(t.ent)} · enviadas ${f$(t.sal)}</div>
      <div class="botones"><button class="btn mini sec" data-a="ver-cuenta" data-id="${c.id}">Ver movimientos</button><button class="btn mini sec ed" data-a="ed-cuenta" data-id="${c.id}">Renombrar</button><button class="btn mini peligro ed" data-a="quitar-cuenta" data-id="${c.id}">Quitar</button></div></div>`;
  }
  return h + `</div><div class="botones ed"><button class="btn" data-a="cuadre">Cuadre de caja</button><button class="btn sec" data-a="nueva-cuenta">+ Cuenta</button></div>`;
}

function vAjustes() {
  const c = state.config;
  return `<div class="rejilla"><div><h2>Parámetros</h2><form class="tarjeta ed" data-form="config">
    ${campo('Ingreso quincenal aproximado', inMonto('ingreso', c.ingresoQuincenal))}
    ${campo('Tasa de cambio: pesos por dólar', inMonto('tasa', c.tasaUSD))}
    <button class="btn ancho">Guardar</button></form>
    <h2>Catálogo de categorías <button class="btn mini ed" data-a="cat-nueva">+ Agregar</button></h2>
    <div class="tarjeta" id="catalogo">${cats().map((k) => `<div class="fila"><div><div class="nombre">${esc(k.nombre)}</div><div class="suave">${esc(k.tipo)}${k.valorRef ? ` · ${f$(k.valorRef)} por unidad` : ''}${k.comida ? ' · comida' : ''}</div></div>
      <div class="der ed"><button class="enlace" data-a="cat-editar" data-id="${k.id}">Editar</button> <button class="enlace neg" data-a="cat-quitar" data-id="${k.id}">Quitar</button></div></div>`).join('') || '<div class="vacio">No hay categorías. Agregue la primera.</div>'}
    ${state.categorias.some((k) => k.archivada) ? `<details><summary>Categorías quitadas</summary>${state.categorias.filter((k) => k.archivada).map((k) => `<div class="fila"><div class="nombre">${esc(k.nombre)}<div class="suave">Sus movimientos se conservan</div></div><button class="btn mini sec ed" data-a="cat-recuperar" data-id="${k.id}">Recuperar</button></div>`).join('')}</details>` : ''}
    <p class="suave">Estas son las categorías que aparecen al registrar un gasto. El presupuesto de cada una se asigna en Presupuestos.</p></div></div><div>
    <h2>Mis datos</h2><div class="tarjeta">
    <p class="suave">Sus datos viven solo en este dispositivo. ${c.ultimaCopia ? `Última copia de seguridad: ${C.fechaCorta(c.ultimaCopia)}.` : 'Todavía no ha descargado una copia de seguridad.'}</p>
    <div class="botones"><button class="btn" data-a="copia">Descargar copia de seguridad</button></div>
    <div class="botones"><button class="btn sec" data-a="csv-movs">Movimientos en CSV</button><button class="btn sec" data-a="csv-pres">Presupuestos en CSV</button></div>
    <div class="botones"><button class="btn sec" data-a="revision">Revisar una copia (solo lectura)</button></div>
    <div class="botones ed"><button class="btn sec" data-a="restaurar">Restaurar una copia</button><button class="btn peligro" data-a="borrar-todo">Borrar todo</button></div></div>
    <h2>Ayuda</h2><div class="tarjeta"><button class="btn sec ancho" data-a="recorrido">Ver el recorrido otra vez</button></div>
    <p class="suave">Para revisar en el computador: descargue la copia en el celular, pásela al computador y ábrala con «Revisar una copia».</p>
    <h2>Versión</h2><div class="tarjeta"><p>Está usando la versión <b id="version">${VERSION_APP}</b> de VAINAS.</p><button class="btn sec ancho" data-a="actualizar">Buscar actualización</button>
    <p class="suave">Actualizar no toca sus datos.</p></div></div></div>`;
}

// ---------- recorrido guiado ----------
const PASOS = [
  { titulo: '¡Quiubo pues!', texto: 'Le muestro la app en menos de un minuto. Puede saltarse el recorrido y volver a verlo cuando quiera desde Ajustes.', boton: 'Empecemos' },
  { sel: '.heroe', titulo: '¿Onta la plata?', texto: 'Este número es su plata libre: lo que hay en sus cuentas menos lo que ya tiene dueño. Si sale en rojo, le está faltando para cubrir lo comprometido.' },
  { sel: '.ritmo', titulo: 'Su ritmo diario', texto: 'Cuánto puede gastar por día para llegar sin afanes al próximo pago. Su quincena va de un pago al siguiente: cuando registre el sueldo, empieza una nueva.' },
  { sel: '#fab', titulo: 'Anote todo aquí', texto: 'Escriba el valor, toque la categoría y guarde. El mismo botón sirve para ingresos, transferencias entre sus cuentas, préstamos y las veces que le invitan algo.' },
  { sel: '#nav a[data-r=presupuestos]', titulo: 'Presupuestos', texto: 'Cuánto tenía, cuánto gastó y cuánto le queda en cada categoría. En comida le cuento cuántos almuerzos le quedan.' },
  { sel: '#nav a[data-r=reservas]', titulo: 'Esa platica ya tiene dueño', texto: 'Arriendo, servicios y suscripciones. Reservar aparta la plata sin sacarla de la cuenta, y al pagar desde aquí se descuenta una sola vez. En el calendario ve qué día vence cada gasto fijo y puede anotar los nuevos.' },
  { sel: '#nav a[data-r=movimientos]', titulo: 'Movimientos', texto: 'Todo lo que ha anotado, con buscador y filtros. Toque cualquier movimiento para corregirlo o eliminarlo.' },
  { sel: '#nav a[data-r=analisis]', titulo: 'Análisis', texto: 'Los gráficos de cada quincena y los créditos finales de cada capítulo: en qué se pasó y en qué le sobró.' },
  { sel: '#btn-ajustes', titulo: 'Ajustes y copia de seguridad', texto: 'Sus datos viven solo en este dispositivo. Descargue una copia de vez en cuando y, en el iPhone, agregue la app a la pantalla de inicio desde el botón Compartir.' },
  { titulo: '¡Listo, a llevar las cuentas claras!', texto: 'Empiece por anotar su primer movimiento: el sueldo que le entró o lo último que gastó.', boton: 'Registrar mi primer movimiento', accion: 'primer' },
];
function recorrido() {
  cerrarHoja();
  iniciarTour(PASOS, async (resultado) => {
    if (!state.config.tourVisto && !ui.revision) await commit(() => { state.config.tourVisto = true; });
    if (resultado === 'primer' && !ui.revision) hojaMov('gasto');
  });
}

// ---------- configuración inicial ----------
// Supone pagos el 15 y el 30 (o fin de mes) para proponer la fecha del último pago.
function ultimoPagoProbable() {
  const h = hoy(), { y, m, d } = C.partes(h);
  const fin = Math.min(30, C.ultimoDia(y, m));
  if (d >= fin) return `${h.slice(0, 8)}${String(fin).padStart(2, '0')}`;
  if (d >= 15) return `${h.slice(0, 8)}15`;
  const ant = C.sumarDias(`${h.slice(0, 8)}01`, -1), a = C.partes(ant);
  return `${ant.slice(0, 8)}${String(Math.min(30, a.d)).padStart(2, '0')}`;
}
function vSetup() {
  const pres = { Almuerzos: 225000, Desayunos: 48000 }; // sugerencias de ejemplo
  return `<form data-form="setup" id="setup">
    <div class="tarjeta"><b>¡Quiubo pues!</b> Antes de empezar, cuadremos cuatro cosas. Todo se puede cambiar después.
      <div><button type="button" class="enlace" data-a="revision">Solo quiero revisar una copia de seguridad</button> · <button type="button" class="enlace" data-a="restaurar">Restaurar una copia</button></div></div>
    <h2><span><span class="paso">1</span>¿Cuánto tiene hoy?</span></h2>
    <div class="tarjeta"><p class="suave">Mire cada cuenta y escriba lo que tiene hoy.</p>
      <div class="dos">${state.cuentas.map((c) => campo(c.nombre, inMonto('saldo_' + c.id, c.saldoInicial))).join('')}</div></div>
    <h2><span><span class="paso">2</span>¿Cuánto le entra por quincena?</span></h2>
    <div class="tarjeta"><div class="dos">${campo('Ingreso quincenal', inMonto('ingreso', state.config.ingresoQuincenal))}${campo('Pesos por dólar', inMonto('tasa', state.config.tasaUSD))}</div>
      ${campo('¿Cuándo le pagaron la última vez?', `<input type="date" name="inicio" value="${ultimoPagoProbable()}" max="${hoy()}" required>`)}
      <p class="suave">Su quincena va de un pago al siguiente. Ese último pago ya está dentro de los saldos de arriba, así que se anota como ingreso de esta quincena sin sumarlo otra vez. Cada vez que registre un sueldo nuevo, empieza otra.</p></div>
    <h2><span><span class="paso">3</span>Platica que ya tiene dueño</span></h2>
    <div class="tarjeta"><p class="suave">Estas son de ejemplo: corrija el nombre, el valor y el día en que vencen (día del mes; en las quincenales, 1 es el mismo día del pago). Desmarque las que no apliquen; después puede agregar más.</p>
      ${state.obligaciones.map((o) => `<div class="ob"><input type="checkbox" name="on_${o.id}" ${o.activa ? 'checked' : ''} aria-label="Incluir ${esc(o.nombre)}" style="width:22px;height:22px">
        <span><input class="entrada" name="nombre_${o.id}" value="${esc(o.nombre)}" maxlength="60" aria-label="Nombre de la obligación"><span class="suave">${o.frecuencia === 'quincenal' ? 'cada quincena' : 'cada mes'}${o.moneda === 'USD' ? ' · en USD' : ''}</span></span>
        <input class="entrada ${o.moneda === 'USD' ? '' : 'monto'}" inputmode="decimal" name="monto_${o.id}" value="${o.moneda === 'USD' ? o.montoUSD : miles(o.monto)}" aria-label="Valor de ${esc(o.nombre)}">
        <input class="entrada" inputmode="numeric" name="dia_${o.id}" value="${o.dia}" aria-label="Día de ${esc(o.nombre)}"></div>`).join('')}</div>
    <h2><span><span class="paso">4</span>Presupuestos de la quincena</span></h2>
    <div class="tarjeta"><p class="suave">Los valores sugeridos son de ejemplo. Deje en blanco las categorías que no quiera presupuestar todavía.</p>
      <div class="dos">${cats().map((c) => campo(c.nombre, inMonto('pres_' + c.id, pres[c.nombre] || 0, 'placeholder="0"'))).join('')}</div></div>
    <div class="chequeo" id="chequeo"></div>
    <button class="btn ancho" style="margin-top:12px;background:var(--terra)">Empezar a llevar las cuentas claras</button></form>`;
}
function leerSetup() {
  const fd = new FormData($('#setup')); const g = (k) => fd.get(k);
  const d = { saldos: {}, presupuestos: {}, ingreso: C.parseMonto(g('ingreso')), tasa: C.parseMonto(g('tasa')), inicio: g('inicio'), obligaciones: [] };
  for (const c of state.cuentas) d.saldos[c.id] = C.parseMonto(g('saldo_' + c.id));
  for (const c of cats()) d.presupuestos[c.id] = C.parseMonto(g('pres_' + c.id));
  for (const o of state.obligaciones) {
    const x = { id: o.id, nombre: String(g('nombre_' + o.id) || '').trim(), activa: g('on_' + o.id) === 'on', dia: parseInt(g('dia_' + o.id), 10) };
    if (o.moneda === 'USD') x.montoUSD = parseFloat(String(g('monto_' + o.id)).replace(',', '.')) || 0; else x.monto = C.parseMonto(g('monto_' + o.id));
    d.obligaciones.push(x);
  }
  return d;
}
function chequeoSetup() {
  const el = $('#chequeo'); if (!el) return;
  const d = leerSetup();
  const obs = state.obligaciones.map((o) => ({ ...o, ...d.obligaciones.find((x) => x.id === o.id) }));
  const pres = Object.values(d.presupuestos).reduce((a, b) => a + b, 0);
  const ini = C.fechaValida(d.inicio) ? d.inicio : hoy();
  const linea = (desde, etq) => {
    const res = C.reservasParaRango(obs, desde, C.sumarDias(desde, C.DIAS_PERIODO - 1), d.tasa || 1, desde).reduce((a, r) => a + r.monto, 0);
    const dif = d.ingreso - res - pres;
    return `<div class="fila"><div>${etq}<div class="suave" style="color:inherit;opacity:.75">Ingreso ${f$(d.ingreso)} − reservas ${f$(res)} − presupuestos ${f$(pres)}</div></div><span class="num ${dif < 0 ? 'neg' : ''}">${dif < 0 ? 'Faltan ' + f$(-dif) : 'Sobran ' + f$(dif)}</span></div>`;
  };
  el.innerHTML = `<b>CHEQUEO DE REALIDAD</b>${linea(ini, 'Esta quincena')}${linea(C.sumarDias(ini, C.DIAS_PERIODO), 'La siguiente')}`;
}

// ---------- hojas ----------
function hojaMov(tipo = 'gasto', m = null, pre = {}) {
  const ed = !!m; const v = { fecha: hoy(), ...pre, ...(m || {}) };
  const cu = activas(); const selCu = v.cuentaId || state.config.ultimaCuenta || cu[0]?.id;
  const uso = {}; for (const x of state.movimientos.slice(-80)) if (x.tipo === 'gasto' && x.categoriaId) uso[x.categoriaId] = (uso[x.categoriaId] || 0) + 1;
  const orden = [...cats()].sort((a, b) => (uso[b.id] || 0) - (uso[a.id] || 0));
  const tabs = ed ? '' : `<div class="tabs">${['gasto', 'ingreso', 'transferencia', 'prestamo', 'invitacion'].map((t) => `<button type="button" data-a="tab-mov" data-t="${t}" class="${t === tipo ? 'activa' : ''}">${C.NOMBRE_TIPO[t]}</button>`).join('')}</div>`;
  const valor = tipo === 'invitacion' ? '' : `<div class="valor-grande"><span>$</span><input name="valor" class="monto" inputmode="numeric" autocomplete="off" placeholder="0" value="${miles(Math.abs(v.valor || 0))}" aria-label="Valor" ${tipo === 'ajuste' || tipo === 'cobro' ? 'readonly' : ''}></div>`;
  // La fecha va a la vista, con atajos, para que un gasto de otro día no quede anotado como de hoy.
  const fecha = `<div class="campo-fecha">${campo('Fecha', `<input type="date" name="fecha" value="${v.fecha}" required>`)}<button type="button" class="btn mini sec" data-a="poner-fecha" data-f="${hoy()}">Hoy</button><button type="button" class="btn mini sec" data-a="poner-fecha" data-f="${C.sumarDias(hoy(), -1)}">Ayer</button></div>`;
  const desc = (etq = 'Descripción') => campo(etq, `<input name="descripcion" value="${esc(v.descripcion || '')}" maxlength="120">`);
  const cuentaSel = (etq, name, sel) => `<fieldset><legend>${etq}</legend>${chips(name, cu.concat(state.cuentas.filter((c) => c.archivada && c.id === sel)), sel)}</fieldset>`;
  let cuerpo = '';
  if (tipo === 'gasto') {
    cuerpo = (ed ? '' : '<p class="pista">¿Y esta vaina cuánto costó?</p>') + valor
      + (v.reservaId ? `<p class="suave">Pago de la reserva «${esc(v.descripcion)}». No se imputa a ningún presupuesto.</p>` : `<fieldset><legend>Categoría</legend>${chips('categoriaId', orden.concat(state.categorias.filter((c) => c.archivada && c.id === v.categoriaId)), v.categoriaId)}</fieldset>`)
      + cuentaSel('Sale de', 'cuentaId', selCu)
      + fecha + `<details ${ed ? 'open' : ''}><summary>Más detalles</summary>${v.reservaId ? '' : desc()}${campo('Nota', `<textarea name="nota" rows="2" maxlength="300">${esc(v.nota || '')}</textarea>`)}</details>`;
  } else if (tipo === 'ingreso') {
    const nueva = pre.nueva ?? C.sugerirNuevaQuincena(state, v.fecha);
    cuerpo = valor + cuentaSel('Entra a', 'cuentaId', selCu) + fecha + desc()
      + (ed ? '' : `<label class="check"><input type="checkbox" name="nueva" ${nueva ? 'checked' : ''}>Con este pago empieza una quincena nueva</label>
      <label class="check"><input type="checkbox" name="arrastrar">Sumar lo que sobró de cada presupuesto al de la quincena nueva</label>
      <p class="suave">Marque la primera casilla cuando sea su sueldo: se cierra la quincena actual y la nueva arranca en la fecha del pago, con sus presupuestos y reservas.</p>`);
  } else if (tipo === 'transferencia') {
    cuerpo = valor + cuentaSel('Sale de', 'cuentaId', selCu) + cuentaSel('Entra a', 'cuentaDestinoId', v.cuentaDestinoId)
      + '<p class="suave">Mover plata entre sus cuentas no es gasto ni ingreso.</p>' + fecha + desc();
  } else if (tipo === 'prestamo') {
    cuerpo = valor + campo('¿A quién?', `<input name="persona" value="${esc(v.persona || '')}" maxlength="60" required>`) + cuentaSel('Sale de', 'cuentaId', selCu)
      + '<p class="suave">Prestar no es gastar: baja la cuenta y queda anotado en «Me deben».</p>' + fecha + desc('Concepto');
  } else if (tipo === 'invitacion') {
    cuerpo = '<p class="suave">Queda anotado que comió sin gastar. No mueve plata ni presupuesto.</p>'
      + `<fieldset><legend>¿Qué le invitaron?</legend>${chips('categoriaId', cats().filter((c) => c.comida || c.id === v.categoriaId), v.categoriaId || cats().find((c) => c.comida)?.id)}</fieldset>` + desc('¿Quién invitó?') + fecha;
  } else if (tipo === 'cobro') {
    cuerpo = valor + `<p class="suave">Pago de ${esc(v.persona)}. El valor es el de la deuda.</p>` + cuentaSel('Entró a', 'cuentaId', selCu) + fecha;
  } else {
    cuerpo = `<p>Ajuste de ${f$(v.valor)} en ${esc(C.cuenta(state, v.cuentaId)?.nombre)} por cuadre de caja del ${C.fechaCorta(v.fecha)}.</p><input type="hidden" name="fecha" value="${v.fecha}"><input type="hidden" name="cuentaId" value="${v.cuentaId}">`;
  }
  abrirHoja(ed ? `Editar: ${C.NOMBRE_TIPO[tipo]}` : 'Registrar movimiento', `${tabs}<form data-form="mov"><input type="hidden" name="tipo" value="${tipo}"><input type="hidden" name="id" value="${m?.id || ''}">${cuerpo}
    <div class="botones ed">${ed ? `<button type="button" class="btn peligro" data-a="borrar-mov" data-id="${m.id}">Eliminar</button>` : ''}${tipo === 'ajuste' ? '' : '<button class="btn">Guardar</button>'}</div></form>`);
  if (!ed) $('#hoja input[name=valor]')?.focus();
}
function hojaPagar(r) {
  abrirHoja(`Pagar: ${r.nombre}`, `<form data-form="pagar"><input type="hidden" name="id" value="${r.id}">
    <div class="valor-grande"><span>$</span><input name="valor" class="monto" inputmode="numeric" value="${miles(r.monto)}" aria-label="Valor pagado"></div>
    <p class="suave">${r.estimado || r.moneda === 'USD' ? 'El valor reservado era un estimado: escriba lo que pagó de verdad.' : 'Confirme el valor que pagó.'} La diferencia se ajusta sola en su plata libre.</p>
    <fieldset><legend>Sale de</legend>${chips('cuentaId', activas(), state.config.ultimaCuenta || activas()[0]?.id)}</fieldset>
    ${campo('Fecha del pago', `<input type="date" name="fecha" value="${hoy()}" required>`)}<button class="btn ancho">Registrar pago</button></form>`);
}
function hojaReserva(r) {
  const v = r || { nombre: '', monto: 0, vence: hoy(), estimado: false };
  abrirHoja(r ? 'Editar reserva' : 'Nueva reserva', `<form data-form="reserva"><input type="hidden" name="id" value="${r?.id || ''}">
    ${r ? '' : '<p class="suave">Una reserva de una sola vez. Para algo que se repite, cree una obligación periódica.</p>'}
    ${campo('Nombre', `<input name="nombre" value="${esc(v.nombre)}" maxlength="60" required>`)}${campo('Valor en pesos', inMonto('monto', v.monto))}
    ${campo('Vence el', `<input type="date" name="vence" value="${v.vence}" required>`)}
    <label class="check"><input type="checkbox" name="estimado" ${v.estimado ? 'checked' : ''}>El valor es un estimado</label>
    <div class="botones">${r?.estado === 'pendiente' ? `<button type="button" class="btn peligro" data-a="cancelar-reserva" data-id="${r.id}">Cancelar reserva</button>` : ''}${r?.estado === 'cancelada' ? `<button type="button" class="btn sec" data-a="reactivar-reserva" data-id="${r.id}">Reactivar</button>` : ''}<button class="btn">Guardar</button></div></form>`);
}
function hojaObligacion(o) {
  const v = o || { nombre: '', monto: 0, montoUSD: 0, moneda: 'COP', frecuencia: 'mensual', dia: 1, estimado: false, activa: true };
  abrirHoja(o ? 'Editar obligación' : 'Nueva obligación', `<form data-form="obligacion"><input type="hidden" name="id" value="${o?.id || ''}">
    ${campo('Nombre', `<input name="nombre" value="${esc(v.nombre)}" maxlength="60" required>`)}
    <div class="dos">${campo('Moneda', `<select name="moneda"><option value="COP" ${v.moneda === 'COP' ? 'selected' : ''}>Pesos</option><option value="USD" ${v.moneda === 'USD' ? 'selected' : ''}>Dólares</option></select>`)}
    ${campo('Valor', `<input name="valor" inputmode="decimal" value="${v.moneda === 'USD' ? v.montoUSD : miles(v.monto)}" required>`)}</div>
    <div class="dos">${campo('Se paga', `<select name="frecuencia"><option value="quincenal" ${v.frecuencia === 'quincenal' ? 'selected' : ''}>Cada quincena</option><option value="mensual" ${v.frecuencia === 'mensual' ? 'selected' : ''}>Cada mes</option></select>`)}
    ${campo('Día de vencimiento', `<input name="dia" inputmode="numeric" value="${v.dia}" required>`)}</div>
    <p class="suave">Mensual: día del mes (1 a 31); se reserva completa en la quincena en que vence. Quincenal: día dentro de la quincena (1 a 14). Los dólares se convierten con la tasa de Ajustes.</p>
    <label class="check"><input type="checkbox" name="estimado" ${v.estimado ? 'checked' : ''}>El valor es un estimado</label>
    <label class="check"><input type="checkbox" name="activa" ${v.activa ? 'checked' : ''}>Activa</label>
    <div class="botones">${o ? `<button type="button" class="btn peligro" data-a="borrar-ob" data-id="${o.id}">Eliminar</button>` : ''}<button class="btn">Guardar</button></div></form>`);
}
function hojaPres(catId, per) {
  const c = C.categoria(state, catId); const p = C.presupuestosDe(state, per).find((x) => x.categoriaId === catId);
  abrirHoja(c.nombre, `<form data-form="pres"><input type="hidden" name="cat" value="${catId}"><input type="hidden" name="per" value="${per}">
    <p class="suave">Quincena ${C.nombrePeriodo(state, per)}${p ? ` · gastado ${f$(p.gastado)}` : ''}${p?.arrastre ? ` · incluye ${f$(p.arrastre)} que sobraron de la quincena anterior` : ''}</p>
    ${campo('Presupuesto de esta quincena', inMonto('monto', p?.monto || 0))}
    <details><summary>Ajustes de la categoría</summary>${campo('Nombre', `<input name="nombre" value="${esc(c.nombre)}" maxlength="50" required>`)}
    ${campo('Valor de referencia por unidad (opcional)', inMonto('valorRef', c.valorRef))}<p class="suave">Con él le digo cuántos ${esc(c.nombre.toLowerCase())} le quedan.</p>
    ${campo('Tipo de gasto', `<select name="tipo">${['habitual', 'social', 'antojo', 'extraordinario'].map((t) => `<option ${c.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}</select>`)}
    <label class="check"><input type="checkbox" name="comida" ${c.comida ? 'checked' : ''}>Es comida (aparece en «Me invitaron»)</label>
    <button type="button" class="btn peligro mini" data-a="archivar-cat" data-id="${catId}">Archivar categoría</button></details>
    ${p?.historial.length ? `<details><summary>Historial de cambios</summary>${p.historial.map((x) => `<div class="fila"><span>${C.fechaCorta(x.fecha)}</span><span>${f$(x.de)} → ${f$(x.a)}</span></div>`).join('')}</details>` : ''}
    <div class="botones">${p ? `<button type="button" class="btn peligro" data-a="quitar-pres" data-cat="${catId}" data-per="${per}">Quitar presupuesto</button>` : ''}<button class="btn">Guardar</button></div></form>`);
}
function hojaCategoria(k) {
  const v = k || { nombre: '', tipo: 'habitual', valorRef: 0, comida: false };
  abrirHoja(k ? 'Editar categoría' : 'Nueva categoría', `<form data-form="categoria"><input type="hidden" name="id" value="${k?.id || ''}">
    ${campo('Nombre', `<input name="nombre" value="${esc(v.nombre)}" maxlength="50" required>`)}
    ${campo('Tipo de gasto', `<select name="tipo">${['habitual', 'social', 'antojo', 'extraordinario'].map((t) => `<option ${v.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}</select>`)}
    ${campo('Valor de referencia por unidad (opcional)', inMonto('valorRef', v.valorRef))}<p class="suave">Por ejemplo, lo que cuesta un almuerzo. Con él le digo cuántos le quedan.</p>
    <label class="check"><input type="checkbox" name="comida" ${v.comida ? 'checked' : ''}>Es comida (aparece en «Me invitaron»)</label>
    <button class="btn ancho">${k ? 'Guardar' : 'Agregar'}</button></form>`);
}
function hojaCuadre() {
  const sal = C.saldos(state);
  abrirHoja('Cuadre de caja', `<form data-form="cuadre"><p class="suave">Mire cada cuenta y escriba el saldo real. Si hay diferencia, queda un ajuste visible en el historial.</p>
    ${activas().map((c) => campo(`${c.nombre} (calculado: ${f$(sal[c.id])})`, inMonto('real_' + c.id, sal[c.id]))).join('')}<button class="btn ancho">Cuadrar</button></form>`);
}
function hojaAbrir() {
  const per = P();
  abrirHoja('Quincena nueva', `<form data-form="abrir">
    <p class="suave">Lo normal es que la quincena nueva empiece al registrar el sueldo con el botón +. Use esto si quiere abrirla sin registrar un pago.</p>
    ${campo('Empieza el', `<input type="date" name="fecha" value="${hoy()}" required>`)}
    <label class="check"><input type="checkbox" name="arrastrar">Sumar lo que sobró de cada presupuesto al de la quincena nueva</label>
    <p class="suave">Se cierra la quincena ${C.nombrePeriodo(state, per)}, se copian sus presupuestos y se reservan las obligaciones. Nada queda pagado.</p>
    <button class="btn ancho">Abrir la quincena</button></form>`);
}

// ---------- acciones ----------
function elegirArchivo(modo) { ui.archivo = modo; const i = $('#archivo'); i.value = ''; i.click(); }
function hacerCopia() {
  descargar(`vainas-copia-${hoy()}.json`, JSON.stringify(state, null, 1), 'application/json');
  if (!ui.revision) commit(() => { state.config.ultimaCopia = hoy(); }, 'Copia descargada. Guárdela en un lugar seguro.');
}
const acciones = {
  cerrar: cerrarHoja,
  'nuevo-mov': () => hojaMov('gasto'),
  'tab-mov': (el) => hojaMov(el.dataset.t, null, { valor: C.parseMonto($('#hoja input[name=valor]')?.value) }),
  'ed-mov': (el) => { const m = state.movimientos.find((x) => x.id === el.dataset.id); if (m) hojaMov(m.tipo, m); },
  'borrar-mov': (el) => { if (confirm('¿Eliminar este movimiento? Los saldos se recalculan.')) commit(() => C.eliminarMovimiento(state, el.dataset.id), 'Movimiento eliminado.'); },
  pagar: (el) => hojaPagar(state.reservas.find((r) => r.id === el.dataset.id)),
  'nueva-reserva': () => hojaReserva(null),
  'ed-reserva': (el) => hojaReserva(state.reservas.find((r) => r.id === el.dataset.id)),
  'cancelar-reserva': (el) => commit(() => C.cancelarReserva(state, el.dataset.id), 'Reserva cancelada: esa plata volvió a estar libre.'),
  'reactivar-reserva': (el) => commit(() => C.reactivarReserva(state, el.dataset.id), 'Esa platica ya tiene dueño otra vez.'),
  'nueva-ob': () => hojaObligacion(null),
  'ed-ob': (el) => hojaObligacion(state.obligaciones.find((o) => o.id === el.dataset.id)),
  'borrar-ob': (el) => { if (confirm('¿Eliminar esta obligación y sus reservas pendientes? Los pagos ya hechos se conservan.')) commit(() => C.eliminarObligacion(state, el.dataset.id), 'Obligación eliminada.'); },
  'nueva-deuda': () => abrirHoja('Me deben', `<form data-form="deuda">${campo('¿Quién le debe?', '<input name="persona" maxlength="60" required>')}${campo('Valor', inMonto('valor'))}${campo('Concepto', '<input name="concepto" maxlength="120">')}${campo('Fecha', `<input type="date" name="fecha" value="${hoy()}" required>`)}
    <p class="suave">Si le está prestando plata de sus cuentas, use mejor «Presté plata» en el botón +.</p><button class="btn ancho">Guardar</button></form>`),
  cobrar: (el) => { const d = state.porCobrar.find((x) => x.id === el.dataset.id); abrirHoja(`Recibí de ${d.persona}`, `<form data-form="cobrar"><input type="hidden" name="id" value="${d.id}"><p>Valor: ${num(d.valor)}</p><fieldset><legend>¿A qué cuenta entró?</legend>${chips('cuentaId', activas(), state.config.ultimaCuenta || activas()[0]?.id)}</fieldset>${campo('Fecha', `<input type="date" name="fecha" value="${hoy()}" required>`)}<button class="btn ancho">Confirmar que la recibí</button></form>`); },
  'quitar-deuda': (el) => { if (confirm('¿Quitar esta deuda?')) commit(() => C.eliminarPorCobrar(state, el.dataset.id)); },
  'ed-pres': (el) => hojaPres(el.dataset.cat, el.dataset.per),
  'quitar-pres': (el) => commit(() => C.quitarPresupuesto(state, el.dataset.per, el.dataset.cat), 'Presupuesto quitado. Los gastos se conservan.'),
  'archivar-cat': (el) => { if (confirm('¿Archivar esta categoría? Sus movimientos se conservan.')) commit(() => { C.categoria(state, el.dataset.id).archivada = true; state.presupuestos = state.presupuestos.filter((p) => !(p.categoriaId === el.dataset.id && p.periodo >= P())); }); },
  'nueva-cat': () => abrirHoja('Nueva categoría', `<form data-form="cat">${campo('Nombre', '<input name="nombre" maxlength="50" required>')}${campo('Tipo de gasto', '<select name="tipo"><option>habitual</option><option>social</option><option>antojo</option><option>extraordinario</option></select>')}${campo('Presupuesto de esta quincena (opcional)', inMonto('monto'))}<button class="btn ancho">Crear</button></form>`),
  'tipo-ana': (el) => { ui.tipoAna = el.dataset.t; render(); },
  'ver-cuenta': (el) => { ui.filtros = { ...filtrosVacios(), cuenta: el.dataset.id }; location.hash = '#movimientos'; },
  'nueva-cuenta': () => abrirHoja('Nueva cuenta', `<form data-form="cuenta"><input type="hidden" name="id" value="">${campo('Nombre', '<input name="nombre" maxlength="40" required>')}${campo('Saldo de hoy', inMonto('saldo'))}<button class="btn ancho">Crear</button></form>`),
  'ed-cuenta': (el) => { const c = C.cuenta(state, el.dataset.id); abrirHoja('Renombrar cuenta', `<form data-form="cuenta"><input type="hidden" name="id" value="${c.id}">${campo('Nombre', `<input name="nombre" value="${esc(c.nombre)}" maxlength="40" required>`)}<button class="btn ancho">Guardar</button></form>`); },
  'quitar-cuenta': (el) => { if (confirm('¿Quitar esta cuenta? Si tiene movimientos se archiva para conservar el historial.')) commit(() => C.quitarCuenta(state, el.dataset.id), 'Cuenta quitada.'); },
  recorrido: () => { if (ui.ruta !== 'inicio') { ui.ruta = 'inicio'; history.replaceState(null, '', '#inicio'); render(); } window.scrollTo(0, 0); recorrido(); },
  'poner-fecha': (el) => { const i = el.closest('form').elements.fecha; i.value = el.dataset.f; marcarFechas(); },
  cuadre: hojaCuadre,
  'ingreso-inicial': () => { const p = C.ultimoPeriodo(state); abrirHoja('Pago con que empezó la quincena', `<form data-form="ingresoInicial">
    <p class="suave">Es el pago que ya tenía en sus cuentas cuando empezó esta quincena, el ${C.fechaCorta(p.inicio)}. Se anota como ingreso del periodo sin sumarlo otra vez a los saldos. Si registró ese pago con el botón +, déjelo en cero.</p>
    ${campo('Valor del pago', inMonto('valor', p.ingresoInicial || 0))}<button class="btn ancho">Guardar</button></form>`); },
  'cat-nueva': () => hojaCategoria(null),
  'cat-editar': (el) => hojaCategoria(C.categoria(state, el.dataset.id)),
  'cat-quitar': (el) => {
    const k = C.categoria(state, el.dataset.id), usada = C.categoriaUsada(state, k.id);
    if (confirm(usada ? `¿Quitar «${k.nombre}»? Ya tiene movimientos: deja de aparecer al registrar, pero su historial se conserva y la puede recuperar.` : `¿Quitar «${k.nombre}»? No tiene movimientos, así que se borra del todo.`)) commit(() => C.quitarCategoria(state, k.id), 'Categoría quitada.');
  },
  'cat-recuperar': (el) => commit(() => C.recuperarCategoria(state, el.dataset.id), 'Categoría recuperada.'),
  'limpiar-filtros': () => { ui.filtros = filtrosVacios(); render(); },
  actualizar: async () => {
    aviso('Buscando la versión más nueva…');
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.update();
      for (const k of await caches.keys()) await caches.delete(k);
    } catch (e) { /* sin conexión: se recarga con lo que haya */ }
    location.reload();
  },
  'abrir-periodo': hojaAbrir,
  'me-pagaron': () => hojaMov('ingreso', null, { nueva: true }),
  'deshacer-periodo': () => { if (confirm('¿Deshacer la apertura de esta quincena? Sus gastos vuelven a contar en la anterior y se quitan sus presupuestos.')) commit(() => { C.deshacerPeriodo(state); ui.perPres = ui.perAna = null; }, 'Quincena deshecha.'); },
  'cal-mes': (el) => { const [y, m] = (ui.calMes || hoy().slice(0, 7)).split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + Number(el.dataset.d), 1)); ui.calMes = d.toISOString().slice(0, 7); ui.calDia = null; render(); },
  'cal-dia': (el) => { ui.calDia = el.dataset.f; render(); },
  'cal-nuevo': (el) => { const f = el.dataset.f, dia = C.partes(f).d; abrirHoja(`Gasto fijo del ${C.fechaCorta(f)}`, `<form data-form="fijo"><input type="hidden" name="fecha" value="${f}">
    ${campo('Nombre', '<input name="nombre" maxlength="60" required>')}${campo('Valor en pesos', inMonto('monto'))}
    <fieldset><legend>¿Se repite?</legend>${chips('rep', [{ id: 'mes', nombre: `Todos los meses, el día ${dia}` }, { id: 'una', nombre: 'Solo esta vez' }], 'mes')}</fieldset>
    <label class="check"><input type="checkbox" name="estimado">El valor es un estimado</label><button class="btn ancho">Guardar</button></form>`); },
  copia: hacerCopia,
  'csv-movs': () => descargar(`vainas-movimientos-${hoy()}.csv`, C.csvMovimientos(state), 'text/csv;charset=utf-8'),
  'csv-pres': () => descargar(`vainas-presupuestos-${hoy()}.csv`, C.csvPresupuestos(state), 'text/csv;charset=utf-8'),
  revision: () => elegirArchivo('revision'),
  restaurar: () => elegirArchivo('restaurar'),
  'salir-revision': () => { state = propio; propio = null; ui.revision = false; ui.perPres = ui.perAna = null; render(); },
  'borrar-todo': async () => {
    if (!confirm('¿Borrar TODOS los datos de este dispositivo? Descargue antes una copia de seguridad.') || !confirm('¿Seguro? Esto no se puede deshacer.')) return;
    await DB.borrarTodo(); state = C.estadoInicial(); location.hash = '#inicio'; render();
  },
};

const formularios = {
  setup: () => commit(() => C.configurar(state, leerSetup(), hoy()), '¡Listo! Dejémonos de vainas y llevemos las cuentas claras.'),
  config: (d) => commit(() => {
    const ing = C.parseMonto(d.ingreso), tasa = C.parseMonto(d.tasa);
    if (!(tasa > 0)) throw new Error('La tasa de cambio debe ser mayor que cero.');
    state.config.ingresoQuincenal = ing; state.config.tasaUSD = tasa;
  }, 'Guardado.'),
  mov: (d) => {
    const tipo = d.tipo, valor = C.parseMonto(d.valor), desc = (d.descripcion || '').trim();
    const previo = d.id ? state.movimientos.find((m) => m.id === d.id) : null;
    if (tipo === 'gasto' && !previo?.reservaId && !d.categoriaId) return aviso('Elija una categoría.', true);
    if (tipo !== 'invitacion' && tipo !== 'ajuste' && !d.cuentaId) return aviso('Elija una cuenta.', true);
    const m = { tipo, valor, fecha: d.fecha, cuentaId: d.cuentaId || null, descripcion: previo?.reservaId ? previo.descripcion : desc };
    if (tipo === 'gasto') { m.categoriaId = previo?.reservaId ? null : d.categoriaId; m.nota = (d.nota || '').trim(); }
    if (tipo === 'transferencia') m.cuentaDestinoId = d.cuentaDestinoId || null;
    if (tipo === 'prestamo') m.persona = (d.persona || '').trim();
    if (tipo === 'invitacion') m.categoriaId = d.categoriaId || null;
    if (tipo === 'ajuste' || tipo === 'cobro') delete m.valor;
    if (!previo && tipo !== 'invitacion' && C.esDuplicado(state, m) && !confirm('Ya hay un movimiento igual en esa fecha. ¿Registrarlo otra vez?')) return;
    const cerrada = tipo === 'ingreso' && !previo && d.nueva === 'on' ? P() : null;
    return commit(() => {
      if (previo) return C.editarMovimiento(state, previo.id, m);
      if (cerrada) C.abrirPeriodo(state, m.fecha, { arrastrar: d.arrastrar === 'on' });
      if (tipo === 'prestamo') return C.prestar(state, { valor, persona: m.persona, cuentaId: m.cuentaId, fecha: m.fecha, concepto: desc });
      return C.agregarMovimiento(state, m);
    }, () => {
      if (cerrada) return 'Quincena nueva abierta. ¡Pilas pues!';
      if (tipo !== 'gasto' || previo?.reservaId) return previo ? 'Cambios guardados.' : 'Anotado.';
      const p = C.presupuestosDe(state, C.periodoDe(state, m.fecha)).find((x) => x.categoriaId === m.categoriaId);
      if (!p) return 'Anotado como gasto no presupuestado: salió de su plata libre.';
      if (p.exceso) return `No se me descuadre: se pasó por ${f$(p.exceso)} en ${p.nombre}.`;
      const u = p.unidades !== null ? ` (${p.unidades} ${p.nombre.toLowerCase()})` : '';
      return `${p.pct >= 80 ? '¡Pilas pues! ' : 'Anotado. '}Quedan ${f$(p.resta)} en ${p.nombre}${u}.`;
    }).then((ok) => { if (ok && cerrada) abrirHoja('Capítulo cerrado', creditos(cerrada) + '<button class="btn ancho" data-a="cerrar" style="margin-top:12px">Seguir</button>'); return ok; });
  },
  pagar: (d) => {
    if (!d.cuentaId) return aviso('Elija una cuenta.', true);
    return commit(() => C.pagarReserva(state, d.id, { cuentaId: d.cuentaId, valor: C.parseMonto(d.valor), fecha: d.fecha }), 'Pago registrado. La reserva quedó pagada.');
  },
  reserva: (d) => commit(() => C.guardarReserva(state, { id: d.id || undefined, nombre: d.nombre.trim(), monto: C.parseMonto(d.monto), vence: d.vence, estimado: d.estimado === 'on' }), 'Esa platica ya tiene dueño.'),
  obligacion: (d) => commit(() => {
    const o = { id: d.id || undefined, nombre: d.nombre.trim(), moneda: d.moneda, frecuencia: d.frecuencia, dia: parseInt(d.dia, 10), estimado: d.estimado === 'on', activa: d.activa === 'on' };
    if (d.moneda === 'USD') { o.montoUSD = parseFloat(String(d.valor).replace(',', '.')) || 0; o.monto = 0; } else { o.monto = C.parseMonto(d.valor); o.montoUSD = 0; }
    C.guardarObligacion(state, o, hoy());
  }, 'Obligación guardada.'),
  deuda: (d) => commit(() => C.agregarPorCobrar(state, { persona: d.persona, valor: C.parseMonto(d.valor), fecha: d.fecha, concepto: (d.concepto || '').trim() }), 'Anotado. Esa plata no cuenta hasta que la reciba.'),
  cobrar: (d) => {
    if (!d.cuentaId) return aviso('Elija una cuenta.', true);
    return commit(() => C.cobrar(state, d.id, { cuentaId: d.cuentaId, fecha: d.fecha }), 'Recibido. Ya está en su cuenta.');
  },
  pres: (d) => commit(() => {
    C.guardarCategoria(state, { id: d.cat, nombre: d.nombre, valorRef: C.parseMonto(d.valorRef), tipo: d.tipo, comida: d.comida === 'on' });
    C.fijarPresupuesto(state, d.per, d.cat, C.parseMonto(d.monto), hoy());
  }, 'Presupuesto guardado.'),
  cat: (d) => commit(() => {
    const c = C.guardarCategoria(state, { nombre: d.nombre, tipo: d.tipo });
    const monto = C.parseMonto(d.monto);
    if (monto > 0) C.fijarPresupuesto(state, ui.perPres || P(), c.id, monto, hoy());
  }, 'Categoría creada.'),
  fijo: (d) => commit(() => {
    const base = { nombre: d.nombre.trim(), monto: C.parseMonto(d.monto), estimado: d.estimado === 'on' };
    if (d.rep === 'una') C.guardarReserva(state, { ...base, vence: d.fecha });
    else C.guardarObligacion(state, { ...base, frecuencia: 'mensual', dia: C.partes(d.fecha).d }, hoy());
  }, 'Esa platica ya tiene dueño.'),
  categoria: (d) => commit(() => C.guardarCategoria(state, { id: d.id || undefined, nombre: d.nombre, tipo: d.tipo, valorRef: C.parseMonto(d.valorRef), comida: d.comida === 'on' }), d.id ? 'Categoría guardada.' : 'Categoría agregada.'),
  ingresoInicial: (d) => commit(() => C.fijarIngresoInicial(state, C.ultimoPeriodo(state).id, C.parseMonto(d.valor)), 'Guardado.'),
  cuenta: (d) => commit(() => C.guardarCuenta(state, { id: d.id || undefined, nombre: d.nombre, saldoInicial: C.parseMonto(d.saldo) }, hoy()), 'Cuenta guardada.'),
  cuadre: (d) => commit(() => {
    const reales = {};
    for (const c of activas()) reales[c.id] = C.parseMonto(d['real_' + c.id]);
    return C.cuadrar(state, reales, hoy());
  }, (aj) => (aj.length ? `Cuadrado con ${aj.length} ${aj.length === 1 ? 'ajuste' : 'ajustes'}.` : 'Todo cuadra. Así da gusto.')),
  abrir: (d) => commit(() => C.abrirPeriodo(state, d.fecha, { arrastrar: d.arrastrar === 'on' }), 'Quincena abierta. ¡Pilas pues!'),
};

// ---------- eventos ----------
document.addEventListener('click', (e) => {
  if (e.target.id === 'fondo') return cerrarHoja();
  const el = e.target.closest('[data-a]');
  if (el && acciones[el.dataset.a]) { e.preventDefault(); acciones[el.dataset.a](el); }
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-form]'); if (!f) return;
  e.preventDefault();
  formularios[f.dataset.form]?.(Object.fromEntries(new FormData(f)));
});
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.classList.contains('monto')) t.value = miles(C.parseMonto(t.value));
  if (t.type === 'date') t.classList.toggle('vacia', !t.value);
  if (t.dataset.f) { ui.filtros[t.dataset.f] = t.value; $('#lista-movs').innerHTML = listaMovs(); }
  if (t.dataset.fc) {
    const c = ui.filtros.cats, id = t.dataset.fc;
    ui.filtros.cats = t.checked ? [...c, id] : c.filter((x) => x !== id);
    $('#lista-movs').innerHTML = listaMovs(); $('#resumen-cats').innerHTML = resumenCats();
  }
  if (t.closest('#setup')) chequeoSetup();
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.c) { ui[t.dataset.c] = t.value; render(); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#fondo').hidden) cerrarHoja(); });
$('#archivo').addEventListener('change', async (e) => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const datos = C.validarEstado(JSON.parse(await file.text()));
    if (ui.archivo === 'revision') {
      if (!ui.revision) propio = state;
      state = datos; ui.revision = true; ui.perPres = ui.perAna = null; ui.ruta = 'inicio'; location.hash = '#inicio'; render();
    } else if (confirm('¿Reemplazar los datos de este dispositivo con los de la copia?')) {
      state = datos; await DB.guardar(state); render(); aviso('Copia restaurada.');
    }
  } catch (err) { aviso(err instanceof SyntaxError ? 'El archivo no es una copia de VAINAS.' : err.message, true); }
});
function navegar() {
  if (!state) return;
  const r = location.hash.slice(1);
  ui.ruta = TITULOS[r] ? r : 'inicio';
  if (state.config.setupDone && !ui.revision && C.ponerAlDia(state, hoy())) DB.guardar(state).catch(() => {});
  cerrarHoja(); render(); window.scrollTo(0, 0);
}
window.addEventListener('hashchange', navegar);

// ---------- arranque ----------
(async () => {
  // Si los datos no se pueden leer, la app se detiene: seguir desde cero podría sobrescribirlos.
  try {
    state = C.migrar(await DB.cargar());
    if (state && state.version !== C.VERSION) throw new Error('versión de datos desconocida');
  } catch (e) {
    state = null;
    document.body.classList.add('sin-nav');
    $('#vista').innerHTML = `<div class="tarjeta"><h2>No pude abrir sus datos</h2><p>No se ha borrado nada. Lo más probable es que la app se esté actualizando.</p>
      <button class="btn ancho" data-a="actualizar">Actualizar y volver a intentar</button><p class="suave">Versión ${VERSION_APP}. Detalle: ${esc(e.message)}</p></div>`;
    return;
  }
  if (!state) state = C.estadoInicial();
  navegar();
  navigator.storage?.persist?.().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    // Cuando llega una versión nueva, la app se recarga una sola vez para no mezclar archivos viejos y nuevos.
    const tenia = !!navigator.serviceWorker.controller; let recargada = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (tenia && !recargada) { recargada = true; location.reload(); } });
    navigator.serviceWorker.register('sw.js').then((reg) => reg.update()).catch(() => {});
  }
})();
