const welcome = document.querySelector('#welcome');
const profile = document.querySelector('#profile');
const role = document.querySelector('#role');

async function cargarSesion() {
  try {
    const response = await fetch('/api/v1/auth/session', { credentials: 'same-origin' });
    if (!response.ok) return window.location.replace('/');
    const { usuario } = await response.json();
    welcome.textContent = `Bienvenido, ${usuario.nombreCompleto}`;
    profile.textContent = `ID institucional: ${usuario.idInstitucional}`;
    role.textContent = `Rol detectado: ${usuario.rol}`;
  } catch {
    window.location.replace('/');
  }
}

document.querySelector('#logout').addEventListener('click', async () => {
  await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'same-origin' });
  window.location.replace('/');
});

cargarSesion();



// ========================================
// MONITOREO AUTOMÁTICO DE SESIÓN SIRA
// ========================================

let verificandoSesion = false;

async function verificarSesionAutomatica() {
    if (verificandoSesion) return;

    verificandoSesion = true;

    try {
        const respuesta = await fetch("/api/v1/auth/session", {
            method: "GET",
            credentials: "include",
            cache: "no-store"
        });

        if (respuesta.status === 401) {
            window.location.replace("/?expired=1");
            return;
        }

    } catch (error) {
        console.error("Error al verificar la sesión:", error);
    } finally {
        verificandoSesion = false;
    }
}

// Verificar al entrar al panel
verificarSesionAutomatica();

// Comprobar cada 5 segundos
setInterval(verificarSesionAutomatica, 5000);
