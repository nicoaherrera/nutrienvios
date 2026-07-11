import { useEffect, useState, useCallback } from "react";
import { api, setToken } from "./api.js";
import Tablero from "./pages/Tablero.jsx";
import NuevoPedido from "./pages/NuevoPedido.jsx";
import Recorrido from "./pages/Recorrido.jsx";
import Liquidacion from "./pages/Liquidacion.jsx";
import Clientes from "./pages/Clientes.jsx";
import Config from "./pages/Config.jsx";

// Rutas privadas por token en la URL (auth real queda para v2):
//   #/tienda/TOKEN            → tablero | nuevo | liquidacion | config
//   #/reparto/TOKEN           → recorrido del repartidor
function parseHash() {
  const partes = window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const [area, token, vista, extra] = partes;
  return { area: area || "", token: token || "", vista: vista || "", extra: extra || "" };
}

const TABS_TIENDA = [
  ["tablero", "📋 Tablero"],
  ["nuevo", "➕ Nuevo pedido"],
  ["liquidacion", "💰 Liquidación"],
  ["clientes", "👥 Clientes"],
  ["config", "⚙️ Config"],
];

export default function App() {
  const [ruta, setRuta] = useState(parseHash());
  const [zonas, setZonas] = useState(null);
  const [config, setConfig] = useState(null);
  const [errorCarga, setErrorCarga] = useState(null);

  useEffect(() => {
    const onHash = () => setRuta(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  setToken(ruta.token);

  const cargarBase = useCallback(async () => {
    try {
      setErrorCarga(null);
      const [z, c] = await Promise.all([api.zonas(), api.config()]);
      setZonas(z);
      setConfig(c);
    } catch (e) {
      setErrorCarga(e.message);
    }
  }, []);

  useEffect(() => {
    if (ruta.token) cargarBase();
  }, [ruta.token, cargarBase]);

  const navegar = (vista, extra) =>
    (window.location.hash = `#/${ruta.area}/${ruta.token}/${vista}${extra ? "/" + extra : ""}`);

  if (!ruta.area || !ruta.token) {
    return (
      <div className="error-pantalla">
        <h1>🥗 Nutridiet Envíos</h1>
        <p>Falta el link de acceso. Pedile a la tienda el link completo<br />(termina en /tienda/... o /reparto/...).</p>
      </div>
    );
  }

  if (errorCarga) {
    return (
      <div className="error-pantalla">
        <h1>🥗 Nutridiet Envíos</h1>
        <p className="aviso error">{errorCarga === "Token inválido" ? "El link de acceso no es válido." : errorCarga}</p>
        <button className="secundario" onClick={cargarBase} style={{ width: "auto" }}>Reintentar</button>
      </div>
    );
  }

  if (!zonas || !config) return <div className="error-pantalla">Cargando…</div>;

  if (ruta.area === "reparto") {
    return <Recorrido zonas={zonas} config={config} />;
  }

  if (ruta.area === "tienda") {
    const vista = ruta.vista || "tablero";
    return (
      <>
        <div className="header">
          <span className="marca">🥗 Nutridiet Envíos</span>
        </div>
        <div className="tabs">
          {TABS_TIENDA.map(([id, nombre]) => (
            <button key={id} className={vista === id ? "activa" : ""} onClick={() => navegar(id)}>
              {nombre}
            </button>
          ))}
        </div>
        {vista === "tablero" && <Tablero zonas={zonas} config={config} navegar={navegar} />}
        {vista === "nuevo" && (
          <NuevoPedido key={ruta.extra || "nuevo"} zonas={zonas} config={config} pedidoId={ruta.extra} navegar={navegar} />
        )}
        {vista === "liquidacion" && <Liquidacion zonas={zonas} config={config} />}
        {vista === "clientes" && <Clientes />}
        {vista === "config" && <Config zonas={zonas} config={config} recargar={cargarBase} />}
      </>
    );
  }

  return (
    <div className="error-pantalla">
      <p>Ruta desconocida: {ruta.area}</p>
    </div>
  );
}
