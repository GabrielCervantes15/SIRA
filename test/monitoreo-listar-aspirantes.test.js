import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { crearServidor } from '../src/servidor.js';
import {
  crearModuloMonitoreo,
  ListarAspirantesCasoUso,
  RepositorioMonitoreoMemoria,
} from '../src/modulos/monitoreo/index.js';

const ASPIRANTES_PRUEBA = [
  {
    id: 'asp-001',
    folioSolicitud: 'FOL-2026-00101',
    nombreCompleto: 'Carlos Mendoza Armenta',
    correo: 'carlos.mendoza@gmail.com',
    carreraSolicitada: 'Ingeniería en Software',
    preparatoriaProcedencia: 'CBTIS 37',
    periodo: '2027-1',
    fechaSolicitud: '2026-10-15T09:00:00Z',
    estadoSolicitud: 'EN_REVISION',
    semaforo: 'ROJO',
    colaboradorId: 'colab-001',
    fechaUltimaActividad: '2026-10-25T14:30:00Z',
  },
  {
    id: 'asp-002',
    folioSolicitud: 'FOL-2026-00102',
    nombreCompleto: 'María Fernanda López Vega',
    correo: 'mafer.lopez@outlook.com',
    carreraSolicitada: 'Licenciatura en Administración',
    preparatoriaProcedencia: 'COBACH Obregón 1',
    periodo: '2027-1',
    fechaSolicitud: '2026-10-18T11:15:00Z',
    estadoSolicitud: 'ACEPTADA',
    semaforo: 'VERDE',
    colaboradorId: 'colab-001',
    fechaUltimaActividad: '2026-11-08T16:45:00Z',
  },
  {
    id: 'asp-003',
    folioSolicitud: 'FOL-2026-00103',
    nombreCompleto: 'Jorge Luis Valenzuela Ruiz',
    correo: 'jorge.valenzuela@hotmail.com',
    carreraSolicitada: 'Ingeniería Industrial',
    preparatoriaProcedencia: 'CECyTE Esperanza',
    periodo: '2027-1',
    fechaSolicitud: '2026-10-20T10:00:00Z',
    estadoSolicitud: 'RECHAZADA',
    semaforo: 'AMARILLO',
    colaboradorId: 'colab-002',
    fechaUltimaActividad: '2026-11-06T11:20:00Z',
  },
  {
    id: 'asp-004',
    folioSolicitud: 'FOL-2026-00104',
    nombreCompleto: 'Ángel Ramírez Beltrán',
    correo: 'angel.ramirez@gmail.com',
    carreraSolicitada: 'Ingeniería en Software',
    preparatoriaProcedencia: 'CBTIS 37',
    periodo: '2027-1',
    fechaSolicitud: '2026-10-22T09:30:00Z',
    estadoSolicitud: 'RECIBIDA',
    semaforo: 'AMARILLO',
    colaboradorId: 'colab-001',
    fechaUltimaActividad: '2026-11-01T12:00:00Z',
  },
];

function peticionHttp(puerto, path, opciones = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: puerto,
        path,
        method: opciones.method || 'GET',
        headers: opciones.headers || {},
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(data);
          } catch {
            // No es json
          }
          resolve({ status: res.statusCode, headers: res.headers, body: json || data });
        });
      }
    );
    req.on('error', reject);
    if (opciones.body) {
      req.write(typeof opciones.body === 'string' ? opciones.body : JSON.stringify(opciones.body));
    }
    req.end();
  });
}

test('[HU2-4] ListarAspirantesCasoUso rechaza petición sin colaboradorId con 401', async () => {
  const repo = new RepositorioMonitoreoMemoria({ aspirantes: ASPIRANTES_PRUEBA });
  const casoUso = new ListarAspirantesCasoUso({ repositorioMonitoreo: repo });

  await assert.rejects(
    () => casoUso.ejecutar({ colaboradorId: '' }),
    (error) => {
      assert.equal(error.status, 401);
      assert.equal(error.codigo, 'NO_AUTORIZADO');
      return true;
    }
  );
});

