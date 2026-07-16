import { rol, sb, fail } from "./_lib.js";

const SELECT = "select=*,zona:zonas(*)";

const CAMPOS_PEDIDO = [
  "fecha_entrega", "cliente_nombre", "cliente_telefono", "direccion", "entre_calles", "localidad", "referencia",
  "zona_id", "monto_pedido", "costo_envio", "tarifa_envio", "envio_gratis", "motivo_envio_gratis", "tiene_refrigerados",
  "cantidad_productos", "cantidad_refrigerados",
  "incluye_cooler", "cliente_nuevo", "cupon_usado", "forma_pago", "pago_recibido",
  "estado", "notas", "cupon_enviado_at", "resena_enviada_at", "pospuesto", "envio_reintento", "orden_ruta",
];

// El repartidor puede marcar entregas, pagos, posponer paradas y reprogramar
// para otro día con cargo de revisita (él es el que está en la puerta).
const CAMPOS_REPARTIDOR = ["estado", "pago_recibido", "notas", "pospuesto", "fecha_entrega", "envio_reintento", "orden_ruta"];

function filtrar(body, permitidos) {
  return Object.fromEntries(Object.entries(body || {}).filter(([k]) => permitidos.includes(k)));
}

export default async function handler(req, res) {
  const quien = rol(req);
  if (!quien) return res.status(401).json({ error: "Token inválido" });

  try {
    if (req.method === "GET") {
      const { fecha, desde, hasta, telefono, id } = req.query;
      const filtros = [];
      if (id) filtros.push(`id=eq.${encodeURIComponent(id)}`);
      if (fecha) filtros.push(`fecha_entrega=eq.${encodeURIComponent(fecha)}`);
      if (desde) filtros.push(`fecha_entrega=gte.${encodeURIComponent(desde)}`);
      if (hasta) filtros.push(`fecha_entrega=lte.${encodeURIComponent(hasta)}`);
      if (telefono) filtros.push(`cliente_telefono=eq.${encodeURIComponent(telefono)}`);
      if (!filtros.length) return res.status(400).json({ error: "Falta filtro (fecha, desde/hasta, telefono o id)" });
      const data = await sb(`pedidos?${SELECT}&${filtros.join("&")}&order=created_at.asc`);
      return res.status(200).json(data);
    }

    if (req.method === "POST") {
      if (quien !== "tienda") return res.status(403).json({ error: "Solo la tienda puede cargar pedidos" });
      const body = filtrar(req.body, CAMPOS_PEDIDO);
      const obligatorios = ["fecha_entrega", "cliente_nombre", "cliente_telefono", "direccion", "zona_id", "monto_pedido", "forma_pago"];
      const faltan = obligatorios.filter((c) => body[c] === undefined || body[c] === null || body[c] === "");
      if (faltan.length) return res.status(400).json({ error: `Faltan campos: ${faltan.join(", ")}` });
      const data = await sb(`pedidos?${SELECT}`, { method: "POST", body });
      return res.status(201).json(data[0]);
    }

    if (req.method === "PATCH") {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: "Falta id" });
      const permitidos = quien === "tienda" ? CAMPOS_PEDIDO : CAMPOS_REPARTIDOR;
      const cambios = filtrar(req.body, permitidos);
      if (!Object.keys(cambios).length) return res.status(400).json({ error: "Nada para actualizar" });
      const data = await sb(`pedidos?${SELECT}&id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: cambios,
      });
      return res.status(200).json(data[0]);
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return fail(res, err);
  }
}
