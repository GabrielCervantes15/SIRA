/**
 * Demo del adaptador simulado de Autenticación (BASE-7 / EQ-12).
 * Uso: node scripts/demo-autenticacion.js
 */
import { readFile } from "node:fs/promises";
import {
  crearProveedorAutenticacionSimulado,
  implementaProveedorAutenticacion,
} from "../src/modulos/autenticacion/index.js";

const rutaSemilla = new URL("../datos-semilla/autenticacion.json", import.meta.url);
const semilla = JSON.parse(await readFile(rutaSemilla, "utf8"));

const proveedor = crearProveedorAutenticacionSimulado({
  usuarios: semilla.usuarios,
});

console.log("=== Demo de Autenticación Simulada (Active Directory ITSON) ===\n");
console.log("¿Cumple el contrato IProveedorAutenticacion?", implementaProveedorAutenticacion(proveedor));

// 1. Consulta de datos por ID (HU 6 / HU6-5)
const idPrueba = "00000252115";
console.log(`\n1. Consultando colaborador con ID ${idPrueba}:`);
const perfil = await proveedor.obtenerPorIdInstitucional(idPrueba);
console.log(JSON.stringify(perfil, null, 2));

// 2. Autenticación exitosa
console.log(`\n2. Intentando iniciar sesión con credenciales correctas:`);
const authExitosa = await proveedor.autenticar(idPrueba, "Password123!");
console.log("Resultado:", authExitosa.autenticado ? "✅ AUTENTICADO" : "❌ FALLIDO");

// 3. Autenticación con contraseña incorrecta
console.log(`\n3. Intentando iniciar sesión con contraseña errónea:`);
const authFallida = await proveedor.autenticar(idPrueba, "ContrasenaIncorrecta");
console.log("Resultado:", authFallida.autenticado ? "✅ AUTENTICADO" : `❌ RECHAZADO (${authFallida.motivoFalla})`);

// 4. Consulta de ID inexistente
console.log(`\n4. Consultando colaborador inexistente:`);
const noExiste = await proveedor.obtenerPorIdInstitucional("99999999999");
console.log("Resultado:", noExiste === null ? "✅ Devuelve null correctamente" : "❌ Error inesperado");

// 5. Simulación de caída del servicio de Active Directory
console.log(`\n5. Probando caída del servicio Active Directory:`);
proveedor.simularIndisponibilidad(true);
try {
  await proveedor.obtenerPorIdInstitucional(idPrueba);
} catch (error) {
  console.log(`✅ Error simulado capturado: [${error.codigo}] ${error.message}`);
}
proveedor.simularIndisponibilidad(false);
console.log("\n=== Demo finalizada con éxito ===");

