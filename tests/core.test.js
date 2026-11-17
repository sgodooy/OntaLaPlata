import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../js/core.js';

const HOY = '2026-11-17'; // quincena 2026-11-B
const P = '2026-11-B';

function base() {
  const s = C.estadoInicial();
  const sal = {}; [500000, 20000, 30000, 10000].forEach((v, i) => { sal[s.cuentas[i].id] = v; });
  const alm = s.categorias.find((c) => c.nombre === 'Almuerzos');
  C.configurar(s, { saldos: sal, ingreso: 1000000, tasa: 4000, presupuestos: { [alm.id]: 225000 } }, HOY);
  const [banco, nequi, nu] = s.cuentas;
  return { s, banco, nequi, nu, alm };
}
const inv = (s) => { const r = C.resumen(s, HOY); assert.equal(r.libre + r.conDueno, r.enCuentas); return r; };

test('configuración: saldos, reservas de la quincena y presupuesto', () => {
  const { s } = base();
  const r = inv(s);
  assert.equal(r.enCuentas, 560000);
  // 15 al 30 de noviembre: arriendo, celular (día 16) y suscripción (día 20, USD 10 a 4.000). Servicios vence el 10.
  assert.equal(r.reservasPend, 350000 + 80000 + 40000);
  assert.equal(r.presupRest, 225000);
  assert.equal(r.libre, 560000 - 470000 - 225000);
});

test('1. un gasto baja el saldo y el presupuesto por el mismo valor', () => {
  const { s, banco, alm } = base();
  const antes = inv(s);
  C.agregarMovimiento(s, { tipo: 'gasto', valor: 15000, fecha: HOY, cuentaId: banco.id, categoriaId: alm.id });
  const r = inv(s);
  assert.equal(C.saldos(s)[banco.id], 485000);
  const p = C.presupuestosDe(s, P)[0];
  assert.equal(p.gastado, 15000); assert.equal(p.resta, 210000); assert.equal(p.unidades, 14);
  assert.equal(r.libre, antes.libre); // salió del presupuesto, no del libre
  assert.equal(r.gastosPeriodo, 15000);
});

test('2. una transferencia no cambia el total ni cuenta como gasto o ingreso', () => {
  const { s, banco, nu } = base();
  const antes = inv(s);
  C.agregarMovimiento(s, { tipo: 'transferencia', valor: 100000, fecha: HOY, cuentaId: banco.id, cuentaDestinoId: nu.id });
  const r = inv(s);
  assert.equal(C.saldos(s)[banco.id], 400000); assert.equal(C.saldos(s)[nu.id], 130000);
  assert.deepEqual([r.enCuentas, r.libre, r.gastosPeriodo, r.ingresosPeriodo], [antes.enCuentas, antes.libre, 0, 0]);
  assert.throws(() => C.agregarMovimiento(s, { tipo: 'transferencia', valor: 1, fecha: HOY, cuentaId: banco.id, cuentaDestinoId: banco.id }));
});

test('3. una reserva baja el libre y no toca los saldos', () => {
  const { s } = base();
  const antes = inv(s); const sal = C.saldos(s);
  C.guardarReserva(s, { nombre: 'Regalo', monto: 40000, vence: '2026-11-25' });
  const r = inv(s);
  assert.deepEqual(C.saldos(s), sal);
  assert.equal(r.libre, antes.libre - 40000);
});

test('4 y 5. pagar una reserva descuenta una sola vez y ajusta la diferencia', () => {
  const { s, banco } = base();
  const antes = inv(s);
  const arriendo = s.reservas.find((x) => x.nombre === 'Arriendo');
  C.pagarReserva(s, arriendo.id, { cuentaId: banco.id, valor: 350000, fecha: HOY });
  let r = inv(s);
  assert.equal(C.saldos(s)[banco.id], 150000);
  assert.equal(r.libre, antes.libre); // el libre no vuelve a bajar
  assert.equal(C.presupuestosDe(s, P)[0].gastado, 0); // no se imputa a presupuestos
  assert.throws(() => C.pagarReserva(s, arriendo.id, { cuentaId: banco.id, valor: 300000, fecha: HOY }));
  const tigo = s.reservas.find((x) => x.nombre === 'Celular e internet');
  C.pagarReserva(s, tigo.id, { cuentaId: banco.id, valor: 70000, fecha: HOY });
  r = inv(s);
  assert.equal(r.libre, antes.libre + 10000); // pagó menos de lo reservado
  // eliminar el pago devuelve la reserva a pendiente
  C.eliminarMovimiento(s, tigo.movimientoId);
  assert.equal(tigo.estado, 'pendiente');
  assert.equal(inv(s).libre, antes.libre);
});

