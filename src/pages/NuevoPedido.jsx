import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import {
  dinero, hoyISO, normalizarTelefono, costoEnvio, motivoEnvioGratis, esQuintaCompra,
  validarPedido, validarCupon, esClienteNuevo, textoConfirmacionWhatsApp, idCorto,
} from "../logic.js";

const VACIO = {
  cliente_nombre: "",
  cliente_telefono: "",
  direccion: "",
  referencia: "",
  zona_id: "",
  monto_pedido: "",
  tiene_refrigerados: false,
  incluye_cooler: false,
  cupon_usado: "",
  forma_pago: "transferencia",
  fecha_entrega: hoyISO(),
  notas: "",
};

async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    window.prompt("Copiá el texto manualmente:", texto);
    return false;
  }
}

export default function NuevoPedido({ zonas, config, pedidoId, navegar }) {
  const [form, setForm] = useState(VACIO);
  const [previos, setPrevios] = useState(null); // pedidos anteriores del teléfono (null = sin consultar)
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(null); // pedido ya guardado
  const [error, setError] = useState(null);
  const [copiado, setCopiado] = useState(false);
  const timerTel = useRef(null);

  const editando = Boolean(pedidoId);

  useEffect(() => {
    if (!pedidoId) return;
    api.pedidoPorId(pedidoId).then((p) => {
      if (!p) return setError("No se encontró el pedido");
      setForm({
        ...VACIO,
        ...Object.fromEntries(Object.entries(p).filter(([k]) => k in VACIO)),
        referencia: p.referencia || "",
        cupon_usado: p.cupon_usado || "",
        notas: p.notas || "",
        zona_id: String(p.zona_id),
      });
    }).catch((e) => setError(e.message));
  }, [pedidoId]);

  // Detección de cliente nuevo: buscar el teléfono en pedidos anteriores
  useEffect(() => {
    const tel = normalizarTelefono(form.cliente_telefono);
    setPrevios(null);
    if (tel.length < 8) return;
    clearTimeout(timerTel.current);
    timerTel.current = setTimeout(() => {
      api.pedidosPorTelefono(tel)
        .then((ps) => setPrevios(ps.filter((p) => p.id !== pedidoId)))
        .catch(() => setPrevios(null));
    }, 400);
    return () => clearTimeout(timerTel.current);
  }, [form.cliente_telefono, pedidoId]);

  const zona = zonas.find((z) => z.id === Number(form.zona_id));
  const monto = Number(form.monto_pedido) || 0;
  const motivoGratis = monto > 0 ? motivoEnvioGratis(monto, config, previos) : null;
  const gratis = Boolean(motivoGratis);
  const envio = zona && monto > 0 ? costoEnvio(monto, zona, config, previos) : null;
  const clienteNuevo = previos !== null && esClienteNuevo(previos);
  const quintaCompra = previos !== null && esQuintaCompra(previos);

  const errores = useMemo(
    () => (zona && monto > 0 ? validarPedido({ monto, zona, tieneRefrigerados: form.tiene_refrigerados }) : []),
    [zona, monto, form.tiene_refrigerados]
  );

  const warningCupon = useMemo(() => {
    if (!form.cupon_usado.trim()) return null;
    if (form.cupon_usado.trim().toUpperCase() !== String(config.cupon_bienvenida).toUpperCase()) {
      return `Cupón desconocido (el vigente es ${config.cupon_bienvenida})`;
    }
    if (previos === null) return "Ingresá el teléfono para validar el cupón";
    return validarCupon({ pedidosPrevios: previos, monto, config, hoy: hoyISO() });
  }, [form.cupon_usado, previos, monto, config]);

  const campo = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const completo = form.cliente_nombre && form.cliente_telefono && form.direccion && zona && monto > 0 && form.fecha_entrega;

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      const body = {
        ...form,
        cliente_telefono: normalizarTelefono(form.cliente_telefono),
        zona_id: Number(form.zona_id),
        monto_pedido: monto,
        costo_envio: envio,
        envio_gratis: gratis,
        motivo_envio_gratis: motivoGratis,
        cupon_usado: form.cupon_usado.trim() || null,
        referencia: form.referencia.trim() || null,
        notas: form.notas.trim() || null,
      };
      if (!editando) body.cliente_nuevo = clienteNuevo;
      const p = editando ? await api.editarPedido(pedidoId, body) : await api.crearPedido(body);
      setGuardado(p);
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  if (guardado) {
    return (
      <div className="tarjeta">
        <h2>✅ Pedido {idCorto(guardado)} {editando ? "actualizado" : "guardado"}</h2>
        <div className="linea"><span>{guardado.cliente_nombre} — {guardado.direccion}</span></div>
        <div className="linea">
          <span>Mercadería {dinero(guardado.monto_pedido)} + envío {guardado.envio_gratis ? "GRATIS" : dinero(guardado.costo_envio)}</span>
          <span className="monto">{dinero(Number(guardado.monto_pedido) + Number(guardado.costo_envio))}</span>
        </div>
        <button
          className="primario"
          onClick={async () => {
            await copiar(textoConfirmacionWhatsApp(guardado, guardado.zona, config));
            setCopiado(true);
          }}
        >
          {copiado ? "✅ Copiado — pegalo en WhatsApp" : "📋 Copiar confirmación para WhatsApp"}
        </button>
        <button className="secundario" onClick={() => { setGuardado(null); setCopiado(false); setForm(VACIO); }}>
          ➕ Cargar otro pedido
        </button>
        <button className="secundario" onClick={() => navegar("tablero")}>Ir al tablero</button>
      </div>
    );
  }

  return (
    <div className="tarjeta">
      <h2>{editando ? "✏️ Editar pedido" : "➕ Nuevo pedido"}</h2>

      <label>Cliente</label>
      <input value={form.cliente_nombre} onChange={campo("cliente_nombre")} placeholder="Nombre y apellido" />

      <label>
        Teléfono {clienteNuevo && <span className="badge nuevo">CLIENTE NUEVO</span>}
        {!clienteNuevo && quintaCompra && <span className="badge gratis">🎉 LE TOCA ENVÍO GRATIS (5ta compra)</span>}
      </label>
      <input value={form.cliente_telefono} onChange={campo("cliente_telefono")} inputMode="tel" placeholder="221 555 0000" />

      <label>Dirección (siempre con localidad)</label>
      <input value={form.direccion} onChange={campo("direccion")} placeholder="Montevideo 456, Berisso" />

      <label>Referencia de la dirección</label>
      <input value={form.referencia} onChange={campo("referencia")} placeholder="timbre roto, casa con rejas verdes…" />

      <div className="fila">
        <div>
          <label>Zona</label>
          <select value={form.zona_id} onChange={campo("zona_id")}>
            <option value="">Elegir zona…</option>
            {zonas.map((z) => (
              <option key={z.id} value={z.id}>{z.nombre} — {dinero(z.tarifa)}</option>
            ))}
          </select>
        </div>
        <div>
          <label>Monto mercadería {form.cupon_usado ? "(con descuento ya aplicado)" : ""}</label>
          <input value={form.monto_pedido} onChange={campo("monto_pedido")} inputMode="numeric" placeholder="60000" />
        </div>
      </div>

      {zona && <p className="mini">📅 {zona.nombre}: {zona.dias_entrega}{zona.minimo_compra ? ` · mínimo ${dinero(zona.minimo_compra)}` : ""}</p>}

      {envio !== null && (
        <div className={`aviso ${gratis ? "ok" : ""}`} style={!gratis ? { background: "var(--verde-claro)", border: "1px solid #c4dfc6" } : undefined}>
          🚚 Envío: {gratis ? (
            <strong>GRATIS 🎉 ({motivoGratis === "fidelizacion" ? "5ta compra" : `pedido ≥ ${dinero(config.umbral_envio_gratis)}`})</strong>
          ) : <strong>{dinero(envio)}</strong>}
          {" · "}Total cliente: <strong>{dinero(monto + envio)}</strong>
        </div>
      )}

      <div className="check">
        <input type="checkbox" id="frio" checked={form.tiene_refrigerados} onChange={campo("tiene_refrigerados")} />
        <label htmlFor="frio" style={{ margin: 0 }}>❄️ Lleva refrigerados (va en conservadora, primera parada de su zona)</label>
      </div>
      <div className="check">
        <input type="checkbox" id="cooler" checked={form.incluye_cooler} onChange={campo("incluye_cooler")} />
        <label htmlFor="cooler" style={{ margin: 0 }}>🧊 Incluye cooler tote (upsell aceptado)</label>
      </div>

      <div className="fila">
        <div>
          <label>Cupón</label>
          <input value={form.cupon_usado} onChange={campo("cupon_usado")} placeholder={config.cupon_bienvenida} />
        </div>
        <div>
          <label>Fecha de entrega</label>
          <input type="date" value={form.fecha_entrega} onChange={campo("fecha_entrega")} />
        </div>
      </div>

      <label>Forma de pago</label>
      <select value={form.forma_pago} onChange={campo("forma_pago")}>
        <option value="transferencia">Transferencia</option>
        <option value="mercadopago">Mercado Pago</option>
        <option value="efectivo_contra_entrega">Efectivo contra entrega</option>
      </select>

      <label>Notas</label>
      <textarea rows={2} value={form.notas} onChange={campo("notas")} />

      {errores.map((e) => <div key={e} className="aviso error">⛔ {e}</div>)}
      {warningCupon && <div className="aviso warning">⚠️ Cupón: {warningCupon} (podés guardar igual si la tienda lo decide)</div>}
      {error && <div className="aviso error">{error}</div>}

      <button className="primario" disabled={!completo || errores.length > 0 || guardando} onClick={guardar}>
        {guardando ? "Guardando…" : editando ? "Guardar cambios" : "Guardar pedido"}
      </button>
    </div>
  );
}
