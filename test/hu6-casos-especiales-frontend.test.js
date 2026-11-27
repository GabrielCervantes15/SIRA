/**
 * Pruebas unitarias, estructurales y de integración HTTP para EQ-73 / [HU6-19]:
 * Front end — casilla de casos especiales en el perfil y pantalla de transferencia
 * manual de expedientes conectada al backend real de EQ-70.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crearServidor } from "../src/servidor.js";
import {
  aspiranteIdValido,
  filtrarColaboradoresCasosEspeciales,
  puedeTransferirManual,
  describirErrorTransferencia,
} from "../frontend/colaboradores/validaciones.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const ADMIN = { identificador: "00000100001", password: "AdminPassword2026!" };
const COLABORADOR = { identificador: "00000252115", password: "Password123!" };

// ============================================================================
// 1. Pruebas Unitarias de Funciones Puras (validaciones.js · CP-HU6-18)
// ============================================================================

test("[EQ-73 / HU6-19] 1.1 aspiranteIdValido valida identificadores internos entre 1 y 50 caracteres", () => {
  assert.equal(aspiranteIdValido("asp-003"), true);
  assert.equal(aspiranteIdValido("  asp-centro-01  "), true);
  assert.equal(aspiranteIdValido("a"), true);
  assert.equal(aspiranteIdValido("a".repeat(50)), true);

  assert.equal(aspiranteIdValido(""), false);
  assert.equal(aspiranteIdValido("   "), false);
  assert.equal(aspiranteIdValido("a".repeat(51)), false);
  assert.equal(aspiranteIdValido(null), false);
  assert.equal(aspiranteIdValido(undefined), false);
  assert.equal(aspiranteIdValido(12345), false);
});

test("[EQ-73 / HU6-19 / CP-HU6-18] 1.2 filtrarColaboradoresCasosEspeciales incluye solo perfiles activos con casosEspeciales=true y filtra por campus y búsqueda sin acentos", () => {
  const colaboradores = [
    {
      idInstitucional: "00000252115",
      nombreCompleto: "Sebastián Bórquez Huerta",
      campus: "Campus Obregón Náinari",
      activo: true,
      casosEspeciales: true,
    },
    {
      idInstitucional: "00000233231",
      nombreCompleto: "Leonel Carballo",
      campus: "Campus Obregón Centro",
      activo: true,
      casosEspeciales: false, // Sin casilla activa -> excluido (CP-HU6-18)
    },
    {
      idInstitucional: "00000247933",
      nombreCompleto: "Nomar Alberto Limón Quintero",
      campus: "Campus Navojoa",
      activo: false, // Inactivo aunque tenga casilla -> excluido
      casosEspeciales: true,
    },
    {
      idInstitucional: "00000252390",
      nombreCompleto: "Gabriel Cervantes",
      campus: "Campus Obregón Náinari",
      activo: true,
      casosEspeciales: true,
    },
  ];

  const elegibles = filtrarColaboradoresCasosEspeciales(colaboradores);
  assert.deepEqual(
    elegibles.map((c) => c.idInstitucional),
    ["00000252115", "00000252390"]
  );

  // Búsqueda por nombre sin acentos ni mayúsculas
  const porNombre = filtrarColaboradoresCasosEspeciales(colaboradores, {
    busqueda: "borquez",
  });
  assert.deepEqual(
    porNombre.map((c) => c.idInstitucional),
    ["00000252115"]
  );

  // Búsqueda por ID institucional
  const porId = filtrarColaboradoresCasosEspeciales(colaboradores, {
    busqueda: "252390",
  });
  assert.deepEqual(
    porId.map((c) => c.idInstitucional),
    ["00000252390"]
  );

  // Filtro por campus sin coincidencias autorizadas
  const porCampusSinElegibles = filtrarColaboradoresCasosEspeciales(colaboradores, {
    campus: "Campus Obregón Centro",
  });
  assert.deepEqual(porCampusSinElegibles, []);
});

test("[EQ-73 / HU6-19 / CP-HU6-18] 1.3 puedeTransferirManual exige expediente válido, sin envío en curso y colaborador destino activo con casosEspeciales=true", () => {
  const colaboradores = [
    { idInstitucional: "00000252115", activo: true, casosEspeciales: true },
    { idInstitucional: "00000233231", activo: true, casosEspeciales: false },
    { idInstitucional: "00000247933", activo: false, casosEspeciales: true },
  ];

  assert.equal(
    puedeTransferirManual({
      aspiranteId: "asp-003",
      colaboradorDestino: "00000252115",
      colaboradores,
      enviando: false,
    }),
    true
  );

  // Rechaza si está enviando
  assert.equal(
    puedeTransferirManual({
      aspiranteId: "asp-003",
      colaboradorDestino: "00000252115",
      colaboradores,
      enviando: true,
    }),
    false
  );

  // Rechaza si el colaborador destino no tiene activa la casilla casosEspeciales (CP-HU6-18)
  assert.equal(
    puedeTransferirManual({
      aspiranteId: "asp-003",
      colaboradorDestino: "00000233231",
      colaboradores,
    }),
    false
  );

  // Rechaza si el colaborador destino está inactivo
  assert.equal(
    puedeTransferirManual({
      aspiranteId: "asp-003",
      colaboradorDestino: "00000247933",
      colaboradores,
    }),
    false
  );

  // Rechaza si falta aspiranteId o supera 50 caracteres
  assert.equal(
    puedeTransferirManual({
      aspiranteId: "   ",
      colaboradorDestino: "00000252115",
      colaboradores,
    }),
    false
  );
});

test("[EQ-73 / HU6-19] 1.4 describirErrorTransferencia mapea los códigos reales de EQ-70 y conserva fallback", () => {
  assert.match(describirErrorTransferencia("MISMO_CAMPUS"), /campus diferentes/i);
  assert.match(
    describirErrorTransferencia("COLABORADOR_SIN_CASOS_ESPECIALES"),
    /Casos especiales/i
  );
  assert.match(describirErrorTransferencia("ASPIRANTE_NO_ENCONTRADO"), /no el folio/i);
  assert.match(describirErrorTransferencia("YA_ASIGNADO"), /ya se encuentra asignado/i);
  assert.equal(
    describirErrorTransferencia("CODIGO_DESCONOCIDO", "Error específico del servidor."),
    "Error específico del servidor."
  );
});

// ============================================================================
// 2. Verificación Estructural de Vistas y Contratos de Frontend
// ============================================================================

test("[EQ-73 / HU6-19] 2.1 Separación de vistas: registro.html expone acceso a transferencia manual; listado.html (colaborador) no expone controles administrativos", () => {
  const htmlAdmin = readFileSync(
    path.join(ROOT, "frontend/colaboradores/registro.html"),
    "utf8"
  );
  const htmlColaborador = readFileSync(
    path.join(ROOT, "frontend/colaboradores/listado.html"),
    "utf8"
  );
  const jsListado = readFileSync(
    path.join(ROOT, "frontend/colaboradores/listado-colaboradores.js"),
    "utf8"
  );
  const jsTransferencia = readFileSync(
    path.join(ROOT, "frontend/colaboradores/transferencia.js"),
    "utf8"
  );

  // 1. registro.html (admin) incluye el enlace a /app/colaboradores/transferencia.html y estado aria-live
  assert.match(htmlAdmin, /href="\/app\/colaboradores\/transferencia\.html"/);
  assert.match(htmlAdmin, /id="estado-casos-especiales"/);

  // 2. listado.html (colaborador) NO incluye enlace a transferencia.html
  assert.doesNotMatch(htmlColaborador, /transferencia\.html/);

  // 3. listado-colaboradores.js consume PATCH /api/v1/colaboradores/:id/casos-especiales solo para esAdministrador
  assert.match(jsListado, /\/api\/v1\/colaboradores\/\$\{encodeURIComponent\(c\.idInstitucional\)\}\/casos-especiales/);
  assert.match(jsListado, /method:\s*'PATCH'/);
  assert.match(jsListado, /Casos especiales \(otros campus\)/);

  // 4. transferencia.js consume GET /api/v1/colaboradores y POST /api/v1/colaboradores/transferencias-manuales
  assert.match(jsTransferencia, /\/api\/v1\/colaboradores\/transferencias-manuales/);
  assert.match(jsTransferencia, /method:\s*'POST'/);
});

// ============================================================================
// 3. Pruebas HTTP de Autorización y Flujo End-to-End con el Servidor Real
// ============================================================================

async function conServidor(opciones, fn) {
  const servidor = crearServidor(opciones);
  await new Promise((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    await fn({ base, servidor });
  } finally {
    await new Promise((resolve) => servidor.close(resolve));
  }
}

async function login(base, credenciales) {
  const r = await fetch(`${base}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credenciales),
  });
  assert.equal(r.status, 200);
  return r.headers.get("set-cookie").split(";")[0];
}

test("[EQ-73 / HU6-19] 3.1 Autorización de archivos de transferencia manual: 401 sin sesión, 403 para colaborador y 200 para administrador, y flujo completo PATCH casilla -> GET listado -> POST transferencia", async () => {
  await conServidor({}, async ({ base }) => {
    const rutasTransferencia = [
      "/app/colaboradores/transferencia.html",
      "/app/colaboradores/transferencia.js",
      "/app/colaboradores/transferencia.css",
    ];

    // 1. Sin sesión -> 401 SESION_NO_VALIDA
    for (const ruta of rutasTransferencia) {
      const res = await fetch(`${base}${ruta}`);
      assert.equal(res.status, 401, `Sin sesión debe rechazar ${ruta} con 401`);
    }

    // 2. Con rol colaborador -> 403 SIN_PERMISO
    const cookieColab = await login(base, COLABORADOR);
    for (const ruta of rutasTransferencia) {
      const res = await fetch(`${base}${ruta}`, {
        headers: { Cookie: cookieColab },
      });
      assert.equal(res.status, 403, `Rol colaborador debe rechazar ${ruta} con 403`);
    }

    // 3. Con rol administrador -> 200 OK en los 3 recursos
    const cookieAdmin = await login(base, ADMIN);
    for (const ruta of rutasTransferencia) {
      const res = await fetch(`${base}${ruta}`, {
        headers: { Cookie: cookieAdmin },
      });
      assert.equal(res.status, 200, `Rol administrador debe servir ${ruta} con 200`);
    }

    // 4. Flujo real conectado a EQ-70:
    //    a) Al inicio ningún colaborador tiene casosEspeciales=true
    const listadoInicial = await (
      await fetch(`${base}/api/v1/colaboradores`, {
        headers: { Cookie: cookieAdmin },
      })
    ).json();
    assert.deepEqual(
      filtrarColaboradoresCasosEspeciales(listadoInicial.colaboradores),
      []
    );

    //    b) Si se intenta transferir sin activar la casilla -> 409 COLABORADOR_SIN_CASOS_ESPECIALES
    const intentoSinCasilla = await fetch(
      `${base}/api/v1/colaboradores/transferencias-manuales`,
      {
        method: "POST",
        headers: {
          Cookie: cookieAdmin,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          aspiranteId: "asp-003",
          colaboradorDestino: "00000252115",
        }),
      }
    );
    assert.equal(intentoSinCasilla.status, 409);
    const errSinCasilla = await intentoSinCasilla.json();
    assert.equal(errSinCasilla.codigo, "COLABORADOR_SIN_CASOS_ESPECIALES");

    //    c) El administrador activa la casilla de Sebastián (00000252115, Campus Obregón Náinari)
    const activarRes = await fetch(
      `${base}/api/v1/colaboradores/00000252115/casos-especiales`,
      {
        method: "PATCH",
        headers: {
          Cookie: cookieAdmin,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ casosEspeciales: true }),
      }
    );
    assert.equal(activarRes.status, 200);

    //    d) Ahora GET /api/v1/colaboradores devuelve a Sebastián con casosEspeciales=true y pasa el filtro de transferencia.js
    const listadoActualizado = await (
      await fetch(`${base}/api/v1/colaboradores`, {
        headers: { Cookie: cookieAdmin },
      })
    ).json();
    const autorizados = filtrarColaboradoresCasosEspeciales(
      listadoActualizado.colaboradores
    );
    assert.equal(autorizados.length, 1);
    assert.equal(autorizados[0].idInstitucional, "00000252115");
    const cargaAntes = autorizados[0].totalAspirantes;

    //    e) Transferir expediente foráneo asp-003 (Campus Obregón Centro) hacia Sebastián (Campus Obregón Náinari)
    assert.equal(
      puedeTransferirManual({
        aspiranteId: "asp-003",
        colaboradorDestino: "00000252115",
        colaboradores: listadoActualizado.colaboradores,
      }),
      true
    );

    const transferirRes = await fetch(
      `${base}/api/v1/colaboradores/transferencias-manuales`,
      {
        method: "POST",
        headers: {
          Cookie: cookieAdmin,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          aspiranteId: "asp-003",
          colaboradorDestino: "00000252115",
        }),
      }
    );
    assert.equal(transferirRes.status, 200);
    const transferenciaJson = await transferirRes.json();
    assert.equal(transferenciaJson.transferido, true);
    assert.equal(transferenciaJson.transferencia.aspiranteId, "asp-003");
    assert.equal(transferenciaJson.transferencia.colaboradorDestino, "00000252115");

    //    f) Al recargar el listado, la cartera de Sebastián subió en +1
    const listadoFinal = await (
      await fetch(`${base}/api/v1/colaboradores`, {
        headers: { Cookie: cookieAdmin },
      })
    ).json();
    const sebasFinal = listadoFinal.colaboradores.find(
      (c) => c.idInstitucional === "00000252115"
    );
    assert.equal(sebasFinal.totalAspirantes, cargaAntes + 1);
  });
});
