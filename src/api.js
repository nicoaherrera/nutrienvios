// Cliente HTTP: todas las llamadas van a /api/* con el token de la URL.
// El frontend nunca toca Supabase directo ni conoce claves.

let token = null;

export function setToken(t) {
  token = t;
}

async function req(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-app-token": token || "",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
  return data;
}

export const api = {
  zonas: () => req("/api/zonas"),
  editarZona: (id, campos) => req("/api/zonas", { method: "PATCH", body: { id, ...campos } }),
  config: () => req("/api/config"),
  editarConfig: (cambios) => req("/api/config", { method: "PATCH", body: cambios }),
  pedidosPorFecha: (fecha) => req(`/api/pedidos?fecha=${fecha}`),
  pedidosPorRango: (desde, hasta) => req(`/api/pedidos?desde=${desde}&hasta=${hasta}`),
  // Por día de carga del pedido (hora argentina): para el cierre de caja.
  pedidosCargadosEntre: (desde, hasta) =>
    req(
      `/api/pedidos?cargado_desde=${encodeURIComponent(desde + "T00:00:00-03:00")}` +
      `&cargado_hasta=${encodeURIComponent(hasta + "T23:59:59-03:00")}`
    ),
  pedidosPorTelefono: (tel) => req(`/api/pedidos?telefono=${encodeURIComponent(tel)}`),
  pedidoPorId: (id) => req(`/api/pedidos?id=${id}`).then((r) => r[0]),
  crearPedido: (pedido) => req("/api/pedidos", { method: "POST", body: pedido }),
  editarPedido: (id, cambios) => req(`/api/pedidos?id=${id}`, { method: "PATCH", body: cambios }),
  clientes: () => req("/api/clientes"),
  optimizarRuta: (fecha, volverAlLocal = true) =>
    req("/api/optimizar-ruta", { method: "POST", body: { fecha, volverAlLocal } }),
};
