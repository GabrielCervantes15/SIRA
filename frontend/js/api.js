/**
 * Adaptador de la pantalla de Gabriel a la autenticación y API oficiales de SIRA.
 * EQ-30: mostrar_aceptados se envía siempre de manera explícita.
 */

async function pedir(ruta, parametros = {}, opciones = {}) {
  const url = new URL(ruta, window.location.origin);
  for (const [clave, valor] of Object.entries(parametros)) {
    if (valor !== undefined && valor !== null && valor !== "") url.searchParams.set(clave, String(valor));
  }
  const respuesta = await fetch(url, {
    method: opciones.method || "GET",
    headers: { Accept: "application/json" },
    credentials: "same-origin",
    cache: "no-store",
  });
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

function semaforoNormalizado(valor) {
  const nivel = String(typeof valor === "object" && valor !== null
    ? (valor.nivel ?? valor.color ?? "")
    : (valor ?? "")).trim().toUpperCase();
  return {
    nivel: nivel || "SIN_DATO",
    texto: (typeof valor === "object" && valor !== null ? valor.texto : null) ?? nivel,
  };
}

function adaptarAspirante(a) {
  return {
    ...a,
    id: a.id ?? a.aspiranteId ?? a.idAspirante ?? a.idInstitucional,
    nombre: a.nombre ?? a.nombreCompleto ?? "Sin nombre",
    carrera: a.carrera ?? a.carreraSolicitada ?? "Sin carrera",
    preparatoria: a.preparatoria ?? a.preparatoriaProcedencia ?? "Sin preparatoria",
    fechaSolicitud: a.fechaSolicitud ?? null,
    ultimaActividad: a.ultimaActividad ?? a.fechaUltimaActividad ?? null,
    semaforo: semaforoNormalizado(a.semaforo),
  };
}

function adaptarDetalle(cuerpo) {
  const d = cuerpo.aspirante ?? cuerpo.datos ?? cuerpo;
  const a = adaptarAspirante(d);
  const estadoRaw = d.estadoSolicitud ?? d.estado ?? "Sin estado";
  return {
    ...a,
    estado: typeof estadoRaw === "object" && estadoRaw !== null
      ? estadoRaw
      : { texto: String(estadoRaw).replaceAll("_", " ") },
    telefono: d.telefono ?? d.contacto?.telefono ?? d.datosContacto?.telefono ?? "—",
    correo: d.correo ?? d.correoElectronico ?? d.contacto?.correo ?? d.datosContacto?.correo ?? "—",
  };
}

export const api = {
  async sesion() {
    const respuesta = await pedir("/api/v1/auth/session");
    return { nombre: respuesta.usuario?.nombreCompleto ?? "Usuario SIRA", usuario: respuesta.usuario };
  },
  cerrarSesion: () => pedir("/api/v1/auth/logout", {}, { method: "POST" }),
  async listarAspirantes({ pagina = 1, tamano = 13, ordenarPor = "semaforo", direccion = "desc", incluirAceptados = false, busqueda = "" } = {}) {
    const limite = tamano;
    const offset = (pagina - 1) * limite;
    const cuerpo = await pedir("/api/monitoreo/aspirantes", {
      limit: limite,
      offset,
      ordenar_por: orden[ordenarPor] ?? "semaforo",
      orden_direccion: String(direccion).toUpperCase(),
      mostrar_aceptados: incluirAceptados,
      nombre: busqueda.trim(),
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
  // Estas rutas son las candidatas en el módulo de monitoreo existente.
  // Su disponibilidad y sus respuestas deben verificarse en el proyecto completo.
  async detalle(id) {
    const cuerpo = await pedir(`/api/monitoreo/aspirantes/${encodeURIComponent(id)}`);
    return adaptarDetalle(cuerpo);
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
