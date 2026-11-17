# VAINAS: propuesta de aplicación de finanzas personales

Quiero una aplicación web, pensada primero para el celular, que me permita llevar el control de mi plata. Se llama VAINAS, por el humor costumbrista colombiano y por la serie *Dejémonos de Vainas*.

La prioridad absoluta es que las cuentas sean exactas. Prefiero una aplicación sencilla que calcule bien a una espectacular que se equivoque con mi dinero.

## 1. Qué debe responder

La pantalla de inicio responde una sola pregunta: **¿Onta la plata?** La respuesta tiene tres partes.

1. **En cuentas:** todo lo que tengo, sumando cuentas y efectivo.
2. **Con dueño:** lo que ya está comprometido, entre reservas para obligaciones y presupuestos que todavía no he gastado.
3. **Libre:** lo que puedo gastar sin descuadrarme.

Además debo poder saber en qué gasté, de qué cuenta salió y cuánto me queda de cada presupuesto.

## 2. Identidad

- **Nombre:** VAINAS.
- **Frase:** «Dejémonos de vainas. Llevemos las cuentas claras».
- **Tono:** colombiano, cercano, ingenioso y ligeramente paisa, sin exagerar los regionalismos ni parecer infantil.
- **Humor atado al estado de las cuentas**, nunca al azar:
  - Al crear una reserva: «Esa platica ya tiene dueño».
  - Al pasar el 80 % de un presupuesto: «¡Pilas pues!».
  - Al superar un presupuesto: «No se me descuadre».
  - Al abrir el registro de un gasto: «¿Y esta vaina cuánto costó?».
- **Diseño:** limpio y moderno, con detalles retro de la televisión colombiana de los 80 y 90. Colores crema, verde oscuro, terracota y amarillo mostaza. Las barras de ajuste de un televisor sirven como motivo gráfico.
- **Cada quincena es un capítulo.** Al cerrarla aparece un resumen con «créditos finales»: cuánto entró, cuánto salió, en qué me pasé y en qué ahorré.
- No usar personajes, fotografías, logotipos ni material de la serie original. La identidad visual es propia y no debe parecer un software contable empresarial.

## 3. Conceptos y reglas contables

Estas reglas mandan sobre cualquier otra parte de la propuesta.

### 3.1 Definiciones

- **En cuentas (patrimonio líquido)** = suma de los saldos de todas mis cuentas.
- **Reserva** = plata apartada para una obligación fija con fecha (arriendo, celular, servicios, suscripciones). Reservar no mueve el saldo de ninguna cuenta.
- **Presupuesto** = tope de gasto para una categoría variable durante una quincena (almuerzos, mercado, transporte).
- **Con dueño** = reservas pendientes de la quincena vigente y de las anteriores + lo que falta por gastar de cada presupuesto vigente + ingresos ya recibidos que asigné a una quincena futura.
- **Libre** = en cuentas − con dueño.

### 3.2 Reglas

1. Los gastos fijos viven solo como reservas y los gastos variables solo como presupuestos. Ninguna obligación puede estar en los dos lados, para que no se reste dos veces.
2. Lo que falta por gastar de un presupuesto nunca es negativo. Si me paso, el exceso sale del libre.
3. Un gasto en una categoría sin presupuesto se registra como «no presupuestado» y sale del libre, sin inventar un presupuesto.
4. Una transferencia entre mis cuentas baja una cuenta y sube otra por el mismo valor. No cambia el total en cuentas, ni los gastos, ni los ingresos.
5. Pagar una reserva genera un gasto que baja la cuenta y, al mismo tiempo, la reserva deja de contar como plata con dueño. El pago no se imputa a ningún presupuesto.
6. Si el valor pagado difiere del reservado, la diferencia se devuelve al libre o sale de él.
7. Prestar plata baja la cuenta y crea una cuenta por cobrar. No es un gasto y no toca los presupuestos.
8. La plata que me deben no suma en cuentas ni en libre hasta que confirme que la recibí.
9. Un ingreso asignado a una quincena futura sube el saldo de la cuenta cuando llega, pero no aumenta el libre hasta que empiece esa quincena.
10. Cambiar un presupuesto no altera los movimientos ya registrados y queda en un historial de cambios.
11. Todo se recalcula al instante con cada movimiento.
12. Ningún movimiento se duplica: antes de guardar un registro idéntico a otro del mismo día (valor, categoría y cuenta), la app pregunta.

## 4. Quincenas

- Hay dos periodos por mes: **del 1 al 14** y **del 15 al último día**.
- Recibo un sueldo fijo cada quincena. El pago del día 15 financia la quincena del 15 a fin de mes, y el pago de fin de mes (día 30, o el último día si el mes es más corto) financia la quincena del 1 al 14.
- Al registrar un ingreso elijo a qué quincena corresponde. La app sugiere la que está por empezar si faltan tres días o menos, y la vigente en los demás casos.
- Las obligaciones mensuales (celular, servicios, suscripciones) se reservan **completas en la quincena en la que vencen**.
- Al iniciar una quincena, la app propone los mismos presupuestos y reservas periódicas de la anterior para que yo los confirme o ajuste. Nada queda marcado como pagado automáticamente.
- **Cierre de quincena:**
  - Si sobró plata de un presupuesto, elijo entre pasarla a la quincena siguiente o dejarla como libre.
  - Si me pasé, el faltante se muestra y se descuenta del libre de la quincena siguiente.
  - El historial se conserva completo y puedo consultar cualquier quincena anterior.

