/**
 * EQ-95: genera datos-semilla/05_catalogo_mensajes_semilla.sql a partir de
 * datos-semilla/mensajes-ia.json, para que el JSON (memoria) y el SQL (PostgreSQL)
 * tengan siempre el mismo catálogo.
 *
 *   node scripts/generar-semilla-catalogo-mensajes.js
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { catalogoDesdeSemilla, validarCatalogo } from '../src/modulos/mensajes-ia/dominio/catalogo.js';

const raiz = new URL('../', import.meta.url);
const mensajes = catalogoDesdeSemilla(JSON.parse(readFileSync(new URL('datos-semilla/mensajes-ia.json', raiz), 'utf8')).mensajes);
const errores = validarCatalogo(mensajes);
if (errores.length) {
  console.error(`El catálogo tiene errores:\n- ${errores.join('\n- ')}`);
  process.exit(1);
}

// Los textos con saltos de línea van como E'…\n…': así la semilla no lleva saltos dentro de
// las comillas y no cambia si Git convierte el archivo a CRLF en Windows.
const lit = (v) => {
  if (v == null) return 'NULL';
  const texto = String(v);
  if (!/[\r\n]/.test(texto)) return `'${texto.replaceAll("'", "''")}'`;
  const escapado = texto.replaceAll('\\', '\\\\').replaceAll("'", "''").replaceAll('\r', '\\r').replaceAll('\n', '\\n');
  return `E'${escapado}'`;
};
const lineas = [
  '-- =========================================================================',
  '-- HU 8 · EQ-95: semilla del catálogo de mensajes (EQ-98/99).',
  '-- GENERADO por scripts/generar-semilla-catalogo-mensajes.js desde',
  '-- datos-semilla/mensajes-ia.json. No editar a mano.',
  '-- Requiere docker/postgres/migrations/05_catalogo_mensajes.sql.',
  '-- Se puede correr más de una vez: reemplaza el catálogo completo.',
  '-- =========================================================================',
  '',
  'BEGIN;',
  '',
  `DELETE FROM mensajes.catalogo_mensaje WHERE id IN (${mensajes.map((m) => lit(m.id)).join(', ')});`,
  '',
];
for (const m of mensajes) {
  lineas.push(
    `INSERT INTO mensajes.catalogo_mensaje (id, categoria, nombre, orden, grupo, pregunta, disparador, canal, requiere_plantilla_meta, plantilla_meta_referencia, plantilla_meta_estado, texto)`,
    `VALUES (${[m.id, m.categoria, m.nombre].map(lit).join(', ')}, ${m.orden}, ${lit(m.grupo)}, ${lit(m.pregunta)}, ${lit(m.disparador)}, ${lit(m.canal)}, ${m.requierePlantillaMeta ? 'TRUE' : 'FALSE'}, ${lit(m.plantillaMeta?.referencia)}, ${lit(m.plantillaMeta?.estado)}, ${lit(m.texto)});`,
  );
  m.variables.forEach((v, i) => lineas.push(`INSERT INTO mensajes.catalogo_variable (mensaje_id, nombre, orden) VALUES (${lit(m.id)}, ${lit(v)}, ${i + 1});`));
  m.llaves.forEach((l, i) => lineas.push(`INSERT INTO mensajes.catalogo_llave (mensaje_id, orden, tipo, valor) VALUES (${lit(m.id)}, ${i + 1}, ${lit(l.tipo)}, ${lit(l.valor)});`));
  m.reglas.forEach((r, i) => lineas.push(`INSERT INTO mensajes.catalogo_regla (mensaje_id, orden, descripcion) VALUES (${lit(m.id)}, ${i + 1}, ${lit(r)});`));
  lineas.push('');
}
lineas.push('COMMIT;', '');

writeFileSync(new URL('datos-semilla/05_catalogo_mensajes_semilla.sql', raiz), lineas.join('\n'));
console.log(`Semilla generada: ${mensajes.length} mensajes.`);
