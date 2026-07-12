import { rol, sb, fail } from "./_lib.js";
import { direccionParaMapa } from "../src/logic.js";

// Optimiza el orden de las paradas del día con la Routes API de Google
// (computeRoutes + optimizeWaypointOrder): distancia real de manejo, no zonas.
// La API key vive acá (GOOGLE_MAPS_API_KEY), nunca en el frontend.
// Guarda el resultado en pedidos.orden_ruta; el Recorrido lo respeta al ordenar.
export default async function handler(req, res) {
  const quien = rol(req);
  if (!quien) return res.status(401).json({ error: "Token inválido" });
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "Falta configurar GOOGLE_MAPS_API_KEY en el .env (o en Vercel) y reiniciar el servidor",
    });
  }

  const { fecha } = req.body || {};
  if (!fecha) return res.status(400).json({ error: "Falta fecha" });

  try {
    const pendientes = (await sb(
      `pedidos?select=*,zona:zonas(*)&fecha_entrega=eq.${encodeURIComponent(fecha)}&order=created_at.asc`
    )).filter((p) => p.estado !== "entregado" && p.estado !== "cancelado");

    if (pendientes.length < 2) {
      return res.status(400).json({ error: "Hacen falta al menos 2 paradas pendientes para optimizar" });
    }
    if (pendientes.length > 25) {
      return res.status(400).json({ error: "La Routes API optimiza hasta 25 paradas por vez" });
    }

    const config = Object.fromEntries((await sb("config?select=*")).map((c) => [c.clave, c.valor]));
    const local = { address: `${config.direccion_local}, Argentina` };

    // Ida y vuelta desde el local; la API acepta direcciones de texto, así que
    // van las mismas normalizadas que ya usa el link de Maps.
    const r = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "routes.optimizedIntermediateWaypointIndex,routes.duration,routes.distanceMeters",
      },
      body: JSON.stringify({
        origin: local,
        destination: local,
        intermediates: pendientes.map((p) => ({
          address: direccionParaMapa(p.direccion, p.zona, p.localidad),
        })),
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
        optimizeWaypointOrder: true,
      }),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) {
      console.error("Routes API error:", r.status, JSON.stringify(data));
      const detalle = data?.error?.message || `HTTP ${r.status}`;
      return res.status(502).json({ error: `Google Routes API: ${detalle}` });
    }

    const indices = data.routes?.[0]?.optimizedIntermediateWaypointIndex;
    if (!Array.isArray(indices) || indices.length !== pendientes.length) {
      return res.status(502).json({ error: "Google no devolvió un orden optimizado" });
    }

    // indices[i] = índice original de la parada que va en la posición i
    await Promise.all(
      indices.map((idxOriginal, posicion) =>
        sb(`pedidos?id=eq.${encodeURIComponent(pendientes[idxOriginal].id)}`, {
          method: "PATCH",
          body: { orden_ruta: posicion },
        })
      )
    );

    const km = data.routes?.[0]?.distanceMeters ? Math.round(data.routes[0].distanceMeters / 100) / 10 : null;
    const duracion = data.routes?.[0]?.duration || null; // ej. "1860s"
    return res.status(200).json({ ok: true, paradas: pendientes.length, km, duracion });
  } catch (err) {
    return fail(res, err);
  }
}
