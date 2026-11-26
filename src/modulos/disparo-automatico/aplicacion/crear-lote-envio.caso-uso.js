/**
 * HU1-7 (EQ-83) · Crear el lote de envío y publicar sus eventos.
 *
 * 1. Dentro de una transacción (y con el colaborador bloqueado):
 *    a. Si ya hay un lote con la misma clave de idempotencia (o, sin clave, con la
 *       misma huella en los últimos 2 minutos), se devuelve ese lote: no se crea otro.
 *    b. Se valida el horario de HU9 (fuera de horario: error 409, sin crear nada).
 *    c. Se recalculan los aspirantes aplicables con las reglas de EQ-81; si son cero, 400.
 *    d. Se arma el mensaje de cada aspirante con el catálogo de HU8 (EQ-84).
 *    e. Se guarda el lote con un envío por aspirante y canal.
 *    f. Se apartan (reclaman) los envíos PENDIENTES sin publicar que nadie más esté publicando.
 * 2. Ya confirmado, se publica un evento `disparo.envio.solicitado` por cada envío
 *    apartado y se marca como publicado. Si la publicación se corta, lo no publicado se
 *    libera y repetir la petición con la misma clave lo publica. Una petición repetida
 *    mientras la primera publica no encuentra nada que apartar y no publica de nuevo.
 */
import { randomUUID } from "node:crypto";
import { normalizarFiltrosLote } from "../vista-previa-lote.js";
import {
  construirLote,
  ErrorLoteEnvio,
  huellaPeticion,
  leerClaveIdempotencia,
  RECLAMO_PUBLICACION_MS,
  resumenLote,
  VENTANA_SIN_CLAVE_MS,
} from "../dominio/lote-envio.js";
import { verificarRepositorioLotes } from "../dominio/repositorio-lotes.js";
import { crearEventoEnvioSolicitado, routingKeyEnvio } from "../eventos.js";

export class CrearLoteEnvioCasoUso {
  /**
   * @param {Object} d
   * @param {Object} d.repositorioLotes
   * @param {{ calcular: Function }} d.servicioVistaPreviaLote  EQ-81
   * @param {{ personalizarLote: Function }} d.generadorMensaje  EQ-84
   * @param {{ validarEnvioPermitido: Function, obtenerEstadoHorario: Function }} d.validadorHorario  HU9 / EQ-82
   * @param {{ publicar: Function }} d.bus
   * @param {() => Date} [d.reloj]
   * @param {() => string} [d.generarId]
   * @param {(envios: Object[], lote: Object) => Promise<void>} [d.alRegistrarNoEnviables]  Para el historial.
   * @param {(aspiranteId: string) => Promise<string|null>} [d.obtenerNombreAspirante]
   */
  constructor({
    repositorioLotes, servicioVistaPreviaLote, generadorMensaje, validadorHorario, bus,
    reloj = () => new Date(), generarId = randomUUID, alRegistrarNoEnviables = null, obtenerNombreAspirante = null,
  }) {
    for (const [nombre, valor] of Object.entries({ servicioVistaPreviaLote, generadorMensaje, validadorHorario, bus })) {
      if (!valor) throw new Error(`CrearLoteEnvioCasoUso requiere ${nombre}.`);
    }
    this.repositorio = verificarRepositorioLotes(repositorioLotes);
    this.servicioVistaPreviaLote = servicioVistaPreviaLote;
    this.generadorMensaje = generadorMensaje;
    this.validadorHorario = validadorHorario;
    this.bus = bus;
    this.reloj = reloj;
    this.generarId = generarId;
    this.alRegistrarNoEnviables = alRegistrarNoEnviables;
    this.obtenerNombreAspirante = obtenerNombreAspirante;
  }

