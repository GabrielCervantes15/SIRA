import { test } from "node:test";
import assert from "node:assert/strict";
import { RepositorioMonitoreoMemoria } from "../src/modulos/monitoreo/infraestructura/repositorio-monitoreo-memoria.js";
import { ObtenerActividadesAspiranteCasoUso } from "../src/modulos/monitoreo/aplicacion/obtener-actividades-aspirante.caso-uso.js";

const COLABORADOR = "00000252115"; // alias colab-001

function crearCasoUso(historial = HISTORIAL) {
  const repositorio = new RepositorioMonitoreoMemoria({
    aspirantes: [
      { id: "asp-015", nombreCompleto: "Jorge Propio", colaboradorId: "colab-001" },
      { id: "asp-099", nombreCompleto: "Aspirante Ajeno", colaboradorId: "colab-002" },
      { id: "asp-020", nombreCompleto: "Sin Historial", colaboradorId: "colab-001" },
    ],
    historial,
  });
  return new ObtenerActividadesAspiranteCasoUso({ repositorioMonitoreo: repositorio });
}

const HISTORIAL = [
  {
    id: "h0150000-0000-0000-0000-000000000001",
    aspiranteId: "asp-015",
    tipoEvento: "CAMBIO_ESTADO",
    titulo: "Solicitud Recibida",
    detalle: "Registro Escolar recibió la postulación de Jorge para Ingeniería en Software.",
    motivoRechazo: null,
    autorTipo: "REGISTRO_ESCOLAR",
    fechaEvento: "2026-09-10T19:07:58Z",
  },
  {
    id: "h0150000-0000-0000-0000-000000000002",
    aspiranteId: "asp-015",
    tipoEvento: "CONSTANCIA_ENTREGADA",
    titulo: "Constancia de Estudios Adjuntada",
    detalle: "Jorge subió su constancia de bachillerato al portal de aspirantes.",
    motivoRechazo: null,
    autorTipo: "SISTEMA",
    fechaEvento: "2026-09-12T20:35:27Z",
  },
  {
    id: "h0150000-0000-0000-0000-000000000003",
    aspiranteId: "asp-015",
    tipoEvento: "RECHAZO_SOLICITUD",
    titulo: "Documento Rechazado por Registro Escolar",
    detalle: "El documento presentado no cumple los requisitos.",
    motivoRechazo: "El promedio reportado no coincide con el documento oficial",
    autorTipo: "REGISTRO_ESCOLAR",
    fechaEvento: "2026-09-14T06:06:50Z",
  },
  {
    id: "h0990000-0000-0000-0000-000000000001",
    aspiranteId: "asp-099",
    tipoEvento: "CAMBIO_ESTADO",
    titulo: "Solicitud Recibida",
    detalle: "Actividad de otro aspirante.",
    motivoRechazo: null,
    autorTipo: "REGISTRO_ESCOLAR",
    fechaEvento: "2026-09-11T10:00:00Z",
  },
];

test("[EQ-43] actividades propias: salen de la más reciente a la más antigua con id, tipo, fecha y texto", async () => {
  const casoUso = crearCasoUso();
  const { actividades } = await casoUso.ejecutar({ colaboradorId: COLABORADOR, aspiranteId: "asp-015" });

  assert.deepEqual(
    actividades.map((a) => a.id),
    [
      "h0150000-0000-0000-0000-000000000003",
      "h0150000-0000-0000-0000-000000000002",
      "h0150000-0000-0000-0000-000000000001",
    ],
  );
  assert.deepEqual(Object.keys(actividades[0]).sort(), ["fecha", "id", "texto", "tipo"]);
  assert.equal(actividades[2].tipo, "CAMBIO_ESTADO");
  assert.equal(actividades[2].fecha, "2026-09-10T19:07:58Z");
  assert.equal(
    actividades[2].texto,
    "Solicitud Recibida — Registro Escolar recibió la postulación de Jorge para Ingeniería en Software.",
  );
});

test("[EQ-43] no mezcla actividades de otros aspirantes", async () => {
  const casoUso = crearCasoUso();
  const { actividades } = await casoUso.ejecutar({ colaboradorId: COLABORADOR, aspiranteId: "asp-015" });
  assert.equal(actividades.length, 3);
  assert.equal(actividades.some((a) => a.id.startsWith("h099")), false);
});

