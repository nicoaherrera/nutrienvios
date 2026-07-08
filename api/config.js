import { rol, sb, fail } from "./_lib.js";

export default async function handler(req, res) {
  const quien = rol(req);
  if (!quien) return res.status(401).json({ error: "Token inválido" });

  try {
    if (req.method === "GET") {
      const filas = await sb("config?select=*");
      const mapa = Object.fromEntries(filas.map((f) => [f.clave, f.valor]));
      return res.status(200).json(mapa);
    }

    if (req.method === "PATCH") {
      if (quien !== "tienda") return res.status(403).json({ error: "Solo la tienda puede editar la configuración" });
      const cambios = req.body || {};
      for (const [clave, valor] of Object.entries(cambios)) {
        await sb(`config?clave=eq.${encodeURIComponent(clave)}`, {
          method: "PATCH",
          body: { valor: String(valor) },
        });
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return fail(res, err);
  }
}
