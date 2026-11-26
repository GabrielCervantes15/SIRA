/**
 * HU1-7 (EQ-83) · Contrato del repositorio de lotes de envío (esquema `disparo`).
 *
 * - transaccion(fn) → Promise<T>
 *     Lo que haga `fn(repo)` se confirma o se revierte junto. Las transacciones del
 *     mismo colaborador se ejecutan una tras otra, así un doble clic no crea dos lotes.
 * - bloquearColaborador(colaboradorId) → Promise<void>
 *     Dentro de la transacción: espera a que termine cualquier otra del mismo colaborador
 *     (en PostgreSQL, pg_advisory_xact_lock). En memoria la cola ya lo garantiza.
 * - buscarPorClave(colaboradorId, clave) → Promise<{ lote, envios } | null>
 * - buscarRecientePorHuella(colaboradorId, huella, desdeIso) → Promise<{ lote, envios } | null>
 *     Lote más reciente con esa huella creado en o después de `desdeIso` (peticiones sin clave).
 * - guardarLote({ lote, envios }) → Promise<void>
 * - reclamarPendientes(loteId, ahoraIso, hastaIso) → Promise<Object[]>
 *     Dentro de la transacción: aparta hasta `hastaIso` los envíos PENDIENTES sin publicar
 *     que nadie tenga apartados, y los devuelve. Así una petición repetida mientras la
 *     primera publica no publica lo mismo dos veces.
 * - liberarReclamo(envioIds) → Promise<void>
 *     Si la publicación se corta, quita el apartado de lo que no se publicó.
 * - marcarPublicados(envioIds, fechaIso) → Promise<void>
 *     Marca los envíos cuyo evento ya se publicó; los no marcados se vuelven a publicar
 *     al repetir la petición.
 * - obtenerLote(loteId) → Promise<{ lote, envios } | null>
 * - registrarResultado({ envioId, resultado, codigo, motivo, whatsappMessageId, intentos, fecha })
 *     → Promise<{ aplicado: boolean, envio?: Object, yaNotificadoEnLote?: boolean }>
 *     EQ-87: guarda ENVIADO / FALLIDO / DIFERIDO de un envío (ver aceptaResultado).
 *     `yaNotificadoEnLote` dice si el aspirante ya tenía otro canal ENVIADO en ese lote,
 *     para contarlo una sola vez. Un resultado repetido devuelve `aplicado: false`.
 */
export const METODOS_REPOSITORIO_LOTES = Object.freeze([
  "transaccion",
  "bloquearColaborador",
  "buscarPorClave",
  "buscarRecientePorHuella",
  "guardarLote",
  "reclamarPendientes",
  "liberarReclamo",
  "marcarPublicados",
  "obtenerLote",
  "registrarResultado",
]);

export function verificarRepositorioLotes(repositorio) {
  const faltan = METODOS_REPOSITORIO_LOTES.filter((m) => typeof repositorio?.[m] !== "function");
  if (faltan.length) throw new Error(`El repositorio de lotes no implementa: ${faltan.join(", ")}.`);
  return repositorio;
}
