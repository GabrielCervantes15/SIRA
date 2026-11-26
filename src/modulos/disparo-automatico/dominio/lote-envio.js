/**
 * HU1-7 (EQ-83) · Dominio del lote de envío.
 *
 * Un LOTE es una petición de envío del colaborador. Tiene un ENVÍO por cada
 * aspirante y canal (WHATSAPP y, si se pidió, CORREO):
 *
 *   PENDIENTE    se publicará el evento `disparo.envio.solicitado` para ese canal.
 *   NO_ENVIABLE  no se publica nada; `motivo` explica por qué (dato faltante, sin teléfono…).
 *
 * Idempotencia: la clave es la cabecera `Idempotency-Key` o, si no llega, una huella
 * del colaborador y del cuerpo de la petición válida durante VENTANA_SIN_CLAVE_MS.
 * La misma clave con otro cuerpo es un error (no se reutiliza una clave para otra cosa).
 */
import { createHash, randomUUID } from "node:crypto";

export const CANALES = Object.freeze(["WHATSAPP", "CORREO"]);
export const ESTADOS_ENVIO = Object.freeze(["PENDIENTE", "NO_ENVIABLE"]);
export const ESTADO_LOTE_CREADO = "CREADO";
export const VENTANA_SIN_CLAVE_MS = 2 * 60 * 1000;
/** Tiempo que un envío queda apartado para quien lo está publicando. */
export const RECLAMO_PUBLICACION_MS = 30 * 1000;

/** Mismo formato que valida el puerto de WhatsApp (docs/contratos/whatsapp.md). */
export const PATRON_TELEFONO = /^\+[1-9]\d{7,14}$/;
export const PATRON_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PATRON_CLAVE_IDEMPOTENCIA = /^[A-Za-z0-9_-]{8,100}$/;

export class ErrorLoteEnvio extends Error {
  constructor(status, codigo, mensaje, extra = {}) {
    super(mensaje);
    this.name = "ErrorLoteEnvio";
    this.status = status;
    this.codigo = codigo;
    Object.assign(this, extra);
  }
}

/** Devuelve la clave de la cabecera ya validada, o null si no llegó. */
export function leerClaveIdempotencia(valor) {
  if (valor == null || String(valor).trim() === "") return null;
  const clave = String(valor).trim();
  if (!PATRON_CLAVE_IDEMPOTENCIA.test(clave)) {
    throw new ErrorLoteEnvio(400, "CLAVE_IDEMPOTENCIA_INVALIDA",
      "La cabecera Idempotency-Key debe tener de 8 a 100 letras, números, guiones o guiones bajos.");
  }
  return clave;
}

/** Huella estable del colaborador y de la petición (el orden de las listas no importa). */
export function huellaPeticion(colaboradorId, filtros, enviarPorCorreo) {
  const normal = {
    colaboradorId: String(colaboradorId),
    semaforos: [...filtros.semaforos].sort(),
    carreras: [...filtros.carreras].sort(),
    inactividadValor: filtros.inactividadValor,
    inactividadUnidad: filtros.inactividadUnidad,
    enviarPorCorreo: Boolean(enviarPorCorreo),
  };
  return createHash("sha256").update(JSON.stringify(normal)).digest("hex");
}

/** Canales que pide el lote, en orden. */
export function canalesSolicitados(enviarPorCorreo) {
  return enviarPorCorreo ? ["WHATSAPP", "CORREO"] : ["WHATSAPP"];
}

/** Destino del canal o el motivo por el que no se puede usar. */
export function destinoDelCanal(canal, aspirante) {
  if (canal === "WHATSAPP") {
    const telefono = String(aspirante.telefono ?? "").replace(/[\s()-]/g, "");
    if (!telefono) return { destino: null, motivo: "El aspirante no tiene teléfono registrado." };
    if (!PATRON_TELEFONO.test(telefono)) return { destino: null, motivo: "El teléfono no tiene formato internacional válido." };
    return { destino: telefono, motivo: null };
  }
  const correo = String(aspirante.correo ?? "").trim();
  if (!correo) return { destino: null, motivo: "El aspirante no tiene correo registrado." };
  if (!PATRON_CORREO.test(correo)) return { destino: null, motivo: "El correo registrado no tiene un formato válido." };
  return { destino: correo, motivo: null };
}