test('cancelar una reserva devuelve la plata al libre', () => {
  const { s } = base();
  const antes = inv(s);
  const r = s.reservas.find((x) => x.nombre === 'Suscripción en dólares');
  C.cancelarReserva(s, r.id);
  assert.equal(inv(s).libre, antes.libre + 40000);
});

test('6. pasarse de un presupuesto y gastar sin presupuesto salen del libre', () => {
  const { s, banco, alm } = base();
  const antes = inv(s);
  C.agregarMovimiento(s, { tipo: 'gasto', valor: 230000, fecha: HOY, cuentaId: banco.id, categoriaId: alm.id });
  let r = inv(s);
  assert.equal(C.presupuestosDe(s, P)[0].resta, 0);
  assert.equal(r.libre, antes.libre - 5000);
  const antojos = s.categorias.find((c) => c.nombre === 'Antojos');
  C.agregarMovimiento(s, { tipo: 'gasto', valor: 5000, fecha: HOY, cuentaId: banco.id, categoriaId: antojos.id });
  r = inv(s);
  assert.equal(r.libre, antes.libre - 10000);
  assert.equal(s.presupuestos.length, 1); // no se inventó un presupuesto
});

test('7. prestar no es gasto y cobrar el préstamo no es ingreso', () => {
  const { s, banco, nequi } = base();
  const antes = inv(s);
  const pc = C.prestar(s, { valor: 50000, persona: 'Un amigo', cuentaId: banco.id, fecha: HOY });
  let r = inv(s);
  assert.equal(C.saldos(s)[banco.id], 450000);
  assert.equal(r.gastosPeriodo, 0);
  assert.equal(r.enCuentas, antes.enCuentas - 50000); // lo que me deben no suma
  C.cobrar(s, pc.id, { cuentaId: nequi.id, fecha: HOY });
  r = inv(s);
  assert.equal(C.saldos(s)[nequi.id], 70000);
  assert.equal(r.ingresosPeriodo, 0);
  assert.equal(r.enCuentas, antes.enCuentas);
  assert.throws(() => C.cobrar(s, pc.id, { cuentaId: nequi.id, fecha: HOY }));
  // una deuda que no nació de un préstamo sí cuenta como ingreso al recibirla
  const otra = C.agregarPorCobrar(s, { persona: 'Ana', valor: 20000, fecha: HOY });
  assert.equal(inv(s).enCuentas, antes.enCuentas);
  C.cobrar(s, otra.id, { cuentaId: nequi.id, fecha: HOY });
  assert.equal(inv(s).ingresosPeriodo, 20000);
});

test('8. un ingreso para la quincena siguiente sube el saldo y no el libre', () => {
  const { s, banco } = base();
  const antes = inv(s);
  C.agregarMovimiento(s, { tipo: 'ingreso', valor: 1000000, fecha: '2026-11-30', cuentaId: banco.id, periodo: '2026-12-A' });
  const r = inv(s);
  assert.equal(r.enCuentas, antes.enCuentas + 1000000);
  assert.equal(r.libre, antes.libre);
  assert.equal(r.ingresosPeriodo, 0);
  // al empezar esa quincena, la plata ya cuenta
  const dic = C.resumen(s, '2026-12-01');
  assert.equal(dic.futuro, 0); assert.equal(dic.ingresosPeriodo, 1000000);
  assert.equal(C.sugerirPeriodoIngreso('2026-11-30'), '2026-12-A');
  assert.equal(C.sugerirPeriodoIngreso('2026-11-15'), '2026-11-B');
  assert.equal(C.sugerirPeriodoIngreso('2027-02-28'), '2027-03-A');
});

test('9. editar y eliminar movimientos recalcula todo', () => {
  const { s, banco, nequi, alm } = base();
  const antes = inv(s);
  const m = C.agregarMovimiento(s, { tipo: 'gasto', valor: 15000, fecha: HOY, cuentaId: banco.id, categoriaId: alm.id });
  C.editarMovimiento(s, m.id, { valor: 30000, cuentaId: nequi.id });
  assert.equal(C.saldos(s)[banco.id], 500000); assert.equal(C.saldos(s)[nequi.id], -10000);
  assert.equal(C.presupuestosDe(s, P)[0].gastado, 30000);
  C.eliminarMovimiento(s, m.id);
  const r = inv(s);
  assert.deepEqual([r.enCuentas, r.libre, r.presupRest], [antes.enCuentas, antes.libre, antes.presupRest]);
  assert.throws(() => C.agregarMovimiento(s, { tipo: 'gasto', valor: 0, fecha: HOY, cuentaId: banco.id }));
  assert.throws(() => C.agregarMovimiento(s, { tipo: 'gasto', valor: 100, fecha: '2026-02-30', cuentaId: banco.id }));
});

