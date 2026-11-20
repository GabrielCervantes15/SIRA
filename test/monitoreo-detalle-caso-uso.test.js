import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RepositorioMonitoreoMemoria } from '../src/modulos/monitoreo/infraestructura/repositorio-monitoreo-memoria.js';
import { ObtenerDetalleAspiranteCasoUso } from '../src/modulos/monitoreo/aplicacion/obtener-detalle-aspirante.caso-uso.js';

const COLABORADOR = '00000252115'; // alias colab-001

function crearCasoUso() {
  const repositorio = new RepositorioMonitoreoMemoria({
    aspirantes: [
      {
        id: 'a1', folioSolicitud: 'F-1', nombreCompleto: 'Ana Prueba', correo: 'ana@ejemplo.mx',
        telefono: '+526440000001', campus: 'Náinari', carreraSolicitada: 'Ingeniería en Software',
        preparatoriaProcedencia: 'CBTIS 37', periodo: '2027-1', fechaSolicitud: '2026-10-15T09:00:00Z',
        estadoSolicitud: 'EN_REVISION', semaforo: 'ROJO', colaboradorId: 'colab-001',
      },
      {
        id: 'a2', folioSolicitud: 'F-2', nombreCompleto: 'Beto Sin Prepa', correo: 'beto@ejemplo.mx',
        telefono: '+526440000002', campus: 'Náinari', carreraSolicitada: 'Ingeniería Industrial',
        periodo: '2027-1', fechaSolicitud: '2026-10-16T09:00:00Z',
        estadoSolicitud: 'RECIBIDA', semaforo: 'VERDE', colaboradorId: 'colab-001',
      },
      {
        id: 'a3', folioSolicitud: 'F-3', nombreCompleto: 'Carla Ajena', correo: 'carla@ejemplo.mx',
        telefono: '+526440000003', campus: 'Centro', carreraSolicitada: 'Ingeniería Industrial',
        preparatoriaProcedencia: 'CBTIS 188', periodo: '2027-1', fechaSolicitud: '2026-10-17T09:00:00Z',
        estadoSolicitud: 'RECIBIDA', semaforo: 'ROJO', colaboradorId: 'colab-002',
      },
    ],
  });
  return new ObtenerDetalleAspiranteCasoUso({ repositorioMonitoreo: repositorio });
}

test('[EQ-42] detalle propio: devuelve solo los campos del expediente', async () => {
  const { aspirante } = await crearCasoUso().ejecutar({ colaboradorId: COLABORADOR, aspiranteId: 'a1' });
  assert.deepEqual(Object.keys(aspirante).sort(), [
    'carreraSolicitada', 'correo', 'estadoSolicitud', 'fechaSolicitud', 'id',
    'nombreCompleto', 'preparatoriaProcedencia', 'semaforo', 'telefono',
  ]);
  assert.equal('colaboradorId' in aspirante, false);
});

test('[EQ-42] aspirante sin preparatoria: no truena y regresa null', async () => {
  const { aspirante } = await crearCasoUso().ejecutar({ colaboradorId: COLABORADOR, aspiranteId: 'a2' });
  assert.equal(aspirante.preparatoriaProcedencia, null);
});

test('[EQ-42] inexistente: 404', async () => {
  await assert.rejects(
    crearCasoUso().ejecutar({ colaboradorId: COLABORADOR, aspiranteId: 'zzz' }),
    (e) => e.status === 404 && e.codigo === 'NO_ENCONTRADO',
  );
});

test('[EQ-42] de otro colaborador: 403', async () => {
  await assert.rejects(
    crearCasoUso().ejecutar({ colaboradorId: COLABORADOR, aspiranteId: 'a3' }),
    (e) => e.status === 403 && e.codigo === 'SIN_PERMISO',
  );
});

test('[EQ-42] sin colaborador autenticado: 401', async () => {
  await assert.rejects(
    crearCasoUso().ejecutar({ aspiranteId: 'a1' }),
    (e) => e.status === 401 && e.codigo === 'NO_AUTORIZADO',
  );
});