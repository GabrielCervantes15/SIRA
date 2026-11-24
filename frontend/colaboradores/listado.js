/**
 * EQ-71 · Vista de colaborador del listado (Figma «Colaboradores - Vista de colaborador»).
 * Solo consulta: sin mostrar inactivos, sin registrar y sin inactivar.
 * El administrador usa registro.html, que agrega esas opciones.
 */
import { iniciarListadoColaboradores } from './listado-colaboradores.js';
import { inicialesUsuario } from '../js/usuario.js';

const $ = (id) => document.getElementById(id);

async function iniciar() {
  const respuesta = await fetch('/api/v1/auth/session', { credentials: 'same-origin', cache: 'no-store' });
  if (respuesta.status === 401) { window.location.replace('/?expired=1'); return; }
  const { usuario } = await respuesta.json();
  if (usuario?.rol === 'administrador') { window.location.replace('/app/colaboradores/registro.html'); return; }
  $('nombre-usuario').textContent = usuario?.nombreCompleto ?? 'Usuario SIRA';
  $('avatar-usuario').textContent = inicialesUsuario(usuario?.nombreCompleto);
  $('cerrar-sesion').addEventListener('click', async () => {
    await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'same-origin' });
    window.location.replace('/');
  });
  await iniciarListadoColaboradores({ esAdministrador: false });
}

iniciar();
