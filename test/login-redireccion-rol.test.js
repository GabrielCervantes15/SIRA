import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const codigoLogin = readFileSync(new URL('../public/login/app.js', import.meta.url), 'utf8');

// Simula el navegador sin dependencias externas para probar la redirección
// después de una respuesta válida del servidor. No sustituye las pruebas HTTP.
async function simularInicioSesion({ rol, status = 200, codigo = '' }) {
  const eventos = new Map();
  const destinos = [];
  const clases = () => ({ add() {}, remove() {}, toggle() {} });
  const input = (valor) => ({
    value: valor,
    type: 'text',
    closest: () => ({ classList: clases() }),
    addEventListener() {},
    focus() {},
  });
  const identificador = input('00000100001');
  const password = input('AdminPassword2026!');
  const boton = {
    disabled: false,
    classList: clases(),
    querySelector: () => ({ textContent: '' }),
  };
  const nodos = {
    '#login-form': { addEventListener: (nombre, fn) => eventos.set(nombre, fn) },
    '#identifier': identificador,
    '#password': password,
    '#toggle-password': { addEventListener() {} },
    '#submit-button': boton,
    '#feedback': { hidden: true, textContent: '', className: '' },
    '#forgot-password': { addEventListener() {} },
  };
  const document = {
    querySelector: (selector) => nodos[selector],
    querySelectorAll: () => [],
  };
  const fetch = async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => status === 200
      ? { autenticado: true, usuario: { rol } }
      : { codigo, mensaje: 'No autorizado' },
  });
  const window = { location: { assign: (destino) => destinos.push(destino) } };
  runInNewContext(codigoLogin, { document, fetch, window });
  await eventos.get('submit')({ preventDefault() {} });
  return destinos;
}

test('[EQ-62] login de administrador abre la vista de Colaboradores', async () => {
  assert.deepEqual(await simularInicioSesion({ rol: 'administrador' }), ['/app/colaboradores/registro.html']);
});

test('[EQ-62] login de colaborador conserva el Monitoreo', async () => {
  assert.deepEqual(await simularInicioSesion({ rol: 'colaborador' }), ['/app']);
});

test('[EQ-62] login rechazado nunca redirige a ninguna vista', async () => {
  assert.deepEqual(await simularInicioSesion({ rol: '', status: 403, codigo: 'USUARIO_SIN_ACCESO' }), []);
});
