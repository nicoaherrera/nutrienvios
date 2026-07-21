import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import { hoyISO, textoCuponWhatsApp, textoResenaWhatsApp, linkWhatsApp } from "../logic.js";

// Si el navegador bloquea el popup (Safari / app en pantalla de inicio),
// se navega a WhatsApp en la misma pestaña, que no se puede bloquear.
function abrirWhatsApp(link) {
  const ventana = window.open(link, "_blank");
  if (!ventana) window.location.assign(link);
}

export default function Recordatorios({ config }) {
  const [pedidos, setPedidos] = useState(null);
  const [error, setError] = useState(null);

  const cargar = useCallback(() => {
    setError(null);
    const hoy = new Date();
    // Los recordatorios de un cliente nuevo pueden quedar pendientes por
    // semanas si nadie los marca "Enviado"; miramos más atrás que el Tablero.
    const desde = new Date(hoy); desde.setDate(hoy.getDate() - 60);
    api.pedidosPorRango(hoyISO(desde), hoyISO(hoy)).then(setPedidos).catch((e) => setError(e.message));
  }, []);

  useEffect(cargar, [cargar]);

  async function cuponEnviado(p) {
    try {
      await api.editarPedido(p.id, { cupon_enviado_at: new Date().toISOString() });
      cargar();
    } catch (e) {
      setError(e.message);
    }
  }

  async function resenaEnviada(p) {
    try {
      await api.editarPedido(p.id, { resena_enviada_at: new Date().toISOString() });
      cargar();
    } catch (e) {
      setError(e.message);
    }
  }

  if (error) return <div className="aviso error">{error} <button className="chico secundario" onClick={cargar}>Reintentar</button></div>;
  if (!pedidos) return <div className="vacio">Cargando…</div>;

  // "false" explícito en Config = desactivado; si no está seteado, activo por defecto.
  const cuponActivo = config.cupon_recordatorio_activo !== "false";
  const resenaActiva = config.resena_recordatorio_activo !== "false";

  const cupones = pedidos.filter((p) => p.estado === "entregado" && p.cliente_nuevo && !p.cupon_enviado_at);
  const resenas = pedidos.filter((p) => p.estado === "entregado" && p.cliente_nuevo && !p.resena_enviada_at);

  return (
    <>
      <div className="tarjeta">
        <h2 style={{ marginTop: 0 }}>🔔 Recordatorios</h2>
        <p className="mini">
          Cupón de bienvenida y pedido de reseña para clientes que hicieron su primera compra (últimos 60 días).
          Se pueden desactivar desde ⚙️ Config.
        </p>
      </div>

      {!cuponActivo && !resenaActiva && (
        <div className="vacio">Los dos recordatorios están desactivados en Config.</div>
      )}

      {cuponActivo && (
        <div className="tarjeta" style={{ borderColor: "var(--azul)", background: "var(--azul-claro)" }}>
          <h3 style={{ marginTop: 0 }}>🎁 Cupones de bienvenida por enviar ({cupones.length})</h3>
          {cupones.length === 0 && <p className="mini">Al día — no hay ninguno pendiente.</p>}
          {cupones.map((p) => (
            <div key={p.id} className="linea" style={{ flexWrap: "wrap" }}>
              <span><strong>{p.cliente_nombre}</strong> — entregado el {p.fecha_entrega.slice(5)}</span>
              <span style={{ display: "flex", gap: 6 }}>
                <button
                  className="chico primario"
                  onClick={async () => {
                    const texto = textoCuponWhatsApp(p.cliente_nombre, config);
                    try { await navigator.clipboard.writeText(texto); } catch { /* el link ya lleva el texto */ }
                    abrirWhatsApp(linkWhatsApp(p.cliente_telefono, texto));
                  }}
                >
                  💬 Enviar por WhatsApp
                </button>
                <button className="chico secundario" onClick={() => cuponEnviado(p)}>✅ Enviado</button>
              </span>
            </div>
          ))}
        </div>
      )}

      {resenaActiva && (
        <div className="tarjeta" style={{ borderColor: "var(--verde)", background: "var(--verde-claro)" }}>
          <h3 style={{ marginTop: 0 }}>⭐ Reseñas por pedir ({resenas.length})</h3>
          {resenas.length === 0 && <p className="mini">Al día — no hay ninguna pendiente.</p>}
          {resenas.map((p) => (
            <div key={p.id} className="linea" style={{ flexWrap: "wrap" }}>
              <span><strong>{p.cliente_nombre}</strong> — entregado el {p.fecha_entrega.slice(5)}</span>
              <span style={{ display: "flex", gap: 6 }}>
                <button
                  className="chico primario"
                  onClick={async () => {
                    const texto = textoResenaWhatsApp(p.cliente_nombre, config);
                    try { await navigator.clipboard.writeText(texto); } catch { /* el link ya lleva el texto */ }
                    abrirWhatsApp(linkWhatsApp(p.cliente_telefono, texto));
                  }}
                >
                  💬 Enviar por WhatsApp
                </button>
                <button className="chico secundario" onClick={() => resenaEnviada(p)}>✅ Enviado</button>
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
