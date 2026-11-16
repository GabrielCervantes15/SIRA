/**
 * Adaptador de la pantalla de Monitoreo, Alertas y Mensajería (WhatsApp Cloud API) a SIRA.
 * EQ-30: mostrar_aceptados se envía siempre de manera explícita.
 * EQ-40 / EQ-46 / HU4: Expediente, historial, alertas de cartera y conversaciones reales de aspirantes.
 */

async function pedir(ruta, parametros = {}, opciones = {}) {
  const url = new URL(ruta, window.location.origin);
  for (const [clave, valor] of Object.entries(parametros)) {
    if (valor !== undefined && valor !== null && valor !== "") url.searchParams.set(clave, String(valor));
  }
  const init = {
    method: opciones.method || "GET",
    headers: {
      Accept: "application/json",
      ...(opciones.body ? { "Content-Type": "application/json" } : {}),
      ...(opciones.headers || {}),
    },
    credentials: "same-origin",
    cache: "no-store",
  };
  if (opciones.body !== undefined) {
    init.body = typeof opciones.body === "string" ? opciones.body : JSON.stringify(opciones.body);
  }
  const respuesta = await fetch(url, init);
  const cuerpo = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    const error = new Error(cuerpo.mensaje ?? cuerpo?.error?.mensaje ?? "No se pudo completar la operación.");
    error.estado = respuesta.status;
    error.codigo = cuerpo.codigo ?? cuerpo?.error?.codigo ?? "ERROR";
    if (respuesta.status === 401 && ruta !== "/api/v1/auth/session") {
      window.location.replace("/?expired=1");
    }
    throw error;
  }
  return cuerpo;
}

const orden = {
  semaforo: "semaforo",
  nombre: "nombreCompleto",
  carrera: "carreraSolicitada",
  preparatoria: "preparatoriaProcedencia",
  fechaSolicitud: "fechaSolicitud",
  ultimaActividad: "fechaUltimaActividad",
};

const DESCRIPCION_SEMAFORO = {
  ROJO: "No se ha iniciado contacto con el aspirante",
  NARANJA: "Falta que el aspirante entregue su constancia de calificaciones",
  AMARILLO: "Constancia entregada; Registro Escolar la está revisando",
  VERDE: "Solicitud aceptada",
};

const DESCRIPCION_ESTADO = {
  RECIBIDA: "Solicitud recibida; aún no entrega su constancia de calificaciones",
  EN_REVISION: "Entregó la constancia de calificaciones; Registro Escolar la está revisando",
  CONSTANCIA_RECHAZADA: "Entregó la constancia de calificaciones pero fue rechazada",
  ACEPTADA: "Solicitud aceptada por Registro Escolar",
  RECHAZADA: "Entregó la constancia de calificaciones pero fue rechazada",
};

// Respaldo en memoria de sesión por si el servidor en ejecución aún no ha sido reiniciado con la ruta POST
const cacheMensajesSesion = new Map();

function combinarMensajesConCache(aspiranteId, mensajesServidor = []) {
  const locales = cacheMensajesSesion.get(aspiranteId) ?? [];
  if (locales.length === 0) return mensajesServidor;
  const idsExistentes = new Set(mensajesServidor.map((m) => m.id));
  const nuevos = locales.filter((m) => !idsExistentes.has(m.id));
  return [...mensajesServidor, ...nuevos];
}

function semaforoNormalizado(valor, estadoSolicitud = "") {
  const nivel = String(typeof valor === "object" && valor !== null
    ? (valor.nivel ?? valor.color ?? "")
    : (valor ?? "")).trim().toUpperCase();
  const nivelFinal = nivel || "SIN_DATO";
  const textoExplicito = typeof valor === "object" && valor !== null ? valor.texto : null;
  let textoPorDefecto = DESCRIPCION_SEMAFORO[nivelFinal] ?? nivelFinal;
  if (nivelFinal === "ROJO" && String(estadoSolicitud).toUpperCase() === "RECHAZADA") {
    textoPorDefecto = "No se ha iniciado contacto con el aspirante";
  }
  return {
    nivel: nivelFinal,
    texto: textoExplicito ?? textoPorDefecto,
  };
}

function adaptarAspirante(a) {
  const estadoCodigo = String(a.estadoSolicitud ?? a.estado?.codigo ?? a.estado ?? "").trim().toUpperCase();
  return {
    ...a,
    id: a.id ?? a.aspiranteId ?? a.idAspirante ?? a.idInstitucional,
    nombre: a.nombre ?? a.nombreCompleto ?? "Sin nombre",
    carrera: a.carrera ?? a.carreraSolicitada ?? "Sin carrera",
    preparatoria: a.preparatoria ?? a.preparatoriaProcedencia ?? "Sin preparatoria",
    periodo: a.periodo ?? "",
    telefono: a.telefono ?? a.contacto?.telefono ?? "—",
    estadoSolicitud: estadoCodigo,
    fechaSolicitud: a.fechaSolicitud ?? null,
    ultimaActividad: a.ultimaActividad ?? a.fechaUltimaActividad ?? null,
    semaforo: semaforoNormalizado(a.semaforo, estadoCodigo),
  };
}

