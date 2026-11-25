
export const catalogoDemo = {
  envio: [
    {
      id: "env-001",
      nombre: "Saludo inicial",
      resumen: "Mensaje para iniciar una conversación.",
      texto: "[Texto de saludo pendiente de aprobación del PO.]",
      variables: [],
      reglas: [
        ["Inicio", "Regla pendiente de definición"],
        ["Semáforo", "Rojo o amarillo/naranja para inicio por colaborador"],
        ["Automatización", "Pendiente de confirmación"]
      ],
      estadoDefinicion: "Pendiente de aprobación"
    },
    {
      id: "env-002",
      nombre: "Recordatorio por falta de documentación",
      resumen: "Seguimiento de documentación pendiente.",
      texto: "[Texto del recordatorio pendiente de aprobación del PO.]",
      variables: [],
      reglas: [
        ["Condición", "Documentación pendiente"],
        ["Periodicidad", "Pendiente de definición"],
        ["Disparador", "Pendiente de aprobación"]
      ],
      estadoDefinicion: "Pendiente de aprobación"
    },
    {
      id: "env-003",
      nombre: "Reactivación de HU1",
      resumen: "Invitación para continuar el proceso de ingreso.",
      texto: "Hola, {{nombre}}.\n\nTu proceso de ingreso a {{carrera}} todavía puede continuar. ¿Necesitas ayuda para completar tus siguientes pasos?\n\nResponde a este mensaje y con gusto te orientaremos.",
      variables: ["nombre", "carrera"],
      reglas: [
        ["Aplicabilidad", "Se rige por los criterios de HU1"],
        ["Ventana WhatsApp", "24 horas desde el último mensaje recibido del aspirante"],
        ["Plantilla", "Requiere plantilla aprobada por Meta cuando la ventana está cerrada"],
        ["Umbral de inactividad", "Definido fuera de HU8"]
      ],
      estadoDefinicion: "Texto aprobado por PO"
    }
  ],

  respuesta: [
    {
      id: "res-001",
      nombre: "Preguntas frecuentes (FAQ)",
      resumen: "Respuesta a consultas habituales del aspirante.",
      texto: "[Preguntas y respuestas pendientes de definición con el PO.]",
      variables: [],
      reglas: [
        ["Identificación", "Pendiente de definición"],
        ["Sin coincidencia", "Comportamiento pendiente de definición"],
        ["Contenido", "Pendiente de aprobación"]
      ],
      estadoDefinicion: "Pendiente de aprobación"
    },
    {
      id: "res-002",
      nombre: "Aviso fuera del horario",
      resumen: "Informa que el mensaje se recibió fuera de jornada.",
      texto: "[Texto del aviso pendiente de aprobación del PO.]",
      variables: [],
      reglas: [
        ["Jornada", "Configuración de HU9"],
        ["Zona horaria", "Configuración institucional de HU9"],
        ["Frecuencia", "Pendiente de definición"],
        ["Texto", "Pendiente de aprobación"]
      ],
      estadoDefinicion: "Pendiente de aprobación"
    }
  ]
};

export function obtenerMensajes(categoria, catalogo = catalogoDemo) {
  return catalogo[categoria] ?? [];
}

export function buscarMensajes(mensajes, consulta) {
  const termino = consulta.trim().toLocaleLowerCase("es-MX");

  if (!termino) return mensajes;

  return mensajes.filter(mensaje =>
    `${mensaje.nombre} ${mensaje.resumen}`
      .toLocaleLowerCase("es-MX")
      .includes(termino)
  );
}

export function buscarMensajePorId(id, mensajes) {
  return mensajes.find(mensaje => mensaje.id === id) ?? null;
}
