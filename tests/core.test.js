import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../js/core.js';

const HOY = '2026-11-17';
const P = '2026-11-15'; // la quincena empezó con el pago del 15

function base() {
  const s = C.estadoInicial();
  const sal = {}; [500000, 20000, 30000, 10000].forEach((v, i) => { sal[s.cuentas[i].id] = v; });
  const alm = s.categorias.find((c) => c.nombre === 'Almuerzos');
  C.configurar(s, { saldos: sal, ingreso: 1000000, tasa: 4000, presupuestos: { [alm.id]: 225000 }, inicio: P }, HOY);
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
  assert.deepEqual([r.enCuentas, r.libre, r.gastosPeriodo, r.ingresosPeriodo], [antes.enCuentas, antes.libre, 0, 1000000]); // el pago inicial cuenta como ingreso de la quincena
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
  assert.equal(r.ingresosPeriodo, 1000000);
  assert.equal(r.enCuentas, antes.enCuentas);
  assert.throws(() => C.cobrar(s, pc.id, { cuentaId: nequi.id, fecha: HOY }));
  // una deuda que no nació de un préstamo sí cuenta como ingreso al recibirla
  const otra = C.agregarPorCobrar(s, { persona: 'Ana', valor: 20000, fecha: HOY });
  assert.equal(inv(s).enCuentas, antes.enCuentas);
  C.cobrar(s, otra.id, { cuentaId: nequi.id, fecha: HOY });
  assert.equal(inv(s).ingresosPeriodo, 1020000);
});

test('8. el pago abre una quincena nueva, aunque llegue antes o después del día 15', () => {
  const { s, banco, alm } = base();
  C.agregarMovimiento(s, { tipo: 'gasto', valor: 15000, fecha: '2026-11-27', cuentaId: banco.id, categoriaId: alm.id });
  assert.equal(C.sugerirNuevaQuincena(s, '2026-11-20'), false);
  assert.equal(C.sugerirNuevaQuincena(s, '2026-11-28'), true);
  // pago adelantado, el 28
  C.abrirPeriodo(s, '2026-11-28');
  C.agregarMovimiento(s, { tipo: 'ingreso', valor: 1000000, fecha: '2026-11-28', cuentaId: banco.id });
  C.agregarMovimiento(s, { tipo: 'gasto', valor: 20000, fecha: '2026-11-28', cuentaId: banco.id, categoriaId: alm.id });
  assert.equal(C.nombrePeriodo(s, P), '15 nov al 27 nov 2026');
  assert.equal(C.presupuestosDe(s, P)[0].gastado, 15000); // lo del 27 queda en la quincena vieja
  const r = C.resumen(s, '2026-11-28');
  assert.equal(r.periodo, '2026-11-28'); assert.equal(r.ingresosPeriodo, 1000000); assert.equal(r.gastosPeriodo, 20000);
  assert.equal(r.libre + r.conDueno, r.enCuentas);
  const nuevas = s.reservas.filter((x) => x.periodo === '2026-11-28').map((x) => `${x.nombre} ${x.vence}`).sort();
  assert.deepEqual(nuevas, ['Arriendo 2026-11-28', 'Servicios públicos 2026-12-10']); // del 30 nov al 12 dic solo vence servicios
  assert.throws(() => C.abrirPeriodo(s, '2026-11-28')); assert.throws(() => C.abrirPeriodo(s, '2026-11-20'));
});

