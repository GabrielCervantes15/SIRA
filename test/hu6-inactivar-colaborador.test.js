/**
 * Pruebas complementarias para EQ-69 / [HU6-10]:
 *   1. Contrato y validador formal del evento `colaboradores.baja.confirmada` (`eventos.js`).
 *   2. Transaccionalidad y compensación en PostgreSQL (`RepositorioColaboradoresPostgres.aplicarBaja`
 *      + `RepositorioMonitoreoPostgres.reasignarCartera` con `BEGIN/COMMIT`, `ROLLBACK` y `deshacer()`).
 *   3. Bloqueo de inicio de sesión (`403 USUARIO_SIN_ACCESO`) en `POST /api/v1/auth/login` cuando un
 *      colaborador ha sido marcado como inactivo mediante `POST /api/v1/colaboradores/:id/baja`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearServidor } from "../src/servidor.js";
import { crearProveedorAutenticacionSimulado } from "../src/modulos/autenticacion/index.js";
import {
  RepositorioMonitoreoPostgres,
} from "../src/modulos/monitoreo/index.js";
import { crearBusEnMemoria } from "../src/compartido/eventos/bus-en-memoria.js";
import {
  crearModuloColaboradores,
  RepositorioColaboradoresPostgres,
  EXCHANGE_EVENTOS,
  EVENTO_BAJA_CONFIRMADA,
  VERSION_EVENTO,
  crearEventoBajaConfirmada,
  validarEventoBajaConfirmada,
} from "../src/modulos/colaboradores/index.js";

const ADMIN = "00000100001";
const ANA = "00000200001";
const BETO = "00000200002";
const NAINARI = "Campus Obregón Náinari";
const SOFTWARE = "Ingeniería en Software";
const INDUSTRIAL = "Ingeniería Industrial";
const ADMINISTRACION = "Licenciatura en Administración";

// ============================================================================
// 1. Contrato y validación formal del evento `colaboradores.baja.confirmada`
// ============================================================================

test("[EQ-69 / HU6-10] 1. crearEventoBajaConfirmada y validarEventoBajaConfirmada validan estructura para bajas indefinidas, por periodo y casos mal formados", () => {
  assert.equal(EXCHANGE_EVENTOS, "crm.eventos");
  assert.equal(EVENTO_BAJA_CONFIRMADA, "colaboradores.baja.confirmada");
  assert.equal(VERSION_EVENTO, 1);

  const eventoIndefinido = crearEventoBajaConfirmada({
    eventId: "evt-baja-test01",
    colaboradorId: ANA,
    nombreCompleto: "Ana Álvarez Ruiz",
    correoInstitucional: "ana.alvarez@itson.edu.mx",
    campus: NAINARI,
    baja: { indefinida: true, desde: "2026-11-26", hasta: null },
    receptores: [
      {
        colaboradorId: BETO,
        nombreCompleto: "Beto Barrios Soto",
        correoInstitucional: "beto.barrios@itson.edu.mx",
        aspirantesRecibidos: 5,
        carrerasRecibidas: [
          { campus: NAINARI, carrera: SOFTWARE, aspirantes: 3 },
          { campus: NAINARI, carrera: INDUSTRIAL, aspirantes: 2 },
        ],
      },
    ],
    realizadoPor: ADMIN,
    fechaConfirmacion: "2026-11-26T18:00:00.000Z",
  });

  assert.equal(validarEventoBajaConfirmada(eventoIndefinido).valido, true);

  const eventoPeriodo = crearEventoBajaConfirmada({
    ...eventoIndefinido,
    baja: { indefinida: false, desde: "2026-11-26", hasta: "2027-01-15" },
  });
  assert.equal(validarEventoBajaConfirmada(eventoPeriodo).valido, true);

  // Casos mal formados
  assert.equal(validarEventoBajaConfirmada(null).valido, false);
  assert.equal(
    validarEventoBajaConfirmada({ ...eventoIndefinido, tipo: "evento.invalido" }).valido,
    false
  );
  assert.equal(
    validarEventoBajaConfirmada({ ...eventoIndefinido, fechaConfirmacion: "no-iso" }).valido,
    false
  );
  assert.equal(
    validarEventoBajaConfirmada({
      ...eventoIndefinido,
      baja: { indefinida: true, desde: "2026-11-26", hasta: "2027-01-15" },
    }).valido,
    false
  );
  assert.equal(
    validarEventoBajaConfirmada({
      ...eventoIndefinido,
      baja: { indefinida: false, desde: "2026-11-26", hasta: null },
    }).valido,
    false
  );
  assert.equal(
    validarEventoBajaConfirmada({
      ...eventoIndefinido,
      receptores: [{ colaboradorId: "", aspirantesRecibidos: -1, carrerasRecibidas: null }],
    }).valido,
    false
  );
});

// ============================================================================
// 2. Transacción PostgreSQL y compensación saga en ConfirmarBajaCasoUso
// ============================================================================

test("[EQ-69 / HU6-10] 2. Adaptadores PostgreSQL ejecutan BEGIN/COMMIT en ConfirmarBajaCasoUso (aplicarBaja + reasignarCartera) y hacen ROLLBACK + deshacer() si falla la bitácora", async () => {
  const sentenciasUsuarios = [];
  const sentenciasAspirantes = [];
  let fallarBitacora = false;

  const clienteUsuarios = {
    async query(sql, params) {
      const limpia = sql.trim().replace(/\s+/g, " ");
      sentenciasUsuarios.push({ sql: limpia, params });

      if (fallarBitacora && limpia.includes("INSERT INTO usuarios.bitacora_transferencia")) {
        throw new Error("Error PG simulado en bitacora_transferencia");
      }
      if (limpia.includes("WHERE u.id_directorio = $1")) {
        return {
          rows: [
            {
              id: "uuid-ana",
              idInstitucional: ANA,
              rol: "colaborador",
              estado: "activo",
              campusId: 1,
              casosEspeciales: false,
              bajaDesde: null,
              bajaHasta: null,
              fechaRegistro: "2026-08-01T10:00:00.000Z",
              carrerasIds: [10, 20],
            },
          ],
        };
      }
      if (limpia.includes("WHERE u.rol = 'colaborador'")) {
        return {
          rows: [
            {
              id: "uuid-ana",
              idInstitucional: ANA,
              rol: "colaborador",
              estado: "activo",
              campusId: 1,
              casosEspeciales: false,
              bajaDesde: null,
              bajaHasta: null,
              fechaRegistro: "2026-08-01T10:00:00.000Z",
              carrerasIds: [10, 20],
            },
            {
              id: "uuid-beto",
              idInstitucional: BETO,
              rol: "colaborador",
              estado: "activo",
              campusId: 1,
              casosEspeciales: false,
              bajaDesde: null,
              bajaHasta: null,
              fechaRegistro: "2026-08-02T10:00:00.000Z",
              carrerasIds: [30],
            },
          ],
        };
      }
      if (limpia.startsWith("UPDATE usuarios.usuario SET estado = 'inactivo', baja_desde")) {
        return { rows: [{ id: "uuid-ana" }] };
      }
      return { rows: [] };
    },
    release() {},
  };

  const dbAspirantes = {
    async query(sql, params) {
      const limpia = sql.trim().replace(/\s+/g, " ");
      sentenciasAspirantes.push({ sql: limpia, params });

      if (limpia.includes("GROUP BY campus, carrera_solicitada")) {
        return {
          rows: [
            { campus: NAINARI, carrera: SOFTWARE, aspirantes: 2 },
            { campus: NAINARI, carrera: INDUSTRIAL, aspirantes: 1 },
          ],
        };
      }
      if (limpia.includes("GROUP BY colaborador_id")) {
        return {
          rows: [
            { colaboradorId: ANA, total: 3 },
            { colaboradorId: BETO, total: 1 },
          ],
        };
      }
      if (limpia.startsWith("WITH mov AS")) {
        return {
          rows: [
            { aspiranteId: "asp-1", colaboradorDestino: BETO },
            { aspiranteId: "asp-2", colaboradorDestino: BETO },
            { aspiranteId: "asp-3", colaboradorDestino: BETO },
          ],
        };
      }
      return { rows: [] };
    },
  };

  const catalogoIds = {
    idCampus: (n) => ({ [NAINARI]: 1 })[n],
    nombreCampus: (id) => ({ 1: NAINARI })[id],
    idCarrera: (n) => ({ [SOFTWARE]: 10, [INDUSTRIAL]: 20, [ADMINISTRACION]: 30 })[n],
    nombreCarrera: (id) => ({ 10: SOFTWARE, 20: INDUSTRIAL, 30: ADMINISTRACION })[id],
  };

  const repoColabPg = new RepositorioColaboradoresPostgres({
    db: { query: clienteUsuarios.query, connect: async () => clienteUsuarios },
    catalogoIds,
  });
  const repoMonPg = new RepositorioMonitoreoPostgres({ db: dbAspirantes });
  const bus = crearBusEnMemoria();

  const moduloPg = crearModuloColaboradores({
    proveedorAutenticacion: crearProveedorAutenticacionSimulado({ usuarios: [] }),
    cartera: {
      idInstitucionalDe: (id) => repoMonPg.idInstitucionalDe(id),
      contarPorColaborador: () => repoMonPg.contarAspirantesPorColaborador(),
      carteraPorCarrera: (id) => repoMonPg.carteraPorCarrera(id),
      reasignarCartera: (p) => repoMonPg.reasignarCartera(p),
    },
    catalogo: { listarCampus: () => [NAINARI], contieneCampus: () => true, contieneCarrera: () => true },
    bus,
    repositorio: repoColabPg,
    reloj: () => new Date("2026-11-26T18:00:00.000Z"),
  });

  // 1. Ejecución exitosa en PostgreSQL
  const ok = await moduloPg.confirmarBaja.ejecutar(
    { idInstitucional: ANA, tipo: "indefinido" },
    { administradorId: ADMIN }
  );
  assert.equal(ok.confirmado, true);
  assert.equal(validarEventoBajaConfirmada(ok.evento).valido, true);
  assert.ok(sentenciasUsuarios.some((s) => s.sql === "BEGIN"));
  assert.ok(
    sentenciasUsuarios.some((s) =>
      s.sql.startsWith("UPDATE usuarios.usuario SET estado = 'inactivo', baja_desde")
    )
  );
  assert.ok(
    sentenciasUsuarios.some((s) =>
      s.sql.startsWith("DELETE FROM usuarios.colaborador_carrera WHERE usuario_id = $1")
    )
  );
  assert.ok(
    sentenciasUsuarios.some((s) =>
      s.sql.startsWith("INSERT INTO usuarios.colaborador_carrera")
    )
  );
  assert.ok(
    sentenciasUsuarios.some((s) =>
      s.sql.startsWith("INSERT INTO usuarios.bitacora_transferencia")
    )
  );
  assert.equal(sentenciasUsuarios.at(-1).sql, "COMMIT");

  // 2. Fallo en bitácora -> ROLLBACK en usuarios y compensación deshacer() en aspirantes
  sentenciasUsuarios.length = 0;
  sentenciasAspirantes.length = 0;
  fallarBitacora = true;

  await assert.rejects(
    moduloPg.confirmarBaja.ejecutar(
      { idInstitucional: ANA, tipo: "indefinido" },
      { administradorId: ADMIN }
    ),
    /Error PG simulado en bitacora_transferencia/
  );
  assert.equal(sentenciasUsuarios.at(-1).sql, "ROLLBACK");
  assert.ok(
    sentenciasAspirantes.at(-1).sql.includes("UPDATE aspirantes.aspirantes SET colaborador_id = $1 WHERE id = ANY($2::text[])"),
    "Debe ejecutar deshacer() en PostgreSQL para restaurar colaborador_id"
  );
});

// ============================================================================
// 3. Bloqueo de login (403 USUARIO_SIN_ACCESO) tras dar de baja a un colaborador
// ============================================================================

test("[EQ-69 / HU6-10] 3. Un colaborador dado de baja mediante POST /api/v1/colaboradores/:id/baja pierde acceso para iniciar sesión en POST /api/v1/auth/login (403 USUARIO_SIN_ACCESO)", async () => {
  const servidor = crearServidor({});
  await new Promise((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${servidor.address().port}`;

  try {
    const idSebas = "00000252115";

    // 1. Antes de la baja, Sebastián puede iniciar sesión normalmente
    const loginAntes = await fetch(`${base}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identificador: idSebas, password: "Password123!" }),
    });
    assert.equal(loginAntes.status, 200);

    // 2. El administrador da de baja a Sebastián
    const loginAdmin = await fetch(`${base}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identificador: ADMIN, password: "AdminPassword2026!" }),
    });
    assert.equal(loginAdmin.status, 200);
    const cookieAdmin = loginAdmin.headers.get("set-cookie").split(";")[0];

    const bajaRes = await fetch(`${base}/api/v1/colaboradores/${idSebas}/baja`, {
      method: "POST",
      headers: { Cookie: cookieAdmin, "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "indefinido" }),
    });
    assert.equal(bajaRes.status, 200);
    const bajaCuerpo = await bajaRes.json();
    assert.equal(bajaCuerpo.confirmado, true);
    assert.equal(validarEventoBajaConfirmada(bajaCuerpo.evento).valido, true);

    // 3. Al intentar iniciar sesión después de la baja, recibe 403 USUARIO_SIN_ACCESO
    const loginDespues = await fetch(`${base}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identificador: idSebas, password: "Password123!" }),
    });
    assert.equal(loginDespues.status, 403);
    const errorLogin = await loginDespues.json();
    assert.equal(errorLogin.codigo, "USUARIO_SIN_ACCESO");
    assert.match(errorLogin.mensaje, /inactiva/i);
  } finally {
    await new Promise((resolve) => servidor.close(resolve));
  }
});
