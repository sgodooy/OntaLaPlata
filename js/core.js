// VAINAS: reglas contables. Este módulo no toca el navegador, para poder probarlo solo.
// Todos los valores son enteros en pesos colombianos.

export const TZ = 'America/Bogota';
export const VERSION = 2;
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

// ---------- quincenas: van de un pago al siguiente ----------
// Cada periodo se identifica por su fecha de inicio. Mientras no llegue el pago siguiente sigue abierto,
// y su final se estima a los 15 días. "cubierto" es hasta qué fecha ya se reservaron las obligaciones mensuales.
export const DIAS_PERIODO = 15;
export const ultimoPeriodo = (s) => s.periodos[s.periodos.length - 1] || null;
export function periodoDe(s, f) {
  let r = s.periodos[0];
  for (const p of s.periodos) { if (p.inicio <= f) r = p; else break; }
  return r ? r.id : null;
}
export function rangoPeriodo(s, id) {
  const i = s.periodos.findIndex((p) => p.id === id);
  const p = s.periodos[i], sig = s.periodos[i + 1];
  return { inicio: p.inicio, fin: sig ? sumarDias(sig.inicio, -1) : sumarDias(p.inicio, DIAS_PERIODO - 1), abierto: !sig };
}
export function nombrePeriodo(s, id) {
  const r = rangoPeriodo(s, id);
  return r.abierto ? `desde el ${fechaCorta(r.inicio)} ${r.inicio.slice(0, 4)}` : `${fechaCorta(r.inicio)} al ${fechaCorta(r.fin)} ${r.fin.slice(0, 4)}`;
}
export const periodosConDatos = (s) => s.periodos.map((p) => p.id);
// Se sugiere abrir quincena nueva si ya pasaron al menos diez días desde el último pago.
export function sugerirNuevaQuincena(s, f) {
  const u = ultimoPeriodo(s);
  return !!u && diasEntre(u.inicio, f) >= 10;
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
    if (m.tipo === 'gasto' && !m.reservaId && m.categoriaId === catId && periodoDe(s, m.fecha) === periodo) t += m.valor;
  }
  return t;
}
export const totalPresupuesto = (p) => p.monto + (p.arrastre || 0);
// Fecha esperada del siguiente pago: el primer 15 o 30 (o fin de mes) que caiga al menos diez días después del pago.
export function proximoPagoEsperado(inicio) {
  for (let k = 10; k <= 25; k++) {
    const f = sumarDias(inicio, k), { y, m, d } = partes(f);
    if (d === 15 || d === Math.min(30, ultimoDia(y, m))) return f;
  }
  return sumarDias(inicio, DIAS_PERIODO);
}
// Días que cubre una quincena: si ya cerró, los reales; si sigue abierta, hasta el día antes del pago esperado.
export function diasPresupuesto(s, periodo) {
  const r = rangoPeriodo(s, periodo);
  return r.abierto ? diasEntre(r.inicio, proximoPagoEsperado(r.inicio)) : diasEntre(r.inicio, r.fin) + 1;
}
// Categorías con presupuesto por día (como Almuerzos): valor de cada uno por los días de la quincena.
export function montoPorDia(s, catId, periodo) {
  const cat = categoria(s, catId);
  return cat?.porDia && cat.valorRef > 0 ? cat.valorRef * diasPresupuesto(s, periodo) : null;
}
export function presupuestosDe(s, periodo) {
  return s.presupuestos.filter((p) => p.periodo === periodo).map((p) => {
    const cat = categoria(s, p.categoriaId);
    const auto = montoPorDia(s, p.categoriaId, periodo);
    const total = (auto ?? p.monto) + (p.arrastre || 0);
    const gastado = gastadoCategoria(s, p.categoriaId, periodo);
    const resta = Math.max(0, total - gastado);
    return {
      id: p.id, categoriaId: p.categoriaId, nombre: cat?.nombre ?? 'Categoría eliminada', tipo: cat?.tipo, total, monto: auto ?? p.monto,
      auto: auto !== null, dias: auto !== null ? diasPresupuesto(s, periodo) : null, valorRef: cat?.valorRef || 0,
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
    if (m.tipo === 'gasto' && !m.reservaId && periodoDe(s, m.fecha) === periodo && !con.has(m.categoriaId)) {
      const k = m.categoriaId || '';
      r[k] = (r[k] || 0) + m.valor;
    }
  }
  return r;
}

// ---------- resumen: ¿onta la plata? ----------
export function resumen(s, fecha = hoy()) {
  const periodo = periodoDe(s, fecha);
  const total = enCuentas(s);
  const r = periodo ? rangoPeriodo(s, periodo) : { fin: fecha, abierto: true };
  const atrasado = r.abierto && fecha > r.fin; // pasaron los 15 días y todavía no han pagado
  const hasta = atrasado ? fecha : r.fin;
  const reservasPend = s.reservas.filter((x) => x.estado === 'pendiente' && x.vence <= hasta).reduce((a, x) => a + faltaReserva(s, x), 0);
  const pres = periodo ? presupuestosDe(s, periodo) : [];
  const presupRest = pres.reduce((a, p) => a + p.resta, 0);
  // El pago con que empezó la quincena cuenta como ingreso aunque ya estuviera dentro de los saldos iniciales.
  let gastosPeriodo = 0, ingresosPeriodo = s.periodos.find((p) => p.id === periodo)?.ingresoInicial || 0;
  for (const m of s.movimientos) {
    if (periodoDe(s, m.fecha) !== periodo) continue;
    if (m.tipo === 'ingreso' || (m.tipo === 'cobro' && m.esIngreso)) ingresosPeriodo += m.valor;
    if (m.tipo === 'gasto') gastosPeriodo += m.valor;
  }
  const conDueno = reservasPend + presupRest;
  const libre = total - conDueno;
  const diasRestantes = atrasado ? 1 : diasEntre(fecha, r.fin) + 1;
  return {
    periodo, enCuentas: total, reservasPend, presupRest, conDueno, libre, gastosPeriodo, ingresosPeriodo, atrasado,
    presupTotal: pres.reduce((a, p) => a + p.total, 0), presupGastado: pres.reduce((a, p) => a + p.gastado, 0),
    diasRestantes, ritmo: Math.floor((presupRest + libre) / diasRestantes),
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
    if (r && r.estado === 'pagada') r.estado = 'pendiente';
    if (r && r.movimientoId === id) r.movimientoId = null;
  }
  s.movimientos = s.movimientos.filter((x) => x.id !== id);
}

// ---------- reservas y obligaciones ----------
export function montoObligacion(o, tasa) { return o.moneda === 'USD' ? Math.round(o.montoUSD * tasa) : o.monto; }
// Fechas en que vence una obligación mensual dentro de un rango.
function vencimientos(o, desde, hasta) {
  const r = []; let { y, m } = partes(desde);
  while (`${y}-${p2(m)}-01` <= hasta) {
    const f = `${y}-${p2(m)}-${p2(Math.min(Math.max(1, o.dia || 1), ultimoDia(y, m)))}`;
    if (f >= desde && f <= hasta) r.push(f);
    m++; if (m > 12) { m = 1; y++; }
  }
  return r;
}
// Reservas que corresponden a un rango de fechas. Las mensuales van completas el día en que vencen;
// las quincenales salen una vez por periodo, contando los días desde el pago (inicioPeriodo).
export function reservasParaRango(obligaciones, desde, hasta, tasa, inicioPeriodo = null) {
  const r = [];
  for (const o of obligaciones) {
    if (!o.activa) continue;
    const fechas = o.frecuencia === 'mensual' ? vencimientos(o, desde, hasta)
      : inicioPeriodo ? [sumarDias(inicioPeriodo, Math.min(DIAS_PERIODO, Math.max(1, o.dia || 1)) - 1)] : [];
    for (const vence of fechas) {
      r.push({ obligacionId: o.id, nombre: o.nombre, monto: montoObligacion(o, tasa), moneda: o.moneda, montoUSD: o.montoUSD,
        tasa: o.moneda === 'USD' ? tasa : null, estimado: !!o.estimado, vence });
    }
  }
  return r;
}
export function generarReservas(s, desde, hasta, inicioPeriodo = null, soloId = null) {
  const nuevas = [], periodo = ultimoPeriodo(s)?.id ?? null;
  for (const r of reservasParaRango(s.obligaciones, desde, hasta, s.config.tasaUSD, inicioPeriodo)) {
    if (soloId && r.obligacionId !== soloId) continue;
    const o = s.obligaciones.find((x) => x.id === r.obligacionId);
    const repetida = s.reservas.some((x) => x.obligacionId === r.obligacionId
      && (x.vence === r.vence || (o.frecuencia === 'quincenal' && x.periodo === periodo)));
    if (repetida) continue;
    const n = { id: uid(), ...r, periodo, estado: 'pendiente', movimientoId: null };
    s.reservas.push(n); nuevas.push(n);
  }
  return nuevas;
}
// Si el pago se atrasa, el periodo sigue abierto y se van reservando las obligaciones que vencen mientras tanto.
export function ponerAlDia(s, fecha = hoy()) {
  const u = ultimoPeriodo(s);
  if (!u || fecha <= u.cubierto) return false;
  generarReservas(s, sumarDias(u.cubierto, 1), fecha);
  u.cubierto = fecha;
  return true;
}
function validarObligacion(o) {
  if (!String(o.nombre || '').trim()) throw new Error('Póngale un nombre.');
  if (o.moneda === 'USD') { if (!(o.montoUSD > 0)) throw new Error('Escriba el valor en dólares.'); }
  else if (!(Number.isInteger(o.monto) && o.monto > 0)) throw new Error('El valor debe ser mayor que cero.');
  if (!['quincenal', 'mensual'].includes(o.frecuencia)) throw new Error('Elija cada cuánto se paga.');
  const max = o.frecuencia === 'quincenal' ? DIAS_PERIODO : 31;
  if (!(Number.isInteger(o.dia) && o.dia >= 1 && o.dia <= max)) throw new Error(`El día debe estar entre 1 y ${max}.`);
}
export function guardarObligacion(s, datos, fecha = hoy()) {
  let o = datos.id ? buscar(s.obligaciones, datos.id) : null;
  const nuevo = { moneda: 'COP', monto: 0, montoUSD: 0, estimado: false, activa: true, ...(o || {}), ...datos };
  validarObligacion(nuevo);
  if (o) Object.assign(o, nuevo); else { o = { ...nuevo, id: uid() }; s.obligaciones.push(o); }
  // Las reservas pendientes de la quincena vigente siguen a la obligación.
  const u = ultimoPeriodo(s);
  if (u) {
    const conAbonos = s.reservas.filter((r) => r.obligacionId === o.id && r.periodo === u.id && r.estado === 'pendiente' && abonado(s, r) > 0);
    for (const r of conAbonos) { r.nombre = o.nombre; r.monto = montoObligacion(o, s.config.tasaUSD); r.estimado = !!o.estimado; }
    s.reservas = s.reservas.filter((r) => !(r.obligacionId === o.id && r.periodo === u.id && r.estado === 'pendiente' && !conAbonos.includes(r)));
    const yaResuelta = s.reservas.some((r) => r.obligacionId === o.id && r.periodo === u.id);
    if (!yaResuelta || o.frecuencia === 'mensual') generarReservas(s, u.inicio, u.cubierto, u.inicio, o.id);
  }
  return o;
}
export function eliminarObligacion(s, id) {
  s.obligaciones = s.obligaciones.filter((o) => o.id !== id);
  s.reservas = s.reservas.filter((r) => !(r.obligacionId === id && r.estado === 'pendiente' && abonado(s, r) === 0));
}
export function guardarReserva(s, datos) {
  let r = datos.id ? buscar(s.reservas, datos.id) : null;
  if (r && r.estado === 'pagada') throw new Error('Esa reserva ya está pagada.');
  const nuevo = { obligacionId: null, moneda: 'COP', montoUSD: 0, tasa: null, estimado: false, estado: 'pendiente', movimientoId: null, ...(r || {}), ...datos };
  if (!String(nuevo.nombre || '').trim()) throw new Error('Póngale un nombre.');
  if (!(Number.isInteger(nuevo.monto) && nuevo.monto > 0)) throw new Error('El valor debe ser mayor que cero.');
  if (!fechaValida(nuevo.vence)) throw new Error('La fecha de vencimiento no es válida.');
  if (!r) nuevo.periodo = null;
  if (r) Object.assign(r, nuevo); else { r = { ...nuevo, id: uid() }; s.reservas.push(r); }
  return r;
}
// Una reserva se puede pagar en varios abonos. Cada abono es un gasto real que baja la cuenta;
// lo que falta por pagar sigue apartado hasta que se complete o la persona la dé por saldada.
export function abonosDe(s, r) { return s.movimientos.filter((m) => m.tipo === 'gasto' && m.reservaId === r.id).sort((a, b) => a.fecha.localeCompare(b.fecha)); }
export function abonado(s, r) { return abonosDe(s, r).reduce((a, m) => a + m.valor, 0); }
export function faltaReserva(s, r) { return Math.max(0, r.monto - abonado(s, r)); }
export function pagarReserva(s, id, { cuentaId, valor, fecha, cerrar = false }) {
  const r = buscar(s.reservas, id);
  if (!r) throw new Error('La reserva ya no existe.');
  if (r.estado !== 'pendiente') throw new Error('Esa reserva ya no está pendiente.');
  const m = agregarMovimiento(s, { tipo: 'gasto', valor, fecha, cuentaId, categoriaId: null, reservaId: r.id, descripcion: r.nombre });
  r.movimientoId = m.id;
  if (cerrar || abonado(s, r) >= r.monto) r.estado = 'pagada';
  return m;
}
// Pasa una obligación a categoría con presupuesto: deja de reservarse con fecha y se controla como cualquier gasto.
// Lo ya abonado a sus reservas pendientes queda como gasto de la categoría nueva; lo ya pagado y cerrado no se toca.
export function obligacionACategoria(s, id, montoQuincena) {
  const o = s.obligaciones.find((x) => x.id === id);
  if (!o) throw new Error('La obligación ya no existe.');
  if (!(Number.isInteger(montoQuincena) && montoQuincena >= 0)) throw new Error('El presupuesto no es válido.');
  const u = ultimoPeriodo(s);
  let cat = s.categorias.find((c) => !c.archivada && c.nombre.toLowerCase() === o.nombre.toLowerCase());
  if (!cat) cat = guardarCategoria(s, { nombre: o.nombre, grupo: 'Hogar', tipo: 'habitual' });
  for (const r of s.reservas.filter((x) => x.obligacionId === id && x.estado === 'pendiente')) {
    for (const m of abonosDe(s, r)) { delete m.reservaId; m.categoriaId = cat.id; }
    s.reservas = s.reservas.filter((x) => x !== r);
  }
  s.obligaciones = s.obligaciones.filter((x) => x !== o);
  if (u) {
    const p = s.presupuestos.find((x) => x.periodo === u.id && x.categoriaId === cat.id);
    fijarPresupuesto(s, u.id, cat.id, (p ? p.monto : 0) + montoQuincena);
  }
  return cat;
}
// Da por saldada una reserva con abonos: lo que faltaba vuelve a la plata libre.
export function saldarReserva(s, id) {
  const r = buscar(s.reservas, id);
  if (!r || r.estado !== 'pendiente') throw new Error('Esa reserva ya no está pendiente.');
  if (!abonado(s, r)) throw new Error('No tiene abonos: cancélela si ya no la necesita.');
  r.estado = 'pagada';
}
export function cancelarReserva(s, id) {
  const r = buscar(s.reservas, id);
  if (!r || r.estado !== 'pendiente') throw new Error('Solo se puede cancelar una reserva pendiente.');
  if (abonado(s, r)) throw new Error('Esa reserva ya tiene abonos: dela por saldada en lugar de cancelarla.');
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
  nuevo.porDia = !!nuevo.porDia;
  if (nuevo.porDia && !(Number.isInteger(nuevo.valorRef) && nuevo.valorRef > 0)) throw new Error('Para calcularlo por día, escriba cuánto cuesta cada uno.');
  if (!nuevo.nombre) throw new Error('Póngale un nombre a la categoría.');
  if (s.categorias.some((x) => x.id !== nuevo.id && !x.archivada && x.nombre.toLowerCase() === nuevo.nombre.toLowerCase())) throw new Error('Ya existe una categoría con ese nombre.');
  if (c) Object.assign(c, nuevo); else { c = { ...nuevo, id: uid() }; s.categorias.push(c); }
  return c;
}

// Quitar una categoría: si ya tiene movimientos se archiva para conservar el historial; si no, se borra.
export function categoriaUsada(s, id) { return s.movimientos.some((m) => m.categoriaId === id); }
export function quitarCategoria(s, id) {
  const c = categoria(s, id);
  if (!c) return;
  const actual = ultimoPeriodo(s)?.id;
  if (categoriaUsada(s, id)) {
    c.archivada = true;
    s.presupuestos = s.presupuestos.filter((p) => !(p.categoriaId === id && p.periodo === actual && gastadoCategoria(s, id, actual) === 0));
  } else {
    s.categorias = s.categorias.filter((x) => x.id !== id);
    s.presupuestos = s.presupuestos.filter((p) => p.categoriaId !== id);
  }
}
export function recuperarCategoria(s, id) {
  const c = categoria(s, id);
  if (!c) return;
  if (s.categorias.some((x) => x.id !== id && !x.archivada && x.nombre.toLowerCase() === c.nombre.toLowerCase())) throw new Error('Ya existe una categoría activa con ese nombre.');
  c.archivada = false;
}

// ---------- abrir quincena ----------
// Un pago abre un periodo nuevo: cierra el anterior, copia sus presupuestos y reserva las obligaciones.
export function abrirPeriodo(s, inicio, { arrastrar = false } = {}) {
  if (!fechaValida(inicio)) throw new Error('La fecha de inicio no es válida.');
  const previo = ultimoPeriodo(s);
  if (previo && inicio <= previo.inicio) throw new Error(`La quincena nueva debe empezar después del ${fechaCorta(previo.inicio)}, cuando empezó la actual.`);
  const fin = sumarDias(inicio, DIAS_PERIODO - 1);
  const p = { id: inicio, inicio, cubierto: previo && previo.cubierto > fin ? previo.cubierto : fin, ingresoInicial: 0 };
  s.periodos.push(p);
  generarReservas(s, previo ? sumarDias(previo.cubierto, 1) : inicio, p.cubierto, inicio);
  if (!previo) return p;
  for (const x of presupuestosDe(s, previo.id)) {
    const cat = categoria(s, x.categoriaId);
    if (!cat || cat.archivada) continue;
    s.presupuestos.push({ id: uid(), periodo: p.id, categoriaId: x.categoriaId, monto: x.monto, arrastre: arrastrar ? x.resta : 0, historial: [] });
  }
  return p;
}
// Deshace la apertura de la última quincena: sus gastos vuelven a contar en la anterior.
export function deshacerPeriodo(s) {
  if (s.periodos.length < 2) throw new Error('No hay una quincena anterior a la cual volver.');
  const p = s.periodos.pop();
  s.presupuestos = s.presupuestos.filter((x) => x.periodo !== p.id);
  s.reservas = s.reservas.filter((r) => !(r.periodo === p.id && r.obligacionId && r.estado === 'pendiente' && abonado(s, r) === 0));
  const u = ultimoPeriodo(s);
  for (const r of s.reservas) if (r.periodo === p.id) r.periodo = u.id;
  if (p.cubierto > u.cubierto) { const hasta = p.cubierto; generarReservas(s, sumarDias(u.cubierto, 1), hasta); u.cubierto = hasta; }
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
// Aspecto de una cuenta: color de la fila e imagen opcional (se guarda en el dispositivo, como el resto de los datos).
export const COLOR_OK = /^#[0-9a-f]{6}$/i;
export const ICONO_OK = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
function aspecto(c, color, icono) {
  if (color !== undefined) { if (color && !COLOR_OK.test(color)) throw new Error('El color no es válido.'); c.color = color || null; }
  if (icono !== undefined) {
    if (icono && (!ICONO_OK.test(icono) || icono.length > 300000)) throw new Error('La imagen no sirve o es muy pesada.');
    c.icono = icono || null;
  }
}
export function guardarCuenta(s, { id, nombre, saldoInicial = 0, color, icono }, fecha = hoy()) {
  nombre = String(nombre || '').trim();
  if (!nombre) throw new Error('Póngale un nombre a la cuenta.');
  if (s.cuentas.some((c) => c.id !== id && !c.archivada && c.nombre.toLowerCase() === nombre.toLowerCase())) throw new Error('Ya existe una cuenta con ese nombre.');
  if (id) { const c = cuenta(s, id); aspecto(c, color, icono); c.nombre = nombre; return c; }
  if (!(Number.isInteger(saldoInicial) && saldoInicial >= 0)) throw new Error('El saldo inicial no es válido.');
  const c = { id: uid(), nombre, saldoInicial, saldoFecha: fecha, confirmada: true, archivada: false };
  aspecto(c, color, icono);
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
export function configurar(s, { saldos: sal = {}, ingreso, tasa, obligaciones = [], presupuestos = {}, inicio = fecha }, fecha = hoy()) {
  if (!fechaValida(inicio) || inicio > fecha) throw new Error('La fecha del último pago no puede ser futura.');
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
  const abierto = abrirPeriodo(s, inicio), periodo = abierto.id;
  abierto.ingresoInicial = ingreso; // ese pago ya está dentro de los saldos: se anota sin sumarlo otra vez
  ponerAlDia(s, fecha);
  for (const [catId, monto] of Object.entries(presupuestos)) if (monto > 0) fijarPresupuesto(s, periodo, catId, monto, fecha);
  s.config.setupDone = true; s.config.ultimoCuadre = fecha;
}

// ---------- capítulos (cierre de quincena) ----------
export function capitulo(s, periodo) {
  let ingresos = s.periodos.find((p) => p.id === periodo)?.ingresoInicial || 0, gastos = 0, pagosReservas = 0, invitaciones = 0;
  for (const m of s.movimientos) {
    if (periodoDe(s, m.fecha) !== periodo) continue;
    if (m.tipo === 'ingreso' || (m.tipo === 'cobro' && m.esIngreso)) ingresos += m.valor;
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
// Gastos fijos de un mes para el calendario: reservas, obligaciones previstas y días de pago.
export function agenda(s, y, m, fecha = hoy()) {
  const r = {}, pref = `${y}-${p2(m)}-`;
  const add = (f, x) => { (r[f] ||= []).push(x); };
  for (const x of s.reservas) {
    if (!x.vence.startsWith(pref)) continue;
    const ab = abonado(s, x);
    const clase = x.estado === 'pagada' ? 'pagada' : x.estado === 'cancelada' ? 'cancelada' : ab ? 'parcial' : x.vence < fecha ? 'vencida' : 'pendiente';
    add(x.vence, { clase, id: x.id, nombre: x.nombre, monto: x.monto, abonado: ab });
  }
  const u = ultimoPeriodo(s);
  for (const o of s.obligaciones) {
    if (!o.activa || o.frecuencia !== 'mensual' || !u) continue;
    const f = pref + p2(Math.min(Math.max(1, o.dia), ultimoDia(y, m)));
    if (f > u.cubierto && !s.reservas.some((x) => x.obligacionId === o.id && x.vence === f)) add(f, { clase: 'previsto', obligacionId: o.id, nombre: o.nombre, monto: montoObligacion(o, s.config.tasaUSD) });
  }
  for (const p of s.periodos) if (p.inicio.startsWith(pref)) add(p.inicio, { clase: 'pago' });
  return r;
}
export function gastoPorCategoria(s, periodo, tipo = '') {
  const r = new Map();
  for (const m of s.movimientos) {
    if (m.tipo !== 'gasto' || periodoDe(s, m.fecha) !== periodo) continue;
    const cat = categoria(s, m.categoriaId);
    const t = m.reservaId ? 'fijo' : (cat?.tipo || 'habitual');
    if (tipo && t !== tipo) continue;
    const nombre = m.reservaId ? `${m.descripcion} (fijo)` : (cat?.nombre || 'Sin categoría');
    r.set(nombre, (r.get(nombre) || 0) + m.valor);
  }
  return [...r].map(([nombre, valor]) => ({ nombre, valor })).sort((a, b) => b.valor - a.valor);
}

// ---------- copias y exportación ----------
// Lleva una copia de la versión 1 (quincenas de calendario) al modelo de pago a pago.
export function migrar(o) {
  o = migrarV1(o);
  const p0 = o?.periodos?.[0];
  // Datos creados antes de que existiera el ingreso inicial: se toma el ingreso quincenal declarado,
  // salvo que ya haya un ingreso registrado en esa primera quincena.
  if (o?.version === VERSION && p0 && typeof p0 === 'object' && p0.ingresoInicial === undefined && o.config?.setupDone) {
    const sig = o.periodos[1]?.inicio;
    const hay = (o.movimientos || []).some((m) => m.tipo === 'ingreso' && (!sig || m.fecha < sig));
    p0.ingresoInicial = hay ? 0 : (o.config.ingresoQuincenal || 0);
  }
  return o;
}
export function fijarIngresoInicial(s, periodo, valor) {
  const p = s.periodos.find((x) => x.id === periodo);
  if (!p) throw new Error('Esa quincena no existe.');
  if (!(Number.isInteger(valor) && valor >= 0)) throw new Error('El valor no es válido.');
  p.ingresoInicial = valor;
}
function migrarV1(o) {
  if (!o || o.version !== 1 || !Array.isArray(o.periodos)) return o;
  const viejo = (p) => {
    if (typeof p !== 'string' || !/^\d{4}-\d{2}-[AB]$/.test(p)) return null;
    const [y, m, q] = p.split('-');
    return q === 'A' ? { inicio: `${y}-${m}-01`, fin: `${y}-${m}-14` } : { inicio: `${y}-${m}-15`, fin: `${y}-${m}-${p2(ultimoDia(+y, +m))}` };
  };
  o.periodos = o.periodos.map(viejo).filter(Boolean).sort((a, b) => a.inicio.localeCompare(b.inicio)).map((r) => ({ id: r.inicio, inicio: r.inicio, cubierto: r.fin }));
  for (const x of o.presupuestos || []) x.periodo = viejo(x.periodo)?.inicio ?? x.periodo;
  for (const x of o.reservas || []) x.periodo = viejo(x.periodo)?.inicio ?? null;
  for (const m of o.movimientos || []) delete m.periodo;
  o.version = VERSION;
  return o;
}
export function validarEstado(o) {
  const listas = ['cuentas', 'categorias', 'obligaciones', 'presupuestos', 'reservas', 'movimientos', 'porCobrar', 'periodos'];
  if (!o || typeof o !== 'object' || !o.config || typeof o.config !== 'object') throw new Error('El archivo no es una copia de VAINAS.');
  o = migrar(o);
  if (o.version !== VERSION) throw new Error('La copia es de otra versión de VAINAS.');
  for (const k of listas) if (!Array.isArray(o[k])) throw new Error('El archivo no es una copia de VAINAS.');
  for (const p of o.periodos) if (!p || !fechaValida(p.inicio) || p.id !== p.inicio || !fechaValida(p.cubierto)) throw new Error('La copia tiene quincenas dañadas.');
  for (const r of o.reservas) if (!fechaValida(r.vence) || !Number.isInteger(r.monto)) throw new Error('La copia tiene reservas dañadas.');
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
    filas.push([m.fecha, periodoDe(s, m.fecha), NOMBRE_TIPO[m.tipo], m.valor, cuenta(s, m.cuentaId)?.nombre,
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
