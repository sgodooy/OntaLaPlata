// VAINAS: reglas contables. Este módulo no toca el navegador, para poder probarlo solo.
// Todos los valores son enteros en pesos colombianos.

export const TZ = 'America/Bogota';
export const VERSION = 1;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const TIPOS = ['gasto', 'ingreso', 'transferencia', 'prestamo', 'cobro', 'ajuste', 'invitacion'];
export const NOMBRE_TIPO = {
  gasto: 'Gasto', ingreso: 'Ingreso', transferencia: 'Transferencia', prestamo: 'Presté plata',
  cobro: 'Me pagaron', ajuste: 'Cuadre de caja', invitacion: 'Me invitaron',
};

// ---------- utilidades ----------
export function uid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}
export function hoy(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
export function fmt(n) {
  const s = Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (n < 0 ? '-$' : '$') + s;
}
export function parseMonto(txt) {
  const s = String(txt ?? '').replace(/[^\d]/g, '');
  return s ? parseInt(s, 10) : 0;
}
const p2 = (n) => String(n).padStart(2, '0');
export function partes(f) { const [y, m, d] = f.split('-').map(Number); return { y, m, d }; }
export function ultimoDia(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
export function fechaValida(f) {
  if (typeof f !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(f)) return false;
  const { y, m, d } = partes(f);
  return m >= 1 && m <= 12 && d >= 1 && d <= ultimoDia(y, m);
}
export function sumarDias(f, n) {
  const { y, m, d } = partes(f);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
export function diasEntre(a, b) {
  const pa = partes(a), pb = partes(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000);
}
export function fechaCorta(f) { const { m, d } = partes(f); return `${d} ${MESES[m - 1]}`; }

// ---------- quincenas ----------
export function periodoDe(f) { const { y, m, d } = partes(f); return `${y}-${p2(m)}-${d <= 14 ? 'A' : 'B'}`; }
export function esPeriodo(p) { return typeof p === 'string' && /^\d{4}-(0[1-9]|1[0-2])-[AB]$/.test(p); }
export function rangoPeriodo(p) {
  const [y, m, q] = p.split('-');
  return q === 'A'
    ? { inicio: `${y}-${m}-01`, fin: `${y}-${m}-14` }
    : { inicio: `${y}-${m}-15`, fin: `${y}-${m}-${p2(ultimoDia(+y, +m))}` };
}
export function periodoSiguiente(p) { return periodoDe(sumarDias(rangoPeriodo(p).fin, 1)); }
export function periodoAnterior(p) { return periodoDe(sumarDias(rangoPeriodo(p).inicio, -1)); }
export function nombrePeriodo(p) {
  const { inicio, fin } = rangoPeriodo(p); const a = partes(inicio), b = partes(fin);
  return `${a.d} al ${b.d} de ${MESES[a.m - 1]} ${a.y}`;
}
// Un ingreso se sugiere para la quincena que está por empezar si faltan tres días o menos.
export function sugerirPeriodoIngreso(f) {
  const p = periodoDe(f);
  return diasEntre(f, rangoPeriodo(p).fin) + 1 <= 3 ? periodoSiguiente(p) : p;
}

// ---------- estado inicial ----------
export function estadoInicial() {
  const c = (nombre, saldoInicial) => ({ id: uid(), nombre, saldoInicial, saldoFecha: null, confirmada: false, archivada: false });
  const k = (nombre, grupo, tipo, extra = {}) => ({ id: uid(), nombre, grupo, tipo, valorRef: 0, comida: false, archivada: false, ...extra });
  const o = (nombre, monto, frecuencia, dia, extra = {}) => ({ id: uid(), nombre, monto, moneda: 'COP', montoUSD: 0, frecuencia, dia, estimado: false, activa: true, ...extra });
  return {
    version: VERSION,
    config: { setupDone: false, ingresoQuincenal: 1000000, tasaUSD: 4000, ultimaCuenta: null, ultimoCuadre: null, ultimaCopia: null },
    periodos: [],
    cuentas: [c('Bancolombia', 0), c('Nequi', 0), c('Nu', 0), c('Efectivo', 0)],
    categorias: [
      k('Almuerzos', 'Alimentación', 'habitual', { valorRef: 15000, comida: true }),
      k('Desayunos', 'Alimentación', 'habitual', { valorRef: 8000, comida: true }),
      k('Mercado', 'Alimentación', 'habitual'),
      k('Cenas', 'Alimentación', 'habitual', { comida: true }),
      k('Salidas', 'Vida social', 'social'),
      k('Restaurantes e invitaciones a otros', 'Vida social', 'social'),
      k('Entretenimiento', 'Vida social', 'social'),
      k('Antojos', 'Antojos', 'antojo'),
      k('Transporte', 'Otros', 'habitual'),
      k('Belleza y cuidado personal', 'Otros', 'habitual'),
      k('Salud', 'Otros', 'habitual'),
      k('Compras personales', 'Otros', 'habitual'),
      k('Gastos extraordinarios', 'Extraordinarios', 'extraordinario'),
    ],
    obligaciones: [
      // Valores de ejemplo: los reales se escriben en la configuración inicial.
      o('Arriendo', 350000, 'quincenal', 1),
      o('Celular e internet', 80000, 'mensual', 16),
      o('Servicios públicos', 100000, 'mensual', 10, { estimado: true }),
      o('Suscripción en dólares', 0, 'mensual', 20, { moneda: 'USD', montoUSD: 10 }),
    ],
    presupuestos: [], reservas: [], movimientos: [], porCobrar: [],
  };
}

const buscar = (lista, id) => lista.find((x) => x.id === id);
export const cuenta = (s, id) => buscar(s.cuentas, id);
export const categoria = (s, id) => buscar(s.categorias, id);

// ---------- saldos ----------
export function saldos(s) {
  const r = {};
  for (const c of s.cuentas) r[c.id] = c.saldoInicial;
  for (const m of s.movimientos) {
    switch (m.tipo) {
      case 'gasto': case 'prestamo': r[m.cuentaId] -= m.valor; break;
      case 'ingreso': case 'cobro': case 'ajuste': r[m.cuentaId] += m.valor; break;
      case 'transferencia': r[m.cuentaId] -= m.valor; r[m.cuentaDestinoId] += m.valor; break;
    }
  }
  return r;
}
export function enCuentas(s) { return Object.values(saldos(s)).reduce((a, b) => a + b, 0); }

// ---------- presupuestos ----------
// Lo gastado en una categoría no incluye pagos de reservas: esos no se imputan a presupuestos.
export function gastadoCategoria(s, catId, periodo) {
  let t = 0;
  for (const m of s.movimientos) {
    if (m.tipo === 'gasto' && !m.reservaId && m.categoriaId === catId && periodoDe(m.fecha) === periodo) t += m.valor;
  }
  return t;
}
export const totalPresupuesto = (p) => p.monto + (p.arrastre || 0);
export function presupuestosDe(s, periodo) {
  return s.presupuestos.filter((p) => p.periodo === periodo).map((p) => {
    const cat = categoria(s, p.categoriaId);
    const total = totalPresupuesto(p);
    const gastado = gastadoCategoria(s, p.categoriaId, periodo);
    const resta = Math.max(0, total - gastado);
    return {
      id: p.id, categoriaId: p.categoriaId, nombre: cat?.nombre ?? 'Categoría eliminada', tipo: cat?.tipo, total, monto: p.monto,
      arrastre: p.arrastre || 0, gastado, resta, exceso: Math.max(0, gastado - total),
      pct: total > 0 ? (gastado / total) * 100 : (gastado > 0 ? 100 : 0),
      unidades: cat?.valorRef > 0 ? Math.floor(resta / cat.valorRef) : null, historial: p.historial || [],
    };
  });
}
export function gastosSinPresupuesto(s, periodo) {
  const con = new Set(s.presupuestos.filter((p) => p.periodo === periodo).map((p) => p.categoriaId));
  const r = {};
  for (const m of s.movimientos) {
    if (m.tipo === 'gasto' && !m.reservaId && periodoDe(m.fecha) === periodo && !con.has(m.categoriaId)) {
      const k = m.categoriaId || '';
      r[k] = (r[k] || 0) + m.valor;
    }
  }
  return r;
}

// ---------- resumen: ¿onta la plata? ----------
export function resumen(s, fecha = hoy()) {
  const periodo = periodoDe(fecha);
  const total = enCuentas(s);
  const reservasPend = s.reservas.filter((r) => r.estado === 'pendiente' && r.periodo <= periodo).reduce((a, r) => a + r.monto, 0);
  const pres = presupuestosDe(s, periodo);
  const presupRest = pres.reduce((a, p) => a + p.resta, 0);
  // Ingresos ya recibidos para quincenas futuras, menos lo que ya se pagó por adelantado de esas quincenas.
  let futuro = 0, gastosPeriodo = 0, ingresosPeriodo = 0;
  for (const m of s.movimientos) {
    if (m.tipo === 'ingreso') { if (m.periodo > periodo) futuro += m.valor; else if (m.periodo === periodo) ingresosPeriodo += m.valor; }
    if (m.tipo === 'cobro' && m.esIngreso && periodoDe(m.fecha) === periodo) ingresosPeriodo += m.valor;
    if (m.tipo === 'gasto') {
      if (periodoDe(m.fecha) === periodo) gastosPeriodo += m.valor;
      if (m.reservaId) { const r = buscar(s.reservas, m.reservaId); if (r && r.periodo > periodo) futuro -= m.valor; }
    }
  }
  futuro = Math.max(0, futuro);
  const conDueno = reservasPend + presupRest + futuro;
  const libre = total - conDueno;
  const diasRestantes = diasEntre(fecha, rangoPeriodo(periodo).fin) + 1;
  const paraGastar = presupRest + libre;
  return {
    periodo, enCuentas: total, reservasPend, presupRest, futuro, conDueno, libre, gastosPeriodo, ingresosPeriodo,
    presupTotal: pres.reduce((a, p) => a + p.total, 0), presupGastado: pres.reduce((a, p) => a + p.gastado, 0),
    diasRestantes, ritmo: Math.floor(paraGastar / diasRestantes),
  };
}

// ---------- movimientos ----------
function validarMov(s, m) {
  if (!TIPOS.includes(m.tipo)) throw new Error('Tipo de movimiento desconocido.');
  if (!fechaValida(m.fecha)) throw new Error('La fecha no es válida.');
  if (m.tipo === 'invitacion') { m.valor = 0; m.cuentaId = null; return; }
  if (!Number.isInteger(m.valor)) throw new Error('Escriba un valor.');
  if (m.tipo === 'ajuste') { if (m.valor === 0) throw new Error('El ajuste no puede ser cero.'); }
  else if (m.valor <= 0) throw new Error('El valor debe ser mayor que cero.');
  if (!cuenta(s, m.cuentaId)) throw new Error('Elija una cuenta.');
  if (m.tipo === 'transferencia') {
    if (!cuenta(s, m.cuentaDestinoId)) throw new Error('Elija la cuenta de destino.');
    if (m.cuentaDestinoId === m.cuentaId) throw new Error('Las dos cuentas deben ser distintas.');
  }
  if (m.tipo === 'ingreso' && !esPeriodo(m.periodo)) m.periodo = periodoDe(m.fecha);
  if (m.tipo === 'gasto' && m.categoriaId && !categoria(s, m.categoriaId)) throw new Error('La categoría no existe.');
  if (m.tipo === 'prestamo' && !String(m.persona || '').trim()) throw new Error('Escriba a quién le prestó.');
}
export function esDuplicado(s, m) {
  return s.movimientos.some((x) => x.id !== m.id && x.tipo === m.tipo && x.valor === m.valor && x.fecha === m.fecha
    && (x.cuentaId || null) === (m.cuentaId || null) && (x.categoriaId || null) === (m.categoriaId || null)
    && (x.cuentaDestinoId || null) === (m.cuentaDestinoId || null));
}
export function agregarMovimiento(s, datos) {
  const m = { id: uid(), descripcion: '', nota: '', creado: new Date().toISOString(), ...datos };
  validarMov(s, m);
  s.movimientos.push(m);
  if (m.cuentaId && m.tipo !== 'ajuste') s.config.ultimaCuenta = m.cuentaId;
  return m;
}
export function editarMovimiento(s, id, cambios) {
  const m = buscar(s.movimientos, id);
  if (!m) throw new Error('El movimiento ya no existe.');
  const nuevo = { ...m, ...cambios, id: m.id, tipo: m.tipo, reservaId: m.reservaId, porCobrarId: m.porCobrarId };
  validarMov(s, nuevo);
  if (m.tipo === 'prestamo') {
    const pc = buscar(s.porCobrar, m.porCobrarId);
    if (pc) {
      if (pc.estado === 'recibido' && nuevo.valor !== m.valor) throw new Error('Ese préstamo ya fue cobrado. Elimine primero el cobro.');
      pc.valor = nuevo.valor; pc.persona = nuevo.persona; pc.concepto = nuevo.descripcion; pc.fecha = nuevo.fecha;
    }
  }
  if (m.tipo === 'cobro') {
    const pc = buscar(s.porCobrar, m.porCobrarId);
    if (pc && nuevo.valor !== pc.valor) throw new Error('El cobro debe ser por el valor de la deuda.');
  }
  Object.assign(m, nuevo);
  return m;
}
export function eliminarMovimiento(s, id) {
  const m = buscar(s.movimientos, id);
  if (!m) return;
  if (m.tipo === 'prestamo') {
    const pc = buscar(s.porCobrar, m.porCobrarId);
    if (pc?.estado === 'recibido') throw new Error('Ese préstamo ya fue cobrado. Elimine primero el cobro.');
    s.porCobrar = s.porCobrar.filter((x) => x.id !== m.porCobrarId);
  }
  if (m.tipo === 'cobro') {
    const pc = buscar(s.porCobrar, m.porCobrarId);
    if (pc) { pc.estado = 'pendiente'; pc.cobroId = null; }
  }
  if (m.reservaId) {
    const r = buscar(s.reservas, m.reservaId);
    if (r) { r.estado = 'pendiente'; r.movimientoId = null; }
  }
  s.movimientos = s.movimientos.filter((x) => x.id !== id);
}

// ---------- reservas y obligaciones ----------
export function montoObligacion(o, tasa) { return o.moneda === 'USD' ? Math.round(o.montoUSD * tasa) : o.monto; }
function venceEn(o, periodo) {
  const { inicio, fin } = rangoPeriodo(periodo);
  if (o.frecuencia === 'quincenal') {
    const f = sumarDias(inicio, Math.max(0, (o.dia || 1) - 1));
    return f > fin ? fin : f;
  }
  if (o.frecuencia === 'mensual') {
    const { y, m } = partes(inicio);
    const f = `${y}-${p2(m)}-${p2(Math.min(Math.max(1, o.dia || 1), ultimoDia(y, m)))}`;
    return periodoDe(f) === periodo ? f : null;
  }
  return null;
}
// Reservas que le corresponden a una quincena: las mensuales van completas en la quincena en que vencen.
export function reservasParaPeriodo(obligaciones, periodo, tasa) {
  const r = [];
  for (const o of obligaciones) {
    if (!o.activa) continue;
    const vence = venceEn(o, periodo);
    if (!vence) continue;
    r.push({
      obligacionId: o.id, nombre: o.nombre, monto: montoObligacion(o, tasa), moneda: o.moneda, montoUSD: o.montoUSD,
      tasa: o.moneda === 'USD' ? tasa : null, estimado: !!o.estimado, vence, periodo,
    });
  }
  return r;
}
export function generarReservas(s, periodo) {
  const nuevas = [];
  for (const r of reservasParaPeriodo(s.obligaciones, periodo, s.config.tasaUSD)) {
    if (s.reservas.some((x) => x.obligacionId === r.obligacionId && x.periodo === periodo)) continue;
    const n = { id: uid(), ...r, estado: 'pendiente', movimientoId: null };
    s.reservas.push(n); nuevas.push(n);
  }
  return nuevas;
}
function validarObligacion(o) {
  if (!String(o.nombre || '').trim()) throw new Error('Póngale un nombre.');
  if (o.moneda === 'USD') { if (!(o.montoUSD > 0)) throw new Error('Escriba el valor en dólares.'); }
  else if (!(Number.isInteger(o.monto) && o.monto > 0)) throw new Error('El valor debe ser mayor que cero.');
  if (!['quincenal', 'mensual'].includes(o.frecuencia)) throw new Error('Elija cada cuánto se paga.');
  const max = o.frecuencia === 'quincenal' ? 14 : 31;
  if (!(Number.isInteger(o.dia) && o.dia >= 1 && o.dia <= max)) throw new Error(`El día debe estar entre 1 y ${max}.`);
}
export function guardarObligacion(s, datos, fecha = hoy()) {
  let o = datos.id ? buscar(s.obligaciones, datos.id) : null;
  const nuevo = { moneda: 'COP', monto: 0, montoUSD: 0, estimado: false, activa: true, ...(o || {}), ...datos };
  validarObligacion(nuevo);
  if (o) Object.assign(o, nuevo); else { o = { ...nuevo, id: uid() }; s.obligaciones.push(o); }
  // La reserva pendiente de la quincena vigente sigue a la obligación.
  const periodo = periodoDe(fecha);
  s.reservas = s.reservas.filter((r) => !(r.obligacionId === o.id && r.periodo === periodo && r.estado === 'pendiente'));
  if (s.periodos.includes(periodo)) generarReservas(s, periodo);
  return o;
}
export function eliminarObligacion(s, id) {
  s.obligaciones = s.obligaciones.filter((o) => o.id !== id);
  s.reservas = s.reservas.filter((r) => !(r.obligacionId === id && r.estado === 'pendiente'));
}
export function guardarReserva(s, datos) {
  let r = datos.id ? buscar(s.reservas, datos.id) : null;
  if (r && r.estado === 'pagada') throw new Error('Esa reserva ya está pagada.');
  const nuevo = { obligacionId: null, moneda: 'COP', montoUSD: 0, tasa: null, estimado: false, estado: 'pendiente', movimientoId: null, ...(r || {}), ...datos };
  if (!String(nuevo.nombre || '').trim()) throw new Error('Póngale un nombre.');
  if (!(Number.isInteger(nuevo.monto) && nuevo.monto > 0)) throw new Error('El valor debe ser mayor que cero.');
  if (!fechaValida(nuevo.vence)) throw new Error('La fecha de vencimiento no es válida.');
  nuevo.periodo = periodoDe(nuevo.vence);
  if (r) Object.assign(r, nuevo); else { r = { ...nuevo, id: uid() }; s.reservas.push(r); }
  return r;
}
export function pagarReserva(s, id, { cuentaId, valor, fecha }) {
  const r = buscar(s.reservas, id);
  if (!r) throw new Error('La reserva ya no existe.');
  if (r.estado !== 'pendiente') throw new Error('Esa reserva ya no está pendiente.');
  const m = agregarMovimiento(s, { tipo: 'gasto', valor, fecha, cuentaId, categoriaId: null, reservaId: r.id, descripcion: r.nombre });
  r.estado = 'pagada'; r.movimientoId = m.id;
  return m;
}
export function cancelarReserva(s, id) {
  const r = buscar(s.reservas, id);
  if (!r || r.estado !== 'pendiente') throw new Error('Solo se puede cancelar una reserva pendiente.');
  r.estado = 'cancelada';
}
export function reactivarReserva(s, id) {
  const r = buscar(s.reservas, id);
  if (!r || r.estado !== 'cancelada') throw new Error('Esa reserva no está cancelada.');
  r.estado = 'pendiente';
}

// ---------- presupuestos: cambios ----------
export function fijarPresupuesto(s, periodo, categoriaId, monto, fecha = hoy()) {
  if (!categoria(s, categoriaId)) throw new Error('La categoría no existe.');
  if (!(Number.isInteger(monto) && monto >= 0)) throw new Error('El presupuesto no es válido.');
  let p = s.presupuestos.find((x) => x.periodo === periodo && x.categoriaId === categoriaId);
  if (!p) { p = { id: uid(), periodo, categoriaId, monto, arrastre: 0, historial: [] }; s.presupuestos.push(p); }
  else if (p.monto !== monto) { p.historial.push({ fecha, de: p.monto, a: monto }); p.monto = monto; }
  return p;
}
export function quitarPresupuesto(s, periodo, categoriaId) {
  s.presupuestos = s.presupuestos.filter((x) => !(x.periodo === periodo && x.categoriaId === categoriaId));
}
export function guardarCategoria(s, datos) {
  let c = datos.id ? categoria(s, datos.id) : null;
  const nuevo = { grupo: 'Otros', tipo: 'habitual', valorRef: 0, comida: false, archivada: false, ...(c || {}), ...datos };
  nuevo.nombre = String(nuevo.nombre || '').trim();
  if (!nuevo.nombre) throw new Error('Póngale un nombre a la categoría.');
  if (s.categorias.some((x) => x.id !== nuevo.id && !x.archivada && x.nombre.toLowerCase() === nuevo.nombre.toLowerCase())) throw new Error('Ya existe una categoría con ese nombre.');
  if (c) Object.assign(c, nuevo); else { c = { ...nuevo, id: uid() }; s.categorias.push(c); }
  return c;
}

// ---------- abrir quincena ----------
export function abrirPeriodo(s, periodo, { arrastrar = false } = {}) {
  if (s.periodos.includes(periodo)) return;
  const previo = [...s.periodos].filter((p) => p < periodo).sort().pop();
  s.periodos.push(periodo); s.periodos.sort();
  generarReservas(s, periodo);
  if (!previo) return;
  for (const p of presupuestosDe(s, previo)) {
    if (!categoria(s, p.categoriaId) || categoria(s, p.categoriaId).archivada) continue;
    if (s.presupuestos.some((x) => x.periodo === periodo && x.categoriaId === p.categoriaId)) continue;
    s.presupuestos.push({ id: uid(), periodo, categoriaId: p.categoriaId, monto: p.monto, arrastre: arrastrar ? p.resta : 0, historial: [] });
  }
}

// ---------- me deben ----------
export function prestar(s, { valor, persona, cuentaId, fecha, concepto = '' }) {
  const pc = { id: uid(), persona: String(persona || '').trim(), valor, fecha, concepto, estado: 'pendiente', origen: 'prestamo', cobroId: null };
  const m = agregarMovimiento(s, { tipo: 'prestamo', valor, fecha, cuentaId, persona: pc.persona, descripcion: concepto, porCobrarId: pc.id });
  pc.movimientoId = m.id;
  s.porCobrar.push(pc);
  return pc;
}
export function agregarPorCobrar(s, { persona, valor, fecha, concepto = '' }) {
  if (!String(persona || '').trim()) throw new Error('Escriba quién le debe.');
  if (!(Number.isInteger(valor) && valor > 0)) throw new Error('El valor debe ser mayor que cero.');
  if (!fechaValida(fecha)) throw new Error('La fecha no es válida.');
  const pc = { id: uid(), persona: persona.trim(), valor, fecha, concepto, estado: 'pendiente', origen: 'otro', cobroId: null, movimientoId: null };
  s.porCobrar.push(pc);
  return pc;
}
export function cobrar(s, id, { cuentaId, fecha }) {
  const pc = buscar(s.porCobrar, id);
  if (!pc || pc.estado !== 'pendiente') throw new Error('Esa deuda ya no está pendiente.');
  // Si era un préstamo mío, es plata que vuelve: no cuenta como ingreso de la quincena.
  const m = agregarMovimiento(s, { tipo: 'cobro', valor: pc.valor, fecha, cuentaId, porCobrarId: pc.id, esIngreso: pc.origen === 'otro', persona: pc.persona, descripcion: pc.concepto });
  pc.estado = 'recibido'; pc.cobroId = m.id;
  return m;
}
export function eliminarPorCobrar(s, id) {
  const pc = buscar(s.porCobrar, id);
  if (!pc) return;
  if (pc.estado !== 'pendiente') throw new Error('Esa deuda ya fue cobrada. Elimine primero el cobro.');
  if (pc.origen === 'prestamo') throw new Error('Para quitarla, elimine el movimiento del préstamo.');
  s.porCobrar = s.porCobrar.filter((x) => x.id !== id);
}

// ---------- cuentas ----------
export function guardarCuenta(s, { id, nombre, saldoInicial = 0 }, fecha = hoy()) {
  nombre = String(nombre || '').trim();
  if (!nombre) throw new Error('Póngale un nombre a la cuenta.');
  if (s.cuentas.some((c) => c.id !== id && !c.archivada && c.nombre.toLowerCase() === nombre.toLowerCase())) throw new Error('Ya existe una cuenta con ese nombre.');
  if (id) { cuenta(s, id).nombre = nombre; return cuenta(s, id); }
  if (!(Number.isInteger(saldoInicial) && saldoInicial >= 0)) throw new Error('El saldo inicial no es válido.');
  const c = { id: uid(), nombre, saldoInicial, saldoFecha: fecha, confirmada: true, archivada: false };
  s.cuentas.push(c);
  return c;
}
export function quitarCuenta(s, id) {
  const usada = s.movimientos.some((m) => m.cuentaId === id || m.cuentaDestinoId === id);
  if (saldos(s)[id] !== 0) throw new Error('La cuenta todavía tiene saldo. Transfiéralo antes de quitarla.');
  if (usada) cuenta(s, id).archivada = true; else s.cuentas = s.cuentas.filter((c) => c.id !== id);
  if (s.config.ultimaCuenta === id) s.config.ultimaCuenta = null;
}
// Cuadre de caja: por cada diferencia entre el saldo calculado y el real se crea un ajuste visible.
export function cuadrar(s, reales, fecha = hoy()) {
  const calc = saldos(s); const ajustes = [];
  for (const [id, real] of Object.entries(reales)) {
    if (!cuenta(s, id) || !Number.isInteger(real)) continue;
    const dif = real - calc[id];
    if (dif !== 0) ajustes.push(agregarMovimiento(s, { tipo: 'ajuste', valor: dif, fecha, cuentaId: id, descripcion: 'Cuadre de caja' }));
  }
  s.config.ultimoCuadre = fecha;
  return ajustes;
}

// ---------- configuración inicial ----------
export function configurar(s, { saldos: sal = {}, ingreso, tasa, obligaciones = [], presupuestos = {} }, fecha = hoy()) {
  if (!(Number.isInteger(ingreso) && ingreso >= 0)) throw new Error('El ingreso quincenal no es válido.');
  if (!(tasa > 0)) throw new Error('La tasa de cambio debe ser mayor que cero.');
  for (const c of s.cuentas) {
    if (sal[c.id] === undefined) continue;
    if (!(Number.isInteger(sal[c.id]) && sal[c.id] >= 0)) throw new Error(`El saldo de ${c.nombre} no es válido.`);
    c.saldoInicial = sal[c.id]; c.saldoFecha = fecha; c.confirmada = true;
  }
  s.config.ingresoQuincenal = ingreso; s.config.tasaUSD = tasa;
  for (const d of obligaciones) {
    const o = buscar(s.obligaciones, d.id);
    if (!o) continue;
    Object.assign(o, d);
    if (o.activa) validarObligacion(o);
  }
  const periodo = periodoDe(fecha);
  abrirPeriodo(s, periodo);
  for (const [catId, monto] of Object.entries(presupuestos)) if (monto > 0) fijarPresupuesto(s, periodo, catId, monto, fecha);
  s.config.setupDone = true; s.config.ultimoCuadre = fecha;
}

// ---------- capítulos (cierre de quincena) ----------
export function capitulo(s, periodo) {
  let ingresos = 0, gastos = 0, pagosReservas = 0, invitaciones = 0;
  for (const m of s.movimientos) {
    if (m.tipo === 'ingreso' && m.periodo === periodo) ingresos += m.valor;
    if (periodoDe(m.fecha) !== periodo) continue;
    if (m.tipo === 'cobro' && m.esIngreso) ingresos += m.valor;
    if (m.tipo === 'gasto') { gastos += m.valor; if (m.reservaId) pagosReservas += m.valor; }
    if (m.tipo === 'invitacion') invitaciones++;
  }
  const pres = presupuestosDe(s, periodo);
  const sin = gastosSinPresupuesto(s, periodo);
  return {
    periodo, ingresos, gastos, pagosReservas, invitaciones, presupuestos: pres,
    pasados: pres.filter((p) => p.exceso > 0).sort((a, b) => b.exceso - a.exceso),
    ahorros: pres.filter((p) => p.resta > 0).sort((a, b) => b.resta - a.resta),
    sinPresupuesto: Object.values(sin).reduce((a, b) => a + b, 0),
    balance: ingresos - gastos,
  };
}
export function periodosConDatos(s) {
  const set = new Set(s.periodos);
  for (const m of s.movimientos) set.add(periodoDe(m.fecha));
  return [...set].sort();
}
export function gastoPorCategoria(s, periodo, tipo = '') {
  const r = new Map();
  for (const m of s.movimientos) {
    if (m.tipo !== 'gasto' || periodoDe(m.fecha) !== periodo) continue;
    const cat = categoria(s, m.categoriaId);
    const t = m.reservaId ? 'fijo' : (cat?.tipo || 'habitual');
    if (tipo && t !== tipo) continue;
    const nombre = m.reservaId ? `${m.descripcion} (fijo)` : (cat?.nombre || 'Sin categoría');
    r.set(nombre, (r.get(nombre) || 0) + m.valor);
  }
  return [...r].map(([nombre, valor]) => ({ nombre, valor })).sort((a, b) => b.valor - a.valor);
}

// ---------- copias y exportación ----------
export function validarEstado(o) {
  const listas = ['cuentas', 'categorias', 'obligaciones', 'presupuestos', 'reservas', 'movimientos', 'porCobrar', 'periodos'];
  if (!o || typeof o !== 'object' || !o.config || typeof o.config !== 'object') throw new Error('El archivo no es una copia de VAINAS.');
  if (o.version !== VERSION) throw new Error('La copia es de otra versión de VAINAS.');
  for (const k of listas) if (!Array.isArray(o[k])) throw new Error('El archivo no es una copia de VAINAS.');
  const ids = new Set(o.cuentas.map((c) => c.id));
  for (const c of o.cuentas) if (typeof c.id !== 'string' || !Number.isInteger(c.saldoInicial)) throw new Error('La copia tiene cuentas dañadas.');
  for (const m of o.movimientos) {
    if (!TIPOS.includes(m.tipo) || !Number.isInteger(m.valor) || !fechaValida(m.fecha)) throw new Error('La copia tiene movimientos dañados.');
    if (m.tipo !== 'invitacion' && !ids.has(m.cuentaId)) throw new Error('La copia tiene movimientos sin cuenta.');
    if (m.tipo === 'transferencia' && !ids.has(m.cuentaDestinoId)) throw new Error('La copia tiene transferencias sin cuenta.');
  }
  return o;
}
function csv(filas) {
  const q = (v) => { let t = String(v ?? ''); if (/^[=+\-@\t\r]/.test(t) && typeof v !== 'number') t = "'" + t; return '"' + t.replace(/"/g, '""') + '"'; };
  return '﻿' + filas.map((f) => f.map(q).join(';')).join('\r\n');
}
export function csvMovimientos(s) {
  const filas = [['Fecha', 'Quincena', 'Tipo', 'Valor', 'Cuenta', 'Cuenta destino', 'Categoría', 'Descripción', 'Persona', 'Nota']];
  for (const m of [...s.movimientos].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    filas.push([m.fecha, m.tipo === 'ingreso' ? m.periodo : periodoDe(m.fecha), NOMBRE_TIPO[m.tipo], m.valor, cuenta(s, m.cuentaId)?.nombre,
      cuenta(s, m.cuentaDestinoId)?.nombre, m.reservaId ? 'Pago de reserva' : categoria(s, m.categoriaId)?.nombre, m.descripcion, m.persona, m.nota]);
  }
  return csv(filas);
}
export function csvPresupuestos(s) {
  const filas = [['Quincena', 'Categoría', 'Presupuesto', 'Gastado', 'Queda', 'Exceso', 'Ejecución %']];
  for (const per of periodosConDatos(s)) for (const p of presupuestosDe(s, per)) {
    filas.push([per, p.nombre, p.total, p.gastado, p.resta, p.exceso, p.pct.toFixed(1).replace('.', ',')]);
  }
  return csv(filas);
}
