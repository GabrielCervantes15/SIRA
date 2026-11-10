/**
 * Script de validación de sintaxis y estilo básico (Lint liviano sin dependencias externas)
 * Uso: node scripts/lint.js
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const directorios = ["src", "test", "scripts"];
let totalArchivos = 0;
let errores = 0;

async function obtenerArchivosJs(dir) {
  const entradas = await readdir(dir, { withFileTypes: true });
  const archivos = [];
  for (const entrada of entradas) {
    const rutaCompleta = join(dir, entrada.name);
    if (entrada.isDirectory()) {
      archivos.push(...(await obtenerArchivosJs(rutaCompleta)));
    } else if (entrada.isFile() && entrada.name.endsWith(".js")) {
      archivos.push(rutaCompleta);
    }
  }
  return archivos;
}

console.log("🔍 Verificando sintaxis y consistencia de archivos JavaScript...\n");

for (const dir of directorios) {
  try {
    const archivos = await obtenerArchivosJs(dir);
    for (const archivo of archivos) {
      totalArchivos++;
      // Validar sintaxis con node --check
      const resultado = spawnSync(process.execPath, ["--check", archivo], { encoding: "utf8" });
      if (resultado.status !== 0) {
        console.error(`❌ Error de sintaxis en: ${archivo}\n${resultado.stderr}`);
        errores++;
        continue;
      }

      // Validar fin de línea y tabs
      const contenido = await readFile(archivo, "utf8");
      if (contenido.includes("\t")) {
        console.warn(`⚠️ Advertencia: ${archivo} contiene tabuladores en lugar de espacios.`);
      }
    }
  } catch (err) {
    console.error(`Error al procesar directorio ${dir}:`, err.message);
  }
}

if (errores > 0) {
  console.error(`\n❌ Se encontraron ${errores} errores en ${totalArchivos} archivos evaluados.`);
  process.exit(1);
} else {
  console.log(`✅ Verificación completada con éxito. ${totalArchivos} archivos evaluados sin errores.`);
  process.exit(0);
}
