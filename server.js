// MVP Módulo de Envíos (Sprint 1 + 2). Ejecutar: npm install && npm start  ->  http://localhost:3000
// Opcional (Google): GOOGLE_MAPS_API_KEY=tu_clave npm start
const express = require('express'), fs = require('fs'), path = require('path');
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.env.DB_FILE || path.join(__dirname, 'envios.db'));
db.exec('PRAGMA foreign_keys = ON'); db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
const all = (q, ...p) => db.prepare(q).all(...p), get = (q, ...p) => db.prepare(q).get(...p), run = (q, ...p) => db.prepare(q).run(...p);
const tx = f => { db.exec('BEGIN'); try { const r = f(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
const s = v => String(v ?? '').trim(), ent = v => s(v) !== '' && Number.isInteger(Number(v)) ? Number(v) : NaN;
const marks = a => a.map(() => '?').join();
const KEY = process.env.GOOGLE_MAPS_API_KEY, CLIENTE_ID = 1;       // cliente_id vendrá de Usuarios (F05)
const app = express(); app.use(express.json()); app.use(express.static(path.join(__dirname, 'public')));
const bad = (res, c, ...m) => res.status(c).json({ errores: m.flat() });
const para = (...roles) => (q, r, n) => roles.includes(q.get('x-rol') || 'Cliente') ? n() : bad(r, 403, `Esta acción es solo para: ${roles.join(' o ')}.`);
const admin = para('Administrador'), vend = para('Vendedor', 'Administrador'), cli = para('Cliente');
app.get('/api/config', (q, r) => r.json({ google: !!KEY }));
app.get('/api/municipios', (q, r) => r.json(all('SELECT * FROM Municipio ORDER BY departamento, nombre')));

// ===== SPRINT 1 · HU-ENV-14 Zonas =====
const conflicto = (ids, excl) => ids.length ? all(`SELECT DISTINCT m.nombre FROM Municipio m JOIN ZonaMunicipio zm ON zm.municipio_id = m.id JOIN Zona z ON z.id = zm.zona_id WHERE z.activa = 1 AND z.id <> ? AND m.id IN (${marks(ids)})`, excl, ...ids).map(x => x.nombre) : [];
const opcionesActivas = zid => get('SELECT COUNT(*) n FROM ZonaOpcion zo JOIN OpcionEnvio o ON o.id = zo.opcion_id WHERE zo.zona_id = ? AND o.activa = 1', zid).n;
function validarZona(b, id, activa) {
  const e = [], n = s(b.nombre), ids = [...new Set((b.municipios || []).map(Number))];
  if (!n) e.push('El nombre de la zona es obligatorio.'); else if (get('SELECT id FROM Zona WHERE nombre = ? AND id <> ?', n, id)) e.push('Ya existe una zona con ese nombre.');
  if (!ids.length) e.push('La zona debe tener al menos un municipio.');
  else if (get(`SELECT COUNT(*) n FROM Municipio WHERE id IN (${marks(ids)})`, ...ids).n !== ids.length) e.push('Algún municipio no existe.');
  else if (activa) { const c = conflicto(ids, id); if (c.length) e.push(`Municipios ya asignados a otra zona activa: ${c.join(', ')}.`); }
  return { e, n, ids };
}
app.get('/api/zonas', (q, r) => r.json(all('SELECT * FROM Zona ORDER BY id').map(z => ({ ...z,
  municipios: all('SELECT m.id, m.nombre FROM Municipio m JOIN ZonaMunicipio zm ON zm.municipio_id = m.id WHERE zm.zona_id = ?', z.id),
  opciones: all('SELECT o.id, o.nombre, o.activa FROM OpcionEnvio o JOIN ZonaOpcion zo ON zo.opcion_id = o.id WHERE zo.zona_id = ?', z.id) }))));
const guardarMun = (id, ids) => { run('DELETE FROM ZonaMunicipio WHERE zona_id = ?', id); ids.forEach(m => run('INSERT INTO ZonaMunicipio VALUES (?,?)', id, m)); };
app.post('/api/zonas', admin, (q, r) => {
  const v = validarZona(q.body, 0, false); if (v.e.length) return bad(r, 400, v.e);
  const id = tx(() => { const i = Number(run('INSERT INTO Zona (nombre, activa) VALUES (?, 0)', v.n).lastInsertRowid); guardarMun(i, v.ids); return i; });
  r.status(201).json({ id, mensaje: 'Zona creada (inactiva). Asóciale una opción de envío para poder activarla.' });
});
app.put('/api/zonas/:id', admin, (q, r) => {
  const z = get('SELECT * FROM Zona WHERE id = ?', q.params.id); if (!z) return bad(r, 404, 'Zona no encontrada.');
  const v = validarZona(q.body, z.id, z.activa); if (v.e.length) return bad(r, 400, v.e);
  tx(() => { run('UPDATE Zona SET nombre = ? WHERE id = ?', v.n, z.id); guardarMun(z.id, v.ids); }); r.json({ mensaje: 'Zona actualizada.' });
});
app.patch('/api/zonas/:id/activa', admin, (q, r) => {
  const z = get('SELECT * FROM Zona WHERE id = ?', q.params.id); if (!z) return bad(r, 404, 'Zona no encontrada.');
  if (q.body.activa) {
    if (!opcionesActivas(z.id)) return bad(r, 409, 'Una zona activa necesita al menos una opción de envío activa asociada.');
    const c = conflicto(all('SELECT municipio_id id FROM ZonaMunicipio WHERE zona_id = ?', z.id).map(x => x.id), z.id);
    if (c.length) return bad(r, 409, `Municipios ya asignados a otra zona activa: ${c.join(', ')}.`);
  }
  run('UPDATE Zona SET activa = ? WHERE id = ?', q.body.activa ? 1 : 0, z.id); r.json({ mensaje: q.body.activa ? 'Zona activada.' : 'Zona desactivada.' });
});
app.delete('/api/zonas/:id', admin, (q, r) => { run('DELETE FROM Zona WHERE id = ?', q.params.id); r.json({ mensaje: 'Zona eliminada.' }); });

// ===== SPRINT 1 · HU-ENV-01 Opciones de envío =====
app.get('/api/opciones', (q, r) => r.json(all('SELECT * FROM OpcionEnvio ORDER BY id')));
function validarOpcion(b, id) {
  const e = [], n = s(b.nombre), mn = ent(b.tiempo_min), mx = ent(b.tiempo_max);
  if (!n) e.push('El nombre es obligatorio.'); else if (get('SELECT id FROM OpcionEnvio WHERE nombre = ? AND id <> ?', n, id)) e.push('Ya existe una opción con ese nombre.');
  if (!['domicilio', 'punto'].includes(b.modalidad)) e.push('Elige la modalidad (domicilio o recogida en punto).');
  if (!(mn >= 0 && mx >= mn)) e.push('El tiempo mínimo y máximo deben ser días enteros, con máximo mayor o igual al mínimo.');
  return { e, n, mn, mx };
}
app.post('/api/opciones', admin, (q, r) => {
  const v = validarOpcion(q.body, 0); if (v.e.length) return bad(r, 400, v.e);
  r.status(201).json({ id: Number(run('INSERT INTO OpcionEnvio (nombre, modalidad, tiempo_min, tiempo_max) VALUES (?,?,?,?)', v.n, q.body.modalidad, v.mn, v.mx).lastInsertRowid), mensaje: 'Opción de envío creada.' });
});
app.put('/api/opciones/:id', admin, (q, r) => {
  if (!get('SELECT id FROM OpcionEnvio WHERE id = ?', q.params.id)) return bad(r, 404, 'Opción no encontrada.');
  const v = validarOpcion(q.body, Number(q.params.id)); if (v.e.length) return bad(r, 400, v.e);
  run('UPDATE OpcionEnvio SET nombre = ?, modalidad = ?, tiempo_min = ?, tiempo_max = ? WHERE id = ?', v.n, q.body.modalidad, v.mn, v.mx, q.params.id); r.json({ mensaje: 'Opción actualizada.' });
});
// SPRINT 2 · HU-ENV-17 activar/desactivar opciones
app.patch('/api/opciones/:id/activa', admin, (q, r) => {
  const id = Number(q.params.id), o = get('SELECT * FROM OpcionEnvio WHERE id = ?', id); if (!o) return bad(r, 404, 'Opción no encontrada.');
  const activa = q.body.activa ? 1 : 0; let advertencia = null;
  if (!activa && o.activa) {
    const zonas = all('SELECT z.nombre FROM Zona z JOIN ZonaOpcion zo ON zo.zona_id = z.id WHERE z.activa = 1 AND zo.opcion_id = ? AND NOT EXISTS (SELECT 1 FROM ZonaOpcion z2 JOIN OpcionEnvio e2 ON e2.id = z2.opcion_id WHERE z2.zona_id = z.id AND e2.activa = 1 AND e2.id <> ?)', id, id).map(z => z.nombre);
    if (zonas.length) return bad(r, 409, `No se puede desactivar: es la única opción activa en ${zonas.join(', ')}.`);
    if (get('SELECT COUNT(*) n FROM OpcionEnvio WHERE activa = 1 AND id <> ?', id).n === 0) advertencia = 'Atención: es la última opción de envío activa de la tienda.';
  }
  run('UPDATE OpcionEnvio SET activa = ? WHERE id = ?', activa, id);   // los pedidos creados conservan su opción
  r.json({ mensaje: activa ? 'Opción activada.' : 'Opción desactivada. Los pedidos ya creados la conservan.', advertencia });
});

// ===== SPRINT 1 · HU-ENV-19 Asociar opciones a zonas =====
app.post('/api/zonas/:id/opciones', admin, (q, r) => {
  const z = get('SELECT * FROM Zona WHERE id = ?', q.params.id), oid = ent(q.body.opcion_id);
  if (!z || !Number.isInteger(oid) || !get('SELECT id FROM OpcionEnvio WHERE id = ?', oid)) return bad(r, 404, 'Zona u opción no encontrada.');
  if (get('SELECT 1 x FROM ZonaOpcion WHERE zona_id = ? AND opcion_id = ?', z.id, oid)) return bad(r, 409, 'La opción ya está asociada a esta zona.');
  run('INSERT INTO ZonaOpcion VALUES (?,?)', z.id, oid);
  r.status(201).json({ mensaje: 'Opción asociada a la zona.', advertencia: get('SELECT 1 x FROM Tarifa WHERE zona_id = ? AND opcion_id = ?', z.id, oid) ? null : 'Esta opción aún no tiene tarifa en la zona.' });
});
app.delete('/api/zonas/:id/opciones/:oid', admin, (q, r) => {
  const z = get('SELECT * FROM Zona WHERE id = ?', q.params.id); if (!z) return bad(r, 404, 'Zona no encontrada.');
  if (z.activa && get('SELECT COUNT(*) n FROM ZonaOpcion zo JOIN OpcionEnvio o ON o.id = zo.opcion_id WHERE zo.zona_id = ? AND o.activa = 1 AND o.id <> ?', z.id, q.params.oid).n === 0) return bad(r, 409, 'No se puede quitar: una zona activa necesita al menos una opción activa.');
  run('DELETE FROM ZonaOpcion WHERE zona_id = ? AND opcion_id = ?', z.id, q.params.oid); r.json({ mensaje: 'Opción quitada de la zona.' });
});

// ===== SPRINT 1 · HU-ENV-04 Tarifas =====
app.get('/api/tarifas', (q, r) => r.json(all('SELECT * FROM Tarifa WHERE zona_id = ? AND opcion_id = ? ORDER BY peso_min', q.query.zona_id, q.query.opcion_id)));
app.get('/api/historial-tarifas', (q, r) => r.json(all('SELECT * FROM HistorialTarifa ORDER BY id DESC LIMIT 30')));
app.post('/api/tarifas', admin, (q, r) => {
  const b = q.body, e = [], z = ent(b.zona_id), o = ent(b.opcion_id), mn = ent(b.peso_min), mx = ent(b.peso_max), v = ent(b.valor);
  if (!Number.isInteger(z) || !Number.isInteger(o) || !get('SELECT 1 x FROM ZonaOpcion WHERE zona_id = ? AND opcion_id = ?', z, o)) e.push('La opción debe estar asociada a la zona.');
  if (!(v >= 0)) e.push('El valor debe ser numérico, entero (sin decimales) y no negativo (0 permitido).');
  if (!(mn >= 0 && mx > mn)) e.push('Los pesos deben ser enteros en kg y el peso hasta debe ser mayor que el peso desde.');
  else if (!e.length) { const u = get('SELECT MAX(peso_max) m FROM Tarifa WHERE zona_id = ? AND opcion_id = ?', z, o).m; if (mn !== (u ?? 0)) e.push(u == null ? 'El primer rango debe empezar en 0 kg.' : `El rango debe empezar en ${u} kg (sin traslapes ni vacíos).`); }
  if (e.length) return bad(r, 400, e);
  const id = tx(() => { const i = Number(run('INSERT INTO Tarifa (zona_id, opcion_id, peso_min, peso_max, valor) VALUES (?,?,?,?,?)', z, o, mn, mx, v).lastInsertRowid); run('INSERT INTO HistorialTarifa (tarifa_id, detalle, valor_anterior, valor_nuevo, rol) VALUES (?,?,NULL,?,?)', i, `Tarifa creada ${mn}-${mx} kg`, v, q.get('x-rol')); return i; });
  r.status(201).json({ id, mensaje: 'Tarifa guardada. Aplica solo a pedidos nuevos.' });
});
app.patch('/api/tarifas/:id', admin, (q, r) => {
  const t = get('SELECT * FROM Tarifa WHERE id = ?', q.params.id), v = ent(q.body.valor); if (!t) return bad(r, 404, 'Tarifa no encontrada.');
  if (!(v >= 0)) return bad(r, 400, 'El valor debe ser numérico, entero (sin decimales) y no negativo (0 permitido).');
  tx(() => { run('UPDATE Tarifa SET valor = ? WHERE id = ?', v, t.id); run('INSERT INTO HistorialTarifa (tarifa_id, detalle, valor_anterior, valor_nuevo, rol) VALUES (?,?,?,?,?)', t.id, `Cambio ${t.peso_min}-${t.peso_max} kg`, t.valor, v, q.get('x-rol')); });
  r.json({ mensaje: 'Tarifa actualizada. Aplica solo a pedidos nuevos; los pedidos creados conservan su costo.' });
});

// ===== SPRINT 1 · HU-ENV-13 Transportadoras =====
app.get('/api/transportadoras', (q, r) => r.json(all(`SELECT * FROM Transportadora ${q.query.activas ? 'WHERE activa = 1' : ''} ORDER BY id`)));   // ?activas=1 -> lista para despachar
function validarTrans(b, id) {
  const e = [], n = s(b.nombre), nit = s(b.nit);
  if (!n) e.push('El nombre es obligatorio.');
  if (!/^\d{6,10}(-\d)?$/.test(nit)) e.push('El NIT debe tener 6 a 10 dígitos y opcionalmente el dígito de verificación (ej: 900123456-7).'); else if (get('SELECT id FROM Transportadora WHERE nit = ? AND id <> ?', nit, id)) e.push('Ya existe una transportadora con ese NIT.');
  if (s(b.contacto).length < 3) e.push('El contacto es obligatorio.');
  return { e, n, nit };
}
app.post('/api/transportadoras', admin, (q, r) => { const v = validarTrans(q.body, 0); if (v.e.length) return bad(r, 400, v.e); run('INSERT INTO Transportadora (nombre, nit, contacto) VALUES (?,?,?)', v.n, v.nit, s(q.body.contacto)); r.status(201).json({ mensaje: 'Transportadora registrada.' }); });
app.put('/api/transportadoras/:id', admin, (q, r) => { if (!get('SELECT id FROM Transportadora WHERE id = ?', q.params.id)) return bad(r, 404, 'No encontrada.'); const v = validarTrans(q.body, Number(q.params.id)); if (v.e.length) return bad(r, 400, v.e); run('UPDATE Transportadora SET nombre = ?, nit = ?, contacto = ? WHERE id = ?', v.n, v.nit, s(q.body.contacto), q.params.id); r.json({ mensaje: 'Transportadora actualizada.' }); });
app.patch('/api/transportadoras/:id/activa', admin, (q, r) => { run('UPDATE Transportadora SET activa = ? WHERE id = ?', q.body.activa ? 1 : 0, q.params.id); r.json({ mensaje: q.body.activa ? 'Transportadora activada.' : 'Transportadora desactivada: ya no aparece al despachar.' }); });

// ===== SPRINT 1 · HU-ENV-21 y SPRINT 2 · HU-ENV-22 Productos =====
app.get('/api/productos', (q, r) => r.json(all('SELECT * FROM Producto').map(p => ({ ...p, opciones: all('SELECT opcion_id FROM ProductoOpcion WHERE producto_id = ?', p.id).map(x => x.opcion_id), envio_disponible: !!(p.peso_kg && p.largo_cm && p.ancho_cm && p.alto_cm) }))));
app.put('/api/productos/:id/dimensiones', vend, (q, r) => {
  if (!get('SELECT id FROM Producto WHERE id = ?', q.params.id)) return bad(r, 404, 'Producto no encontrado.');
  const n = k => Number(s(q.body[k]).replace(',', '.')), v = ['peso_kg', 'largo_cm', 'ancho_cm', 'alto_cm'].map(n);
  if (!v.every(x => Number.isFinite(x) && x > 0)) return bad(r, 400, 'Peso (kg), largo, ancho y alto (cm) deben ser números mayores a 0.');
  run('UPDATE Producto SET peso_kg = ?, largo_cm = ?, ancho_cm = ?, alto_cm = ? WHERE id = ?', ...v, q.params.id); r.json({ mensaje: 'Peso y dimensiones guardados.' });
});
app.put('/api/productos/:id/opciones', vend, (q, r) => {
  const p = get('SELECT * FROM Producto WHERE id = ?', q.params.id); if (!p) return bad(r, 404, 'Producto no encontrado.');
  const ids = [...new Set((q.body.opciones || []).map(Number))]; if (!ids.length) return bad(r, 400, 'Elige al menos una opción de envío.');
  if (get(`SELECT COUNT(*) n FROM OpcionEnvio WHERE id IN (${marks(ids)})`, ...ids).n !== ids.length) return bad(r, 400, 'Alguna opción de envío no existe.');
  const cubre = get(`SELECT COUNT(*) n FROM ZonaOpcion zo JOIN OpcionEnvio o ON o.id = zo.opcion_id JOIN Zona z ON z.id = zo.zona_id WHERE o.activa = 1 AND z.activa = 1 AND o.id IN (${marks(ids)})`, ...ids).n;
  tx(() => { run('DELETE FROM ProductoOpcion WHERE producto_id = ?', p.id); ids.forEach(i => run('INSERT INTO ProductoOpcion VALUES (?,?)', p.id, i)); });
  const adv = []; if (!cubre) adv.push('Ninguna opción elegida tiene cobertura en una zona activa.'); if (!(p.peso_kg && p.largo_cm && p.ancho_cm && p.alto_cm)) adv.push('Sin peso y dimensiones no se ofrecerá envío para este producto.');
  r.json({ mensaje: 'Opciones guardadas. Aplican solo a pedidos nuevos.', advertencia: adv.join(' ') || null });
});

// ===== SPRINT 2 · HU-ENV-03 Dirección y destinatario (con validación Google) =====
const ABV = { 'calle': 'Calle', 'carrera': 'Carrera', 'avenida': 'Avenida', 'diagonal': 'Diagonal', 'transversal': 'Transversal' };
function localDir(b) {
  const e = [], m = get('SELECT * FROM Municipio WHERE id = ?', ent(b.municipio_id) || 0);
  if (!m) e.push('Elige el municipio.');
  if (!/^(calle|carrera|avenida|diagonal|transversal)\s+\d{1,3}[a-z]?(\s+(bis|sur|norte))?$/i.test(s(b.via))) e.push('La vía no tiene formato válido (ej: Calle 5, Carrera 100 Bis).');
  if (!/^\d{1,3}[a-z]?-\d{1,3}$/i.test(s(b.placa))) e.push('La placa no tiene formato válido (ej: 10-20).');
  if (s(b.complemento) && !/^[\wáéíóúñÁÉÍÓÚÑ\s.,#-]{1,60}$/.test(s(b.complemento))) e.push('El complemento tiene caracteres no válidos (máximo 60).');
  return { e, m };
}
const texto = (b, m) => `${s(b.via)} # ${s(b.placa)}${s(b.complemento) ? ', ' + s(b.complemento) : ''}, ${m.nombre}, ${m.departamento}, Colombia`;
async function verificar(b) {
  const { e, m } = localDir(b); if (e.length) return { errores: e };
  const t = texto(b, m); if (!KEY) return { errores: [], fuente: 'local', formateada: t, aviso: 'Validación local (sin clave de Google).' };
  try {   // Google Address Validation API (cubre Colombia)
    const g = await fetch(`https://addressvalidation.googleapis.com/v1:validateAddress?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: { regionCode: 'CO', addressLines: [t] } }) });
    const j = await g.json(); if (!g.ok) throw new Error(j.error?.message || 'Error de Google');
    const falta = [...(j.result.address?.missingComponentTypes || []), ...(j.result.address?.unconfirmedComponentTypes || [])];
    return j.result.verdict?.addressComplete ? { errores: [], fuente: 'google', formateada: j.result.address?.formattedAddress || t }
      : { errores: ['Google no pudo confirmar la dirección. Revisa vía, placa y municipio.' + (falta.length ? ` (Sin confirmar: ${falta.join(', ')})` : '')], fuente: 'google' };
  } catch (x) { console.error('Google:', x.message); return { errores: [], fuente: 'local', formateada: t, aviso: 'No se pudo consultar Google; se validó solo el formato.' }; }
}
app.get('/api/google/autocompletar', cli, async (q, r) => {   // sugerencias tipo marketplace (Places API New)
  if (!KEY) return r.json({ activo: false, sugerencias: [] });
  const m = get('SELECT * FROM Municipio WHERE id = ?', ent(q.query.municipio_id) || 0);
  try {
    const g = await fetch('https://places.googleapis.com/v1/places:autocomplete', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY }, body: JSON.stringify({ input: `${s(q.query.q)}${m ? ', ' + m.nombre : ''}`, includedRegionCodes: ['co'], languageCode: 'es' }) });
    r.json({ activo: true, sugerencias: ((await g.json()).suggestions || []).map(x => x.placePrediction?.text?.text).filter(Boolean) });
  } catch { r.json({ activo: true, sugerencias: [] }); }
});
app.post('/api/direcciones/validar', cli, async (q, r) => { const v = await verificar(q.body || {}); r.json({ valida: !v.errores.length, ...v }); });
app.post('/api/direcciones', cli, async (q, r) => {
  const b = q.body || {}, e = [], punto = b.tipo_entrega === 'punto';
  if (!['domicilio', 'punto'].includes(b.tipo_entrega)) e.push('Elige entrega a domicilio o recogida en punto.');
  if (s(b.dest_nombre).length < 3) e.push('El nombre de quien recibe o recoge es obligatorio.');
  if (!/^\d{6,10}$/.test(s(b.dest_cedula))) e.push('La cédula debe tener entre 6 y 10 dígitos.');
  if (!/^3\d{9}$/.test(s(b.dest_celular))) e.push('El celular debe tener 10 dígitos y empezar por 3.');
  if (b.acepta_politica !== true) e.push('Debes aceptar la política de tratamiento de datos (Ley 1581).');
  let v = { errores: [], formateada: 'Recogida en punto', fuente: 'n/a' };
  if (!punto && b.tipo_entrega === 'domicilio') v = await verificar(b);
  const errores = [...e, ...v.errores]; if (errores.length) return bad(r, 400, errores);
  const id = tx(() => {
    const primera = get('SELECT COUNT(*) n FROM Direccion WHERE cliente_id = ?', CLIENTE_ID).n === 0;
    const i = Number(run('INSERT INTO Direccion (cliente_id, tipo_entrega, municipio_id, via, placa, complemento, direccion, verificada_por, predeterminada, acepta_politica) VALUES (?,?,?,?,?,?,?,?,?,1)', CLIENTE_ID, b.tipo_entrega, punto ? null : ent(b.municipio_id), punto ? null : s(b.via), punto ? null : s(b.placa), s(b.complemento) || null, v.formateada, v.fuente, primera ? 1 : 0).lastInsertRowid);
    run('INSERT INTO Destinatario (direccion_id, nombre, cedula, celular) VALUES (?,?,?,?)', i, s(b.dest_nombre), s(b.dest_cedula), s(b.dest_celular)); return i;
  });
  r.status(201).json({ id, mensaje: 'Dirección y destinatario guardados.', advertencia: v.aviso || null });
});
app.get('/api/direcciones', (q, r) => r.json(all('SELECT d.*, de.nombre dest_nombre, de.celular dest_celular FROM Direccion d LEFT JOIN Destinatario de ON de.direccion_id = d.id WHERE d.cliente_id = ? ORDER BY d.predeterminada DESC, d.id DESC', CLIENTE_ID)));
app.patch('/api/direcciones/:id/predeterminada', cli, (q, r) => {
  if (!get('SELECT id FROM Direccion WHERE id = ? AND cliente_id = ?', q.params.id, CLIENTE_ID)) return bad(r, 404, 'Dirección no encontrada.');
  tx(() => { run('UPDATE Direccion SET predeterminada = 0 WHERE cliente_id = ?', CLIENTE_ID); run('UPDATE Direccion SET predeterminada = 1 WHERE id = ?', q.params.id); }); r.json({ mensaje: 'Dirección predeterminada actualizada.' });
});
app.get('/api/pedidos', (q, r) => r.json(all('SELECT * FROM Pedido WHERE cliente_id = ?', CLIENTE_ID)));
app.put('/api/pedidos/:id/direccion', cli, (q, r) => {   // copia la dirección en el pedido; solo si está "Pago confirmado"
  const p = get('SELECT * FROM Pedido WHERE id = ?', q.params.id), d = get('SELECT d.direccion, de.nombre, de.celular FROM Direccion d LEFT JOIN Destinatario de ON de.direccion_id = d.id WHERE d.id = ? AND d.cliente_id = ?', q.body.direccion_id, CLIENTE_ID);
  if (!p || !d) return bad(r, 404, 'Pedido o dirección no encontrados.');
  if (p.estado !== 'Pago confirmado') return bad(r, 409, `La dirección solo se puede modificar con el pedido en "Pago confirmado" (estado actual: ${p.estado}).`);
  run('UPDATE Pedido SET direccion_copia = ?, destinatario_copia = ? WHERE id = ?', d.direccion, d.nombre ? `${d.nombre} - ${d.celular}` : null, p.id); r.json({ mensaje: 'Dirección copiada al pedido.' });
});
app.use((e, q, r, n) => { console.error(e); bad(r, 500, 'Error interno del servidor.'); });
module.exports = app;
if (require.main === module) app.listen(3000, () => console.log(`Envíos en http://localhost:3000 · Google: ${KEY ? 'activo' : 'sin clave (validación local)'}`));
