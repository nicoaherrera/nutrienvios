// Helpers compartidos por las funciones serverless.
// Vercel no expone como endpoint los archivos que empiezan con "_".

export function rol(req) {
  const token = req.headers["x-app-token"];
  if (!token) return null;
  if (token === process.env.TOKEN_TIENDA) return "tienda";
  if (token === process.env.TOKEN_REPARTIDOR) return "repartidor";
  return null;
}

export async function sb(pathAndQuery, { method = "GET", body } = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    const err = new Error("Supabase no configurado (SUPABASE_URL / SUPABASE_SERVICE_KEY)");
    err.status = 500;
    throw err;
  }
  const res = await fetch(`${url}/rest/v1/${pathAndQuery}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: method === "GET" ? "count=none" : "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    console.error("Supabase error:", res.status, JSON.stringify(data));
    const err = new Error(data?.message || "Error de base de datos");
    err.status = res.status;
    throw err;
  }
  return data;
}

export function fail(res, err) {
  return res.status(err.status || 500).json({ error: err.message || "Error interno" });
}
