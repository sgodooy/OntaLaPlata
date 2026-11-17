# VAINAS

«Dejémonos de vainas. Llevemos las cuentas claras».

Aplicación web de finanzas personales por quincenas, pensada para el celular. La pantalla de inicio responde «¿Onta la plata?»: cuánto hay en cuentas, cuánto tiene dueño y cuánto está libre. La especificación completa está en [PROPUESTA.md](PROPUESTA.md).

## Cómo funciona

- No tiene servidor ni cuentas de usuario. Los datos se guardan en el dispositivo (IndexedDB) y la app funciona sin internet.
- No necesita compilación ni dependencias: es HTML, CSS y JavaScript.
- `js/core.js` contiene todas las reglas contables, `js/db.js` la persistencia y `js/app.js` las pantallas.

## Usarla

```bash
npm start
```

Luego abrir `http://localhost:8080`. Para usarla en el celular hay que publicarla en una dirección HTTPS, por ejemplo con GitHub Pages (Settings → Pages → Deploy from a branch → carpeta raíz).

En el iPhone: abrir la dirección en Safari, tocar Compartir y luego «Agregar a inicio». Instalarla importa, porque Safari puede borrar los datos de un sitio no instalado que lleve varios días sin abrirse.

En el computador: descargar la copia de seguridad en el celular (Ajustes), pasarla al computador y abrirla con «Revisar una copia», que es de solo lectura.

## Pruebas

```bash
npm test
```

Comprueba las reglas contables (gastos, transferencias, reservas, pagos, préstamos, quincenas, cuadre de caja y copias).

```bash
npm run e2e
```

Recorre la app en un navegador de tamaño celular; necesita Playwright y la app servida con `npm start`.
