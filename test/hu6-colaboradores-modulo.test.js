/**
 * HU 6 · módulo Colaboradores:
 *   EQ-55 (consultar por ID), EQ-71 (listado por campus), EQ-64 (vista previa del paso 3)
 *   y EQ-59 (confirmación en una transacción, con reversión).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearProveedorAutenticacionSimulado } from '../src/modulos/autenticacion/index.js';
import { crearModuloMonitoreo } from '../src/modulos/monitoreo/index.js';
import { crearBusEnMemoria } from '../src/compartido/eventos/bus-en-memoria.js';
import { crearServicioBorradores } from '../src/modulos/colaboradores/borradores.js';
import { crearCatalogoRegistroDemo } from '../src/modulos/colaboradores/catalogo-registro-demo.js';
import {
  crearModuloColaboradores, RepositorioColaboradoresMemoria, RepositorioColaboradoresPostgres,
  METODOS_REPOSITORIO_COLABORADORES,
} from '../src/modulos/colaboradores/index.js';

const ADMIN = '00000100001';
const NUEVO = '00000300001';
const ANA = '00000200001';
const BETO = '00000200002';
const NAINARI = 'Campus Obregón Náinari';
const CENTRO = 'Campus Obregón Centro';
const SOFTWARE = 'Ingeniería en Software';
const INDUSTRIAL = 'Ingeniería Industrial';

function aspirante(id, campus, carrera, colaboradorId) {
  return { id, campus, carreraSolicitada: carrera, colaboradorId, nombreCompleto: id, fechaSolicitud: '2026-10-01T00:00:00Z' };
}

function crearContexto({ proveedorCaido = false, colaboradores } = {}) {
  const usuarios = [
    { idInstitucional: ADMIN, nombreCompleto: 'Admin Prueba', correoInstitucional: 'admin@itson.edu.mx', telefono: '6440000000', activo: true },
    { idInstitucional: NUEVO, nombreCompleto: 'Nora Nueva Díaz', correoInstitucional: 'nora@itson.edu.mx', telefono: '6440000001', password: 'secreta', activo: true },
    { idInstitucional: ANA, nombreCompleto: 'Ana Álvarez Ruiz', correoInstitucional: 'ana@itson.edu.mx', telefono: '6440000002', activo: true },
    { idInstitucional: BETO, nombreCompleto: 'Beto Barrios Soto', correoInstitucional: 'beto@itson.edu.mx', telefono: '6440000003', activo: true },
  ];
  const aspirantes = [
    aspirante('a1', NAINARI, SOFTWARE, ANA),
    aspirante('a2', NAINARI, SOFTWARE, ANA),
    aspirante('a3', NAINARI, SOFTWARE, BETO),
    aspirante('a4', NAINARI, SOFTWARE, null),
    aspirante('a5', NAINARI, INDUSTRIAL, BETO),
    aspirante('a6', CENTRO, SOFTWARE, ANA),
  ];
  const monitoreo = crearModuloMonitoreo({ datosSemilla: { aspirantes, conversaciones: [], historial: [] } });
  const bus = crearBusEnMemoria();
  const borradores = crearServicioBorradores();
  const catalogo = crearCatalogoRegistroDemo(aspirantes);
  const proveedor = crearProveedorAutenticacionSimulado({ usuarios, indisponible: proveedorCaido });
  const modulo = crearModuloColaboradores({
    proveedorAutenticacion: proveedor,
    cartera: monitoreo.cartera,
    catalogo,
    bus,
    borradores,
    colaboradores: colaboradores ?? [
      { idInstitucional: ANA, campus: NAINARI, carreras: [SOFTWARE], fechaRegistro: '2026-08-01T00:00:00Z' },
      { idInstitucional: BETO, campus: NAINARI, carreras: [INDUSTRIAL], fechaRegistro: '2026-08-02T00:00:00Z', estado: 'inactivo' },
    ],
    reloj: () => new Date('2026-11-24T17:00:00Z'),
  });
  return { modulo, monitoreo, bus, borradores, proveedor };
}

const rechazaCon = (status, codigo) => (error) => error.status === status && error.codigo === codigo;

// ---------------------------------------------------------------- EQ-55

test('[EQ-55] consulta el perfil del directorio sin credenciales', async () => {
  const { modulo } = crearContexto();
  const { perfil } = await modulo.consultarColaborador.ejecutar(` ${NUEVO} `);
  assert.deepEqual(Object.keys(perfil).sort(), ['correoInstitucional', 'fotoUrl', 'idInstitucional', 'nombreCompleto', 'telefono']);
  assert.equal(perfil.nombreCompleto, 'Nora Nueva Díaz');
  assert.equal('password' in perfil, false);
});

test('[EQ-55] 400 ID inválido, 409 ya registrado (activo o inactivo), 404 desconocido y 503 directorio caído', async () => {
  const { modulo } = crearContexto();
  await assert.rejects(modulo.consultarColaborador.ejecutar('12a'), rechazaCon(400, 'ID_INVALIDO'));
  await assert.rejects(modulo.consultarColaborador.ejecutar(ANA), rechazaCon(409, 'YA_REGISTRADO'));
  await assert.rejects(modulo.consultarColaborador.ejecutar(BETO), rechazaCon(409, 'YA_REGISTRADO'));
  await assert.rejects(modulo.consultarColaborador.ejecutar('99999999'), rechazaCon(404, 'ID_NO_ENCONTRADO'));
  const caido = crearContexto({ proveedorCaido: true });
  await assert.rejects(caido.modulo.consultarColaborador.ejecutar(NUEVO), rechazaCon(503, 'SERVICIO_NO_DISPONIBLE'));
});

// ---------------------------------------------------------------- EQ-71

test('[EQ-71] lista por campus con datos del directorio y carga de aspirantes', async () => {
  const { modulo } = crearContexto();
  const { colaboradores, total, campus } = await modulo.listarColaboradores.ejecutar({ campus: NAINARI });
  assert.equal(total, 1, 'por defecto no incluye inactivos');
  assert.equal(colaboradores[0].idInstitucional, ANA);
  assert.equal(colaboradores[0].nombreCompleto, 'Ana Álvarez Ruiz');
  assert.equal(colaboradores[0].totalAspirantes, 3, 'cuenta toda su cartera (a1, a2, a6)');
  assert.deepEqual(campus, [CENTRO, NAINARI]);
});

test('[EQ-71] incluye inactivos, busca sin acentos y ordena por nombre', async () => {
  const { modulo } = crearContexto();
  const todos = await modulo.listarColaboradores.ejecutar({ incluirInactivos: 'true' });
  assert.deepEqual(todos.colaboradores.map((c) => c.idInstitucional), [ANA, BETO]);
  assert.equal(todos.colaboradores[1].activo, false);
  const busqueda = await modulo.listarColaboradores.ejecutar({ incluirInactivos: true, busqueda: 'alvarez' });
  assert.deepEqual(busqueda.colaboradores.map((c) => c.idInstitucional), [ANA]);
  await assert.rejects(modulo.listarColaboradores.ejecutar({ campus: 'Campus Marte' }), rechazaCon(400, 'CAMPUS_INVALIDO'));
});

test('[EQ-71] si el directorio no responde el listado sale igual, sin datos personales', async () => {
  const { modulo } = crearContexto({ proveedorCaido: true });
  const { colaboradores } = await modulo.listarColaboradores.ejecutar({});
  assert.equal(colaboradores.length, 1);
  assert.equal(colaboradores[0].nombreCompleto, null);
  assert.equal(colaboradores[0].totalAspirantes, 3);
});

// ---------------------------------------------------------------- EQ-64

test('[EQ-64] vista previa: aspirantes por carrera, responsables actuales y cargas antes/después', async () => {
  const { modulo, monitoreo } = crearContexto();
  const antes = JSON.stringify(monitoreo.repositorio.aspirantes);
  const vista = await modulo.previsualizarDistribucion.ejecutar({ idInstitucional: NUEVO, campus: NAINARI, carreras: [SOFTWARE] });

  assert.equal(vista.colaborador.nombreCompleto, 'Nora Nueva Díaz');
  assert.equal(vista.totalAspirantes, 4);
  assert.deepEqual(vista.carreras, [{
    carrera: SOFTWARE, totalAspirantes: 4, sinResponsable: 1,
    responsablesActuales: [
      { colaboradorId: ANA, nombreCompleto: 'Ana Álvarez Ruiz', aspirantes: 2 },
      { colaboradorId: BETO, nombreCompleto: 'Beto Barrios Soto', aspirantes: 1 },
    ],
  }]);
  assert.deepEqual(vista.cargas.map(({ colaboradorId, antes: a, despues: d, esNuevo }) => [colaboradorId, a, d, esNuevo]), [
    [NUEVO, 0, 4, true],
    [ANA, 3, 1, false],
    [BETO, 2, 1, false],
  ]);
  assert.equal(JSON.stringify(monitoreo.repositorio.aspirantes), antes, 'la vista previa no modifica nada');
});

test('[EQ-64] la vista previa valida igual que la confirmación', async () => {
  const { modulo } = crearContexto();
  const vp = (s) => modulo.previsualizarDistribucion.ejecutar(s);
  await assert.rejects(vp({ idInstitucional: 'x', campus: NAINARI, carreras: [SOFTWARE] }), rechazaCon(400, 'ID_INVALIDO'));
  await assert.rejects(vp({ idInstitucional: ANA, campus: NAINARI, carreras: [SOFTWARE] }), rechazaCon(409, 'YA_REGISTRADO'));
  await assert.rejects(vp({ idInstitucional: NUEVO, campus: '', carreras: [SOFTWARE] }), rechazaCon(400, 'CAMPUS_OBLIGATORIO'));
  await assert.rejects(vp({ idInstitucional: NUEVO, campus: NAINARI, carreras: [] }), rechazaCon(400, 'CARRERAS_OBLIGATORIAS'));
  await assert.rejects(vp({ idInstitucional: NUEVO, campus: CENTRO, carreras: [INDUSTRIAL] }), rechazaCon(400, 'CARRERA_INVALIDA'));
});

// ---------------------------------------------------------------- EQ-59

test('[EQ-59] confirma: guarda al colaborador, reasigna, deja bitácora, borra el borrador y publica el evento', async () => {
  const { modulo, monitoreo, bus, borradores } = crearContexto();
  borradores.guardarBorrador({ idInstitucional: NUEVO, campus: NAINARI, carreras: [SOFTWARE] });

  const r = await modulo.confirmarRegistro.ejecutar(
    { idInstitucional: NUEVO, campus: NAINARI, carreras: [SOFTWARE, SOFTWARE] },
    { administradorId: ADMIN },
  );

  assert.equal(r.confirmado, true);
  assert.deepEqual(r.asignacion.aspirantesIds, ['a1', 'a2', 'a3', 'a4']);
  assert.deepEqual(r.colaborador.carrerasAsignadas, [SOFTWARE], 'sin duplicados');
  const guardado = await modulo.repositorio.obtenerPorId(NUEVO);
  assert.equal(guardado.estado, 'activo');
  assert.equal(guardado.registradoPor, ADMIN);
  assert.equal(guardado.fechaRegistro, '2026-11-24T17:00:00.000Z');

  const duenos = Object.fromEntries(monitoreo.repositorio.aspirantes.map((a) => [a.id, a.colaboradorId]));
  assert.deepEqual(duenos, { a1: NUEVO, a2: NUEVO, a3: NUEVO, a4: NUEVO, a5: BETO, a6: ANA });

  assert.deepEqual(
    modulo.repositorio.bitacoraTransferencias.map((t) => [t.aspiranteId, t.colaboradorOrigen, t.colaboradorDestino, t.motivo, t.realizadoPor]),
    [['a1', ANA, NUEVO, 'alta', ADMIN], ['a2', ANA, NUEVO, 'alta', ADMIN], ['a3', BETO, NUEVO, 'alta', ADMIN], ['a4', null, NUEVO, 'alta', ADMIN]],
  );
  assert.equal(borradores.obtenerBorrador(NUEVO), null);

  const [publicado] = bus.publicados();
  assert.equal(publicado.routingKey, 'colaboradores.registro.confirmado');
  assert.equal(publicado.evento.correoInstitucional, 'nora@itson.edu.mx');
  assert.deepEqual(publicado.evento.aspirantesAsignados, ['a1', 'a2', 'a3', 'a4']);
});

test('[EQ-59] si falla la cartera se revierte el alta y no se publica nada', async () => {
  const { modulo, monitoreo, bus } = crearContexto();
  monitoreo.repositorio.reasignarAspirantes = async () => { throw new Error('BD de aspirantes caída'); };
  await assert.rejects(
    modulo.confirmarRegistro.ejecutar({ idInstitucional: NUEVO, campus: NAINARI, carreras: [SOFTWARE] }, { administradorId: ADMIN }),
    /BD de aspirantes caída/,
  );
  assert.equal(await modulo.repositorio.existe(NUEVO), false);
  assert.equal(bus.publicados().length, 0);
});

test('[EQ-59] si falla la bitácora (después de reasignar) se compensa la cartera', async () => {
  const { modulo, monitoreo, bus } = crearContexto();
  const antes = monitoreo.repositorio.aspirantes.map((a) => a.colaboradorId);
  const carrerasAntes = monitoreo.repositorio.carrerasPorColaborador[NUEVO];
  modulo.repositorio.registrarTransferencias = async () => { throw new Error('fallo al escribir la bitácora'); };

  await assert.rejects(
    modulo.confirmarRegistro.ejecutar({ idInstitucional: NUEVO, campus: NAINARI, carreras: [SOFTWARE] }, { administradorId: ADMIN }),
    /bitácora/,
  );
  assert.deepEqual(monitoreo.repositorio.aspirantes.map((a) => a.colaboradorId), antes, 'los aspirantes regresan a su dueño');
  assert.equal(monitoreo.repositorio.carrerasPorColaborador[NUEVO], carrerasAntes);
  assert.equal(await modulo.repositorio.existe(NUEVO), false);
  assert.equal(bus.publicados().length, 0);
});

test('[EQ-59] dos confirmaciones simultáneas del mismo ID: solo una gana', async () => {
  const { modulo, bus } = crearContexto();
  const solicitud = { idInstitucional: NUEVO, campus: NAINARI, carreras: [SOFTWARE] };
  const resultados = await Promise.allSettled([
    modulo.confirmarRegistro.ejecutar(solicitud, { administradorId: ADMIN }),
    modulo.confirmarRegistro.ejecutar(solicitud, { administradorId: ADMIN }),
  ]);
  assert.equal(resultados.filter((r) => r.status === 'fulfilled').length, 1);
  const rechazo = resultados.find((r) => r.status === 'rejected').reason;
  assert.equal(rechazo.codigo, 'YA_REGISTRADO');
  assert.equal(bus.publicados().length, 1);
  assert.equal(modulo.repositorio.bitacoraTransferencias.length, 4, 'la bitácora no se duplica');
});

test('[EQ-59] un fallo del bus no deshace un registro ya confirmado', async () => {
  const { modulo } = crearContexto();
  const errores = [];
  modulo.confirmarRegistro.bus = { publicar: async () => { throw new Error('RabbitMQ caído'); } };
  modulo.confirmarRegistro.registrarError = (e) => errores.push(e.message);
  const r = await modulo.confirmarRegistro.ejecutar({ idInstitucional: NUEVO, campus: NAINARI, carreras: [SOFTWARE] });
  assert.equal(r.confirmado, true);
  assert.equal(await modulo.repositorio.existe(NUEVO), true);
  assert.deepEqual(errores, ['RabbitMQ caído']);
});

// ---------------------------------------------------------------- Puerto y Postgres

test('[EQ-59] ambos repositorios cumplen el puerto', () => {
  const memoria = new RepositorioColaboradoresMemoria();
  const postgres = new RepositorioColaboradoresPostgres({ db: { query: async () => ({ rows: [] }) }, catalogoIds: {} });
  for (const metodo of METODOS_REPOSITORIO_COLABORADORES) {
    assert.equal(typeof memoria[metodo], 'function', `memoria: ${metodo}`);
    assert.equal(typeof postgres[metodo], 'function', `postgres: ${metodo}`);
  }
});

function crearPoolFalso({ fallarEn } = {}) {
  const sentencias = [];
  let liberado = 0;
  const cliente = {
    async query(sql) {
      const limpia = sql.trim().split(/\s+/).slice(0, 3).join(' ');
      sentencias.push(limpia);
      if (fallarEn && sql.includes(fallarEn)) throw new Error(`falla en ${fallarEn}`);
      if (sql.includes('RETURNING id')) return { rows: [{ id: 'uuid-1' }] };
      return { rows: [] };
    },
    release() { liberado += 1; },
  };
  return {
    pool: { query: cliente.query, connect: async () => cliente },
    sentencias,
    liberado: () => liberado,
  };
}

const catalogoIds = {
  idCampus: (n) => ({ [NAINARI]: 1 })[n],
  nombreCampus: (id) => ({ 1: NAINARI })[id],
  idCarrera: (n) => ({ [SOFTWARE]: 10 })[n],
  nombreCarrera: (id) => ({ 10: SOFTWARE })[id],
};

test('[EQ-59] Postgres: BEGIN … COMMIT cuando todo sale bien', async () => {
  const { pool, sentencias, liberado } = crearPoolFalso();
  const repo = new RepositorioColaboradoresPostgres({ db: pool, catalogoIds });
  await repo.transaccion(async (tx) => {
    await tx.guardar({ idInstitucional: NUEVO, rol: 'colaborador', estado: 'activo', campus: NAINARI, carreras: [SOFTWARE] });
  });
  assert.equal(sentencias[0], 'BEGIN');
  assert.match(sentencias[1], /^INSERT INTO usuarios.usuario/);
  assert.match(sentencias[2], /^INSERT INTO usuarios.colaborador_carrera/);
  assert.equal(sentencias.at(-1), 'COMMIT');
  assert.equal(liberado(), 1);
});

test('[EQ-59] Postgres: ROLLBACK y se libera el cliente si algo falla', async () => {
  const { pool, sentencias, liberado } = crearPoolFalso({ fallarEn: 'colaborador_carrera' });
  const repo = new RepositorioColaboradoresPostgres({ db: pool, catalogoIds });
  await assert.rejects(repo.transaccion((tx) => tx.guardar({ idInstitucional: NUEVO, campus: NAINARI, carreras: [SOFTWARE] })));
  assert.equal(sentencias.at(-1), 'ROLLBACK');
  assert.equal(sentencias.includes('COMMIT'), false);
  assert.equal(liberado(), 1);
});
