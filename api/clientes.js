import { rol, sb, fail } from "./_lib.js";
import { agregarClientes, hoyISO } from "../src/logic.js";

export default async function handler(req, res) {
  const quien = rol(req);
  if (!quien) return res.status(401).json({ error: "Token inválido" });
  if (quien !== "tienda") return res.status(403).json({ error: "Solo la tienda puede ver los clientes" });
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const data = await sb(
      "pedidos?select=cliente_telefono,cliente_nombre,monto_pedido,fecha_entrega,estado&estado=eq.entregado&order=fecha_entrega.asc"
    );
    return res.status(200).json(agregarClientes(data, hoyISO()));
  } catch (err) {
    return fail(res, err);
  }
}
