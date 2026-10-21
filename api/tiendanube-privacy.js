// Los 3 webhooks de privacidad son obligatorios para crear la app en el
// Partners Portal (store/redact, customers/redact, customers/data_request),
// aunque esta app sea de uso interno y no publicada. No hacemos nada con
// los datos nosotros (no los guardamos en ninguna base propia): solo
// confirmamos recepción. El tópico llega por query string, ej.
// /api/tiendanube-privacy?topic=store_redact
import { verificarFirmaTiendaNube, leerRawBody } from "./_tiendanube.js";

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const raw = await leerRawBody(req);
  const firma = req.headers["x-linkedstore-hmac-sha256"];
  if (!verificarFirmaTiendaNube(raw, firma)) {
    return res.status(401).end();
  }

  console.log("Webhook de privacidad recibido:", req.query.topic);
  return res.status(200).end();
}