## 5. Pantalla de inicio

De arriba hacia abajo:

1. **Libre**, en grande, con el desglose «en cuentas» y «con dueño» debajo.
2. **Ritmo diario:** «Le quedan $12.000 por día hasta la quincena».
3. **Saldo de cada cuenta.**
4. **Quincena vigente:** gastado, restante y porcentaje consumido en una sola barra.
5. **Próximas obligaciones** con fecha de vencimiento y botón para pagarlas.

Si el libre es negativo, se muestra en terracota con el valor del faltante.

## 6. Registrar movimientos

Un botón flotante «+» siempre visible. Registrar un almuerzo de $15.000 debe tomar dos toques después de escribir el valor.

### 6.1 Gasto (opción por defecto)

- **Obligatorio:** valor y categoría. Las categorías aparecen como botones, con las más usadas primero.
- **Automático:** fecha de hoy y la última cuenta usada, visibles y modificables con un toque.
- **Opcional, bajo «más detalles»:** descripción y nota.
- El tipo de gasto (habitual, social, antojo, extraordinario) lo define la categoría y no se pregunta.
- Al guardar, la app muestra cuánto queda en ese presupuesto.

### 6.2 Otros tipos

- **Ingreso:** valor, cuenta de destino, quincena a la que corresponde y descripción.
- **Transferencia:** valor, cuenta de origen y cuenta de destino.
- **Presté plata:** valor, persona, cuenta de origen y concepto. Crea la cuenta por cobrar.
- **Me invitaron:** registra una comida sin valor y sin cuenta. No mueve plata ni presupuesto y queda en el historial para las estadísticas.

Reservar y liberar plata se hace desde la sección Reservas. Todos los registros se pueden editar y eliminar, y los saldos se recalculan.

## 7. Mis cuentas

- Cuentas iniciales: **Bancolombia, Nequi, Nu y Efectivo**. Todas son de débito o efectivo; no hay tarjetas de crédito.
- Puedo agregar, renombrar y archivar cuentas. Una cuenta con movimientos se archiva en lugar de borrarse, para conservar el historial.
- Cada cuenta muestra saldo, movimientos, ingresos, gastos y transferencias recibidas y enviadas.
- **Cuadre de caja:** una vez por semana la app me invita a escribir el saldo real de cada cuenta. Si hay diferencia con el saldo calculado, crea un movimiento de ajuste visible en el historial. También puedo hacerlo cuando quiera.

## 8. Presupuestos

Cada categoría variable tiene su presupuesto por quincena, con una barra de progreso:

> **ALMUERZOS** · Presupuesto $225.000 · Gastado $45.000 · Quedan $180.000 (20,0 %) · **Le quedan 12 almuerzos**

- Las categorías de comida pueden tener un **valor de referencia** (almuerzo $15.000, desayuno $8.000). Con él, la app traduce lo que queda a unidades.
- Aviso al llegar al 80 % y alerta clara al superar el 100 %, sin bloquear el registro.
- Comparación de lo planeado frente a lo gastado, por categoría y por quincena.

### Categorías iniciales (editables, y puedo crear más)

| Grupo | Categorías | Tipo |
|---|---|---|
| Alimentación | Almuerzos, Desayunos, Mercado, Cenas | Habitual |
| Vida social | Salidas, Restaurantes e invitaciones a otros, Entretenimiento | Social |
| Antojos | Antojos | Antojo |
| Otros | Transporte, Belleza y cuidado personal, Salud, Compras personales | Habitual |
| Extraordinarios | Gastos extraordinarios | Extraordinario |

Lo que gasto en mi comida va en Alimentación; lo que gasto invitando a otros va en «Restaurantes e invitaciones a otros».

## 9. Reservas: «Esta platica ya tiene dueño»

Aquí viven las obligaciones fijas. La app trae estas de ejemplo, con nombre, valor y día editables:

| Obligación | Valor | Frecuencia |
|---|---|---|
| Arriendo | $350.000 | Cada quincena |
| Celular e internet | $80.000 | Mensual |
| Servicios públicos | $100.000 (estimado) | Mensual |
| Suscripción en dólares | USD 10 | Mensual, segunda quincena |

