const form = document.querySelector('#login-form');
const identifierInput = document.querySelector('#identifier');
const passwordInput = document.querySelector('#password');
const togglePassword = document.querySelector('#toggle-password');
const submitButton = document.querySelector('#submit-button');
const feedback = document.querySelector('#feedback');
const forgotPassword = document.querySelector('#forgot-password');

function mostrarMensaje(message, type = 'error') {
  feedback.textContent = message;
  feedback.className = `feedback ${type}`;
  feedback.hidden = false;
}

function limpiarErrores() {
  feedback.textContent = '';
  feedback.hidden = true;
  feedback.className = 'feedback';
  document.querySelectorAll('.input-wrap').forEach((element) => element.classList.remove('has-error'));
}

function establecerCarga(loading) {
  submitButton.disabled = loading;
  submitButton.classList.toggle('is-loading', loading);
  submitButton.querySelector('.button-label').textContent = loading ? 'Verificando…' : 'Continuar';
}

togglePassword.addEventListener('click', () => {
  const mostrar = passwordInput.type === 'password';
  passwordInput.type = mostrar ? 'text' : 'password';
  togglePassword.setAttribute('aria-label', mostrar ? 'Ocultar contraseña' : 'Mostrar contraseña');
  togglePassword.setAttribute('aria-pressed', String(mostrar));
});

forgotPassword.addEventListener('click', (event) => {
  event.preventDefault();
  mostrarMensaje('Para restablecer tu contraseña institucional, contacta al área de soporte de ITSON.', 'info');
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  limpiarErrores();
  const identifier = identifierInput.value.trim();
  const password = passwordInput.value;

  if (!identifier || !password) {
    mostrarMensaje('Ingresa tu correo o ID y tu contraseña para continuar.');
    if (!identifier) identifierInput.closest('.input-wrap').classList.add('has-error');
    if (!password) passwordInput.closest('.input-wrap').classList.add('has-error');
    (!identifier ? identifierInput : passwordInput).focus();
    return;
  }

  establecerCarga(true);
  try {
    const response = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ identificador: identifier, password }),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      const messages = {
        CREDENCIALES_INVALIDAS: 'El correo, ID o contraseña no son correctos. Verifica tus datos e inténtalo nuevamente.',
        USUARIO_SIN_ACCESO: 'Tu cuenta institucional no tiene autorización para acceder a SIRA. Contacta al administrador del sistema.',
        SERVICIO_NO_DISPONIBLE: 'El servicio de identidad no está disponible en este momento. Inténtalo más tarde.',
        CUENTA_BLOQUEADA: 'Tu cuenta institucional está inactiva o bloqueada. Contacta al área de soporte.',
      };
      mostrarMensaje(messages[result.codigo] || result.mensaje || 'No fue posible iniciar sesión. Inténtalo nuevamente.');
      if (response.status === 401 || response.status === 403) passwordInput.closest('.input-wrap').classList.add('has-error');
      return;
    }

    // El backend determina el rol autorizado; el frontend solo elige la vista inicial.
    // El servidor sigue protegiendo las rutas administrativas (EQ-17).
    const destino = result.usuario?.rol === 'administrador'
      ? '/app/colaboradores/registro.html'
      : '/app';
    window.location.assign(destino);
  } catch {
    mostrarMensaje('No se pudo conectar con SIRA. Revisa tu conexión e inténtalo nuevamente.');
  } finally {
    establecerCarga(false);
  }
});

[identifierInput, passwordInput].forEach((input) => input.addEventListener('input', () => {
  input.closest('.input-wrap').classList.remove('has-error');
  if (!feedback.hidden) limpiarErrores();
}));