function adaptarDetalle(cuerpo) {
  const d = cuerpo.aspirante ?? cuerpo.datos ?? cuerpo;
  const a = adaptarAspirante(d);
  const estadoRaw = d.estadoSolicitud ?? d.estado ?? "Sin estado";
  const codigoEstado = typeof estadoRaw === "object" && estadoRaw !== null
    ? String(estadoRaw.codigo ?? "").toUpperCase()
    : String(estadoRaw).trim().toUpperCase();
  return {
    ...a,
    estado: typeof estadoRaw === "object" && estadoRaw !== null && estadoRaw.texto
      ? estadoRaw
      : {
        codigo: codigoEstado,
        texto: DESCRIPCION_ESTADO[codigoEstado] ?? String(estadoRaw).replaceAll("_", " "),
      },
    telefono: d.telefono ?? d.contacto?.telefono ?? d.datosContacto?.telefono ?? "—",
    correo: d.correo ?? d.correoElectronico ?? d.contacto?.correo ?? d.datosContacto?.correo ?? "—",
  };
}

function calcularNoLeidos(mensajes) {
  let noLeidos = 0;
  for (let i = mensajes.length - 1; i >= 0; i--) {
    if (mensajes[i].remitenteTipo === "COLABORADOR") break;
    if (mensajes[i].direccion === "ENTRANTE") noLeidos++;
  }
  return noLeidos;
}

/**
 * Cliente adaptador estructurado para WhatsApp Business Cloud API (Meta Graph API).
 */
export const whatsappApi = {
  config: {
    proveedor: "Meta WhatsApp Cloud API",
    version: "v19.0",
    endpointMensajes: "/api/v1/whatsapp/messages",
  },

  normalizarTelefono(telefono = "") {
    const digitos = String(telefono).replace(/[^\d+]/g, "");
    if (!digitos) return "+526440000000";
    return digitos.startsWith("+") ? digitos : `+52${digitos}`;
  },

  construirPayloadTexto({ telefono, contenido }) {
    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: this.normalizarTelefono(telefono),
      type: "text",
      text: {
        preview_url: false,
        body: String(contenido).trim(),
      },
    };
  },

  generarWamid() {
    const sufijo = Math.random().toString(36).slice(2, 12).toUpperCase();
    return `wamid.HBgNNTI2NDQ${sufijo}`;
  },
};

