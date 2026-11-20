/**
 * Genera un lote grande de aspirantes sintéticos para pruebas de RENDIMIENTO
 * (HU2-14 / EQ-39: "rendimiento con miles de aspirantes"), sin tocar el
 * datos-semilla/aspirantes.json que carga `npm start` todos los días.
 *
 * No se usa en el arranque normal: es una herramienta aparte, a pedir.
 *
 * Uso:
 *   node scripts/generar-carga-masiva.js              → 2000 aspirantes
 *   node scripts/generar-carga-masiva.js 10000         → 10000 aspirantes
 *
 * Escribe datos-semilla/aspirantes-carga-masiva.json con la MISMA forma que
 * datos-semilla/aspirantes.json (aspirantes/historial/conversaciones), pero
 * sin historial ni conversaciones (no hace falta para probar listar/filtrar/
 * ordenar/paginar, que es lo que este volumen necesita ejercitar).
 *
 * Para probarlo con el servidor real, aparte y sin perder el dataset normal:
 *   cp datos-semilla/aspirantes.json datos-semilla/aspirantes.respaldo.json
 *   cp datos-semilla/aspirantes-carga-masiva.json datos-semilla/aspirantes.json
 *   npm start
 *   # al terminar la prueba:
 *   cp datos-semilla/aspirantes.respaldo.json datos-semilla/aspirantes.json
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CANTIDAD = Number(process.argv[2]) > 0 ? Number(process.argv[2]) : 2000;
const RUTA_SALIDA = fileURLToPath(new URL("../datos-semilla/aspirantes-carga-masiva.json", import.meta.url));

const PRIMEROS = ["Juan", "Carlos", "Luis", "María Fernanda", "Ana Sofía", "Valeria", "Daniela", "Jorge",
  "Roberto", "Fernando", "Alejandra", "Karla", "Diego", "Ángel", "Iván", "Gabriela", "Andrea", "Patricia"];
const APELLIDOS = ["López", "Martínez", "García", "Hernández", "González", "Rodríguez", "Pérez", "Sánchez",
  "Ramírez", "Flores", "Gómez", "Díaz", "Morales", "Ruiz", "Castro", "Valenzuela", "Cota", "Félix"];
const CAMPUS = ["Campus Obregón Náinari", "Campus Obregón Centro", "Campus Navojoa", "Campus Guaymas"];
const PREPAS = ["CBTIS 37", "COBACH Obregón 1", "CECyTE Esperanza", "CBTIS 188", "CONALEP Navojoa", "COBACH Guaymas"];
const PERIODOS = ["2027-1", "2026-2", "2026-1"];
const CARRERAS_POR_COLAB = {
  "colab-001": ["Ingeniería en Software", "Licenciatura en Administración"],
  "colab-002": ["Ingeniería Industrial", "Licenciatura en Psicología"],
  "colab-003": ["Ingeniería en Software"],
  "colab-004": ["Ingeniería en Software", "Ingeniería Industrial"],
  "colab-005": ["Licenciatura en Administración", "Licenciatura en Psicología"],
};
const COLABORADORES = Object.keys(CARRERAS_POR_COLAB);
const ESTADOS = ["RECIBIDA", "EN_REVISION", "ACEPTADA", "RECHAZADA"];
const SEMAFOROS = ["VERDE", "NARANJA", "ROJO"]; // sin AMARILLO

const elegir = (lista) => lista[Math.floor(Math.random() * lista.length)];
const HOY = new Date("2026-11-13T12:00:00Z");

function fechaAzar(diasAtras) {
  const f = new Date(HOY.getTime() - Math.random() * diasAtras * 86400000);
  return f.toISOString().replace(/\.\d+Z$/, "Z");
}

const aspirantes = [];
for (let i = 0; i < CANTIDAD; i++) {
  const n = i + 1;
  const colaborador = COLABORADORES[i % COLABORADORES.length];
  const carrera = elegir(CARRERAS_POR_COLAB[colaborador]);
  const primero = elegir(PRIMEROS);
  const ap1 = elegir(APELLIDOS);
  const ap2 = elegir(APELLIDOS);
  aspirantes.push({
    id: `carga-${String(n).padStart(6, "0")}`,
    folioSolicitud: `FOL-CARGA-${String(n).padStart(6, "0")}`,
    nombreCompleto: `${primero} ${ap1} ${ap2}`,
    correo: `carga${n}@ejemplo-carga.mx`,
    telefono: `+5264${String(10000000 + (n % 39999999))}`,
    campus: elegir(CAMPUS),
    carreraSolicitada: carrera,
    preparatoriaProcedencia: elegir(PREPAS),
    periodo: elegir(PERIODOS),
    fechaSolicitud: fechaAzar(70),
    estadoSolicitud: elegir(ESTADOS),
    semaforo: elegir(SEMAFOROS),
    colaboradorId: colaborador,
    fechaUltimaActividad: fechaAzar(20),
  });
}

const salida = {
  _descripcion: `Carga sintética de ${CANTIDAD} aspirantes para pruebas de rendimiento (HU2-14/EQ-39). `
    + "No se carga por defecto; ver el comentario al inicio de este script para usarla temporalmente.",
  aspirantes,
  historial: [],
  conversaciones: [],
};

writeFileSync(RUTA_SALIDA, JSON.stringify(salida, null, 1), "utf8");
console.log(`Generados ${CANTIDAD} aspirantes en ${RUTA_SALIDA}`);
