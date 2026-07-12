import { Fragment, useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import { dinero, idCorto, nombreFormaPago, mensajeReactivacion, linkReactivacion } from "../logic.js";

async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
  } catch {
    window.prompt("Copiá el mensaje:", texto);
  }
}

const ESTADO_LABEL = { pendiente: "pendiente", en_reparto: "en reparto", entregado: "entregado", cancelado: "cancelado" };

function Historial({ telefono }) {
  const [pedidos, setPedidos] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.pedidosPorTelefono(telefono).then((ps) => setPedidos([...ps].reverse())).catch((e) => setError(e.message));
  }, [telefono]);

  if (error) return <p className="aviso error">{error}</p>;
  if (!pedidos) return <p className="mini">Cargando historial…</p>;
  if (!pedidos.length) return <p className="mini">Sin pedidos.</p>;

  return (
    <div className="tabla-scroll">
      <table>
        <thead>
          <tr><th>Pedido</th><th>Fecha</th><th className="num">Mercadería</th><th>Pago</th><th>Estado</th></tr>
        </thead>
        <tbody>
          {pedidos.map((p) => (
            <tr key={p.id}>
              <td>{idCorto(p)}</td>
              <td>{p.fecha_entrega.slice(5)}</td>
              <td className="num">{dinero(p.monto_pedido)}</td>
              <td>{nombreFormaPago(p.forma_pago)}</td>
              <td><span className={`badge estado-${p.estado}`}>{ESTADO_LABEL[p.estado] || p.estado}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Clientes() {
  const [clientes, setClientes] = useState(null);
  const [error, setError] = useState(null);
  const [abierto, setAbierto] = useState(null); // teléfono con el historial desplegado

  const cargar = useCallback(() => {
    setError(null);
    setClientes(null);
    api.clientes().then(setClientes).catch((e) => setError(e.message));
  }, []);

  useEffect(cargar, [cargar]);

  if (error) return <div className="aviso error">{error} <button className="chico secundario" onClick={cargar}>Reintentar</button></div>;
  if (!clientes) return <div className="vacio">Cargando…</div>;

  const inactivos = clientes.filter((c) => c.diasSinPedir >= 30);

  return (
    <>
      <div className="tarjeta">
        <h2 style={{ marginTop: 0 }}>👥 Clientes</h2>
        <p className="mini">Solo cuentan pedidos ENTREGADOS. Ordenados por más tiempo sin pedir primero.</p>
      </div>

      {inactivos.length > 0 && (
        <div className="tarjeta" style={{ borderColor: "var(--azul)", background: "var(--azul-claro)" }}>
          <h3 style={{ marginTop: 0 }}>💤 Hace 30 días o más que no piden ({inactivos.length})</h3>
          {inactivos.map((c) => (
            <div key={c.telefono} className="linea" style={{ flexWrap: "wrap" }}>
              <span><strong>{c.nombre}</strong> — hace {c.diasSinPedir} días ({c.compras} compras, {dinero(c.gastoTotal)} en total)</span>
              <button
                className="chico primario"
                onClick={async () => {
                  await copiar(mensajeReactivacion(c));
                  window.open(linkReactivacion(c), "_blank");
                }}
              >
                💬 Mandar mensaje
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="tarjeta">
        <p className="mini">Tocá un cliente para ver su historial completo de pedidos.</p>
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>Cliente</th><th className="num">Compras</th><th className="num">Gasto total</th>
                <th>Última entrega</th><th className="num">Días sin pedir</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <Fragment key={c.telefono}>
                  <tr style={{ cursor: "pointer" }} onClick={() => setAbierto(abierto === c.telefono ? null : c.telefono)}>
                    <td>{abierto === c.telefono ? "▾ " : "▸ "}{c.nombre}</td>
                    <td className="num">{c.compras}</td>
                    <td className="num">{dinero(c.gastoTotal)}</td>
                    <td>{c.ultimaEntrega.slice(5)}</td>
                    <td className="num">{c.diasSinPedir}</td>
                  </tr>
                  {abierto === c.telefono && (
                    <tr>
                      <td colSpan={5} style={{ background: "var(--fondo)" }}>
                        <Historial telefono={c.telefono} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {clientes.length === 0 && <p className="mini">Todavía no hay entregas registradas.</p>}
      </div>
    </>
  );
}
