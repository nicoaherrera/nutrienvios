// Paso único de instalación: Tiendanube redirige acá con ?code=... después
// de que Nicolás autoriza la app en su propia tienda. Lo cambiamos por un
// Access Token y lo mostramos en pantalla UNA vez para copiarlo a mano a
// las variables de entorno de Vercel (TIENDANUBE_ACCESS_TOKEN y
// TIENDANUBE_STORE_ID) — mismo patrón que el resto de las claves de este
// proyecto: viven en Vercel, no en una base de datos.
export default async function handler(req, res) {
  const { code, error } = req.query;

  if (error) {
    return res.status(400).send(`<p>Tiendanube devolvió un error: ${error}</p>`);
  }
  if (!code) {
    return res.status(400).send("<p>Falta el parámetro ?code= (abrí este flujo desde el botón de instalar la app en Tiendanube).</p>");
  }

  const clientId = process.env.TIENDANUBE_CLIENT_ID;
  const clientSecret = process.env.TIENDANUBE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(500).send("<p>Falta configurar TIENDANUBE_CLIENT_ID / TIENDANUBE_CLIENT_SECRET en Vercel antes de instalar la app.</p>");
  }

  try {
    const r = await fetch("https://www.tiendanube.com/apps/authorize/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      return res.status(500).send(`<pre>Error al cambiar el code por el token:\n${JSON.stringify(data, null, 2)}</pre>`);
    }

    const storeId = data.user_id || data.store_id;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(`
      <html><body style="font-family:sans-serif; max-width:640px; margin:40px auto; line-height:1.5;">
        <h2>✅ App instalada</h2>
        <p>Copiá estos dos valores a <b>Vercel → nutridiet-envios → Settings → Environment Variables</b> y volvé a hacer deploy:</p>
        <p><b>TIENDANUBE_ACCESS_TOKEN</b><br><code style="background:#eee;padding:4px 8px;">${data.access_token}</code></p>
        <p><b>TIENDANUBE_STORE_ID</b><br><code style="background:#eee;padding:4px 8px;">${storeId}</code></p>
        <p style="color:#666;font-size:.9em;">Scopes otorgados: ${data.scope}</p>
        <p style="color:#a00;">Esta página no vuelve a mostrar el token: si lo perdés, desinstalá y reinstalá la app para generar uno nuevo.</p>
      </body></html>
    `);
  } catch (err) {
    return res.status(500).send(`<pre>${err.message}</pre>`);
  }
}