test("[EQ-43] con la misma fecha desempata por id descendente", async () => {
  const casoUso = crearCasoUso([
    { id: "h-a", aspiranteId: "asp-015", tipoEvento: "CAMBIO_ESTADO", titulo: "A", fechaEvento: "2026-10-01T10:00:00Z" },
    { id: "h-b", aspiranteId: "asp-015", tipoEvento: "CAMBIO_ESTADO", titulo: "B", fechaEvento: "2026-10-01T10:00:00Z" },
  ]);
  const { actividades } = await casoUso.ejecutar({ colaboradorId: COLABORADOR, aspiranteId: "asp-015" });
  assert.deepEqual(actividades.map((a) => a.id), ["h-b", "h-a"]);
});

test("[EQ-43] el rango de fechas incluye los extremos", async () => {
  const casoUso = crearCasoUso();
  const { actividades } = await casoUso.ejecutar({
    colaboradorId: COLABORADOR,
    aspiranteId: "asp-015",
    desde: "2026-09-12T20:35:27Z",
    hasta: "2026-09-14T06:06:50Z",
  });
  assert.deepEqual(
    actividades.map((a) => a.id),
    ["h0150000-0000-0000-0000-000000000003", "h0150000-0000-0000-0000-000000000002"],
  );
});

test("[EQ-43] rango con una sola cota: solo desde o solo hasta", async () => {
  const casoUso = crearCasoUso();
  const soloDesde = await casoUso.ejecutar({
    colaboradorId: COLABORADOR, aspiranteId: "asp-015", desde: "2026-09-13T00:00:00Z",
  });
  assert.equal(soloDesde.actividades.length, 1);

  const soloHasta = await casoUso.ejecutar({
    colaboradorId: COLABORADOR, aspiranteId: "asp-015", hasta: "2026-09-11T00:00:00Z",
  });
  assert.equal(soloHasta.actividades.length, 1);
});

test("[EQ-43] rango inválido o invertido: 400 PARAMETRO_INVALIDO", async () => {
  const casoUso = crearCasoUso();
  const esperar400 = (err) => {
    assert.equal(err.status, 400);
    assert.equal(err.codigo, "PARAMETRO_INVALIDO");
    return true;
  };

  await assert.rejects(
    () => casoUso.ejecutar({ colaboradorId: COLABORADOR, aspiranteId: "asp-015", desde: "no-es-fecha" }),
    esperar400,
  );
  await assert.rejects(
    () => casoUso.ejecutar({ colaboradorId: COLABORADOR, aspiranteId: "asp-015", hasta: "tampoco" }),
    esperar400,
  );
  await assert.rejects(
    () => casoUso.ejecutar({
      colaboradorId: COLABORADOR,
      aspiranteId: "asp-015",
      desde: "2026-09-14T00:00:00Z",
      hasta: "2026-09-10T00:00:00Z",
    }),
    esperar400,
  );
});

test("[EQ-43] aspirante sin historial: lista vacía", async () => {
  const casoUso = crearCasoUso();
  const resultado = await casoUso.ejecutar({ colaboradorId: COLABORADOR, aspiranteId: "asp-020" });
  assert.deepEqual(resultado, { actividades: [] });
});

test("[EQ-43] entrada sin título ni detalle: texto y tipo por defecto", async () => {
  const casoUso = crearCasoUso([
    { id: "h-x", aspiranteId: "asp-015", fechaEvento: "2026-10-01T10:00:00Z" },
  ]);
  const { actividades } = await casoUso.ejecutar({ colaboradorId: COLABORADOR, aspiranteId: "asp-015" });
  assert.equal(actividades[0].tipo, "ACTIVIDAD");
  assert.equal(actividades[0].texto, "Actividad registrada");
});

test("[EQ-43] errores de acceso: 401, 404 y 403, en ese orden", async () => {
  const casoUso = crearCasoUso();

  await assert.rejects(
    () => casoUso.ejecutar({ colaboradorId: "", aspiranteId: "asp-015" }),
    (err) => { assert.equal(err.status, 401); assert.equal(err.codigo, "NO_AUTORIZADO"); return true; },
  );
  await assert.rejects(
    () => casoUso.ejecutar({ colaboradorId: COLABORADOR, aspiranteId: "asp-inexistente" }),
    (err) => { assert.equal(err.status, 404); assert.equal(err.codigo, "NO_ENCONTRADO"); return true; },
  );
  await assert.rejects(
    () => casoUso.ejecutar({ colaboradorId: COLABORADOR, aspiranteId: "asp-099" }),
    (err) => { assert.equal(err.status, 403); assert.equal(err.codigo, "SIN_PERMISO"); return true; },
  );
});