/**
 * Arma el lote y sus envíos a partir de los mensajes ya personalizados (EQ-84).
 * @param {Object} datos
 * @param {Array<{ aspirante: Object, enviable: boolean, texto?: string, mensajeId: string, codigo?: string, faltantes?: string[], motivo?: string }>} datos.personalizados
 */
export function construirLote({
  colaboradorId, clave, huella, filtros, enviarPorCorreo, personalizados, ahora, generarId = randomUUID,
}) {
  const loteId = generarId();
  const creadoEn = ahora.toISOString();
  const canales = canalesSolicitados(enviarPorCorreo);
  const envios = [];

  for (const p of personalizados) {
    for (const canal of canales) {
      const base = {
        id: generarId(), loteId, aspiranteId: p.aspirante.id, canal,
        mensajeId: p.mensajeId, destino: null, texto: null, motivo: null, codigoMotivo: null, faltantes: [], parametros: [], publicadoEn: null, reclamadoHasta: null,
        resultado: null, resultadoCodigo: null, resultadoMotivo: null, whatsappMessageId: null, intentos: null, resultadoEn: null,
      };
      if (!p.enviable) {
        envios.push({ ...base, estado: "NO_ENVIABLE", motivo: p.motivo, codigoMotivo: p.codigo, faltantes: [...(p.faltantes ?? [])] });
        continue;
      }
      const { destino, motivo } = destinoDelCanal(canal, p.aspirante);
      envios.push(destino
        ? { ...base, estado: "PENDIENTE", destino, texto: p.texto, parametros: [...(p.parametros ?? [])] }
        : { ...base, estado: "NO_ENVIABLE", motivo, codigoMotivo: "CANAL_NO_DISPONIBLE" });
    }
  }

  const lote = {
    id: loteId,
    colaboradorId: String(colaboradorId),
    claveIdempotencia: clave,
    huella,
    filtros: {
      semaforos: [...filtros.semaforos], carreras: [...filtros.carreras],
      inactividadValor: filtros.inactividadValor, inactividadUnidad: filtros.inactividadUnidad,
    },
    enviarPorCorreo: Boolean(enviarPorCorreo),
    estado: ESTADO_LOTE_CREADO,
    totalAspirantes: personalizados.length,
    totalEnviosPendientes: envios.filter((e) => e.estado === "PENDIENTE").length,
    creadoEn,
  };
  return { lote, envios };
}

/**
 * Resumen que devuelve el endpoint. Conserva `totalEnviados` y `correo` porque el modal de HU1 los usa.
 * @param {{ lote: Object, envios: Object[] }} registro
 * @param {Map<string, string>} nombres  aspiranteId → nombre para mostrar
 */
export function resumenLote({ lote, envios }, nombres = new Map()) {
  const porAspirante = new Map();
  for (const e of envios) {
    if (!porAspirante.has(e.aspiranteId)) porAspirante.set(e.aspiranteId, []);
    porAspirante.get(e.aspiranteId).push(e);
  }
  const nombre = (id) => nombres.get(id) || id;

  const noEnviados = [];
  let totalEnviados = 0;
  for (const [aspiranteId, suyos] of porAspirante) {
    if (suyos.some((e) => e.estado === "PENDIENTE")) { totalEnviados += 1; continue; }
    const primero = suyos[0];
    noEnviados.push({
      aspiranteId, nombre: nombre(aspiranteId), codigo: primero.codigoMotivo,
      faltantes: [...(primero.faltantes ?? [])],
      motivo: primero.motivo,
    });
  }

  const correos = envios.filter((e) => e.canal === "CORREO");
  const correoFallido = correos.filter((e) => e.estado === "NO_ENVIABLE" && e.codigoMotivo === "CANAL_NO_DISPONIBLE");
  return {
    loteId: lote.id,
    estado: lote.estado,
    creadoEn: lote.creadoEn,
    totalAspirantes: lote.totalAspirantes,
    totalEnviados,
    envios: {
      whatsapp: envios.filter((e) => e.canal === "WHATSAPP" && e.estado === "PENDIENTE").length,
      correo: correos.filter((e) => e.estado === "PENDIENTE").length,
    },
    noEnviados: { total: noEnviados.length, detalles: noEnviados },
    correo: {
      exitosos: correos.filter((e) => e.estado === "PENDIENTE").length,
      fallidos: correoFallido.length,
      detalles: correoFallido.map((e) => ({ aspiranteId: e.aspiranteId, nombre: nombre(e.aspiranteId), motivo: e.motivo })),
    },
  };
}