test('[HU2-4] Repositorio filtra por defecto únicamente los aspirantes del colaborador', async () => {
  const repo = new RepositorioMonitoreoMemoria({ aspirantes: ASPIRANTES_PRUEBA });

  // Consulta para colab-001 (o su ID institucional '00000252115')
  const resultado1 = await repo.listarAspirantes({ colaboradorId: 'colab-001' });
  assert.equal(resultado1.total, 3);
  assert.ok(resultado1.aspirantes.every((a) => a.colaboradorId === 'colab-001'));

  // Consulta para colab-002
  const resultado2 = await repo.listarAspirantes({ colaboradorId: 'colab-002' });
  assert.equal(resultado2.total, 1);
  assert.equal(resultado2.aspirantes[0].id, 'asp-003');
});

test('[HU2-4] Repositorio mapea ID institucional a aspirantes del colaborador', async () => {
  const repo = new RepositorioMonitoreoMemoria({ aspirantes: ASPIRANTES_PRUEBA });

  const resultado = await repo.listarAspirantes({ colaboradorId: '00000252115' });
  assert.equal(resultado.total, 3);
});

test('[HU2-4] Búsqueda por nombre es parcial, insensible a mayúsculas y acentos (unaccent)', async () => {
  const repo = new RepositorioMonitoreoMemoria({ aspirantes: ASPIRANTES_PRUEBA });

  // Buscar 'carlos' con minúsculas y sin acento
  const res1 = await repo.listarAspirantes({ colaboradorId: 'colab-001', nombre: 'carlos' });
  assert.equal(res1.total, 1);
  assert.equal(res1.aspirantes[0].nombreCompleto, 'Carlos Mendoza Armenta');

  // Buscar 'angel' sin acento debe coincidir con 'Ángel Ramírez Beltrán'
  const res2 = await repo.listarAspirantes({ colaboradorId: 'colab-001', nombre: 'angel' });
  assert.equal(res2.total, 1);
  assert.equal(res2.aspirantes[0].id, 'asp-004');

  // Buscar 'RAMIREZ' en mayúsculas sin acento
  const res3 = await repo.listarAspirantes({ colaboradorId: 'colab-001', nombre: 'RAMIREZ' });
  assert.equal(res3.total, 1);
  assert.equal(res3.aspirantes[0].id, 'asp-004');
});

test('[HU2-4] Filtro mostrar_aceptados=false oculta aspirantes con estado ACEPTADA', async () => {
  const repo = new RepositorioMonitoreoMemoria({ aspirantes: ASPIRANTES_PRUEBA });

  // Con mostrarAceptados: false, debe excluir asp-002 (María Fernanda López Vega, ACEPTADA)
  const resSinAceptados = await repo.listarAspirantes({
    colaboradorId: 'colab-001',
    mostrarAceptados: false,
  });
  assert.equal(resSinAceptados.total, 2);
  assert.ok(resSinAceptados.aspirantes.every((a) => a.estadoSolicitud !== 'ACEPTADA'));

  // Con mostrarAceptados: true, debe incluir a todos los 3
  const resConAceptados = await repo.listarAspirantes({
    colaboradorId: 'colab-001',
    mostrarAceptados: true,
  });
  assert.equal(resConAceptados.total, 3);
});

test('[HU2-4] Filtros combinables: semaforo, carrera, preparatoria y periodo', async () => {
  const repo = new RepositorioMonitoreoMemoria({ aspirantes: ASPIRANTES_PRUEBA });

  // Filtrar por semáforo ROJO
  const resRojo = await repo.listarAspirantes({ colaboradorId: 'colab-001', semaforo: 'rojo' });
  assert.equal(resRojo.total, 1);
  assert.equal(resRojo.aspirantes[0].id, 'asp-001');

  // Combinación: carrera + preparatoria
  const resComb = await repo.listarAspirantes({
    colaboradorId: 'colab-001',
    carrera: 'Ingeniería en Software',
    preparatoria: 'CBTIS 37',
  });
  assert.equal(resComb.total, 2);

  // Combinación no coincidente
  const resVacio = await repo.listarAspirantes({
    colaboradorId: 'colab-001',
    carrera: 'Ingeniería en Software',
    semaforo: 'VERDE',
  });
  assert.equal(resVacio.total, 0);
});

