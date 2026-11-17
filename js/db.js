// Persistencia en IndexedDB: una tabla por tipo de dato, todo dentro del dispositivo.
const NOMBRE = 'vainas';
const TABLAS = ['cuentas', 'categorias', 'obligaciones', 'presupuestos', 'reservas', 'movimientos', 'porCobrar'];
let conexion = null;

function abrir() {
  if (conexion) return conexion;
  conexion = new Promise((ok, mal) => {
    const req = indexedDB.open(NOMBRE, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const t of TABLAS) db.createObjectStore(t, { keyPath: 'id' });
      db.createObjectStore('meta', { keyPath: 'clave' });
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => mal(req.error);
  });
  return conexion;
}
const pedir = (req) => new Promise((ok, mal) => { req.onsuccess = () => ok(req.result); req.onerror = () => mal(req.error); });

export async function cargar() {
  const db = await abrir();
  const tx = db.transaction([...TABLAS, 'meta'], 'readonly');
  const meta = await pedir(tx.objectStore('meta').getAll());
  if (!meta.length) return null;
  const s = {};
  for (const m of meta) s[m.clave] = m.valor;
  // getAll devuelve por id; _i conserva el orden en que se crearon las filas.
  for (const t of TABLAS) {
    const filas = await pedir(tx.objectStore(t).getAll());
    s[t] = filas.sort((a, b) => a._i - b._i).map(({ _i, ...fila }) => fila);
  }
  return s;
}

// Guarda todo en una sola transacción: o queda completo o no queda nada.
export async function guardar(s) {
  const db = await abrir();
  const tx = db.transaction([...TABLAS, 'meta'], 'readwrite');
  for (const t of TABLAS) {
    const st = tx.objectStore(t);
    st.clear();
    s[t].forEach((fila, i) => st.put({ ...fila, _i: i }));
  }
  const meta = tx.objectStore('meta');
  meta.put({ clave: 'version', valor: s.version });
  meta.put({ clave: 'config', valor: s.config });
  meta.put({ clave: 'periodos', valor: s.periodos });
  return new Promise((ok, mal) => { tx.oncomplete = () => ok(); tx.onerror = () => mal(tx.error); tx.onabort = () => mal(tx.error); });
}

export async function borrarTodo() {
  const db = await abrir();
  const tx = db.transaction([...TABLAS, 'meta'], 'readwrite');
  for (const t of [...TABLAS, 'meta']) tx.objectStore(t).clear();
  return new Promise((ok, mal) => { tx.oncomplete = () => ok(); tx.onerror = () => mal(tx.error); });
}
