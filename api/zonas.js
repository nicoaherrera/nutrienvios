import { rol, sb, fail } from "./_lib.js";

export default async function handler(req, res) {
  const quien = rol(req);
  if (!quien) return res.status(401).json({ error: "Token inválido" });

  try {
    if (req.method === "GET") {
      const data = await sb("zonas?select=*&order=orden_recorrido.asc");
      return res.status(200).json(data);
    }

    if (req.method === "PATCH") {
      if (quien !== "tienda") return res.status(403).json({ error: "Solo la tienda puede editar zonas" });
      const { id, ...campos } = req.body || {};
      if (!id) return res.status(400).json({ error: "Falta id de zona" });
      const permitidos = ["tarifa", "dias_entrega", "minimo_compra", "refrigerados_ok", "orden_recorrido"];
      const cambios = Object.fromEntries(Object.entries(campos).filter(([k]) => permitidos.includes(k)));
      if (!Object.keys(cambios).length) return res.status(400).json({ error: "Nada para actualizar" });
      const data = await sb(`zonas?id=eq.${Number(id)}`, { method: "PATCH", body: cambios });
      return res.status(200).json(data);
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return fail(res, err);
  }
}
