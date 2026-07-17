import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import {
  dinero, semanaPasada, calcularLiquidacion, resumenPorZona, metricas,
  nombreFormaPago, idCorto, envioCobradoPorNutridiet, envioReintento, liquidacionCSV, tarifaDelPedido,
  totalesVentas, hoyISO,
} from "../logic.js";

function descargarCSV(entregados, rango) {
  const csv = liquidacionCSV(entregados);
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `liquidacion_${rango.desde}_a_${rango.hasta}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function TablaPedidos({ pedidos, columnaMonto, valorMonto }) {
  if (!pedidos.length) return <p className="mini">Sin pedidos en este rubro.</p>;
  return (
    <div className="tabla-scroll">
      <table>
        <thead>
          <tr><th>Fecha</th><th>Cliente</th><th>Zona</th><th>Pago</th><th className="num">{columnaMonto}</th></tr>
        </thead>
        <tbody>
          {pedidos.map((p) => (
            <tr key={p.id}>
              <td>{p.fecha_entrega.slice(5)}</td>
              <td><span className="mini">{idCorto(p)}</span> {p.cliente_nombre}{envioReintento(p) > 0 && <span className="mini"> 🔁</span>}</td>
              <td>{p.zona?.nombre}</td>
              <td>{nombreFormaPago(p.forma_pago)}</td>
              <td className="num">{dinero(valorMonto(p))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Liquidacion() {
  const [rango, setRango] = useState(semanaPasada());
  const [pedidos, setPedidos] = useState(null); // entregas del período (liquidación del repartidor)
  const [cargados, setCargados] = useState(null); // cargados en el período (ventas para la caja)
  const [error, setError] = useState(null);
  const pedidoNro = useRef(0); // descarta respuestas viejas si se cambia el rango rápido

  const cargar = useCallback(() => {
    const nro = ++pedidoNro.current;
    setError(null);
    setPedidos(null);
    setCargados(null);
    Promise.all([
      api.pedidosPorRango(rango.desde, rango.hasta),
      api.pedidosCargadosEntre(rango.desde, rango.hasta),
    ])
      .then(([porEntrega, porCarga]) => {
        if (pedidoNro.current !== nro) return;
        setPedidos(porEntrega);
        setCargados(porCarga);
      })
      .catch((e) => { if (pedidoNro.current === nro) setError(e.message); });
  }, [rango]);

  useEffect(cargar, [cargar]);

  if (error) return <div className="aviso error">{error}</div>;

  const liq = pedidos ? calcularLiquidacion(pedidos) : null;
  const ventas = cargados ? totalesVentas(cargados) : null;
  const zonasResumen = liq ? resumenPorZona(liq.entregados) : [];
  const m = liq ? metricas(liq.entregados) : null;

  return (
    <>
      <div className="tarjeta">
        <h2 style={{ marginTop: 0 }}>💰 Liquidación</h2>
        <div className="fila">
          <div>
            <label>Desde</label>
            <input type="date" value={rango.desde} onChange={(e) => setRango((r) => ({ ...r, desde: e.target.value }))} />
          </div>
          <div>
            <label>Hasta</label>
            <input type="date" value={rango.hasta} onChange={(e) => setRango((r) => ({ ...r, hasta: e.target.value }))} />
          </div>
        </div>
        <button
          className="chico secundario"
          onClick={() => setRango({ desde: hoyISO(), hasta: hoyISO() })}
        >
          📆 Hoy (cierre de caja)
        </button>
        <p className="mini">Default: semana pasada (lunes a domingo). Solo cuentan pedidos ENTREGADOS.</p>
      </div>

      {!pedidos || !cargados ? (
        <div className="vacio">Calculando…</div>
      ) : (
        <>
          {liq.entregados.length > 0 && (
            <button className="secundario" style={{ width: "auto" }} onClick={() => descargarCSV(liq.entregados, rango)}>
              ⬇️ Exportar CSV
            </button>
          )}

          <div className="tarjeta">
            <h3 style={{ marginTop: 0 }}>🧾 Ventas por la app en el período (para cruzar con la caja)</h3>
            <p className="mini">Cuenta los pedidos <strong>cargados</strong> en estas fechas — el ticket ya se hizo en el POS aunque la entrega sea programada. Los cancelados no suman (anular ese ticket en el POS).</p>
            <div className="linea">
              <span>Pedidos cargados{ventas.aEntregar > 0 ? ` (${ventas.aEntregar} con entrega programada)` : ""}</span>
              <span className="monto">{ventas.cantidad}</span>
            </div>
            <div className="linea">
              <span>Mercadería (productos)</span>
              <span className="monto">{dinero(ventas.mercaderia)}</span>
            </div>
            <div className="linea">
              <span>Envíos cobrados al cliente (con revisitas; los gratis no suman)</span>
              <span className="monto">{dinero(ventas.envios)}</span>
            </div>
            <div className="linea" style={{ borderTop: "1px solid #d8e3d5", paddingTop: 8 }}>
              <span><strong>TOTAL vendido por la app</strong></span>
              <span className="monto">{dinero(ventas.total)}</span>
            </div>
            <p className="mini">Lo facturado en el POS en el período menos este total = venta física del local.</p>
          </div>

          <div className="tarjeta" style={{ textAlign: "center" }}>
            <div className="mini">NETO DEL PERÍODO (repartidor)</div>
            <div className={`neto ${liq.neto >= 0 ? "positivo" : "negativo"}`}>{dinero(Math.abs(liq.neto))}</div>
            <strong>
              {liq.neto > 0 && "Nutridiet le transfiere al repartidor"}
              {liq.neto < 0 && "El repartidor le entrega a Nutridiet"}
              {liq.neto === 0 && "Están a mano"}
            </strong>
            <div className="linea" style={{ marginTop: 12 }}>
              <span>Debe Nutridiet (envíos cobrados + envíos gratis)</span>
              <span className="monto">{dinero(liq.debeNutridiet)}</span>
            </div>
            <div className="linea">
              <span>Debe el repartidor (mercadería cobrada en efectivo)</span>
              <span className="monto">−{dinero(liq.debeRepartidor)}</span>
            </div>
          </div>

          <div className="tarjeta">
            <h3>🚚 Envíos cobrados por Nutridiet (transferencia / MP, con revisitas) — {dinero(liq.totalEnviosCobrados)}</h3>
            <TablaPedidos pedidos={liq.enviosCobrados} columnaMonto="Envío" valorMonto={envioCobradoPorNutridiet} />
          </div>

          <div className="tarjeta">
            <h3>🎁 Envíos gratis (los paga Nutridiet a tarifa de zona) — {dinero(liq.totalEnviosGratis)}</h3>
            <TablaPedidos pedidos={liq.enviosGratis} columnaMonto="Tarifa" valorMonto={tarifaDelPedido} />
          </div>

          <div className="tarjeta">
            <h3>💵 Efectivo contra entrega (mercadería que debe el repartidor) — {dinero(liq.debeRepartidor)}</h3>
            <TablaPedidos pedidos={liq.efectivo} columnaMonto="Mercadería" valorMonto={(p) => p.monto_pedido} />
          </div>

          <div className="tarjeta">
            <h3>📍 Demanda por zona (entregados)</h3>
            {zonasResumen.length === 0 ? <p className="mini">Sin entregas en el rango.</p> : (
              <table>
                <thead><tr><th>Zona</th><th className="num">Envíos</th><th className="num">Total envíos</th></tr></thead>
                <tbody>
                  {zonasResumen.map((z) => (
                    <tr key={z.nombre}><td>{z.nombre}</td><td className="num">{z.cantidad}</td><td className="num">{dinero(z.totalEnvios)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="metricas">
            <div className="metrica"><div className="valor">{m.pedidosPorSalida.toFixed(1)}</div><div className="nombre">Pedidos por salida ({m.salidas} salidas)</div></div>
            <div className="metrica"><div className="valor">{dinero(Math.round(m.ticketPromedio))}</div><div className="nombre">Ticket promedio</div></div>
            <div className="metrica"><div className="valor">{m.pctCooler.toFixed(0)}%</div><div className="nombre">Con cooler (conversión upsell)</div></div>
            <div className="metrica"><div className="valor">{m.pctNuevos.toFixed(0)}%</div><div className="nombre">Clientes nuevos</div></div>
          </div>
        </>
      )}
    </>
  );
}