test('10. el cuadre de caja crea ajustes visibles y deja los saldos reales', () => {
  const { s, banco, nequi } = base();
  const aj = C.cuadrar(s, { [banco.id]: 492000, [nequi.id]: 20000 }, HOY);
  assert.equal(aj.length, 1); assert.equal(aj[0].valor, -8000); assert.equal(aj[0].tipo, 'ajuste');
  assert.equal(C.saldos(s)[banco.id], 492000);
  assert.equal(inv(s).gastosPeriodo, 0);
});

test('11. una copia de seguridad se restaura idéntica', () => {
  const { s, banco, alm } = base();
  C.agregarMovimiento(s, { tipo: 'gasto', valor: 15000, fecha: HOY, cuentaId: banco.id, categoriaId: alm.id });
  const copia = C.validarEstado(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(copia, s);
  assert.deepEqual(C.resumen(copia, HOY), C.resumen(s, HOY));
  assert.throws(() => C.validarEstado({ version: 1 }));
  assert.throws(() => C.validarEstado({ ...copia, movimientos: [{ tipo: 'gasto', valor: 'x', fecha: HOY }] }));
});

test('quincenas: límites, febrero y obligaciones mensuales completas', () => {
  assert.equal(C.periodoDe('2026-11-14'), '2026-11-A');
  assert.equal(C.periodoDe('2026-11-15'), '2026-11-B');
  assert.deepEqual(C.rangoPeriodo('2027-02-B'), { inicio: '2027-02-15', fin: '2027-02-28' });
  assert.equal(C.periodoSiguiente('2026-12-B'), '2027-01-A');
  assert.equal(C.periodoAnterior('2027-01-A'), '2026-12-B');
  const { s } = base();
  const a = C.reservasParaPeriodo(s.obligaciones, '2026-12-A', 4000).map((r) => r.nombre);
  const b = C.reservasParaPeriodo(s.obligaciones, '2026-12-B', 4000).map((r) => r.nombre);
  assert.deepEqual(a, ['Arriendo', 'Servicios públicos']);
  assert.deepEqual(b, ['Arriendo', 'Celular e internet', 'Suscripción en dólares']);
});

test('abrir quincena: copia presupuestos, genera reservas y arrastra sobrantes si se pide', () => {
  const { s, banco, alm } = base();
  C.agregarMovimiento(s, { tipo: 'gasto', valor: 24000, fecha: HOY, cuentaId: banco.id, categoriaId: alm.id });
  C.abrirPeriodo(s, '2026-12-A', { arrastrar: true });
  C.abrirPeriodo(s, '2026-12-A', { arrastrar: true }); // repetir no duplica
  const p = C.presupuestosDe(s, '2026-12-A');
  assert.equal(p.length, 1); assert.equal(p[0].monto, 225000); assert.equal(p[0].total, 426000);
  assert.equal(s.reservas.filter((r) => r.periodo === '2026-12-A').length, 2);
  C.abrirPeriodo(s, '2026-12-B');
  assert.equal(C.presupuestosDe(s, '2026-12-B')[0].total, 225000); // el arrastre no se hereda
  // las reservas vencidas y sin pagar siguen contando
  assert.ok(C.resumen(s, '2026-12-01').reservasPend >= 470000);
  assert.equal(C.presupuestosDe(s, P)[0].gastado, 24000); // el historial se conserva
});

test('cambiar un presupuesto deja historial y no toca los movimientos', () => {
  const { s, banco, alm } = base();
  C.agregarMovimiento(s, { tipo: 'gasto', valor: 15000, fecha: HOY, cuentaId: banco.id, categoriaId: alm.id });
  const n = s.movimientos.length;
  C.fijarPresupuesto(s, P, alm.id, 200000, HOY);
  const p = C.presupuestosDe(s, P)[0];
  assert.deepEqual(p.historial, [{ fecha: HOY, de: 225000, a: 200000 }]);
  assert.equal(p.resta, 185000); assert.equal(s.movimientos.length, n);
});

test('duplicados, invitaciones y formato', () => {
  const { s, banco, alm } = base();
  const d = { tipo: 'gasto', valor: 15000, fecha: HOY, cuentaId: banco.id, categoriaId: alm.id };
  assert.equal(C.esDuplicado(s, d), false);
  C.agregarMovimiento(s, d);
  assert.equal(C.esDuplicado(s, d), true);
  const antes = inv(s);
  C.agregarMovimiento(s, { tipo: 'invitacion', fecha: HOY, categoriaId: alm.id, valor: 999 });
  const r = inv(s);
  assert.deepEqual([r.enCuentas, r.libre, r.gastosPeriodo], [antes.enCuentas, antes.libre, antes.gastosPeriodo]);
  assert.equal(C.capitulo(s, P).invitaciones, 1);
  assert.equal(C.fmt(1250000), '$1.250.000'); assert.equal(C.fmt(-1500), '-$1.500');
  assert.equal(C.parseMonto('$ 15.000'), 15000);
  assert.ok(C.csvMovimientos(s).includes('"Almuerzos"'));
});
