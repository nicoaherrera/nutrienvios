import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import {
  dinero, hoyISO, ordenarRecorrido, montoACobrar, linksGoogleMaps, direccionParaMapa,
  gananciaRepartidor, nombreFormaPago, idCorto, siguienteParada,
  ultimaEntregada, demoraEstimada, linkAvisoEnCamino, mensajeEnCamino, envioReintento,
  linkWhatsApp, mensajeNoTeEncontramos, mensajeNoEstabaReprogramado,
} from "../logic.js";

// Algunos teléfonos corrompen los emoji que van prellenados en el link de
// wa.me (aparecen como �). Copiamos el texto real al portapapeles antes de
// abrir el chat, así si el prellenado sale mal, pegar (Cmd/Ctrl+V) lo arregla.
async function copiarYAbrir(telefono, texto, link) {
  try { await navigator.clipboard.writeText(texto); } catch { /* el link ya lleva el texto */ }
  window.open(link, "_blank");
}

export default function Recorrido({ config }) {
  const [fecha, setFecha] = useState(hoyISO());
  const [pedidos, setPedidos] = useState(null);
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(null); // id del pedido que se está actualizando
  const [optimizando, setOptimizando] = useState(false);
  const [resumenRuta, setResumenRuta] = useState(null); // km/duración de la última optimización

  const cargar = useCallback(() => {
    setError(null);
    api.pedidosPorFecha(fecha)
      .then((ps) => setPedidos(ps.filter((p) => p.estado !== "cancelado")))
      .catch((e) => setError(e.message));
  }, [fecha]);

  useEffect(cargar, [cargar]);

  async function marcar(pedido, cambios) {
    setOcupado(pedido.id);
    try {
      await api.editarPedido(pedido.id, cambios);
      cargar();
    } catch (e) {
      setError(e.message);
    } finally {
      setOcupado(null);
    }
  }

  async function optimizar() {
    setOptimizando(true);
    setError(null);
    try {
      const r = await api.optimizarRuta(fecha);
      setResumenRuta(r);
      cargar();
    } catch (e) {
      setError(e.message);
    } finally {
      setOptimizando(false);
    }
  }

  if (error) return <div className="aviso error">{error} <button className="chico secundario" onClick={cargar}>Reintentar</button></div>;
  if (!pedidos) return <div className="vacio">Cargando recorrido…</div>;

  const orden = ordenarRecorrido(pedidos);
  const pendientes = orden.filter((p) => p.estado !== "entregado");
  const entregados = orden.filter((p) => p.estado === "entregado");
  const totalDia = orden.reduce((s, p) => s + gananciaRepartidor(p), 0);
  const links = linksGoogleMaps(config.direccion_local, pendientes);
  const proxima = siguienteParada(orden);
  const ultima = ultimaEntregada(orden);

  return (
    <>
      <div className="header">
        <span className="marca">🚚 Recorrido</span>
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={{ width: "auto" }} />
      </div>

      <div className="tarjeta">
        <div className="linea">
          <span><strong>{entregados.length} de {orden.length}</strong> entregados</span>
          <span className="monto">Envíos del día: {dinero(totalDia)}</span>
        </div>
        {pendientes.length >= 2 && (
          <button className="primario" disabled={optimizando} onClick={optimizar}>
            {optimizando ? "Optimizando…" : "🧭 Optimizar recorrido (distancia real)"}
          </button>
        )}
        {resumenRuta && (
          <div className="aviso ok">
            ✅ Recorrido optimizado: {resumenRuta.paradas} paradas
            {resumenRuta.km ? ` · ${resumenRuta.km} km` : ""}
            {resumenRuta.duracion ? ` · ~${Math.round(parseInt(resumenRuta.duracion) / 60)} min de manejo` : ""}
          </div>
        )}
        {links.map((url, i) => (
          <a key={url} className="botonlink" href={url} target="_blank" rel="noreferrer">
            🗺️ Abrir ruta en Google Maps{links.length > 1 ? ` (tramo ${i + 1} de ${links.length})` : ""}
          </a>
        ))}
        {links.length > 0 && (
          <p className="mini">
            💡 Tocá "Optimizar recorrido" al arrancar el día: reordena las paradas de esta pantalla por distancia real de
            manejo (Google Routes) y el link de Maps ya sale en ese orden. Si después salteás o reprogramás alguna, el
            resto mantiene su orden.
          </p>
        )}
      </div>

      {orden.length === 0 && <div className="vacio">No hay entregas para este día 🎉</div>}

      {orden.map((p) => {
        const contraEntrega = p.forma_pago === "efectivo_contra_entrega";
        const entregado = p.estado === "entregado";
        const esProxima = proxima?.id === p.id;
        return (
          <div key={p.id} className={`tarjeta parada ${entregado ? "entregada" : ""} ${esProxima ? "proxima" : ""}`}>
            {esProxima && <div className="badge proxima">▶ PRÓXIMA PARADA</div>}
            {p.pospuesto && !entregado && <div className="badge efectivo">⏸ POSPUESTA — al final del recorrido</div>}
            <div className="linea" style={{ paddingBottom: 0 }}>
              <strong>{p.cliente_nombre} <span className="mini">{idCorto(p)}</span></strong>
              <span>
                {p.tiene_refrigerados && <span className="badge frio">❄️ FRÍO</span>}{" "}
                {contraEntrega
                  ? <span className="badge efectivo">💵 {p.pago_recibido ? "COBRADO" : "COBRAR"}</span>
                  : <span className="badge pago">{nombreFormaPago(p.forma_pago)}</span>}
              </span>
            </div>
            <div className="direccion">📍 {p.direccion}{p.entre_calles && ` (entre ${p.entre_calles})`}</div>
            {p.referencia && <div className="referencia">👉 {p.referencia}</div>}
            {p.notas && <div className="referencia">📝 {p.notas}</div>}
            <div className="mini">{p.zona?.nombre}{p.envio_gratis ? " · envío gratis (lo paga Nutridiet)" : ` · envío ${dinero(p.costo_envio)}`}</div>

            {contraEntrega && !entregado && (
              <div className="cobrar">
                💵 COBRAR {dinero(montoACobrar(p))} (mercadería {dinero(p.monto_pedido)} + envío {p.envio_gratis ? "$0" : dinero(p.costo_envio)}
                {envioReintento(p) > 0 && <> + revisita {dinero(envioReintento(p))}</>})
              </div>
            )}
            {envioReintento(p) > 0 && !contraEntrega && (
              <div className="mini">🔁 Revisita: {dinero(envioReintento(p))} de envío extra (ya cobrado por la tienda)</div>
            )}

            {!entregado && (
              <a
                className="botonlink wsp"
                href={linkAvisoEnCamino(p, demoraEstimada(p, ultima))}
                target="_blank"
                rel="noreferrer"
                onClick={() => { navigator.clipboard.writeText(mensajeEnCamino(p, demoraEstimada(p, ultima))).catch(() => {}); }}
              >
                Avisar que voy en camino 🚀
              </a>
            )}

            <div className="acciones">
              <a className="botonlink chico" style={{ width: "auto", marginTop: 0 }} href={`https://maps.google.com/?q=${encodeURIComponent(direccionParaMapa(p.direccion, p.zona, p.localidad))}`} target="_blank" rel="noreferrer">📍 Mapa</a>
              <a className="botonlink chico" style={{ width: "auto", marginTop: 0 }} href={`https://wa.me/${p.cliente_telefono.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">💬 WhatsApp</a>
              {!entregado && (
                <button className="chico secundario" disabled={ocupado === p.id} onClick={() => marcar(p, { pospuesto: !p.pospuesto })}>
                  {p.pospuesto ? "↩️ Retomar" : "⏭️ Más tarde"}
                </button>
              )}
            </div>

            {!entregado ? (
              <div className="acciones">
                <button
                  className="primario"
                  disabled={ocupado === p.id}
                  onClick={() => marcar(p, { estado: "entregado", ...(contraEntrega ? { pago_recibido: true } : {}) })}
                >
                  Entregado ✅
                </button>
                <button
                  className="peligro"
                  disabled={ocupado === p.id}
                  onClick={async () => {
                    const nota = window.prompt("¿Qué pasó? (queda como nota)", "No estaba");
                    if (nota === null) return;
                    const tarifa = Number(p.zona?.tarifa ?? 0);
                    const d = new Date(fecha + "T00:00:00");
                    d.setDate(d.getDate() + 1);
                    const manana = hoyISO(d);
                    if (window.confirm(`¿Reprogramar para mañana sumando ${dinero(tarifa)} de revisita?\n(Cancelar = queda para que lo resuelva la tienda)`)) {
                      await marcar(p, {
                        estado: "pendiente",
                        fecha_entrega: manana,
                        pospuesto: false,
                        orden_ruta: null,
                        envio_reintento: envioReintento(p) + tarifa,
                        notas: [p.notas, `${fecha}: ${nota} — reprogramado a ${manana} (+${dinero(tarifa)} revisita)`].filter(Boolean).join(" | "),
                      });
                      const texto = mensajeNoEstabaReprogramado(p, manana, tarifa);
                      await copiarYAbrir(p.cliente_telefono, texto, linkWhatsApp(p.cliente_telefono, texto));
                    } else {
                      await marcar(p, { estado: "pendiente", notas: [p.notas, `${fecha}: ${nota}`].filter(Boolean).join(" | ") });
                      if (window.confirm("¿Avisarle al cliente por WhatsApp que no lo encontramos?")) {
                        const texto = mensajeNoTeEncontramos(p);
                        await copiarYAbrir(p.cliente_telefono, texto, linkWhatsApp(p.cliente_telefono, texto));
                      }
                    }
                  }}
                >
                  No estaba ❌
                </button>
              </div>
            ) : (
              <div className="acciones" style={{ alignItems: "center" }}>
                <div className="mini">✅ Entregado{contraEntrega ? " y cobrado" : ""}</div>
                <button
                  className="chico secundario"
                  disabled={ocupado === p.id}
                  onClick={() => {
                    if (!window.confirm("¿Deshacer la entrega de este pedido?")) return;
                    marcar(p, { estado: "pendiente", ...(contraEntrega ? { pago_recibido: false } : {}) });
                  }}
                >
                  ↩️ Deshacer
                </button>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