  /**
   * @param {{ colaboradorId: string, claveIdempotencia?: string|null, cuerpo: Object }} entrada
   * @returns {Promise<{ repetido: boolean, resumen: Object, estadoHorario: Object, eventosPublicados: number }>}
   */
  async ejecutar({ colaboradorId, claveIdempotencia = null, cuerpo = {} }) {
    const clave = leerClaveIdempotencia(claveIdempotencia);
    const filtros = normalizarFiltrosLote(cuerpo);
    const enviarPorCorreo = cuerpo.enviarPorCorreo === true;
    const huella = huellaPeticion(colaboradorId, filtros, enviarPorCorreo);
    const ahora = this.reloj();

    const reclamar = async (tx, loteId) => tx.reclamarPendientes(
      loteId, ahora.toISOString(), new Date(ahora.getTime() + RECLAMO_PUBLICACION_MS).toISOString());

    const resultado = await this.repositorio.transaccion(async (tx) => {
      await tx.bloquearColaborador(colaboradorId);

      const previo = clave
        ? await tx.buscarPorClave(colaboradorId, clave)
        : await tx.buscarRecientePorHuella(colaboradorId, huella, new Date(ahora.getTime() - VENTANA_SIN_CLAVE_MS).toISOString());
      if (previo) {
        if (previo.lote.huella !== huella) {
          throw new ErrorLoteEnvio(422, "CLAVE_IDEMPOTENCIA_REUTILIZADA",
            "Esa clave de idempotencia ya se usó para un lote con otros filtros.");
        }
        return { repetido: true, registro: previo, porPublicar: await reclamar(tx, previo.lote.id) };
      }

      // Fuera de horario lanza el error de HU9 (409) y no se crea nada.
      const estadoHorario = this.validadorHorario.validarEnvioPermitido();

      const vista = await this.servicioVistaPreviaLote.calcular(colaboradorId, cuerpo);
      if (!vista.valido) {
        throw new ErrorLoteEnvio(400, "FILTROS_INVALIDOS", "Revisa los filtros del lote.", { errores: vista.errores });
      }
      if (vista.total === 0) {
        throw new ErrorLoteEnvio(400, "SIN_ASPIRANTES", "No hay aspirantes que cumplan las condiciones de ese lote.");
      }

      const personalizados = await this.generadorMensaje.personalizarLote(vista.elegibles);
      const registro = construirLote({
        colaboradorId, clave, huella, filtros, enviarPorCorreo, personalizados, ahora, generarId: this.generarId,
      });
      await tx.guardarLote(registro);
      return { repetido: false, registro, estadoHorario, elegibles: vista.elegibles, porPublicar: await reclamar(tx, registro.lote.id) };
    });

    const { registro } = resultado;
    if (!resultado.repetido && this.alRegistrarNoEnviables) {
      const noEnviables = registro.envios.filter((e) => e.estado === "NO_ENVIABLE");
      if (noEnviables.length) await this.alRegistrarNoEnviables(noEnviables, registro.lote);
    }

    const eventosPublicados = await this._publicar(registro, resultado.porPublicar);
    const nombres = await this._nombres(registro, resultado.elegibles);
    return {
      repetido: resultado.repetido,
      resumen: resumenLote(registro, nombres),
      estadoHorario: resultado.estadoHorario ?? this.validadorHorario.obtenerEstadoHorario(),
      eventosPublicados,
    };
  }

  async _publicar(registro, porPublicar) {
    const publicados = [];
    try {
      for (const envio of porPublicar) {
        await this.bus.publicar(routingKeyEnvio(envio.canal), crearEventoEnvioSolicitado(registro.lote, envio, this.reloj()));
        publicados.push(envio.id);
      }
    } finally {
      // Aunque se corte a la mitad, lo ya publicado queda marcado y lo demás se libera
      // para que el reintento con la misma clave lo publique.
      if (publicados.length) {
        const fecha = this.reloj().toISOString();
        await this.repositorio.marcarPublicados(publicados, fecha);
        for (const e of registro.envios) if (publicados.includes(e.id)) e.publicadoEn = fecha;
      }
      const sinPublicar = porPublicar.map((e) => e.id).filter((id) => !publicados.includes(id));
      if (sinPublicar.length) await this.repositorio.liberarReclamo(sinPublicar);
    }
    return publicados.length;
  }

  /** Nombres solo de quienes aparecen en el resumen como no enviados o con correo fallido. */
  async _nombres(registro, elegibles = []) {
    const nombres = new Map(elegibles.map((a) => [a.id, a.nombreCompleto]));
    if (!this.obtenerNombreAspirante) return nombres;
    const ids = new Set(registro.envios.filter((e) => e.estado === "NO_ENVIABLE").map((e) => e.aspiranteId));
    for (const id of ids) {
      if (!nombres.get(id)) nombres.set(id, (await this.obtenerNombreAspirante(id)) || id);
    }
    return nombres;
  }
}
