// Prueba de punta a punta en el navegador: node tests/e2e.cjs (con la app servida en el puerto 8080).
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const URL = process.env.URL || 'http://localhost:8080/';
const SHOTS = process.env.SHOTS;
const n = (t) => parseInt(t.replace(/[^\d-]/g, ''), 10);

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: SHOTS ? 2 : 1, timezoneId: 'America/Bogota' });
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
  p.on('dialog', (d) => d.accept());
  const leer = async () => ({ libre: n(await p.textContent('#libre')), cuentas: n(await p.textContent('#en-cuentas')), dueno: n(await p.textContent('#con-dueno')) });
  const chip = (txt, grupo = 0) => p.locator('#hoja fieldset').nth(grupo).locator('label.chip', { hasText: txt }).click();
  const guardar = async () => { await p.click('#hoja form button.btn:not(.peligro):not(.sec)'); await p.waitForSelector('#fondo', { state: 'hidden' }); };
  const ir = async (r) => { await p.goto(URL + '#' + r); await p.waitForTimeout(80); };

  await p.goto(URL);
  await p.waitForSelector('#setup');
  if (SHOTS) await p.screenshot({ path: SHOTS + '/1-configuracion.png', fullPage: true });
  for (const [c, v] of [['Bancolombia', '500000'], ['Nequi', '20000'], ['Nu', '30000'], ['Efectivo', '10000']]) await p.locator('#setup label.campo', { hasText: c }).first().locator('input').fill(v);
  assert.match(await p.textContent('#chequeo'), /Sobran \$257\.000/);
  await p.click('#setup > button.btn');
  await p.waitForSelector('#libre');
  // la primera vez aparece el recorrido guiado y tapa la app
  await p.waitForSelector('.tour .t-carta');
  assert.match(await p.textContent('.t-carta'), /1 de 10/);
  await p.click('.t-carta [data-t=sig]');
  assert.match(await p.textContent('.t-carta'), /¿Onta la plata\?/);
  const caja = async (s) => p.locator(s).boundingBox();
  const aro = await caja('.t-aro'), heroe = await caja('.heroe'), carta = await caja('.t-carta');
  assert.ok(Math.abs(aro.x - (heroe.x - 6)) < 2 && Math.abs(aro.height - (heroe.height + 12)) < 2, 'el aro rodea el resumen');
  assert.ok(carta.y >= aro.y + aro.height || carta.y + carta.height <= aro.y, 'la carta no tapa lo que explica');
  if (SHOTS) { await p.waitForTimeout(300); await p.screenshot({ path: SHOTS + '/7-recorrido.png' }); }
  await p.click('.t-carta [data-t=sig]'); await p.click('.t-carta [data-t=atras]');
  assert.match(await p.textContent('.t-carta'), /2 de 10/);
  for (let k = 0; k < 2; k++) await p.click('.t-carta [data-t=sig]');
  assert.match(await p.textContent('.t-carta'), /Anote todo aquí/);
  if (SHOTS) { await p.waitForTimeout(300); await p.screenshot({ path: SHOTS + '/8-recorrido-boton.png' }); }
  for (let k = 0; k < 5; k++) {
    await p.click('.t-carta [data-t=sig]');
    const c = await caja('.t-carta');
    assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.width <= 390 && c.y + c.height <= 844, 'la carta cabe en la pantalla');
  }
  await p.click('.t-carta [data-t=sig]');
  assert.match(await p.textContent('.t-carta'), /10 de 10/);
  await p.click('.t-carta [data-t=sig]');
  await p.waitForSelector('.tour', { state: 'detached' });
  await p.waitForSelector('#hoja input[name=valor]'); // termina abriendo el registro del primer movimiento
  await p.click('#hoja .cerrar');
  await p.reload(); await p.waitForSelector('#libre'); await p.waitForTimeout(200);
  assert.equal(await p.locator('.tour').count(), 0, 'el recorrido no se repite');
  await p.goto(URL + '#ajustes'); await p.click('[data-a=recorrido]');
  await p.waitForSelector('.tour'); await p.click('.t-carta [data-t=saltar]');
  assert.equal(await p.locator('.tour').count(), 0);
  const t0 = await leer();
  assert.equal(t0.cuentas, 560000);
  assert.equal(t0.libre + t0.dueno, t0.cuentas);

  // 1. gasto: baja el saldo y el presupuesto
  await p.click('#fab'); await p.fill('#hoja input[name=valor]', '15000');
  await chip('Almuerzos', 0); await chip('Bancolombia', 1); await guardar();
  const t1 = await leer();
  assert.equal(t1.cuentas, 545000); assert.equal(t1.libre, t0.libre);
  await ir('presupuestos');
  assert.match(await p.textContent('.pres[data-a=ed-pres]'), /Gastado \$15\.000 de \$225\.000/);
  assert.match(await p.textContent('.pres[data-a=ed-pres]'), /Le quedan 14 almuerzos/);

  // 2. transferencia: no es gasto
  await ir('inicio');
  await p.click('#fab'); await p.click('#hoja .tabs button[data-t=transferencia]'); await p.fill('#hoja input[name=valor]', '100000');
  await chip('Bancolombia', 0); await chip('Nu', 1); await guardar();
  const t2 = await leer();
  assert.deepEqual(t2, t1);
  assert.match(await p.textContent('#vista'), /Gastos del periodo.*\$15\.000/s);

  // 3. reserva: no baja el saldo
  await ir('reservas');
  await p.click('[data-a=nueva-reserva]'); await p.fill('#hoja input[name=nombre]', 'Regalo'); await p.fill('#hoja input[name=monto]', '40000'); await guardar();
  await ir('inicio');
  const t3 = await leer();
  assert.equal(t3.cuentas, t2.cuentas); assert.equal(t3.libre, t2.libre - 40000);

  // 4. pagar una reserva: un solo descuento
  await p.locator('.fila', { hasText: 'Arriendo' }).locator('[data-a=pagar]').click();
  await chip('Bancolombia', 0); await guardar();
  const t4 = await leer();
  assert.equal(t4.cuentas, t3.cuentas - 350000); assert.equal(t4.libre, t3.libre);
  assert.equal(await p.locator('.fila', { hasText: 'Arriendo' }).locator('[data-a=pagar]').count(), 0);

  // 5. prestar y recibir la deuda
  await p.click('#fab'); await p.click('#hoja .tabs button[data-t=prestamo]'); await p.fill('#hoja input[name=valor]', '50000');
  await p.fill('#hoja input[name=persona]', 'Un amigo'); await chip('Bancolombia', 0); await guardar();
  const t5 = await leer();
  assert.equal(t5.cuentas, t4.cuentas - 50000);
  await ir('reservas');
  await p.click('[data-a=cobrar]'); await chip('Nequi', 0); await guardar();
  await ir('inicio');
  const t6 = await leer();
  assert.equal(t6.cuentas, t4.cuentas); assert.equal(t6.libre, t4.libre);
  assert.match(await p.textContent('#vista'), /Gastos del periodo.*\$365\.000/s);
  assert.match(await p.textContent('#vista'), /Ingresos del periodo.*\$0/s);
  if (SHOTS) await p.screenshot({ path: SHOTS + '/2-inicio.png', fullPage: true });

  // 6. cerrar y volver a abrir
  await p.close();
  const p2 = await ctx.newPage(); p2.on('pageerror', (e) => errores.push(e.message));
  await p2.goto(URL); await p2.waitForSelector('#libre');
  assert.equal(n(await p2.textContent('#libre')), t6.libre); assert.equal(n(await p2.textContent('#en-cuentas')), t6.cuentas);
  await p2.goto(URL + '#movimientos'); await p2.waitForSelector('#lista-movs');
  assert.equal(await p2.locator('#lista-movs button.fila').count(), 5);
  if (SHOTS) {
    await p2.screenshot({ path: SHOTS + '/3-movimientos.png', fullPage: true });
    for (const r of ['presupuestos', 'reservas', 'analisis']) { await p2.goto(URL + '#' + r); await p2.waitForTimeout(100); await p2.screenshot({ path: `${SHOTS}/4-${r}.png`, fullPage: true }); }
    await p2.goto(URL + '#inicio'); await p2.click('#fab'); await p2.waitForTimeout(250); await p2.screenshot({ path: SHOTS + '/5-registrar.png' });
    await p2.setViewportSize({ width: 1280, height: 800 }); await p2.keyboard.press('Escape'); await p2.screenshot({ path: SHOTS + '/6-computador.png', fullPage: true });
  }

  // 7. el resto de formularios
  const q = p2; q.on('dialog', (d) => d.accept());
  const chip2 = (txt, g = 0) => q.locator('#hoja fieldset').nth(g).locator('label.chip', { hasText: txt }).click();
  const ok2 = async () => { await q.click('#hoja form button.btn:not(.peligro):not(.sec)'); await q.waitForSelector('#fondo', { state: 'hidden' }); };
  const va = async (r) => { await q.goto(URL + '#' + r); await q.waitForTimeout(80); };
  const tot = async () => { await va('inicio'); return { libre: n(await q.textContent('#libre')), cuentas: n(await q.textContent('#en-cuentas')) }; };
  await q.setViewportSize({ width: 390, height: 844 });
  const a0 = await tot();
  // me invitaron: no mueve nada
  await q.click('#fab'); await q.click('#hoja .tabs button[data-t=invitacion]'); await ok2();
  assert.deepEqual(await tot(), a0);
  // ingreso sin abrir quincena: sube el saldo y la plata libre
  await q.click('#fab'); await q.click('#hoja .tabs button[data-t=ingreso]'); await q.fill('#hoja input[name=valor]', '1000000');
  await chip2('Bancolombia'); assert.equal(await q.isChecked('#hoja input[name=nueva]'), false); await ok2();
  const a1 = await tot();
  assert.equal(a1.cuentas, a0.cuentas + 1000000); assert.equal(a1.libre, a0.libre + 1000000);
  // editar el gasto del almuerzo a 30.000 y luego eliminarlo
  await va('movimientos');
  await q.locator('#lista-movs button.fila', { hasText: 'Almuerzos · ' }).first().click();
  await q.fill('#hoja input[name=valor]', '30000'); await ok2();
  assert.equal((await tot()).cuentas, a1.cuentas - 15000);
  await va('movimientos');
  await q.locator('#lista-movs button.fila', { hasText: 'Almuerzos · ' }).first().click();
  await q.click('#hoja [data-a=borrar-mov]'); await q.waitForSelector('#fondo', { state: 'hidden' });
  assert.equal((await tot()).cuentas, a1.cuentas + 15000);
  // filtro de búsqueda
  await va('movimientos'); await q.fill('[data-f=q]', 'amigo');
  assert.equal(await q.locator('#lista-movs button.fila').count(), 2);
  await q.fill('[data-f=q]', '');
  // un gasto de ayer queda en su propio día, también con el filtro puesto
  await q.click('#fab'); await q.fill('#hoja input[name=valor]', '12000'); await chip2('Almuerzos', 0); await chip2('Bancolombia', 1);
  await q.locator('#hoja [data-a=poner-fecha]', { hasText: 'Ayer' }).click(); await ok2();
  await va('movimientos');
  const dias = await q.locator('#lista-movs .dia').count();
  assert.ok(dias >= 2, 'los días salen separados');
  // varias categorías a la vez
  const filas = () => q.locator('#lista-movs button.fila').count();
  const todas = await filas();
  await q.click('.filtro-cats summary');
  await q.locator('.filtro-cats label.chip', { hasText: 'Almuerzos' }).click();
  const soloAlm = await filas();
  await q.locator('.filtro-cats label.chip', { hasText: 'Gastos fijos' }).click();
  const conFijos = await filas();
  assert.equal(await q.locator('#lista-movs .dia').count(), 2, 'con filtro los días siguen separados');
  assert.ok(soloAlm >= 1 && conFijos === soloAlm + 1 && conFijos < todas, `filtro de categorías: ${soloAlm}, ${conFijos}, ${todas}`);
  assert.match(await q.textContent('#resumen-cats'), /Categorías \(2\): Almuerzos, Gastos fijos/);
  await q.locator('.filtro-cats label.chip', { hasText: 'Almuerzos' }).click();
  assert.equal(await filas(), 1);
  await q.click('[data-a=limpiar-filtros]');
  assert.equal(await filas(), todas);
  assert.match(await q.textContent('#resumen-cats'), /todas/);
  // un filtro de fecha que deja la lista vacía se puede quitar desde ahí mismo
  assert.equal(await q.locator('[data-f=desde].vacia').count(), 1);
  await q.fill('[data-f=desde]', '2030-01-01');
  assert.equal(await q.locator('[data-f=desde].vacia').count(), 0);
  assert.equal(await q.locator('#lista-movs button.fila').count(), 0);
  await q.click('[data-a=limpiar-filtros]');
  assert.ok(await q.locator('#lista-movs button.fila').count() >= 5);
  assert.equal(await q.inputValue('[data-f=desde]'), '');
  // presupuesto: cambiarlo deja historial; categoría nueva
  await va('presupuestos');
  await q.locator('.pres[data-a=ed-pres]', { hasText: 'Almuerzos' }).click(); await q.fill('#hoja input[name=monto]', '200000'); await ok2();
  await q.locator('.pres[data-a=ed-pres]', { hasText: 'Almuerzos' }).click();
  assert.match(await q.textContent('#hoja'), /\$225\.000 → \$200\.000/); await q.click('#hoja .cerrar');
  await q.click('[data-a=nueva-cat]'); await q.fill('#hoja input[name=nombre]', 'Mascota'); await q.fill('#hoja input[name=monto]', '20000'); await ok2();
  assert.equal(await q.locator('.pres[data-a=ed-pres]', { hasText: 'Mascota' }).count(), 1);
  // obligación en dólares
  await va('reservas');
  await q.click('[data-a=nueva-ob]'); await q.fill('#hoja input[name=nombre]', 'Música'); await q.selectOption('#hoja select[name=moneda]', 'USD');
  await q.fill('#hoja input[name=valor]', '5'); await q.fill('#hoja input[name=dia]', '28'); await ok2();
  assert.match(await q.textContent('#vista'), /Música.*\$20\.000/s);
  // cuadre de caja
  const a2 = await tot();
  await va('cuentas'); await q.click('[data-a=cuadre]');
  const real = q.locator('#hoja input.monto').first(); const calc = n(await real.inputValue());
  await real.fill(String(calc - 7000)); await ok2();
  const a3 = await tot();
  assert.equal(a3.cuentas, a2.cuentas - 7000);
  // catálogo de categorías en Ajustes: agregar, usar, quitar y recuperar
  await va('ajustes');
  await q.click('[data-a=cat-nueva]'); await q.fill('#hoja input[name=nombre]', 'Gatos'); await ok2();
  assert.equal(await q.locator('#catalogo .fila', { hasText: 'Gatos' }).count(), 1);
  await q.click('#fab');
  assert.equal(await q.locator('#hoja label.chip', { hasText: 'Gatos' }).count(), 1);
  await q.click('#hoja .cerrar');
  await q.locator('#catalogo .fila', { hasText: 'Gatos' }).locator('[data-a=cat-quitar]').click();
  await q.waitForFunction(() => !document.querySelector('#catalogo').textContent.includes('Gatos'));
  await q.locator('#catalogo .fila', { hasText: 'Almuerzos' }).locator('[data-a=cat-quitar]').click();
  await q.waitForSelector('#catalogo details');
  await q.click('#fab');
  assert.equal(await q.locator('#hoja label.chip', { hasText: 'Almuerzos' }).count(), 0);
  await q.click('#hoja .cerrar');
  await q.click('#catalogo details summary'); await q.click('[data-a=cat-recuperar]');
  await q.waitForFunction(() => !document.querySelector('#catalogo details'));
  assert.deepEqual(await tot(), a3);
  // copia de seguridad y modo revisión
  await va('ajustes');
  await va('ajustes');
  const [dl] = await Promise.all([q.waitForEvent('download'), q.click('[data-a=copia]')]);
  const ruta = await dl.path();
  const [fc] = await Promise.all([q.waitForEvent('filechooser'), q.click('[data-a=revision]')]);
  await fc.setFiles(ruta);
  await q.waitForSelector('body.revision');
  assert.equal(n(await q.textContent('#libre')), a3.libre);
  assert.equal(await q.locator('#fab').isVisible(), false);
  await q.click('[data-a=salir-revision]');
  assert.equal(await q.locator('#fab').isVisible(), true);
  // calendario: ver un día y anotar un gasto fijo mensual
  await va('reservas');
  await q.click('.cal-dia[data-f$="-20"]');
  assert.match(await q.textContent('.cal-det'), /Suscripción en dólares/);
  await q.click('.cal-dia[data-f$="-25"]'); await q.click('[data-a=cal-nuevo]');
  await q.fill('#hoja input[name=nombre]', 'Gimnasio'); await q.fill('#hoja input[name=monto]', '60000'); await ok2();
  assert.match(await q.textContent('.cal-det'), /Gimnasio/);
  if (SHOTS) await q.screenshot({ path: SHOTS + '/9-calendario.png', fullPage: true });
  const a4 = await tot(); assert.equal(a4.libre, a3.libre - 60000);
  await va('reservas'); await q.click('[data-a=cal-mes][data-d="1"]');
  assert.ok(await q.locator('.cal-dia i.p-previsto').count() >= 3);
  // el pago abre una quincena nueva y muestra los créditos finales de la anterior
  await va('inicio'); await q.click('#fab'); await q.click('#hoja .tabs button[data-t=ingreso]'); await q.fill('#hoja input[name=valor]', '1000000');
  await chip2('Bancolombia'); await q.check('#hoja input[name=nueva]'); await q.click('#hoja form button.btn:not(.peligro):not(.sec)');
  await q.waitForSelector('#hoja .creditos'); await q.click('#hoja [data-a=cerrar]');
  assert.match(await q.textContent('#vista'), /Quincena desde el/);
  await va('presupuestos'); assert.equal(await q.locator('[data-a=deshacer-periodo]').count(), 1);
  assert.equal(await q.locator('.pres[data-a=ed-pres]').count(), 3);
  const a5 = await tot(); assert.equal(a5.cuentas, a4.cuentas + 1000000);
  // los días del calendario y los campos de fecha caben en su tarjeta, también en celulares angostos
  for (const ancho of [320, 375, 390]) {
    await q.setViewportSize({ width: ancho, height: 800 });
    for (const r of ['reservas', 'movimientos']) {
      await va(r);
      const fuera = await q.evaluate(() => [...document.querySelectorAll('.cal-dia, input[type=date]')].filter((el) => {
        const c = el.closest('.tarjeta, .filtros').getBoundingClientRect(), b = el.getBoundingClientRect();
        return b.left < c.left - 0.5 || b.right > c.right + 0.5;
      }).length);
      assert.equal(fuera, 0, `algo se sale del margen en ${r} a ${ancho}px`);
      assert.ok(await q.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `desborde en ${r} a ${ancho}px`);
    }
  }
  await q.setViewportSize({ width: 390, height: 844 });
  // nada se desborda hacia los lados en el celular
  for (const r of ['inicio', 'movimientos', 'presupuestos', 'reservas', 'analisis', 'cuentas', 'ajustes']) {
    await va(r);
    assert.ok(await q.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'desborde en ' + r);
  }
  await va('inicio'); await q.reload(); await q.waitForSelector('#libre');
  assert.equal(n(await q.textContent('#libre')), a5.libre);
  assert.deepEqual(errores, []);
  await b.close();
  console.log('Prueba de punta a punta: todo cuadra.');
})().catch((e) => { console.error(e); process.exit(1); });
