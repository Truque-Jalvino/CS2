// MVP Módulo de Envíos – una sola página con las vistas de Sprint 1 y Sprint 2 según el rol
const $ = s => document.querySelector(s);
const h = (t, p = {}, ...c) => { const e = Object.assign(document.createElement(t), p); e.append(...c.flat().filter(x => x != null && x !== false)); return e; };
let ROL = 'Cliente', actual = null;
async function api(m, u, b) { const r = await fetch(u, { method: m, headers: { 'Content-Type': 'application/json', 'X-Rol': ROL }, body: b ? JSON.stringify(b) : undefined }); return { ok: r.ok, d: await r.json() }; }
const msg = (el, ok, d) => { el.className = 'msg ' + (ok ? 'ok' : 'err'); el.textContent = (ok ? d.mensaje : d.errores.join('\n')) + (ok && d.advertencia ? '\n⚠ ' + d.advertencia : ''); };
const refrescar = () => abrir(actual);
const item = (t, sub, ...acc) => h('li', {}, h('div', {}, t, h('small', {}, sub)), h('div', { className: 'acc' }, ...acc));
const btn = (t, fn) => h('button', { type: 'button', className: 'link', onclick: fn }, t);
const etq = (t, el) => h('label', {}, t, el);
const tag = (ok, a = 'Activa', b = 'Inactiva') => h('span', { className: 'tag' + (ok ? '' : ' off') }, ok ? a : b);
const sel = (op, f = x => x) => h('select', {}, ...op.map(o => h('option', { value: o[0] ?? o.id }, o[1] ?? f(o))));

// Campos numéricos: solo dígitos (bloquea letras al teclear, pegar o arrastrar). Decimales: dígitos y un punto
const num = (ph, max) => { const e = h('input', { placeholder: ph, maxLength: max, inputMode: 'numeric' }); e.dataset.num = '1'; return e; };
const dec = ph => { const e = h('input', { placeholder: ph, inputMode: 'decimal' }); e.dataset.num = 'd'; return e; };
document.addEventListener('keydown', e => { const t = e.target.dataset; if (t && t.num && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !(t.num === 'd' ? /[\d.,]/ : /\d/).test(e.key)) e.preventDefault(); });
document.addEventListener('input', e => { const t = e.target.dataset; if (t && t.num) e.target.value = e.target.value.replace(t.num === 'd' ? /[^\d.,]/g : /\D/g, ''); });