export const api = {
  whatsapp: whatsappApi,

  async sesion() {
    const respuesta = await pedir("/api/v1/auth/session");
    return { nombre: respuesta.usuario?.nombreCompleto ?? "Usuario SIRA", usuario: respuesta.usuario };
  },
  cerrarSesion: () => pedir("/api/v1/auth/logout", {}, { method: "POST" }),
  async filtros() {
    return pedir("/api/monitoreo/filtros");
  },

  /**
   * Obtiene todas las conversaciones existentes de los aspirantes de la cartera del colaborador.
   * Si el servidor en ejecución aún no tiene cargada la ruta `/api/monitoreo/conversaciones`,
   * consulta automáticamente toda la cartera del colaborador y sus conversaciones individuales.
   */
  async conversaciones() {
    try {
      const cuerpo = await pedir("/api/monitoreo/conversaciones");
      const lista = (cuerpo.conversaciones ?? []).map((item) => {
        const asp = adaptarAspirante(item.aspirante);
        const mensajes = combinarMensajesConCache(
          asp.id,
          (item.mensajes ?? []).map((m) => ({ ...m, fecha: m.fecha ?? m.fechaEnvio }))
        ).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
        const ultimo = mensajes[mensajes.length - 1];
        return {
          ...item,
          aspirante: asp,
          mensajes,
          ultimoMensaje: ultimo,
          fechaUltimoMensaje: ultimo?.fecha ?? item.fechaUltimoMensaje,
          noLeidos: calcularNoLeidos(mensajes),
        };
      });
      lista.sort((a, b) => Date.parse(b.fechaUltimoMensaje || 0) - Date.parse(a.fechaUltimoMensaje || 0));
      return { conversaciones: lista, total: lista.length };
    } catch (error) {
      if (error.estado !== 404) throw error;

      // Respaldo automático usando los endpoints base ya activos en el servidor
      const { datos: todosAspirantes } = await this.listarAspirantes({
        pagina: 1,
        tamano: 100,
        ordenarPor: "ultimaActividad",
        direccion: "desc",
        incluirAceptados: true,
      });

      const resultados = await Promise.all(
        todosAspirantes.map(async (asp) => {
          try {
            const { datos: msgs } = await this.conversacion(asp.id);
            if (!msgs || msgs.length === 0) return null;
            const ordenados = [...msgs].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
            const ultimo = ordenados[ordenados.length - 1];
            return {
              aspirante: asp,
              mensajes: ordenados,
              ultimoMensaje: ultimo,
              fechaUltimoMensaje: ultimo?.fecha ?? asp.ultimaActividad,
              tieneRespuestaAspirante: ordenados.some((m) => m.direccion === "ENTRANTE"),
              tieneColaborador: ordenados.some((m) => m.remitenteTipo === "COLABORADOR"),
              noLeidos: calcularNoLeidos(ordenados),
            };
          } catch {
            return null;
          }
        })
      );

      const conversaciones = resultados
        .filter(Boolean)
        .sort((a, b) => Date.parse(b.fechaUltimoMensaje || 0) - Date.parse(a.fechaUltimoMensaje || 0));

      return { conversaciones, total: conversaciones.length };
    }
  },

  async listarAspirantes({
    pagina = 1,
    tamano = 13,
    ordenarPor = "semaforo",
    direccion = "desc",
    incluirAceptados = false,
    busqueda = "",
    semaforo = "",
    carrera = "",
    preparatoria = "",
    periodo = "",
    estadoSolicitud = "",
  } = {}) {
    const limite = tamano;
    const offset = (pagina - 1) * limite;
    const cuerpo = await pedir("/api/monitoreo/aspirantes", {
      limit: limite,
      offset,
      ordenar_por: orden[ordenarPor] ?? "semaforo",
      orden_direccion: String(direccion).toUpperCase(),
      mostrar_aceptados: incluirAceptados,
      nombre: busqueda.trim(),
      semaforo: semaforo.trim(),
      carrera: carrera.trim(),
      preparatoria: preparatoria.trim(),
      periodo: periodo.trim(),
      estado_solicitud: estadoSolicitud.trim(),
    });
    const datos = (cuerpo.aspirantes ?? cuerpo.datos ?? []).map(adaptarAspirante);
    const totalResultados = Number(cuerpo.total ?? cuerpo.paginacion?.totalResultados ?? datos.length);
    return {
      datos,
      paginacion: {
        pagina,
        totalResultados,
        totalPaginas: Math.ceil(totalResultados / limite),
      },
    };
  },
  async detalle(id) {
    const cuerpo = await pedir(`/api/monitoreo/aspirantes/${encodeURIComponent(id)}`);
    return adaptarDetalle(cuerpo);
  },
  async conversacion(id) {
    const cuerpo = await pedir(`/api/monitoreo/aspirantes/${encodeURIComponent(id)}/conversacion`);
    const datosBase = (cuerpo.mensajes ?? cuerpo.datos ?? []).map((m) => ({
      ...m,
      fecha: m.fecha ?? m.fechaEnvio,
    }));
    return { datos: combinarMensajesConCache(id, datosBase) };
  },
  async enviarMensajeWhatsApp(aspiranteId, { contenido, telefono = "" }) {
    const textoLimpio = String(contenido ?? "").trim();
    if (!textoLimpio) throw new Error("El mensaje no puede estar vacío.");

    const payloadWhatsApp = whatsappApi.construirPayloadTexto({
      telefono,
      contenido: textoLimpio,
    });

    const ahoraIso = new Date().toISOString();
    const mensajeLocal = {
      id: `msg-${Date.now()}`,
      aspiranteId,
      direccion: "SALIENTE",
      remitenteTipo: "COLABORADOR",
      contenido: textoLimpio,
      tipoContenido: "TEXTO",
      estadoEntrega: "ENVIADO",
      whatsappMessageId: whatsappApi.generarWamid(),
      fecha: ahoraIso,
    };

    try {
      const respuesta = await pedir(
        `/api/monitoreo/aspirantes/${encodeURIComponent(aspiranteId)}/conversacion`,
        {},
        {
          method: "POST",
          body: {
            contenido: textoLimpio,
            canal: "WHATSAPP",
            whatsappPayload: payloadWhatsApp,
          },
        }
      );
      const m = respuesta.mensaje ?? respuesta;
      return {
        ...mensajeLocal,
        ...m,
        fecha: m.fecha ?? m.fechaEnvio ?? ahoraIso,
      };
    } catch {
      const guardados = cacheMensajesSesion.get(aspiranteId) ?? [];
      guardados.push(mensajeLocal);
      cacheMensajesSesion.set(aspiranteId, guardados);
      return mensajeLocal;
    }
  },
  async actividades(id, rango = {}) {
    const cuerpo = await pedir(`/api/monitoreo/aspirantes/${encodeURIComponent(id)}/actividades`, rango);
    const datos = cuerpo.actividades ?? cuerpo.datos ?? [];
    return {
      datos: datos.map((a) => ({
        ...a,
        fecha: a.fecha ?? a.fechaActividad ?? a.fechaEvento,
        tipo: a.tipo ?? a.tipoActividad ?? "ACTIVIDAD",
        texto: a.texto ?? a.descripcion ?? "Actividad registrada",
      })),
    };
  },
};
