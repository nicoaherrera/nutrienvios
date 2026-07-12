import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import {
  dinero, hoyISO, nombreFormaPago, textoCuponWhatsApp, textoResenaWhatsApp, idCorto,
  envioReintento, linkWhatsApp, mensajeReprogramado,
} from "../logic.js";

const ESTADOS = ["pendiente", "en_reparto", "entregado", "cancelado"];

function fechaLinda(iso) {
  const hoy = hoyISO();
  if (iso === hoy) return "HOY";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "numeric" });
}

export default function Tablero({ config, navegar }) {
  const [pedidos, setPedidos] = useState(null);
  const [error, setError] = useState(null);

  const cargar = useCallback(() => {
    setError(null);
    const hoy = new Date();
    const desde = new Date(hoy); desde.setDate(hoy.getDate() - 14);
    const hasta = new Date(hoy); hasta.setDate(hoy.getDate() + 14);
    api.pedidosPorRango(hoyISO(desde), hoyISO(hasta)).then(setPedidos).catch((e) => setError(e.message));
  }, []);

  useEffect(cargar, [cargar]);

  async function cambiarEstado(p, estado) {
    try {
      await api.editarPedido(p.id, {
        estado,
        ...(estado === "entregado" && p.forma_pago === "efectivo_contra_entrega" ? { pago_recibido: true } : {}),
      });
      cargar();
    } catch (e) {
      setError(e.message);
    }
  }

  async function marcarPago(p) {
    try {
      await api.editarPedido(p.id, { pago_recibido: true });
      cargar();
    } catch (e) {
      setError(e.message);
    }
  }

  // Reprograma para mañana; con cargo suma la tarifa de zona como revisita
  // (política: si no había nadie, la nueva visita se cobra, incluso con envío gratis).
  async function reprogramar(p, conCargo) {
    const extra = conCargo ? Number(p.zona?.tarifa ?? 0) : 0;
    if (conCargo && !window.confirm(`Reprogramar para mañana sumando ${dinero(extra)} de revisita, ¿dale?`)) return;
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const manana = hoyISO(d);
    try {
      await api.editarPedido(p.id, {
        fecha_entrega: manana,
        estado: "pendiente",
        pospuesto: false,
        orden_ruta: null,
        envio_reintento: envioReintento(p) + extra,
        notas: [p.notas, `reprogramado ${hoyISO()} → ${manana}${conCargo ? ` (+${dinero(extra)} revisita)` : " sin cargo"}`].filter(Boolean).join(" | "),
      });
      const texto = mensajeReprogramado(p, manana, extra);
      try { await navigator.clipboard.writeText(texto); } catch { /* el link ya lleva el texto */ }
      window.open(linkWhatsApp(p.cliente_telefono, texto), "_blank");
      cargar();
    } catch (e) {
      setError(e.message);
    }
  }

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

  const hoy = hoyISO();
  const recordatorios = pedidos.filter((p) => p.estado === "entregado" && p.cliente_nuevo && !p.cupon_enviado_at);
  const recordatoriosResena = pedidos.filter((p) => p.estado === "entregado" && p.cliente_nuevo && !p.resena_enviada_at);
  const atrasados = pedidos.filter((p) => p.fecha_entrega < hoy && (p.estado === "pendiente" || p.estado === "en_reparto"));
  const proximos = pedidos.filter((p) => p.fecha_entrega >= hoy && p.estado !== "cancelado");

  const porFecha = new Map();
  for (const p of proximos) {
    if (!porFecha.has(p.fecha_entrega)) porFecha.set(p.fecha_entrega, []);
    porFecha.get(p.fecha_entrega).push(p);
  }
  const fechas = [...porFecha.keys()].sort();

  const Pedido = ({ p }) => (
    <div className="tarjeta" style={{ marginBottom: 8 }}>
      <div className="linea" style={{ padding: 0 }}>
        <strong>
          <span className="mini">{idCorto(p)}</span> {p.cliente_nombre} {p.cliente_nuevo && <span className="badge nuevo">NUEVO</span>}{" "}
          {p.tiene_refrigerados && <span className="badge frio">❄️</span>}{" "}
          {p.envio_gratis && (
            <span className="badge gratis">{p.motivo_envio_gratis === "fidelizacion" ? "🎉 5TA COMPRA GRATIS" : "ENVÍO GRATIS"}</span>
          )}
        </strong>
        <span className={`badge estado-${p.estado}`}>{p.estado.replace("_", " ")}</span>
      </div>
      <div className="mini">
        📍 {p.direccion}{p.entre_calles && ` (entre ${p.entre_calles})`} · {p.zona?.nombre}
        {p.cantidad_productos != null && <> · 📦 {p.cantidad_productos}{Number(p.cantidad_refrigerados) > 0 && <> (❄️ {p.cantidad_refrigerados})</>}</>}
        {" · "}{dinero(p.monto_pedido)} + envío {p.envio_gratis ? "$0" : dinero(p.costo_envio)}
        {envioReintento(p) > 0 && <> + 🔁 revisita {dinero(envioReintento(p))}</>} · {nombreFormaPago(p.forma_pago)}
        {" · "}{p.pago_recibido ? "✅ pago recibido" : "⏳ pago pendiente"}
      </div>
      <div className="acciones" style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <select value={p.estado} onChange={(e) => cambiarEstado(p, e.target.value)} style={{ width: "auto", padding: "8px" }}>
          {ESTADOS.map((e) => <option key={e} value={e}>{e.replace("_", " ")}</option>)}
        </select>
        {!p.pago_recibido && p.forma_pago !== "efectivo_contra_entrega" && (
          <button className="chico secundario" onClick={() => marcarPago(p)}>💰 Marcar pago recibido</button>
        )}
        {(p.estado === "pendiente" || p.estado === "en_reparto") && (
          <>
            <button className="chico secundario" onClick={() => reprogramar(p, true)}>🔁 Mañana +envío</button>
            <button className="chico secundario" onClick={() => reprogramar(p, false)}>🔁 Mañana sin cargo</button>
          </>
        )}
        <button className="chico secundario" onClick={() => navegar("nuevo", p.id)}>✏️ Editar</button>
      </div>
    </div>
  );

  return (
    <>
      {recordatorios.length > 0 && (
        <div className="tarjeta" style={{ borderColor: "var(--azul)", background: "var(--azul-claro)" }}>
          <h3 style={{ marginTop: 0 }}>🎁 Cupones de bienvenida por enviar ({recordatorios.length})</h3>
          {recordatorios.map((p) => (
            <div key={p.id} className="linea" style={{ flexWrap: "wrap" }}>
              <span><strong>{p.cliente_nombre}</strong> — entregado el {p.fecha_entrega.slice(5)}</span>
              <span style={{ display: "flex", gap: 6 }}>
                <button
                  className="chico primario"
                  onClick={async () => {
                    const texto = textoCuponWhatsApp(p.cliente_nombre, config);
                    try { await navigator.clipboard.writeText(texto); } catch { /* el link ya lleva el texto */ }
                    window.open(linkWhatsApp(p.cliente_telefono, texto), "_blank");
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

      {recordatoriosResena.length > 0 && (
        <div className="tarjeta" style={{ borderColor: "var(--verde)", background: "var(--verde-claro)" }}>
          <h3 style={{ marginTop: 0 }}>⭐ Reseñas por pedir ({recordatoriosResena.length})</h3>
          {recordatoriosResena.map((p) => (
            <div key={p.id} className="linea" style={{ flexWrap: "wrap" }}>
              <span><strong>{p.cliente_nombre}</strong> — entregado el {p.fecha_entrega.slice(5)}</span>
              <span style={{ display: "flex", gap: 6 }}>
                <button
                  className="chico primario"
                  onClick={async () => {
                    const texto = textoResenaWhatsApp(p.cliente_nombre, config);
                    try { await navigator.clipboard.writeText(texto); } catch { /* el link ya lleva el texto */ }
                    window.open(linkWhatsApp(p.cliente_telefono, texto), "_blank");
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

      {atrasados.length > 0 && (
        <>
          <h2>⚠️ Atrasados (no entregados de días anteriores)</h2>
          {atrasados.map((p) => <Pedido key={p.id} p={p} />)}
        </>
      )}

      {fechas.length === 0 && atrasados.length === 0 && (
        <div className="vacio">
          No hay pedidos próximos.
          <br /><br />
          <button className="primario" style={{ width: "auto" }} onClick={() => navegar("nuevo")}>➕ Cargar el primero</button>
        </div>
      )}

      {fechas.map((f) => (
        <div key={f}>
          <h2>📅 {fechaLinda(f)} <span className="mini">({porFecha.get(f).length} pedidos)</span></h2>
          {porFecha.get(f).map((p) => <Pedido key={p.id} p={p} />)}
        </div>
      ))}
    </>
  );
}
