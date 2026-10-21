// Webhook de "pedido nuevo" de Tiendanube. El payload que manda Tiendanube
// es mínimo ({store_id, event, id}): hay que pedirle el pedido completo a
// la API. Si la dirección de envío es zona propia (la reparte el propio
// equipo, no correo), se le avisa al vendedor por Telegram con los datos
// del pedido y un link de WhatsApp ya armado para escribirle al cliente.
import { verificarFirmaTiendaNube, tiendanubeFetch, enviarTelegram, leerRawBody } from "./_tiendanube.js";
import { esZonaPropia, resumenPedidoTiendaNube, linkAvisoVendedorTiendaNube } from "../src/logic.js";

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const raw = await leerRawBody(req);
  const firma = req.headers["x-linkedstore-hmac-sha256"];
  if (!verificarFirmaTiendaNube(raw, firma)) {
    console.error("Firma de webhook de Tiendanube inválida");
    return res.status(401).end();
  }

  // Tiendanube espera una respuesta 2xx rápida (reintenta si no la recibe
  // en ~3s); el resto de la lógica sigue después de responder.
  res.status(200).end();

  let payload;
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch (err) {
    console.error("Webhook con body no-JSON:", err.message);
    return;
  }
  if (payload.event !== "order/created") return;

  try {
    const order = await tiendanubeFetch(`/orders/${payload.id}`);
    const dir = order.shipping_address || {};
    const localidad = dir.city || dir.locality || "";

    if (!esZonaPropia(localidad)) {
      console.log(`Pedido ${payload.id}: "${localidad}" no es zona propia, no se avisa.`);
      return;
    }

    const resumen = resumenPedidoTiendaNube(order);
    const link = linkAvisoVendedorTiendaNube(order);
    await enviarTelegram(
      `${resumen}\n\n👉 <a href="${link}">Tocá para escribirle al cliente por WhatsApp</a>`
    );
  } catch (err) {
    console.error("Error procesando pedido nuevo de Tiendanube:", err);
  }
}