- Cada reserva tiene valor, fecha de vencimiento, frecuencia y estado (pendiente, pagada o cancelada).
- Las suscripciones en dólares se escriben en USD con una tasa de cambio editable. Al pagar registro el valor real en pesos.
- Un valor puede marcarse como estimado, y se confirma al pagar.
- **Pagar:** un botón en la reserva abre el gasto ya diligenciado. Solo elijo la cuenta y confirmo el valor. La reserva queda pagada y vinculada a ese gasto.
- **Cancelar:** la plata vuelve al libre.
- La app nunca crea reservas para gastos opcionales ni marca obligaciones como pagadas por su cuenta.

## 10. Me deben

- Cada registro tiene persona, valor, fecha, concepto y estado (pendiente o recibido).
- Nace de dos maneras: desde «Presté plata» o registrada a mano cuando alguien me debe por otra razón.
- Al marcarla como recibida elijo la cuenta donde entró. Si era un préstamo mío, sube el saldo sin contarse como ingreso de la quincena; si era otra deuda, se cuenta como ingreso.

## 11. Movimientos y análisis

- **Historial** con búsqueda por descripción y filtros por fecha, quincena, categoría, cuenta y tipo.
- **Tres gráficos en la primera versión:**
  1. Presupuesto frente a gasto real por categoría, resaltando dónde me pasé.
  2. Gasto por categoría, con un filtro por tipo para ver sociales y antojos.
  3. Comparación entre quincenas.
- Para una versión posterior: gasto por cuenta, evolución diaria y gastos recurrentes.

## 12. Configuración inicial

Un recorrido corto la primera vez. Todas las cifras que trae la app son de ejemplo; las reales las escribo yo y quedan guardadas solo en mi dispositivo:

1. **Saldos.** Empiezan en cero y escribo lo que tengo hoy en cada cuenta.
2. **Ingreso quincenal** y tasa de cambio del dólar.
3. **Reservas** de la sección 9, corrigiendo nombre, valor y día de vencimiento.
4. **Presupuestos** por categoría, con almuerzos y desayunos sugeridos a partir de su valor de referencia.
5. **Chequeo de realidad.** La app suma reservas y presupuestos, los compara con el ingreso y muestra si sobra o falta en esta quincena y en la siguiente, para ajustar ahí mismo antes de empezar.

Todos los parámetros son editables después.

## 13. Datos, celular y computador

- **El celular es donde registro.** Los datos se guardan en el propio teléfono, sin cuenta ni servidor, y la app funciona sin internet.
- La app se instala en la pantalla de inicio del iPhone. Esto es necesario porque Safari puede borrar los datos de un sitio web no instalado que lleve varios días sin abrirse.
- **Copia de seguridad:** descarga de un archivo con todos los datos y opción de restaurarlo. La app me recuerda hacerla si pasaron más de 15 días desde la última.
- **El computador es para revisar.** La misma app, en pantalla ancha, tiene un «modo revisión» que abre el archivo de copia de seguridad en solo lectura, con el historial y los gráficos en grande. Para ver lo del momento uso la duplicación del iPhone.
- La estructura de datos debe quedar lista para agregar sincronización automática entre dispositivos más adelante, sin rehacer la app.
- Exportación de movimientos y presupuestos a CSV.
- Moneda COP con formato colombiano ($1.000.000), fechas y hora de Colombia (America/Bogota).
- Formularios con validaciones: valores mayores que cero, cuentas distintas en una transferencia, fechas válidas.
- Sin conexión a bancos: todo se registra a mano.

## 14. Navegación

Cinco secciones en la barra inferior y el botón flotante «+» sobre todas:

1. **Inicio:** ¿Onta la plata?
2. **Movimientos:** historial y filtros.
3. **Presupuestos:** cuánto tenía, cuánto gasté y cuánto queda.
4. **Reservas:** obligaciones y plata que me deben.
5. **Análisis:** gráficos y capítulos anteriores.

Las cuentas y la configuración se abren desde Inicio.

## 15. Entregable y pruebas

Construir la aplicación completa y funcional, con persistencia real. No basta un prototipo visual ni una descripción.

Antes de entregar, comprobar con pruebas automáticas y a mano:

1. Un gasto baja el saldo de la cuenta y lo que queda del presupuesto por el mismo valor.
2. Una transferencia deja igual el total en cuentas y no aparece como gasto ni como ingreso.
3. Una reserva baja el libre y deja intactos los saldos.
4. Pagar una reserva baja la cuenta una sola vez, y el libre no vuelve a bajar por ese pago.
5. Pagar una reserva por un valor distinto al estimado ajusta el libre por la diferencia.
6. Pasarse de un presupuesto descuenta el exceso del libre.
7. Prestar plata baja la cuenta sin registrar un gasto; al cobrarla, la cuenta sube sin contarse como ingreso.
8. Un ingreso asignado a la quincena siguiente sube el saldo y deja igual el libre de la quincena vigente.
9. Editar y eliminar movimientos recalcula todo correctamente.
10. El cuadre de caja crea un ajuste visible y los saldos quedan iguales a los reales.
11. Cerrar y volver a abrir la app conserva los datos, y restaurar una copia de seguridad los recupera idénticos.
12. En todo momento se cumple: libre + con dueño = en cuentas.