test('[HU2-4] Paginación y ordenamiento por columna ascendente y descendente', async () => {
  const repo = new RepositorioMonitoreoMemoria({ aspirantes: ASPIRANTES_PRUEBA });

  // Paginación: limit 2, offset 0
  const pag1 = await repo.listarAspirantes({
    colaboradorId: 'colab-001',
    limit: 2,
    offset: 0,
    ordenarPor: 'nombre',
    ordenDireccion: 'ASC',
  });
  assert.equal(pag1.total, 3);
  assert.equal(pag1.aspirantes.length, 2);
  // 'Ángel Ramírez Beltrán' primero alfabéticamente
  assert.equal(pag1.aspirantes[0].id, 'asp-004');
  assert.equal(pag1.aspirantes[1].id, 'asp-001');

  // Paginación: limit 2, offset 2
  const pag2 = await repo.listarAspirantes({
    colaboradorId: 'colab-001',
    limit: 2,
    offset: 2,
    ordenarPor: 'nombre',
    ordenDireccion: 'ASC',
  });
  assert.equal(pag2.total, 3);
  assert.equal(pag2.aspirantes.length, 1);
  assert.equal(pag2.aspirantes[0].id, 'asp-002');
});

test('[HU2-4] HTTP GET /api/monitoreo/aspirantes requiere autenticación (401)', async () => {
  const servidor = crearServidor({ port: 0 });
  await new Promise((resolve) => servidor.listen(0, resolve));
  const puerto = servidor.address().port;

  try {
    const res = await peticionHttp(puerto, '/api/monitoreo/aspirantes');
    assert.equal(res.status, 401);
    assert.equal(res.body.codigo, 'NO_AUTORIZADO');
  } finally {
    servidor.close();
  }
});

test('[HU2-4] HTTP GET /api/monitoreo/aspirantes retorna lista de aspirantes con filtros combinados', async () => {
  const moduloMonitoreo = crearModuloMonitoreo({
    datosSemilla: {
      aspirantes: ASPIRANTES_PRUEBA,
      conversaciones: [],
    },
  });

  const servidor = crearServidor({ port: 0, moduloMonitoreo });
  await new Promise((resolve) => servidor.listen(0, resolve));
  const puerto = servidor.address().port;

  try {
    // 1. Iniciar sesión con Sebastián (00000252115 / colab-001)
    const loginRes = await peticionHttp(puerto, '/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { identificador: '00000252115', password: 'Password123!' },
    });
    assert.equal(loginRes.status, 200);
    const cookie = loginRes.headers['set-cookie']?.[0]?.split(';')[0];
    assert.ok(cookie);

    // 2. Consultar lista sin filtros adicionales
    const resLista = await peticionHttp(puerto, '/api/monitoreo/aspirantes', {
      headers: { Cookie: cookie },
    });
    assert.equal(resLista.status, 200);
    assert.equal(resLista.body.total, 3);
    assert.equal(resLista.body.aspirantes.length, 3);

    // 3. Consultar con mostrar_aceptados=false
    const resOcultar = await peticionHttp(
      puerto,
      '/api/monitoreo/aspirantes?mostrar_aceptados=false',
      { headers: { Cookie: cookie } }
    );
    assert.equal(resOcultar.status, 200);
    assert.equal(resOcultar.body.total, 2);

    // 4. Consultar con búsqueda parcial de nombre
    const resNombre = await peticionHttp(
      puerto,
      '/api/monitoreo/aspirantes?nombre=carlos',
      { headers: { Cookie: cookie } }
    );
    assert.equal(resNombre.status, 200);
    assert.equal(resNombre.body.total, 1);
    assert.equal(resNombre.body.aspirantes[0].id, 'asp-001');

    // 5. Soporta alias versionado /api/v1/monitoreo/aspirantes
    const resV1 = await peticionHttp(puerto, '/api/v1/monitoreo/aspirantes', {
      headers: { Cookie: cookie },
    });
    assert.equal(resV1.status, 200);
    assert.equal(resV1.body.total, 3);
  } finally {
    servidor.close();
  }
});

