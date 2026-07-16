import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import {
  dinero, hoyISO, normalizarTelefono, motivoEnvioGratis, esQuintaCompra,
  calcularCostoEnvio, parseTarifario,
  validarPedido, validarCupon, esClienteNuevo, textoConfirmacionWhatsApp, idCorto,
  componerDireccion, separarDireccion, componerNombreCompleto, separarNombreCompleto,
  BARRIOS_POR_ZONA,
} from "../logic.js";

const VACIO = {
  nombre: "",
  apellido: "",
  cliente_telefono: "",
  calle: "",
  numero: "",
  entre_calles: "",
  localidad: "",
  tarifa_manual: "",
  referencia: "",
  zona_id: "",
  monto_pedido: "",
  cantidad_productos: "",
  cantidad_refrigerados: "",
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
        ...separarNombreCompleto(p.cliente_nombre),
        ...separarDireccion(p.direccion),
        referencia: p.referencia || "",
        entre_calles: p.entre_calles || "",
        localidad: p.localidad || "",
        cantidad_productos: p.cantidad_productos ?? "",
        cantidad_refrigerados: p.cantidad_refrigerados ?? "",
        tarifa_manual: p.tarifa_envio ?? "",
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

  const clienteNombre = componerNombreCompleto(form.nombre, form.apellido);
  const direccion = componerDireccion(form.calle, form.numero);
  const zona = zonas.find((z) => z.id === Number(form.zona_id));
  const monto = Number(form.monto_pedido) || 0;
  const motivoGratis = monto > 0 ? motivoEnvioGratis(monto, config, previos) : null;
  const gratis = Boolean(motivoGratis);
  // Tarifa por localidad + rango de calle (tarifario editable en Config).
  // Si no resuelve (localidad/calle fuera de tarifario), la tienda la carga a mano.
  const tarifario = parseTarifario(config);
  const tarifaCalculada = form.localidad ? calcularCostoEnvio(form.localidad, form.calle, tarifario) : null;
  const tarifa = tarifaCalculada ?? (form.tarifa_manual !== "" ? Number(form.tarifa_manual) : null);
  const envio = tarifa != null && monto > 0 ? (gratis ? 0 : tarifa) : null;
  const clienteNuevo = previos !== null && esClienteNuevo(previos);
  const quintaCompra = previos !== null && esQuintaCompra(previos);

  // El flag de cadena de frío se deriva de la cantidad; si no se cargó cantidad
  // (pedidos viejos), vale lo que ya tenía el pedido.
  const tieneRefrigerados = form.cantidad_refrigerados !== "" ? Number(form.cantidad_refrigerados) > 0 : form.tiene_refrigerados;

  const errores = useMemo(() => {
    const es = zona && monto > 0 ? validarPedido({ monto, zona, tieneRefrigerados }) : [];
    if (form.cantidad_productos !== "" && form.cantidad_refrigerados !== "" &&
        Number(form.cantidad_refrigerados) > Number(form.cantidad_productos)) {
      es.push("Los refrigerados no pueden ser más que el total de productos");
    }
    return es;
  }, [zona, monto, tieneRefrigerados, form.cantidad_productos, form.cantidad_refrigerados]);

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

  const completo = form.nombre && form.cliente_telefono && direccion && zona && monto > 0 && tarifa != null && form.fecha_entrega;

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      const body = {
        cliente_nombre: clienteNombre,
        direccion,
        cliente_telefono: normalizarTelefono(form.cliente_telefono),
        zona_id: Number(form.zona_id),
        monto_pedido: monto,
        costo_envio: envio,
        tarifa_envio: tarifa,
        envio_gratis: gratis,
        motivo_envio_gratis: motivoGratis,
        tiene_refrigerados: tieneRefrigerados,
        cantidad_productos: form.cantidad_productos !== "" ? Number(form.cantidad_productos) : null,
        cantidad_refrigerados: form.cantidad_refrigerados !== "" ? Number(form.cantidad_refrigerados) : null,
        incluye_cooler: form.incluye_cooler,
        forma_pago: form.forma_pago,
        fecha_entrega: form.fecha_entrega,
        cupon_usado: form.cupon_usado.trim() || null,
        referencia: form.referencia.trim() || null,
        entre_calles: form.entre_calles.trim() || null,
        localidad: form.localidad || null,
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

      <div className="fila">
        <div>
          <label>Nombre</label>
          <input value={form.nombre} onChange={campo("nombre")} placeholder="Ana" />
        </div>
        <div>
          <label>Apellido</label>
          <input value={form.apellido} onChange={campo("apellido")} placeholder="Pérez" />
        </div>
      </div>

      <label>
        Teléfono {clienteNuevo && <span className="badge nuevo">CLIENTE NUEVO</span>}
        {!clienteNuevo && quintaCompra && <span className="badge gratis">🎉 LE TOCA ENVÍO GRATIS (5ta compra)</span>}
      </label>
      <input value={form.cliente_telefono} onChange={campo("cliente_telefono")} inputMode="tel" placeholder="221 555 0000" />

      <div className="fila">
        <div>
          <label>Calle</label>
          <input value={form.calle} onChange={campo("calle")} placeholder="9 o Montevideo" />
        </div>
        <div>
          <label>Número</label>
          <input value={form.numero} onChange={campo("numero")} inputMode="numeric" placeholder="136" />
        </div>
      </div>

      <label>Entre calles</label>
      <input value={form.entre_calles} onChange={campo("entre_calles")} placeholder="15 y 16" />
      <p className="mini">Calle, número y entre calles: los tres completos, así el mapa geolocaliza bien (como en el WhatsApp Business).</p>

      <label>Referencia de la dirección</label>
      <input value={form.referencia} onChange={campo("referencia")} placeholder="timbre roto, casa con rejas verdes…" />

      <div className="fila">
        <div>
          <label>Zona</label>
          <select
            value={form.zona_id}
            onChange={(e) => {
              const zonaId = e.target.value;
              setForm((f) => ({ ...f, zona_id: zonaId, localidad: BARRIOS_POR_ZONA[Number(zonaId)]?.[0] || "" }));
            }}
          >
            <option value="">Elegir zona…</option>
            {zonas.map((z) => (
              <option key={z.id} value={z.id}>{z.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label>Barrio / localidad</label>
          <select value={form.localidad} onChange={campo("localidad")} disabled={!zona}>
            {!zona && <option value="">Elegí la zona primero…</option>}
            {(BARRIOS_POR_ZONA[Number(form.zona_id)] || []).map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>
      </div>

      <label>Monto mercadería {form.cupon_usado ? "(con descuento ya aplicado)" : ""}</label>
      <input value={form.monto_pedido} onChange={campo("monto_pedido")} inputMode="numeric" placeholder="60000" />

      {zona && <p className="mini">📅 {zona.nombre}: {zona.dias_entrega}{zona.minimo_compra ? ` · mínimo ${dinero(zona.minimo_compra)}` : ""}</p>}

      {form.localidad && tarifaCalculada == null && (
        <div className="aviso warning">
          ⚠️ El tarifario no cubre {form.localidad}{form.calle ? ` calle ${form.calle}` : ""} — <strong>consultar precio</strong> y cargarlo acá:
          <input
            value={form.tarifa_manual}
            onChange={campo("tarifa_manual")}
            inputMode="numeric"
            placeholder="Envío ($)"
            style={{ marginTop: 6 }}
          />
        </div>
      )}

      {envio !== null && (
        <div className={`aviso ${gratis ? "ok" : ""}`} style={!gratis ? { background: "var(--verde-claro)", border: "1px solid #c4dfc6" } : undefined}>
          🚚 Envío: {gratis ? (
            <strong>GRATIS 🎉 ({motivoGratis === "fidelizacion" ? "5ta compra" : `pedido ≥ ${dinero(config.umbral_envio_gratis)}`})</strong>
          ) : <strong>{dinero(envio)}</strong>}
          {" · "}Total cliente: <strong>{dinero(monto + envio)}</strong>
        </div>
      )}

      <div className="fila">
        <div>
          <label>📦 Cantidad de productos</label>
          <input value={form.cantidad_productos} onChange={campo("cantidad_productos")} inputMode="numeric" placeholder="8" />
        </div>
        <div>
          <label>❄️ De esos, refrigerados</label>
          <input value={form.cantidad_refrigerados} onChange={campo("cantidad_refrigerados")} inputMode="numeric" placeholder="0" />
        </div>
      </div>
      {tieneRefrigerados && (
        <p className="mini">❄️ Lleva refrigerados: va en conservadora, primera parada de su zona.</p>
      )}
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