test('si el pago se atrasa, la quincena sigue abierta y no se duplican obligaciones', () => {
  const { s } = base();
  assert.equal(C.resumen(s, '2026-11-29').atrasado, false);
  assert.equal(C.ponerAlDia(s, '2026-12-10'), true);
  const r = C.resumen(s, '2026-12-10');
  assert.equal(r.periodo, P); assert.equal(r.atrasado, true); assert.equal(r.diasRestantes, 1);
  assert.equal(r.reservasPend, 470000 + 100000); // servicios venció el 10 mientras esperaba el pago
  assert.equal(C.ponerAlDia(s, '2026-12-10'), false);
  C.abrirPeriodo(s, '2026-12-11');
  assert.equal(s.reservas.filter((x) => x.nombre === 'Servicios públicos').length, 1);
  const nuevas = s.reservas.filter((x) => x.periodo === '2026-12-11').map((x) => `${x.nombre} ${x.vence}`).sort();
  assert.deepEqual(nuevas, ['Arriendo 2026-12-11', 'Celular e internet 2026-12-16', 'Suscripción en dólares 2026-12-20']);
  assert.equal(C.nombrePeriodo(s, P), '15 nov al 10 dic 2026');
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

test('abrir quincena: copia presupuestos, arrastra sobrantes si se pide y se puede deshacer', () => {
  const { s, banco, alm } = base();
  C.agregarMovimiento(s, { tipo: 'gasto', valor: 24000, fecha: HOY, cuentaId: banco.id, categoriaId: alm.id });
  C.abrirPeriodo(s, '2026-11-30', { arrastrar: true });
  const p = C.presupuestosDe(s, '2026-11-30');
  assert.equal(p.length, 1); assert.equal(p[0].monto, 225000); assert.equal(p[0].total, 426000);
  C.abrirPeriodo(s, '2026-12-15');
  assert.equal(C.presupuestosDe(s, '2026-12-15')[0].total, 225000); // el arrastre no se hereda
  assert.ok(C.resumen(s, '2026-12-15').reservasPend >= 470000); // lo vencido y sin pagar sigue contando
  assert.equal(C.presupuestosDe(s, P)[0].gastado, 24000); // el historial se conserva
  const antes = s.reservas.length;
  C.deshacerPeriodo(s);
  assert.equal(s.periodos.length, 2); assert.equal(C.presupuestosDe(s, '2026-12-15').length, 0);
  assert.ok(s.reservas.length < antes);
  assert.equal(C.periodoDe(s, '2026-12-20'), '2026-11-30');
  assert.equal(C.periodoDe(s, '2026-01-01'), P); // lo anterior al primer pago cuenta en la primera quincena
});

test('calendario: reservas, obligaciones previstas y días de pago', () => {
  const { s, banco } = base();
  C.pagarReserva(s, s.reservas.find((x) => x.nombre === 'Arriendo').id, { cuentaId: banco.id, valor: 350000, fecha: HOY });
  const nov = C.agenda(s, 2026, 11, HOY);
  assert.deepEqual(nov['2026-11-15'].map((x) => x.clase).sort(), ['pagada', 'pago']);
  assert.equal(nov['2026-11-16'][0].clase, 'vencida'); assert.equal(nov['2026-11-20'][0].clase, 'pendiente');
  const dic = C.agenda(s, 2026, 12, HOY);
  assert.deepEqual(Object.keys(dic).sort(), ['2026-12-10', '2026-12-16', '2026-12-20']);
  assert.ok(Object.values(dic).flat().every((x) => x.clase === 'previsto'));
  // una obligación nueva dentro de la quincena vigente queda reservada de una vez
  const antes = C.resumen(s, HOY).libre;
  C.guardarObligacion(s, { nombre: 'Gimnasio', monto: 60000, frecuencia: 'mensual', dia: 25 }, HOY);
  assert.equal(C.agenda(s, 2026, 11, HOY)['2026-11-25'][0].clase, 'pendiente');
  assert.equal(C.resumen(s, HOY).libre, antes - 60000);
  assert.equal(new Date(Date.UTC(2027, 1, 28)).getUTCDate(), 28);
  assert.equal(C.agenda(s, 2027, 2, HOY)['2027-02-25'][0].nombre, 'Gimnasio');
});

test('una copia de la versión anterior se convierte al modelo de pago a pago', () => {
  const { s } = base();
  const v1 = JSON.parse(JSON.stringify(s));
  v1.version = 1; v1.periodos = ['2026-11-B'];
  for (const x of v1.presupuestos) x.periodo = '2026-11-B';
  for (const x of v1.reservas) x.periodo = '2026-11-B';
  const m = C.validarEstado(v1);
  assert.equal(m.version, 2);
  assert.deepEqual(m.periodos, [{ id: '2026-11-15', inicio: '2026-11-15', cubierto: '2026-11-30', ingresoInicial: 1000000 }]);
  // datos de la versión actual sin ese dato: se completa una sola vez y se puede corregir
  const v2 = JSON.parse(JSON.stringify(s)); delete v2.periodos[0].ingresoInicial;
  assert.equal(C.migrar(v2).periodos[0].ingresoInicial, 1000000);
  const libre = C.resumen(v2, HOY).libre;
  C.fijarIngresoInicial(v2, P, 930000);
  assert.equal(C.resumen(v2, HOY).ingresosPeriodo, 930000);
  assert.equal(C.resumen(v2, HOY).libre, libre); // no cambia saldos ni plata libre
  assert.equal(C.resumen(m, HOY).presupRest, 225000);
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

test('catálogo: quitar una categoría sin uso la borra, y con movimientos la archiva', () => {
  const { s, banco, alm } = base();
  const libre = inv(s).libre;
  const nueva = C.guardarCategoria(s, { nombre: 'Mascota', tipo: 'habitual' });
  C.fijarPresupuesto(s, P, nueva.id, 20000, HOY);
  assert.equal(inv(s).libre, libre - 20000);
  assert.throws(() => C.guardarCategoria(s, { nombre: 'mascota' }));
  C.quitarCategoria(s, nueva.id);
  assert.equal(C.categoria(s, nueva.id), undefined);
  assert.equal(inv(s).libre, libre); // su presupuesto deja de apartar plata
  C.agregarMovimiento(s, { tipo: 'gasto', valor: 15000, fecha: HOY, cuentaId: banco.id, categoriaId: alm.id });
  const n = s.movimientos.length;
  C.quitarCategoria(s, alm.id);
  assert.equal(C.categoria(s, alm.id).archivada, true);
  assert.equal(s.movimientos.length, n);
  assert.equal(C.presupuestosDe(s, P)[0].gastado, 15000); // lo ya gastado sigue contando
  C.recuperarCategoria(s, alm.id);
  assert.equal(C.categoria(s, alm.id).archivada, false);
  inv(s);
});
