import { useState } from "react";
import { api } from "../api.js";
import { parseTarifario } from "../logic.js";

// Editor del tarifario de envíos (localidades fijas + rangos de calles).
// Se guarda entero como JSON en config.tarifario: la lógica de precios
// (calcularCostoEnvio en logic.js) no se toca al cambiar valores.
function EditorTarifario({ config, recargar, setMsg }) {
  const [t, setT] = useState(() => JSON.parse(JSON.stringify(parseTarifario(config))));
  const [guardando, setGuardando] = useState(false);

  const setFijo = (loc, valor) => setT((x) => ({ ...x, fijos: { ...x.fijos, [loc]: valor } }));
  const setBase = (loc, valor) =>
    setT((x) => ({ ...x, rangos: { ...x.rangos, [loc]: { ...x.rangos[loc], base: valor } } }));
  const setTramo = (loc, i, campo, valor) =>
    setT((x) => {
      const tramos = x.rangos[loc].tramos.map((tr, j) => (j === i ? { ...tr, [campo]: valor } : tr));
      return { ...x, rangos: { ...x.rangos, [loc]: { ...x.rangos[loc], tramos } } };
    });
  const agregarTramo = (loc) =>
    setT((x) => ({
      ...x,
      rangos: { ...x.rangos, [loc]: { ...x.rangos[loc], tramos: [...x.rangos[loc].tramos, { desde: "", hasta: "", precio: "" }] } },
    }));
  const quitarTramo = (loc, i) =>
    setT((x) => ({
      ...x,
      rangos: { ...x.rangos, [loc]: { ...x.rangos[loc], tramos: x.rangos[loc].tramos.filter((_, j) => j !== i) } },
    }));

  async function guardar() {
    // Validación: todo numérico y rangos coherentes, antes de pisar el JSON
    const limpio = { fijos: {}, rangos: {} };
    for (const [loc, precio] of Object.entries(t.fijos || {})) {
      const p = Number(precio);
      if (!p || p <= 0) return setMsg({ tipo: "error", texto: `Precio inválido en ${loc}` });
      limpio.fijos[loc] = p;
    }
    for (const [loc, r] of Object.entries(t.rangos || {})) {
      const tramos = [];
      for (const tr of r.tramos || []) {
        const desde = Number(tr.desde), hasta = Number(tr.hasta), precio = Number(tr.precio);
        if (!desde || !hasta || !precio || desde > hasta) {
          return setMsg({ tipo: "error", texto: `Tramo inválido en ${loc}: revisá desde/hasta/precio` });
        }
        tramos.push({ desde, hasta, precio });
      }
      limpio.rangos[loc] = { ...(r.base != null && r.base !== "" ? { base: Number(r.base) } : {}), tramos };
    }
    setGuardando(true);
    setMsg(null);
    try {
      await api.editarConfig({ tarifario: JSON.stringify(limpio) });
      await recargar();
      setMsg({ tipo: "ok", texto: "Tarifario guardado ✅ — los pedidos nuevos ya usan estos precios" });
    } catch (e) {
      setMsg({ tipo: "error", texto: e.message });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="tarjeta">
      <h2 style={{ marginTop: 0 }}>🚚 Tarifario de envíos</h2>
      <p className="mini">El precio del envío sale de acá según la localidad y, donde aplica, el rango de calle. Los pedidos ya cargados no cambian.</p>

      <h3>Precio fijo por localidad</h3>
      {Object.entries(t.fijos || {}).map(([loc, precio]) => (
        <div key={loc} className="linea">
          <span>{loc}</span>
          <input
            value={precio}
            onChange={(e) => setFijo(loc, e.target.value)}
            inputMode="numeric"
            style={{ width: 110, textAlign: "right" }}
          />
        </div>
      ))}

      {Object.entries(t.rangos || {}).map(([loc, r]) => (
        <div key={loc}>
          <h3>{loc} — por rango de calles</h3>
          {r.base != null && (
            <div className="linea">
              <span>Resto de las calles (casco)</span>
              <input value={r.base} onChange={(e) => setBase(loc, e.target.value)} inputMode="numeric" style={{ width: 110, textAlign: "right" }} />
            </div>
          )}
          {(r.tramos || []).map((tr, i) => (
            <div key={i} className="linea" style={{ gap: 6, alignItems: "center" }}>
              <span style={{ display: "flex", gap: 6, alignItems: "center", flex: 1 }}>
                Calles
                <input value={tr.desde} onChange={(e) => setTramo(loc, i, "desde", e.target.value)} inputMode="numeric" style={{ width: 70 }} />
                a
                <input value={tr.hasta} onChange={(e) => setTramo(loc, i, "hasta", e.target.value)} inputMode="numeric" style={{ width: 70 }} />
              </span>
              <input value={tr.precio} onChange={(e) => setTramo(loc, i, "precio", e.target.value)} inputMode="numeric" style={{ width: 110, textAlign: "right" }} />
              <button className="chico secundario" onClick={() => quitarTramo(loc, i)}>✕</button>
            </div>
          ))}
          <button className="chico secundario" onClick={() => agregarTramo(loc)}>➕ Agregar tramo en {loc}</button>
        </div>
      ))}

      <button className="primario" disabled={guardando} onClick={guardar}>Guardar tarifario</button>
    </div>
  );
}

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
        <h3>🔔 Recordatorios (pestaña Recordatorios)</h3>
        <div className="check">
          <input
            type="checkbox"
            id="cupon-activo"
            checked={valores.cupon_recordatorio_activo !== "false"}
            onChange={(e) => setValores((v) => ({ ...v, cupon_recordatorio_activo: String(e.target.checked) }))}
          />
          <label htmlFor="cupon-activo" style={{ margin: 0 }}>Recordar cupón de bienvenida a clientes nuevos</label>
        </div>
        <div className="check">
          <input
            type="checkbox"
            id="resena-activo"
            checked={valores.resena_recordatorio_activo !== "false"}
            onChange={(e) => setValores((v) => ({ ...v, resena_recordatorio_activo: String(e.target.checked) }))}
          />
          <label htmlFor="resena-activo" style={{ margin: 0 }}>Recordar pedido de reseña a clientes nuevos</label>
        </div>

        <button className="primario" disabled={guardando} onClick={guardarConfig} style={{ marginTop: 12 }}>Guardar parámetros</button>
      </div>

      <EditorTarifario config={config} recargar={recargar} setMsg={setMsg} />

      <h2>📍 Zonas</h2>
      <p className="mini">El precio del envío ya no sale de la zona (está en el Tarifario de arriba); acá quedan los días de entrega, el mínimo de compra y si acepta refrigerados.</p>
      {zonasEdit.map((z) => (
        <div key={z.id} className="tarjeta">
          <strong>{z.orden_recorrido}. {z.nombre}</strong>
          <label>Mínimo de compra ($, vacío = sin mínimo)</label>
          <input inputMode="numeric" value={z.minimo_compra ?? ""} onChange={(e) => editarZona(z.id, "minimo_compra", e.target.value)} />
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
            Guardar {z.nombre}
          </button>
        </div>
      ))}
    </>
  );
}