// ---------------------------------------------------------------------------
// EQ-87 (HU1-11) · Resultados del envío y conteo de notificados por lote
// ---------------------------------------------------------------------------
export const RESULTADOS_ENVIO = Object.freeze(["ENVIADO", "FALLIDO", "DIFERIDO"]);
export const RESULTADOS_FINALES = Object.freeze(["ENVIADO", "FALLIDO"]);

/**
 * ¿Se puede aplicar este resultado al envío? Solo a envíos PENDIENTES; ENVIADO y FALLIDO
 * son finales (un evento repetido no cambia nada) y DIFERIDO puede pasar a final.
 */
export function aceptaResultado(envio, resultado) {
  if (!envio || envio.estado !== "PENDIENTE" || !RESULTADOS_ENVIO.includes(resultado)) return false;
  if (RESULTADOS_FINALES.includes(envio.resultado)) return false;
  return !(envio.resultado === "DIFERIDO" && resultado === "DIFERIDO");
}

/**
 * Conteo del lote por aspirante (EQ-77 §11: aspirantes únicos, no mensajes por canal).
 * Cada aspirante cuenta una vez, en este orden:
 *   notificado  al menos un canal ENVIADO
 *   pendiente   algún canal sin resultado todavía
 *   diferido    algún canal DIFERIDO (límite de 24 h u horario)
 *   fallido     el resto (FALLIDO o NO_ENVIABLE en todos sus canales)
 */
export function resumenResultados(envios) {
  const porAspirante = new Map();
  for (const e of envios) {
    if (!porAspirante.has(e.aspiranteId)) porAspirante.set(e.aspiranteId, []);
    porAspirante.get(e.aspiranteId).push(e);
  }
  const conteo = { totalAspirantes: porAspirante.size, notificados: 0, pendientes: 0, diferidos: 0, fallidos: 0 };
  for (const suyos of porAspirante.values()) {
    if (suyos.some((e) => e.resultado === "ENVIADO")) conteo.notificados += 1;
    else if (suyos.some((e) => e.estado === "PENDIENTE" && !e.resultado)) conteo.pendientes += 1;
    else if (suyos.some((e) => e.resultado === "DIFERIDO")) conteo.diferidos += 1;
    else conteo.fallidos += 1;
  }

  const porCanal = {};
  for (const canal of CANALES) {
    const delCanal = envios.filter((e) => e.canal === canal);
    if (!delCanal.length) continue;
    porCanal[canal] = {
      enviados: delCanal.filter((e) => e.resultado === "ENVIADO").length,
      fallidos: delCanal.filter((e) => e.resultado === "FALLIDO").length,
      diferidos: delCanal.filter((e) => e.resultado === "DIFERIDO").length,
      pendientes: delCanal.filter((e) => e.estado === "PENDIENTE" && !e.resultado).length,
      noEnviables: delCanal.filter((e) => e.estado === "NO_ENVIABLE").length,
    };
  }
  return { ...conteo, completo: conteo.pendientes === 0 && conteo.diferidos === 0, porCanal };
}
