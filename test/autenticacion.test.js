import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ErrorAutenticacion,
  crearProveedorAutenticacionSimulado,
  implementaProveedorAutenticacion,
} from "../src/modulos/autenticacion/index.js";

const USUARIOS_PRUEBA = [
  {
    idInstitucional: "00000252115",
    password: "Password123!",
    nombreCompleto: "Sebastián Bórquez Huerta",
    correoInstitucional: "sebastian.borquez252115@potros.itson.edu.mx",
    telefono: "+526441112233",
    fotoUrl: "https://ad.itson.mx/fotos/00000252115.jpg",
    activo: true,
  },
  {
    idInstitucional: "00000233231",
    password: "Password123!",
    nombreCompleto: "Gabriel Cervantes Trujillo",
    correoInstitucional: "gabriel.cervantes233231@potros.itson.edu.mx",
    telefono: "+526442223344",
    fotoUrl: "https://ad.itson.mx/fotos/00000233231.jpg",
    activo: true,
  },
  {
    idInstitucional: "00000999999",
    password: "Password123!",
    nombreCompleto: "Usuario Inactivo",
    correoInstitucional: "inactivo@itson.edu.mx",
    telefono: "+526449999999",
    fotoUrl: "https://ad.itson.mx/fotos/00000999999.jpg",
    activo: false,
  },
];

function armarProveedor(opciones = {}) {
  return crearProveedorAutenticacionSimulado({
    usuarios: USUARIOS_PRUEBA,
    ...opciones,
  });
}

// ---------- Cumplimiento del Contrato ----------

test("[BASE-7] El adaptador simulado cumple la interfaz del puerto IProveedorAutenticacion", () => {
  const proveedor = armarProveedor();
  assert.equal(implementaProveedorAutenticacion(proveedor), true);
  assert.equal(implementaProveedorAutenticacion({}), false);
  assert.equal(implementaProveedorAutenticacion(null), false);
});

// ---------- Casos de Uso: Iniciar Sesión (autenticar) ----------

test("[BASE-7] autenticar: éxito con credenciales válidas", async () => {
  const proveedor = armarProveedor();
  const resultado = await proveedor.autenticar("00000252115", "Password123!");

  assert.equal(resultado.autenticado, true);
  assert.ok(resultado.colaborador);
  assert.equal(resultado.colaborador.idInstitucional, "00000252115");
  assert.equal(resultado.colaborador.nombreCompleto, "Sebastián Bórquez Huerta");
  assert.equal(resultado.colaborador.correoInstitucional, "sebastian.borquez252115@potros.itson.edu.mx");
  // Verificar que NO expone contraseñas en el objeto retornado
  assert.equal("password" in resultado.colaborador, false);
});

test("[BASE-7] autenticar: rechaza contraseña incorrecta (CREDENCIALES_INVALIDAS)", async () => {
  const proveedor = armarProveedor();
  const resultado = await proveedor.autenticar("00000252115", "ContrasenaEquivocada");

  assert.equal(resultado.autenticado, false);
  assert.equal(resultado.colaborador, null);
  assert.equal(resultado.motivoFalla, "CREDENCIALES_INVALIDAS");
});

test("[BASE-7] autenticar: rechaza usuario no existente (USUARIO_INEXISTENTE)", async () => {
  const proveedor = armarProveedor();
  const resultado = await proveedor.autenticar("00000000000", "Password123!");

  assert.equal(resultado.autenticado, false);
  assert.equal(resultado.colaborador, null);
  assert.equal(resultado.motivoFalla, "USUARIO_INEXISTENTE");
});

test("[BASE-7] autenticar: rechaza usuario inactivo (CUENTA_BLOQUEADA)", async () => {
  const proveedor = armarProveedor();
  const resultado = await proveedor.autenticar("00000999999", "Password123!");

  assert.equal(resultado.autenticado, false);
  assert.equal(resultado.colaborador, null);
  assert.equal(resultado.motivoFalla, "CUENTA_BLOQUEADA");
});

// ---------- Casos de Uso: Consultar Colaborador por ID (obtenerPorIdInstitucional) ----------

test("[BASE-7] obtenerPorIdInstitucional: devuelve perfil completo si existe", async () => {
  const proveedor = armarProveedor();
  const perfil = await proveedor.obtenerPorIdInstitucional("00000233231");

  assert.deepEqual(perfil, {
    idInstitucional: "00000233231",
    nombreCompleto: "Gabriel Cervantes Trujillo",
    correoInstitucional: "gabriel.cervantes233231@potros.itson.edu.mx",
    telefono: "+526442223344",
    fotoUrl: "https://ad.itson.mx/fotos/00000233231.jpg",
  });
});

test("[BASE-7] obtenerPorIdInstitucional: devuelve null si no existe", async () => {
  const proveedor = armarProveedor();
  const perfil = await proveedor.obtenerPorIdInstitucional("no-existe");
  assert.equal(perfil, null);
});

// ---------- Resiliencia: Simulación de Indisponibilidad ----------

test("[BASE-7] lanza ErrorAutenticacion con SERVICIO_NO_DISPONIBLE si el AD no responde", async () => {
  const proveedor = armarProveedor();
  proveedor.simularIndisponibilidad(true);

  await assert.rejects(
    async () => proveedor.autenticar("00000252115", "Password123!"),
    (err) => {
      assert.ok(err instanceof ErrorAutenticacion);
      assert.equal(err.codigo, "SERVICIO_NO_DISPONIBLE");
      return true;
    }
  );

  await assert.rejects(
    async () => proveedor.obtenerPorIdInstitucional("00000252115"),
    (err) => {
      assert.ok(err instanceof ErrorAutenticacion);
      assert.equal(err.codigo, "SERVICIO_NO_DISPONIBLE");
      return true;
    }
  );

  // Restaurar disponibilidad
  proveedor.simularIndisponibilidad(false);
  const perfil = await proveedor.obtenerPorIdInstitucional("00000252115");
  assert.ok(perfil !== null);
});

// ---------- Integridad de Datos Semilla del Repositorio ----------

test("[BASE-7] Datos semilla en JSON son consistentes y tienen perfiles válidos", async () => {
  const rutaSemilla = new URL("../datos-semilla/autenticacion.json", import.meta.url);
  const data = JSON.parse(await readFile(rutaSemilla, "utf8"));

  assert.ok(Array.isArray(data.usuarios));
  assert.ok(data.usuarios.length >= 3, "Debe tener al menos 3 colaboradores de prueba");

  for (const u of data.usuarios) {
    assert.ok(u.idInstitucional, "El ID institucional es obligatorio");
    assert.ok(u.nombreCompleto, "El nombre completo es obligatorio");
    assert.match(
      u.correoInstitucional,
      /@(potros\.)?itson\.edu\.mx$/,
      "El correo institucional debe pertenecer al dominio ITSON"
    );
    assert.ok(u.telefono, "El teléfono es obligatorio");
    assert.ok(u.fotoUrl, "La URL de fotografía es obligatoria");
  }
});