// ---------- navegación por rol ----------
const TABS = { Cliente: { 'Mis direcciones': vDir }, Vendedor: { 'Productos y envío': vProd }, Administrador: { 'Zonas': vZonas, 'Opciones de envío': vOpc, 'Tarifas': vTar, 'Transportadoras': vTrans } };
async function abrir(fn) { actual = fn; const box = h('div'); $('#main').replaceChildren(box); document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', TABS[ROL][b.textContent] === fn)); await fn(box); }
function menu() { $('#tabs').replaceChildren(...Object.entries(TABS[ROL]).map(([n, f]) => h('button', { onclick: () => abrir(f) }, n))); abrir(Object.values(TABS[ROL])[0]); }
$('#rol').onchange = e => { ROL = e.target.value; menu(); };

// ---------- Sprint 2 · HU-ENV-03 · Cliente ----------
const ABV = { cl: 'Calle', calle: 'Calle', cra: 'Carrera', kr: 'Carrera', carrera: 'Carrera', av: 'Avenida', avenida: 'Avenida', dg: 'Diagonal', diagonal: 'Diagonal', tv: 'Transversal', transversal: 'Transversal' };
function parsear(t) { const m = t.match(/^([A-Za-z]+)\.?\s+(\d{1,3}[A-Za-z]?(?:\s+(?:bis|sur|norte))?)\s*#\s*(\d{1,3}[A-Za-z]?-\d{1,3})/i); return m && ABV[m[1].toLowerCase()] ? { via: `${ABV[m[1].toLowerCase()]} ${m[2]}`, placa: m[3] } : null; }
async function vDir(box) {
  const [mun, dirs, peds, cfg] = (await Promise.all(['/api/municipios', '/api/direcciones', '/api/pedidos', '/api/config'].map(u => api('GET', u)))).map(x => x.d);
  const tipo = sel([['domicilio', 'Entrega a domicilio'], ['punto', 'Recogida en punto']]), muni = sel(mun.map(m => [m.id, `${m.nombre} (${m.departamento})`]));
  const buscar = h('input', { placeholder: 'Empieza a escribir tu dirección…' }), lista = h('datalist', { id: 'sug' }); buscar.setAttribute('list', 'sug');
  const via = h('input', { placeholder: 'Calle 5' }), placa = h('input', { placeholder: '10-20' }), comp = h('input', { placeholder: 'Apto 301 (opcional)' });
  const dn = h('input'), dc = num('1144123456', 10), dcel = num('3001234567', 10), pol = h('input', { type: 'checkbox' }), m = h('p', { className: 'msg', role: 'alert' });
  const dom = [etq('Municipio', muni), etq('Buscar dirección', buscar), etq('Vía', via), etq('Placa', placa), etq('Complemento', comp)];
  tipo.onchange = () => dom.forEach(x => x.hidden = tipo.value === 'punto');
  let t; buscar.oninput = () => { clearTimeout(t); t = setTimeout(async () => { const d = (await api('GET', `/api/google/autocompletar?q=${encodeURIComponent(buscar.value)}&municipio_id=${muni.value}`)).d; lista.replaceChildren(...d.sugerencias.map(x => h('option', { value: x }))); }, 300); };
  buscar.onchange = () => { const p = parsear(buscar.value); if (p) { via.value = p.via; placa.value = p.placa; } else m.textContent = 'Completa vía y placa manualmente.'; };
  const cuerpo = () => ({ tipo_entrega: tipo.value, municipio_id: muni.value, via: via.value, placa: placa.value, complemento: comp.value, dest_nombre: dn.value, dest_cedula: dc.value, dest_celular: dcel.value, acepta_politica: pol.checked });
  const verif = h('button', { type: 'button', className: 'p', onclick: async () => { const { d } = await api('POST', '/api/direcciones/validar', cuerpo()); m.className = 'msg ' + (d.valida ? 'ok' : 'err'); m.textContent = d.valida ? `✔ Dirección válida (${d.fuente}): ${d.formateada}${d.aviso ? '\n⚠ ' + d.aviso : ''}` : d.errores.join('\n'); } }, 'Verificar dirección');
  const f = h('form', { onsubmit: async ev => { ev.preventDefault(); const { ok, d } = await api('POST', '/api/direcciones', cuerpo()); msg(m, ok, d); if (ok) setTimeout(refrescar, 1200); } },
    h('p', { className: 'nota ancho' }, cfg.google ? 'Validación y sugerencias con Google activas.' : 'Modo local: sin clave de Google, solo se valida el formato (ver instrucciones para activar Google).'),
    etq('Tipo de entrega', tipo), ...dom, etq('Nombre de quien recibe o recoge', dn), etq('Cédula', dc), etq('Celular', dcel),
    h('label', { className: 'fila ancho' }, pol, 'Acepto la política de tratamiento de datos personales (Ley 1581)'), verif, h('button', {}, 'Guardar dirección'), m, lista);
  const ped = sel(peds.map(p => [p.id, `Pedido #${p.id} · ${p.estado}${p.direccion_copia ? ' · ' + p.direccion_copia : ''}`])), mp = h('p', { className: 'msg' });
  box.append(h('h2', {}, 'Registrar dirección y destinatario'), f, h('h2', {}, 'Mis direcciones'), h('ul', {}, ...dirs.map(d => item(`${d.direccion}`, `${d.tipo_entrega} · Recibe: ${d.dest_nombre} · ${d.dest_celular} · verificada: ${d.verificada_por}`,
    d.predeterminada ? tag(true, 'Predeterminada') : btn('Hacer predeterminada', async () => { await api('PATCH', `/api/direcciones/${d.id}/predeterminada`); refrescar(); })))),
    h('h2', {}, 'Copiar la dirección predeterminada a un pedido'), h('div', { className: 'caja' }, etq('Pedido', ped), h('button', { className: 'p', onclick: async () => { const p = dirs.find(x => x.predeterminada); if (!p) return msg(mp, false, { errores: ['Aún no tienes dirección predeterminada.'] }); const { ok, d } = await api('PUT', `/api/pedidos/${ped.value}/direccion`, { direccion_id: p.id }); msg(mp, ok, d); } }, 'Copiar al pedido'), mp));
}

// ---------- Sprint 1 · HU-ENV-21 y Sprint 2 · HU-ENV-22 · Vendedor ----------
async function vProd(box) {
  const [prods, ops] = (await Promise.all(['/api/productos', '/api/opciones'].map(u => api('GET', u)))).map(x => x.d);
  box.append(h('h2', {}, 'Productos: peso, dimensiones y opciones de envío'));
  prods.forEach(p => {
    const campos = [['peso_kg', 'Peso (kg)'], ['largo_cm', 'Largo (cm)'], ['ancho_cm', 'Ancho (cm)'], ['alto_cm', 'Alto (cm)']].map(([k, e]) => { const i = dec('0'); i.value = p[k] ?? ''; return [k, e, i]; });
    const checks = ops.map(o => { const c = h('input', { type: 'checkbox', value: o.id, checked: p.opciones.includes(o.id) }); return h('label', { className: 'fila' }, c, o.nombre + (o.activa ? '' : ' (inactiva)')); });
    const m = h('p', { className: 'msg', role: 'alert' });
    box.append(h('div', { className: 'caja' }, h('h3', { className: 'ancho' }, p.nombre, ' ', tag(p.envio_disponible, 'Envío disponible', 'Sin envío: faltan peso/dimensiones')),
      ...campos.map(([, e, i]) => etq(e, i)),
      h('button', { className: 'p', onclick: async () => { const { ok, d } = await api('PUT', `/api/productos/${p.id}/dimensiones`, Object.fromEntries(campos.map(([k, , i]) => [k, i.value]))); msg(m, ok, d); if (ok) setTimeout(refrescar, 900); } }, 'Guardar medidas'),
      h('div', { className: 'checks ancho' }, ...checks),
      h('button', { className: 'p', onclick: async () => { const { ok, d } = await api('PUT', `/api/productos/${p.id}/opciones`, { opciones: checks.map(l => l.firstChild).filter(c => c.checked).map(c => Number(c.value)) }); msg(m, ok, d); } }, 'Guardar opciones de envío'), m));
  });
}

// ---------- Sprint 1 · Administrador ----------
async function crud(box, { titulo, url, campos, fila }) {   // formulario + lista con editar y activar/desactivar
  let edit = null; const items = (await api('GET', url)).d, m = h('p', { className: 'msg', role: 'alert' });
  const ins = campos.map(c => c.sel ? sel(c.sel) : c.num ? num(c.ph || '', c.max || 9) : h('input', { placeholder: c.ph || '' }));
  const f = h('form', { onsubmit: async ev => { ev.preventDefault(); const b = Object.fromEntries(campos.map((c, i) => [c.k, ins[i].value])); const { ok, d } = edit ? await api('PUT', `${url}/${edit}`, b) : await api('POST', url, b); msg(m, ok, d); if (ok) setTimeout(refrescar, 800); } }, ...campos.map((c, i) => etq(c.etq, ins[i])), h('button', {}, 'Guardar'), m);
  box.append(h('h2', {}, titulo), f, h('ul', {}, ...items.map(it => { const [t, s] = fila(it); return item(t, s, tag(it.activa), btn('Editar', () => { edit = it.id; campos.forEach((c, i) => ins[i].value = it[c.k]); f.scrollIntoView(); m.textContent = `Editando #${it.id}`; }),
    btn(it.activa ? 'Desactivar' : 'Activar', async () => { const { ok, d } = await api('PATCH', `${url}/${it.id}/activa`, { activa: !it.activa }); msg(m, ok, d); if (ok) setTimeout(refrescar, 700); })); })));
}
function vOpc(box) { return crud(box, { titulo: 'HU-ENV-01 · Opciones de envío (HU-ENV-17: activar/desactivar)', url: '/api/opciones',
  campos: [{ k: 'nombre', etq: 'Nombre', ph: 'Exprés' }, { k: 'modalidad', etq: 'Modalidad', sel: [['domicilio', 'Domicilio'], ['punto', 'Recogida en punto']] }, { k: 'tiempo_min', etq: 'Tiempo mínimo (días)', num: 1, max: 2 }, { k: 'tiempo_max', etq: 'Tiempo máximo (días)', num: 1, max: 2 }],
  fila: o => [o.nombre, `${o.modalidad} · ${o.tiempo_min} a ${o.tiempo_max} días`] }); }
function vTrans(box) { return crud(box, { titulo: 'HU-ENV-13 · Transportadoras', url: '/api/transportadoras',
  campos: [{ k: 'nombre', etq: 'Nombre' }, { k: 'nit', etq: 'NIT (solo números y guion)', ph: '900123456-7' }, { k: 'contacto', etq: 'Contacto' }], fila: t => [t.nombre, `NIT ${t.nit} · ${t.contacto}`] }); }

async function vZonas(box) {
  const [zonas, mun, ops] = (await Promise.all(['/api/zonas', '/api/municipios', '/api/opciones'].map(u => api('GET', u)))).map(x => x.d);
  let edit = null; const nom = h('input', { placeholder: 'Cali y área metropolitana' }), m = h('p', { className: 'msg', role: 'alert' });
  const cm = mun.map(x => h('label', { className: 'fila' }, h('input', { type: 'checkbox', value: x.id }), `${x.nombre} (${x.departamento})`));
  const f = h('form', { onsubmit: async ev => { ev.preventDefault(); const b = { nombre: nom.value, municipios: cm.map(l => l.firstChild).filter(c => c.checked).map(c => Number(c.value)) }; const { ok, d } = edit ? await api('PUT', `/api/zonas/${edit}`, b) : await api('POST', '/api/zonas', b); msg(m, ok, d); if (ok) setTimeout(refrescar, 800); } },
    etq('Nombre de la zona', nom), h('div', { className: 'checks ancho' }, ...cm), h('button', {}, 'Guardar zona'), m);
  const res = h('p', { className: 'msg', role: 'alert' });
  box.append(h('h2', {}, 'HU-ENV-14 · Zonas de cobertura'), f, h('h2', {}, 'Zonas y opciones asociadas (HU-ENV-19)'), res, h('ul', {}, ...zonas.map(z => {
    const pick = sel(ops.map(o => [o.id, o.nombre])); const acc = async (p) => { const { ok, d } = await p; msg(res, ok, d); if (ok) setTimeout(refrescar, 800); };
    return h('li', {}, h('div', {}, h('b', {}, z.nombre), ' ', tag(z.activa), h('small', {}, 'Municipios: ' + z.municipios.map(x => x.nombre).join(', ')),
      h('small', {}, 'Opciones: ', ...(z.opciones.length ? z.opciones.flatMap(o => [o.nombre + (o.activa ? '' : ' (inactiva)'), ' ', btn('✕', () => acc(api('DELETE', `/api/zonas/${z.id}/opciones/${o.id}`))), '  ']) : ['ninguna']))),
      h('div', { className: 'acc' }, pick, btn('Asociar opción', () => acc(api('POST', `/api/zonas/${z.id}/opciones`, { opcion_id: pick.value }))),
        btn('Editar', () => { edit = z.id; nom.value = z.nombre; cm.forEach(l => l.firstChild.checked = z.municipios.some(x => x.id == l.firstChild.value)); f.scrollIntoView(); }),
        btn(z.activa ? 'Desactivar' : 'Activar', () => acc(api('PATCH', `/api/zonas/${z.id}/activa`, { activa: !z.activa }))), btn('Eliminar', () => confirm('¿Eliminar la zona?') && acc(api('DELETE', `/api/zonas/${z.id}`)))));
  })));
}

async function vTar(box) {
  const zonas = (await api('GET', '/api/zonas')).d; if (!zonas.length) return box.append(h('p', { className: 'vacio' }, 'Primero crea una zona.'));
  const zs = sel(zonas.map(z => [z.id, z.nombre])), os = h('select'), cont = h('div'), m = h('p', { className: 'msg', role: 'alert' });
  const pintar = async () => {
    if (!os.value) return cont.replaceChildren(h('p', { className: 'vacio' }, 'Esta zona no tiene opciones asociadas.'));
    const [ts, hist] = (await Promise.all([api('GET', `/api/tarifas?zona_id=${zs.value}&opcion_id=${os.value}`), api('GET', '/api/historial-tarifas')])).map(x => x.d);
    const desde = num('0', 3), hasta = num('5', 3), valor = num('8000', 7), fm = h('p', { className: 'msg', role: 'alert' });
    cont.replaceChildren(h('ul', {}, ...ts.map(t => item(`${t.peso_min} – ${t.peso_max} kg`, `$${t.valor.toLocaleString('es-CO')}`, btn('Cambiar valor', async () => { const v = prompt('Nuevo valor (entero, sin decimales):', t.valor); if (v === null) return; const { ok, d } = await api('PATCH', `/api/tarifas/${t.id}`, { valor: v }); msg(m, ok, d); if (ok) pintar(); })))),
      h('form', { onsubmit: async ev => { ev.preventDefault(); const { ok, d } = await api('POST', '/api/tarifas', { zona_id: zs.value, opcion_id: os.value, peso_min: desde.value, peso_max: hasta.value, valor: valor.value }); msg(fm, ok, d); if (ok) pintar(); } }, etq('Peso desde (kg)', desde), etq('Peso hasta (kg)', hasta), etq('Valor (COP)', valor), h('button', {}, 'Agregar rango'), fm),
      h('h2', {}, 'Historial de cambios'), h('ul', {}, ...hist.map(x => item(`${x.detalle}: ${x.valor_anterior == null ? '—' : '$' + x.valor_anterior} → $${x.valor_nuevo}`, `${x.rol} · ${x.fecha}`))));
  };
  const cargarOps = () => { const z = zonas.find(x => x.id == zs.value); os.replaceChildren(...z.opciones.map(o => h('option', { value: o.id }, o.nombre))); pintar(); };
  zs.onchange = cargarOps; os.onchange = pintar;
  box.append(h('h2', {}, 'HU-ENV-04 · Tarifas por zona, opción y peso'), h('div', { className: 'caja' }, etq('Zona', zs), etq('Opción de envío', os)), m, cont); cargarOps();
}
menu();