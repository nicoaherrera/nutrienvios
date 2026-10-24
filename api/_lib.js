// Helpers compartidos por las funciones serverless.
// Vercel no expone como endpoint los archivos que empiezan con "_".
import crypto from "crypto";

// Comparación a tiempo constante (mismo patrón que la firma de Tiendanube
// en _tiendanube.js): con === el tiempo de respuesta varía según cuántos
// caracteres iniciales coinciden, lo cual en teoría filtra el token
// carácter a carácter. No es el riesgo más probable acá (son tokens de
// 32 caracteres, fuerza bruta ya es inviable), pero es gratis de evitar.
function igual(a, b) {
  if (!a || !b) return false;
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function rol(req) {
  const token = req.headers["x-app-token"];
  if (!token) return null;
  if (igual(token, process.env.TOKEN_TIENDA)) return "tienda";
  if (igual(token, process.env.TOKEN_REPARTIDOR)) return "repartidor";
  return null;
}

export async function sb(pathAndQuery, { method = "GET", body } = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key || url.includes("COMPLETAR") || key.includes("COMPLETAR")) {
    const err = new Error(
      "Falta configurar Supabase: completá SUPABASE_URL y SUPABASE_SERVICE_KEY en el .env (o en Vercel) y reiniciá el servidor"
    );
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
