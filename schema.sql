-- MVP Módulo de Envíos (Sprint 1 + Sprint 2) · SQLite
-- SPRINT 1 · HU-ENV-14 zonas y municipios
CREATE TABLE IF NOT EXISTS Municipio (id INTEGER PRIMARY KEY, departamento TEXT NOT NULL, nombre TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS Zona (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL UNIQUE, activa INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS ZonaMunicipio (zona_id INTEGER NOT NULL REFERENCES Zona(id) ON DELETE CASCADE, municipio_id INTEGER NOT NULL REFERENCES Municipio(id), PRIMARY KEY (zona_id, municipio_id));
-- SPRINT 1 · HU-ENV-01 opciones de envío y HU-ENV-19 asociación zona-opción
CREATE TABLE IF NOT EXISTS OpcionEnvio (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL UNIQUE, modalidad TEXT NOT NULL CHECK (modalidad IN ('domicilio','punto')), tiempo_min INTEGER NOT NULL, tiempo_max INTEGER NOT NULL, activa INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS ZonaOpcion (zona_id INTEGER NOT NULL REFERENCES Zona(id) ON DELETE CASCADE, opcion_id INTEGER NOT NULL REFERENCES OpcionEnvio(id), PRIMARY KEY (zona_id, opcion_id));
-- SPRINT 1 · HU-ENV-04 tarifas por zona, opción y peso (kg) + historial
CREATE TABLE IF NOT EXISTS Tarifa (id INTEGER PRIMARY KEY AUTOINCREMENT, zona_id INTEGER NOT NULL REFERENCES Zona(id) ON DELETE CASCADE, opcion_id INTEGER NOT NULL REFERENCES OpcionEnvio(id), peso_min INTEGER NOT NULL, peso_max INTEGER NOT NULL, valor INTEGER NOT NULL CHECK (valor >= 0));
CREATE TABLE IF NOT EXISTS HistorialTarifa (id INTEGER PRIMARY KEY AUTOINCREMENT, tarifa_id INTEGER NOT NULL, detalle TEXT NOT NULL, valor_anterior INTEGER, valor_nuevo INTEGER NOT NULL, rol TEXT NOT NULL, fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
-- SPRINT 1 · HU-ENV-13 transportadoras
CREATE TABLE IF NOT EXISTS Transportadora (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, nit TEXT NOT NULL UNIQUE, contacto TEXT NOT NULL, activa INTEGER NOT NULL DEFAULT 1);
-- SPRINT 1 · HU-ENV-21 peso y dimensiones del producto / SPRINT 2 · HU-ENV-22 opciones por producto
CREATE TABLE IF NOT EXISTS Producto (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, peso_kg REAL, largo_cm REAL, ancho_cm REAL, alto_cm REAL);
CREATE TABLE IF NOT EXISTS ProductoOpcion (producto_id INTEGER NOT NULL REFERENCES Producto(id), opcion_id INTEGER NOT NULL REFERENCES OpcionEnvio(id), PRIMARY KEY (producto_id, opcion_id));
-- SPRINT 2 · HU-ENV-03 dirección y destinatario
CREATE TABLE IF NOT EXISTS Direccion (id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER NOT NULL, tipo_entrega TEXT NOT NULL CHECK (tipo_entrega IN ('domicilio','punto')), municipio_id INTEGER REFERENCES Municipio(id), via TEXT, placa TEXT, complemento TEXT, direccion TEXT NOT NULL, verificada_por TEXT, predeterminada INTEGER NOT NULL DEFAULT 0, acepta_politica INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS Destinatario (id INTEGER PRIMARY KEY AUTOINCREMENT, direccion_id INTEGER NOT NULL UNIQUE REFERENCES Direccion(id) ON DELETE CASCADE, nombre TEXT NOT NULL, cedula TEXT NOT NULL, celular TEXT NOT NULL);
-- Simulación del módulo Órdenes/Pagos (F05): el pedido guarda COPIA de opción, costo y dirección
CREATE TABLE IF NOT EXISTS Pedido (id INTEGER PRIMARY KEY, cliente_id INTEGER NOT NULL, estado TEXT NOT NULL, opcion_envio TEXT, costo_envio INTEGER, direccion_copia TEXT, destinatario_copia TEXT);

-- Datos de ejemplo (simulan módulos de otros equipos y dejan el MVP listo para probar)
INSERT OR IGNORE INTO Municipio VALUES (1,'Valle del Cauca','Cali'),(2,'Valle del Cauca','Yumbo'),(3,'Valle del Cauca','Jamundí'),(4,'Valle del Cauca','Palmira'),(5,'Cundinamarca','Bogotá D.C.'),(6,'Cundinamarca','Soacha'),(7,'Cundinamarca','Chía'),(8,'Antioquia','Medellín'),(9,'Antioquia','Envigado'),(10,'Antioquia','Bello');
INSERT OR IGNORE INTO Zona (id,nombre,activa) VALUES (1,'Cali y área metropolitana',1);
INSERT OR IGNORE INTO ZonaMunicipio VALUES (1,1),(1,2),(1,3),(1,4);
INSERT OR IGNORE INTO OpcionEnvio (id,nombre,modalidad,tiempo_min,tiempo_max,activa) VALUES (1,'Normal','domicilio',2,4,1),(2,'Recoger en tienda','punto',0,1,1);
INSERT OR IGNORE INTO ZonaOpcion VALUES (1,1),(1,2);
INSERT OR IGNORE INTO Tarifa (id,zona_id,opcion_id,peso_min,peso_max,valor) VALUES (1,1,1,0,5,8000),(2,1,1,5,15,14000),(3,1,2,0,50,0);
INSERT OR IGNORE INTO Transportadora (id,nombre,nit,contacto) VALUES (1,'Transportadora Demo','900000001-1','Línea 3001234567');
INSERT OR IGNORE INTO Producto VALUES (1,'Camiseta',0.3,30,25,3),(2,'Audífonos',NULL,NULL,NULL,NULL);
INSERT OR IGNORE INTO ProductoOpcion VALUES (1,1);
INSERT OR IGNORE INTO Pedido VALUES (1,1,'Pago confirmado','Normal',8000,NULL,NULL),(2,1,'Enviado','Normal',8000,'Calle 9 # 4-10, Cali','Ana Pérez - 3001112233');
