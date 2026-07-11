import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import { dinero, semanaPasada, calcularLiquidacion, resumenPorZona, metricas, nombreFormaPago, idCorto } from "../logic.js";

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
              <td><span className="mini">{idCorto(p)}</span> {p.cliente_nombre}</td>
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
  const [pedidos, setPedidos] = useState(null);
  const [error, setError] = useState(null);

  const cargar = useCallback(() => {
    setError(null);
    setPedidos(null);
    api.pedidosPorRango(rango.desde, rango.hasta).then(setPedidos).catch((e) => setError(e.message));
  }, [rango]);

  useEffect(cargar, [cargar]);

  if (error) return <div className="aviso error">{error}</div>;

  const liq = pedidos ? calcularLiquidacion(pedidos) : null;
  const zonasResumen = liq ? resumenPorZona(liq.entregados) : [];
  const m = liq ? metricas(liq.entregados) : null;

  return (
    <>
      <div className="tarjeta">
        <h2 style={{ marginTop: 0 }}>💰 Liquidación semanal</h2>
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
        <p className="mini">Default: semana pasada (lunes a domingo). Solo cuentan pedidos ENTREGADOS.</p>
      </div>

      {!pedidos ? (
        <div className="vacio">Calculando…</div>
      ) : (
        <>
          <div className="tarjeta" style={{ textAlign: "center" }}>
            <div className="mini">NETO DE LA SEMANA</div>
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
            <h3>🚚 Envíos cobrados por Nutridiet (transferencia / MP) — {dinero(liq.totalEnviosCobrados)}</h3>
            <TablaPedidos pedidos={liq.enviosCobrados} columnaMonto="Envío" valorMonto={(p) => p.costo_envio} />
          </div>

          <div className="tarjeta">
            <h3>🎁 Envíos gratis (los paga Nutridiet a tarifa de zona) — {dinero(liq.totalEnviosGratis)}</h3>
            <TablaPedidos pedidos={liq.enviosGratis} columnaMonto="Tarifa" valorMonto={(p) => p.zona?.tarifa ?? 0} />
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
