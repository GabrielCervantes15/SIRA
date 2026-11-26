/**
 * EQ-70 / HU6-11: autorización para casos especiales y transferencia manual
 * de expedientes entre campus, con bitácora y compensación ante fallos.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearProveedorAutenticacionSimulado } from '../src/modulos/autenticacion/index.js';
import { crearModuloMonitoreo } from '../src/modulos/monitoreo/index.js';
import { crearBusEnMemoria } from '../src/compartido/eventos/bus-en-memoria.js';
import { crearCatalogoRegistroDemo } from '../src/modulos/colaboradores/catalogo-registro-demo.js';
import { crearModuloColaboradores, RepositorioColaboradoresPostgres } from '../src/modulos/colaboradores/index.js';
import { RepositorioMonitoreoPostgres } from '../src/modulos/monitoreo/index.js';
import { crearServidor } from '../src/servidor.js';

const ADMIN = '00000100001';
const DESTINO = '00000252115';
const ORIGEN = '00000233231';
const INACTIVO = '00000247933';
const NAINARI = 'Campus Obregón Náinari';
const CENTRO = 'Campus Obregón Centro';
const NAVOJOA = 'Campus Navojoa';

function crearContexto() {
  const usuarios = [
    { idInstitucional: ADMIN, password: 'AdminPassword2026!', nombreCompleto: 'Admin Prueba', activo: true },
    { idInstitucional: DESTINO, password: 'Password123!', nombreCompleto: 'Destino Prueba', activo: true },
    { idInstitucional: ORIGEN, password: 'Password123!', nombreCompleto: 'Origen Prueba', activo: true },
  ];
  const aspirantes = [
    { id: 'asp-centro-01', nombreCompleto: 'Aspirante Centro', campus: CENTRO, colaboradorId: ORIGEN, carreraSolicitada: 'Ingeniería Industrial' },
    { id: 'asp-navojoa-01', nombreCompleto: 'Aspirante Navojoa', campus: NAVOJOA, colaboradorId: DESTINO, carreraSolicitada: 'Ingeniería en Software' },
    { id: 'asp-nainari-01', nombreCompleto: 'Aspirante Náinari', campus: NAINARI, colaboradorId: ORIGEN, carreraSolicitada: 'Ingeniería en Software' },
  ];
  const monitoreo = crearModuloMonitoreo({ datosSemilla: { aspirantes, conversaciones: [], historial: [] } });
  const proveedor = crearProveedorAutenticacionSimulado({ usuarios });
  const modulo = crearModuloColaboradores({
    proveedorAutenticacion: proveedor,
    cartera: monitoreo.cartera,
    catalogo: crearCatalogoRegistroDemo(aspirantes),
    bus: crearBusEnMemoria(),
    colaboradores: [
      { idInstitucional: DESTINO, rol: 'colaborador', estado: 'activo', campus: NAINARI, carreras: ['Ingeniería en Software'] },
      { idInstitucional: ORIGEN, rol: 'colaborador', estado: 'activo', campus: CENTRO, carreras: ['Ingeniería Industrial'] },
      { idInstitucional: INACTIVO, rol: 'colaborador', estado: 'inactivo', campus: NAVOJOA, carreras: ['Ingeniería en Software'], casosEspeciales: true },
    ],
  });
  return { modulo, monitoreo, usuarios };
}

const rechazaCon = (status, codigo) => (error) => error.status === status && error.codigo === codigo;

test('[EQ-70] la casilla inicia desactivada y solo se actualiza con booleano para un colaborador registrado', async () => {
  const { modulo } = crearContexto();
  const antes = await modulo.repositorio.obtenerPorId(DESTINO);
  assert.equal(antes.casosEspeciales, false);

  await assert.rejects(
    modulo.actualizarCasosEspeciales.ejecutar(DESTINO, 'true'),
    rechazaCon(400, 'CASOS_ESPECIALES_INVALIDO'),
  );
  await assert.rejects(
    modulo.actualizarCasosEspeciales.ejecutar('00000999999', true),
    rechazaCon(404, 'COLABORADOR_NO_ENCONTRADO'),
  );

  const actualizado = await modulo.actualizarCasosEspeciales.ejecutar(DESTINO, true);
  assert.equal(actualizado.actualizado, true);
  assert.equal(actualizado.colaborador.casosEspeciales, true);
  assert.equal((await modulo.repositorio.obtenerPorId(DESTINO)).casosEspeciales, true);

  const listado = await modulo.listarColaboradores.ejecutar({ incluirInactivos: true });
  assert.equal(listado.colaboradores.find((c) => c.idInstitucional === DESTINO).casosEspeciales, true);
  assert.equal(listado.colaboradores.find((c) => c.idInstitucional === ORIGEN).casosEspeciales, false);
});

test('[EQ-70] rechaza transferencia si el destino no tiene la casilla activa o está inactivo', async () => {
  const { modulo } = crearContexto();
  await assert.rejects(
    modulo.transferirAspiranteManual.ejecutar(
      { aspiranteId: 'asp-centro-01', colaboradorDestino: DESTINO },
      { administradorId: ADMIN },
    ),
    rechazaCon(409, 'COLABORADOR_SIN_CASOS_ESPECIALES'),
  );

  await modulo.actualizarCasosEspeciales.ejecutar(INACTIVO, true);
  await assert.rejects(
    modulo.transferirAspiranteManual.ejecutar(
      { aspiranteId: 'asp-centro-01', colaboradorDestino: INACTIVO },
      { administradorId: ADMIN },
    ),
    rechazaCon(409, 'COLABORADOR_DESTINO_INACTIVO'),
  );
});

test('[EQ-70] transfiere entre campus, conserva el expediente y registra motivo manual en bitácora', async () => {
  const { modulo, monitoreo } = crearContexto();
  await modulo.actualizarCasosEspeciales.ejecutar(DESTINO, true);

  const resultado = await modulo.transferirAspiranteManual.ejecutar(
    { aspiranteId: 'asp-centro-01', colaboradorDestino: DESTINO },
    { administradorId: ADMIN },
  );

  assert.equal(resultado.transferido, true);
  assert.equal(resultado.transferencia.aspiranteId, 'asp-centro-01');
  assert.equal(resultado.transferencia.campusOrigen, CENTRO);
  assert.equal(resultado.transferencia.campusDestino, NAINARI);
  assert.equal(resultado.transferencia.colaboradorOrigen, ORIGEN);
  assert.equal(resultado.transferencia.colaboradorDestino, DESTINO);
  assert.equal(resultado.transferencia.motivo, 'manual');
  assert.equal(resultado.transferencia.realizadoPor, ADMIN);

  const aspirante = await monitoreo.cartera.obtenerAspirantePorId('asp-centro-01');
  assert.equal(aspirante.colaboradorId, DESTINO);
  assert.deepEqual(
    modulo.repositorio.bitacoraTransferencias.map((t) => [t.aspiranteId, t.colaboradorOrigen, t.colaboradorDestino, t.motivo, t.realizadoPor]),
    [['asp-centro-01', ORIGEN, DESTINO, 'manual', ADMIN]],
  );
});

test('[EQ-70] solo permite expedientes de campus distinto y evita transferir al mismo responsable', async () => {
  const { modulo } = crearContexto();
  await modulo.actualizarCasosEspeciales.ejecutar(DESTINO, true);

  await assert.rejects(
    modulo.transferirAspiranteManual.ejecutar(
      { aspiranteId: 'asp-nainari-01', colaboradorDestino: DESTINO },
      { administradorId: ADMIN },
    ),
    rechazaCon(422, 'MISMO_CAMPUS'),
  );

  await assert.rejects(
    modulo.transferirAspiranteManual.ejecutar(
      { aspiranteId: 'asp-navojoa-01', colaboradorDestino: DESTINO },
      { administradorId: ADMIN },
    ),
    rechazaCon(409, 'YA_ASIGNADO'),
  );
});

test('[EQ-70] si falla la bitácora, se revierte el cambio de responsable', async () => {
  const { modulo, monitoreo } = crearContexto();
  await modulo.actualizarCasosEspeciales.ejecutar(DESTINO, true);
  modulo.repositorio.registrarTransferenciaManual = async () => { throw new Error('falló la bitácora'); };

  await assert.rejects(
    modulo.transferirAspiranteManual.ejecutar(
      { aspiranteId: 'asp-centro-01', colaboradorDestino: DESTINO },
      { administradorId: ADMIN },
    ),
    /falló la bitácora/,
  );
  const aspirante = await monitoreo.cartera.obtenerAspirantePorId('asp-centro-01');
  assert.equal(aspirante.colaboradorId, ORIGEN, 'se restaura el responsable anterior');
});

async function conServidor(ejecutar) {
  const servidor = crearServidor();
  await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try { await ejecutar({ base, servidor }); }
  finally { await new Promise((resolve) => servidor.close(resolve)); }
}

async function login(base, identificador, password) {
  const respuesta = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identificador, password }),
  });
  assert.equal(respuesta.status, 200);
  return respuesta.headers.get('set-cookie').split(';')[0];
}

test('[EQ-70] HTTP: requiere administrador para activar la casilla y transferir expedientes', async () => {
  await conServidor(async ({ base, servidor }) => {
    const sinSesion = await fetch(`${base}/api/v1/colaboradores/${DESTINO}/casos-especiales`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ casosEspeciales: true }),
    });
    assert.equal(sinSesion.status, 401);

    const colaborador = await login(base, DESTINO, 'Password123!');
    const prohibido = await fetch(`${base}/api/v1/colaboradores/${DESTINO}/casos-especiales`, {
      method: 'PATCH', headers: { Cookie: colaborador, 'Content-Type': 'application/json' }, body: JSON.stringify({ casosEspeciales: true }),
    });
    assert.equal(prohibido.status, 403);

    const admin = await login(base, ADMIN, 'AdminPassword2026!');
    const activar = await fetch(`${base}/api/v1/colaboradores/${DESTINO}/casos-especiales`, {
      method: 'PATCH', headers: { Cookie: admin, 'Content-Type': 'application/json' }, body: JSON.stringify({ casosEspeciales: true }),
    });
    assert.equal(activar.status, 200);
    assert.equal((await activar.json()).colaborador.casosEspeciales, true);

    const transferencia = await fetch(`${base}/api/v1/colaboradores/transferencias-manuales`, {
      method: 'POST',
      headers: { Cookie: admin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ aspiranteId: 'asp-003', colaboradorDestino: DESTINO }),
    });
    assert.equal(transferencia.status, 200, await transferencia.clone().text());
    const cuerpo = await transferencia.json();
    assert.equal(cuerpo.transferido, true);
    assert.equal(cuerpo.transferencia.motivo, 'manual');
    assert.equal(servidor.modulos.monitoreo.repositorio.aspirantes.find((a) => a.id === 'asp-003').colaboradorId, DESTINO);
    assert.equal(servidor.modulos.colaboradores.repositorio.bitacoraTransferencias.at(-1).motivo, 'manual');

    const listado = await fetch(`${base}/api/v1/colaboradores`, { headers: { Cookie: admin } });
    const lista = await listado.json();
    assert.equal(lista.colaboradores.find((c) => c.idInstitucional === DESTINO).casosEspeciales, true);

    const noAdminTransfer = await fetch(`${base}/api/v1/colaboradores/transferencias-manuales`, {
      method: 'POST', headers: { Cookie: colaborador, 'Content-Type': 'application/json' },
      body: JSON.stringify({ aspiranteId: 'asp-004', colaboradorDestino: DESTINO }),
    });
    assert.equal(noAdminTransfer.status, 403);
  });
});


test('[EQ-70] PostgreSQL: persiste la casilla y mapea el estado del colaborador', async () => {
  const llamadas = [];
  const db = {
    async query(sql, params) {
      llamadas.push({ sql, params });
      if (sql.includes('UPDATE usuarios.usuario')) return { rows: [{ idInstitucional: DESTINO }] };
      if (sql.includes('FROM usuarios.usuario u')) {
        return { rows: [{
          idInstitucional: DESTINO,
          rol: 'colaborador',
          estado: 'activo',
          campusId: 1,
          casosEspeciales: true,
          fechaRegistro: '2026-08-03T16:00:00.000Z',
          carrerasIds: [],
        }] };
      }
      return { rows: [] };
    },
  };
  const repo = new RepositorioColaboradoresPostgres({
    db,
    catalogoIds: { nombreCampus: (id) => id === 1 ? NAINARI : null, nombreCarrera: () => null },
  });
  const colaborador = await repo.actualizarCasosEspeciales(DESTINO, true);
  assert.equal(colaborador.casosEspeciales, true);
  assert.match(llamadas[0].sql, /casos_especiales = \$2/);
  assert.deepEqual(llamadas[0].params, [DESTINO, true]);
});

test('[EQ-70] PostgreSQL: transfiere expediente y permite compensar si falla la bitácora', async () => {
  const llamadas = [];
  const db = {
    async query(sql, params) {
      llamadas.push({ sql, params });
      if (sql.includes('WITH previo AS MATERIALIZED')) {
        return { rows: [{
          aspiranteId: 'asp-centro-01',
          campus: CENTRO,
          nombreCompleto: 'Aspirante Centro',
          colaboradorAnterior: ORIGEN,
          transferido: true,
        }] };
      }
      return { rows: [] };
    },
  };
  const repo = new RepositorioMonitoreoPostgres({ db });
  const movimiento = await repo.transferirAspiranteManual({ aspiranteId: 'asp-centro-01', colaboradorDestino: DESTINO });
  assert.equal(movimiento.transferido, true);
  assert.equal(movimiento.colaboradorAnterior, ORIGEN);
  await movimiento.deshacer();
  assert.match(llamadas[0].sql, /FOR UPDATE/);
  assert.match(llamadas[1].sql, /SET colaborador_id = \$2/);
  assert.deepEqual(llamadas[1].params, ['asp-centro-01', ORIGEN, DESTINO]);
});

test('[EQ-70] PostgreSQL: no acepta una bitácora incompleta', async () => {
  const repo = new RepositorioColaboradoresPostgres({
    db: { query: async () => ({ rows: [] }) },
    catalogoIds: {},
  });
  await assert.rejects(
    repo.registrarTransferenciaManual({
      aspiranteId: 'asp-centro-01',
      colaboradorOrigen: ORIGEN,
      colaboradorDestino: DESTINO,
      motivo: 'manual',
      realizadoPor: ADMIN,
    }),
    (error) => error.status === 500 && error.codigo === 'BITACORA_INCOMPLETA',
  );
});

test('[EQ-59] PostgreSQL: registrarTransferencias conserva su contrato masivo existente', async () => {
  let consulta = '';
  const repo = new RepositorioColaboradoresPostgres({
    db: { query: async (sql) => { consulta = sql; return { rows: [] }; } },
    catalogoIds: {},
  });

  await assert.doesNotReject(repo.registrarTransferencias([{
    aspiranteId: 'asp-centro-01',
    colaboradorOrigen: ORIGEN,
    colaboradorDestino: DESTINO,
    motivo: 'alta',
    realizadoPor: ADMIN,
  }]));
  assert.doesNotMatch(consulta, /RETURNING\s+aspirante_id/i);
});
