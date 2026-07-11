import { useState } from "react";
import { api } from "../api.js";
import { dinero } from "../logic.js";

const CLAVES = [
  ["umbral_envio_gratis", "Umbral de envío gratis ($)", "numeric"],
  ["direccion_local", "Dirección del local (origen de la ruta)", "text"],
  ["cupon_bienvenida", "Código del cupón de bienvenida", "text"],
  ["cupon_descuento_pct", "Descuento del cupón (%)", "numeric"],
  ["cupon_minimo", "Compra mínima del cupón ($)", "numeric"],
  ["cupon_vigencia_dias", "Vigencia del cupón (días)", "numeric"],
  ["datos_pago", "Datos de pago (van en el WhatsApp de confirmación)", "text"],
  ["link_resena_google", "Link de reseña de Google (pedido a clientes nuevos)", "text"],
];

export default function Config({ zonas, config, recargar }) {
  const [valores, setValores] = useState(config);
  const [zonasEdit, setZonasEdit] = useState(zonas);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState(null);

  async function guardarConfig() {
    setGuardando(true);
    setMsg(null);
    try {
      await api.editarConfig(valores);
      await recargar();
      setMsg({ tipo: "ok", texto: "Configuración guardada ✅" });
    } catch (e) {
      setMsg({ tipo: "error", texto: e.message });
    } finally {
      setGuardando(false);
    }
  }

  async function guardarZona(z) {
    setGuardando(true);
    setMsg(null);
    try {
      await api.editarZona(z.id, {
        tarifa: Number(z.tarifa),
        minimo_compra: z.minimo_compra ? Number(z.minimo_compra) : null,
        refrigerados_ok: z.refrigerados_ok,
        dias_entrega: z.dias_entrega,
      });
      await recargar();
      setMsg({ tipo: "ok", texto: `Zona "${z.nombre}" guardada ✅` });
    } catch (e) {
      setMsg({ tipo: "error", texto: e.message });
    } finally {
      setGuardando(false);
    }
  }

  const editarZona = (id, campo, valor) =>
    setZonasEdit((zs) => zs.map((z) => (z.id === id ? { ...z, [campo]: valor } : z)));

  return (
    <>
      {msg && <div className={`aviso ${msg.tipo}`}>{msg.texto}</div>}

      <div className="tarjeta">
        <h2 style={{ marginTop: 0 }}>⚙️ Parámetros globales</h2>
        {CLAVES.map(([clave, nombre, modo]) => (
          <div key={clave}>
            <label>{nombre}</label>
            <input
              value={valores[clave] ?? ""}
              inputMode={modo === "numeric" ? "numeric" : undefined}
              onChange={(e) => setValores((v) => ({ ...v, [clave]: e.target.value }))}
            />
          </div>
        ))}
        <button className="primario" disabled={guardando} onClick={guardarConfig}>Guardar parámetros</button>
      </div>

      <h2>📍 Zonas</h2>
      {zonasEdit.map((z) => (
        <div key={z.id} className="tarjeta">
          <strong>{z.orden_recorrido}. {z.nombre}</strong>
          <div className="fila">
            <div>
              <label>Tarifa ($)</label>
              <input inputMode="numeric" value={z.tarifa} onChange={(e) => editarZona(z.id, "tarifa", e.target.value)} />
            </div>
            <div>
              <label>Mínimo de compra ($, vacío = sin mínimo)</label>
              <input inputMode="numeric" value={z.minimo_compra ?? ""} onChange={(e) => editarZona(z.id, "minimo_compra", e.target.value)} />
            </div>
          </div>
          <label>Días de entrega</label>
          <input value={z.dias_entrega} onChange={(e) => editarZona(z.id, "dias_entrega", e.target.value)} />
          <div className="check">
            <input
              type="checkbox"
              id={`frio-${z.id}`}
              checked={z.refrigerados_ok}
              onChange={(e) => editarZona(z.id, "refrigerados_ok", e.target.checked)}
            />
            <label htmlFor={`frio-${z.id}`} style={{ margin: 0 }}>❄️ Acepta refrigerados</label>
          </div>
          <button className="secundario" disabled={guardando} onClick={() => guardarZona(z)}>
            Guardar {z.nombre} ({dinero(z.tarifa)})
          </button>
        </div>
      ))}
    </>
  );
}
