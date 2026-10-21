// Helpers para la integración con la API de Tiendanube.
// Vercel no expone como endpoint los archivos que empiezan con "_".
import crypto from "crypto";

// Tiendanube firma cada webhook con HMAC-SHA256 sobre el body crudo (antes
// de parsear el JSON), usando el Client Secret de la app como clave.
// Header: x-linkedstore-hmac-sha256, en hexadecimal.
export function verificarFirmaTiendaNube(rawBody, firmaHeader) {
  const secret = process.env.TIENDANUBE_CLIENT_SECRET;
  if (!secret || !firmaHeader) return false;
  const esperada = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(esperada);
  const b = Buffer.from(String(firmaHeader));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// La API de Tiendanube usa un header "Authentication" (no "Authorization")
// y exige un User-Agent que identifique la app + un contacto.
export async function tiendanubeFetch(path, opts = {}) {
  const storeId = process.env.TIENDANUBE_STORE_ID;
  const token = process.env.TIENDANUBE_ACCESS_TOKEN;
  if (!storeId || !token) {
    throw new Error("Falta configurar TIENDANUBE_STORE_ID / TIENDANUBE_ACCESS_TOKEN en Vercel");
  }
  const res = await fetch(`https://api.tiendanube.com/2025-03/${storeId}${path}`, {
    ...opts,
    headers: {
      Authentication: `bearer ${token}`,
      "User-Agent": "Nutridiet Envios (nicolaplata@gmail.com)",
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Tiendanube API ${res.status}: ${txt}`);
  }
  return res.json();
}

// Push al vendedor vía bot de Telegram (gratis, sin riesgo de que
// WhatsApp banee ningún número — el link de WhatsApp va DENTRO del
// mensaje, el vendedor lo toca y ahí sí se abre WhatsApp).
export async function enviarTelegram(texto) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID_VENDEDOR;
  if (!token || !chatId) {
    throw new Error("Falta configurar TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID_VENDEDOR en Vercel");
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: texto,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Telegram API ${res.status}: ${txt}`);
  }
}

// Junta el body crudo del request (lo necesitamos para la firma HMAC:
// verificarla sobre el JSON ya parseado y re-serializado podría no
// coincidir byte a byte con lo que mandó Tiendanube).
export function leerRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
