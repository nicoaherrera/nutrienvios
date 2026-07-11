// Lógica pura del negocio: sin React, sin fetch. Testeada en tests/logic.test.js.

export function dinero(n) {
  return "$" + Number(n || 0).toLocaleString("es-AR");
}

// Fecha local (Argentina) en formato YYYY-MM-DD. No usar toISOString directo: corre en UTC.
export function hoyISO(base = new Date()) {
  const d = new Date(base);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export function normalizarTelefono(tel) {
  return String(tel || "").replace(/\D/g, "");
}

export function esEnvioGratis(montoPedido, config) {
  return Number(montoPedido) >= Number(config.umbral_envio_gratis);
}

export function costoEnvio(montoPedido, zona, config) {
  return esEnvioGratis(montoPedido, config) ? 0 : Number(zona.tarifa);
}

// Validaciones al cargar/editar un pedido.
// errores → bloqueantes (no se puede guardar). warnings → la tienda decide.
export function validarPedido({ monto, zona, tieneRefrigerados }) {
  const errores = [];
  if (zona?.minimo_compra && Number(monto) < zona.minimo_compra) {
    errores.push(`El mínimo de compra para ${zona.nombre} es ${dinero(zona.minimo_compra)}`);
  }
  if (tieneRefrigerados && zona && !zona.refrigerados_ok) {
    errores.push(`Esta zona (${zona.nombre}) no recibe refrigerados por ahora`);
  }
  return errores;
}

export function esClienteNuevo(pedidosPrevios) {
  return !pedidosPrevios.some((p) => p.estado !== "cancelado");
}

// Cupón de bienvenida: solo para la segunda compra, con mínimo y vigencia
// desde la primera entrega. Devuelve null si es válido, o el motivo (warning
// no bloqueante) si no lo es.
export function validarCupon({ pedidosPrevios, monto, config, hoy }) {
  const entregados = pedidosPrevios.filter((p) => p.estado === "entregado");
  if (entregados.length === 0) {
    return "El cliente todavía no tiene una compra entregada (el cupón es para la segunda compra)";
  }
  if (entregados.length > 1) {
    return `El cliente ya tiene ${entregados.length} compras entregadas (el cupón es solo para la segunda compra)`;
  }
  if (Number(monto) < Number(config.cupon_minimo)) {
    return `El cupón requiere un mínimo de ${dinero(config.cupon_minimo)}`;
  }
  const primeraEntrega = new Date(entregados[0].fecha_entrega + "T00:00:00");
  const vence = new Date(primeraEntrega);
  vence.setDate(vence.getDate() + Number(config.cupon_vigencia_dias));
  if (new Date(hoy + "T00:00:00") > vence) {
    return `El cupón venció el ${vence.toLocaleDateString("es-AR")} (${config.cupon_vigencia_dias} días desde la primera entrega)`;
  }
  return null;
}

// Orden del recorrido: por orden_recorrido de zona; dentro de cada zona,
// primero las paradas con refrigerados (el frío de la conservadora es limitado).
export function ordenarRecorrido(pedidos) {
  return [...pedidos].sort((a, b) => {
    const zona = (a.zona?.orden_recorrido ?? 99) - (b.zona?.orden_recorrido ?? 99);
    if (zona !== 0) return zona;
    const frio = Number(b.tiene_refrigerados) - Number(a.tiene_refrigerados);
    if (frio !== 0) return frio;
    return String(a.created_at).localeCompare(String(b.created_at));
  });
}

// Lo que cobra el repartidor en la puerta si es contra entrega.
export function montoACobrar(pedido) {
  return Number(pedido.monto_pedido) + Number(pedido.costo_envio);
}

// Links de Google Maps con las paradas en orden. Máx. 9 paradas por link;
// si hay más se encadenan links, cada uno arrancando donde terminó el anterior.
export function linksGoogleMaps(direccionLocal, paradas) {
  if (!paradas.length) return [];
  const links = [];
  let origen = direccionLocal;
  for (let i = 0; i < paradas.length; i += 9) {
    const tramo = paradas.slice(i, i + 9);
    const puntos = [origen, ...tramo.map((p) => p.direccion)];
    links.push("https://www.google.com/maps/dir/" + puntos.map(encodeURIComponent).join("/"));
    origen = tramo[tramo.length - 1].direccion;
  }
  return links;
}

// Lo que gana el repartidor por un pedido entregado (para el total del día):
// la tarifa de zona si fue envío gratis (la paga Nutridiet), o el costo_envio cobrado.
export function gananciaRepartidor(pedido) {
  return pedido.envio_gratis ? Number(pedido.zona?.tarifa ?? 0) : Number(pedido.costo_envio);
}

// Liquidación semanal. Recibe pedidos del rango; solo cuentan los ENTREGADOS.
export function calcularLiquidacion(pedidos) {
  const entregados = pedidos.filter((p) => p.estado === "entregado");

  // Envíos cobrados por Nutridiet (transferencia/MP) que hay que pasarle al repartidor
  const enviosCobrados = entregados.filter(
    (p) => !p.envio_gratis && (p.forma_pago === "transferencia" || p.forma_pago === "mercadopago")
  );
  // Envíos gratis: Nutridiet le paga la tarifa de zona completa al repartidor
  const enviosGratis = entregados.filter((p) => p.envio_gratis);
  // Efectivo contra entrega: el repartidor cobró mercadería + envío; se queda el
  // envío y le debe la mercadería a Nutridiet
  const efectivo = entregados.filter((p) => p.forma_pago === "efectivo_contra_entrega");

  const totalEnviosCobrados = enviosCobrados.reduce((s, p) => s + Number(p.costo_envio), 0);
  const totalEnviosGratis = enviosGratis.reduce((s, p) => s + Number(p.zona?.tarifa ?? 0), 0);
  const debeNutridiet = totalEnviosCobrados + totalEnviosGratis;
  const debeRepartidor = efectivo.reduce((s, p) => s + Number(p.monto_pedido), 0);

  return {
    entregados,
    enviosCobrados,
    enviosGratis,
    efectivo,
    totalEnviosCobrados,
    totalEnviosGratis,
    debeNutridiet,
    debeRepartidor,
    neto: debeNutridiet - debeRepartidor, // positivo: Nutridiet transfiere al repartidor
  };
}

export function resumenPorZona(pedidosEntregados) {
  const mapa = new Map();
  for (const p of pedidosEntregados) {
    const nombre = p.zona?.nombre ?? `Zona ${p.zona_id}`;
    const item = mapa.get(nombre) || { nombre, cantidad: 0, totalEnvios: 0, orden: p.zona?.orden_recorrido ?? 99 };
    item.cantidad += 1;
    item.totalEnvios += gananciaRepartidor(p);
    mapa.set(nombre, item);
  }
  return [...mapa.values()].sort((a, b) => a.orden - b.orden);
}

export function metricas(pedidosEntregados) {
  const n = pedidosEntregados.length;
  if (!n) return { pedidosPorSalida: 0, ticketPromedio: 0, pctCooler: 0, pctNuevos: 0, salidas: 0 };
  const salidas = new Set(pedidosEntregados.map((p) => p.fecha_entrega)).size;
  return {
    salidas,
    pedidosPorSalida: n / salidas,
    ticketPromedio: pedidosEntregados.reduce((s, p) => s + Number(p.monto_pedido), 0) / n,
    pctCooler: (100 * pedidosEntregados.filter((p) => p.incluye_cooler).length) / n,
    pctNuevos: (100 * pedidosEntregados.filter((p) => p.cliente_nuevo).length) / n,
  };
}

// Rango por defecto de la liquidación: semana pasada, lunes a domingo.
export function semanaPasada(base = new Date()) {
  const d = new Date(base);
  const dia = d.getDay(); // 0=domingo
  const lunesEstaSemana = new Date(d);
  lunesEstaSemana.setDate(d.getDate() - ((dia + 6) % 7));
  const lunes = new Date(lunesEstaSemana);
  lunes.setDate(lunes.getDate() - 7);
  const domingo = new Date(lunes);
  domingo.setDate(domingo.getDate() + 6);
  return { desde: hoyISO(lunes), hasta: hoyISO(domingo) };
}

// ID corto para hablar con el cliente: el numero_pedido serial de la base,
// o (pedidos anteriores a la migración) los últimos 5 del UUID.
export function idCorto(pedido) {
  if (pedido.numero_pedido != null) return `#${pedido.numero_pedido}`;
  return "#" + String(pedido.id || "").replace(/-/g, "").slice(-5).toUpperCase();
}

// Próxima parada del recorrido: la primera no entregada del orden ya calculado.
// Stateless a propósito: sobrevive a recargas de página arriba de la camioneta.
export function siguienteParada(recorridoOrdenado) {
  return recorridoOrdenado.find((p) => p.estado !== "entregado") || null;
}

// Posición actual estimada del repartidor: la parada entregada más avanzada
// en el orden del recorrido (el reparto sigue ese orden).
export function ultimaEntregada(recorridoOrdenado) {
  const entregadas = recorridoOrdenado.filter((p) => p.estado === "entregado");
  return entregadas.length ? entregadas[entregadas.length - 1] : null;
}

// ETA heurístico por saltos de zona, sin APIs pagas.
export function demoraEstimada(siguiente, ultima) {
  if (!ultima) return "en los próximos minutos";
  return siguiente.zona_id === ultima.zona_id ? "15 a 20 minutos" : "30 a 45 minutos";
}

export function mensajeEnCamino(pedido, demora) {
  const llegada = demora === "en los próximos minutos"
    ? "llega en los próximos minutos"
    : `llega en unos ${demora}`;
  let msg =
    `¡Hola ${pedido.cliente_nombre}! 🌱 Te escribimos de Nutridiet Market. ` +
    `¡Buenas noticias: tu pedido ${idCorto(pedido)} ya está en camino a ${pedido.direccion}! 🚚 ` +
    `El repartidor ${llegada}. ¡Gracias por elegirnos! 💚`;
  if (pedido.tiene_refrigerados) {
    msg += " Tus refrigerados viajan en conservadora ❄️ así te llegan bien fresquitos.";
  }
  return msg;
}

export function linkAvisoEnCamino(pedido, demora) {
  const tel = normalizarTelefono(pedido.cliente_telefono);
  return `https://wa.me/${tel}?text=${encodeURIComponent(mensajeEnCamino(pedido, demora))}`;
}

const FORMAS_PAGO = {
  transferencia: "Transferencia",
  mercadopago: "Mercado Pago",
  efectivo_contra_entrega: "Efectivo contra entrega",
};

export function nombreFormaPago(fp) {
  return FORMAS_PAGO[fp] || fp;
}

export function textoConfirmacionWhatsApp(pedido, zona, config) {
  const total = Number(pedido.monto_pedido) + Number(pedido.costo_envio);
  const lineas = [
    `¡Hola ${pedido.cliente_nombre}! Te confirmamos tu pedido ${idCorto(pedido)} de Nutridiet Market 🌱`,
    ``,
    `🧾 Mercadería: ${dinero(pedido.monto_pedido)}${pedido.cupon_usado ? ` (con cupón ${pedido.cupon_usado} aplicado)` : ""}`,
    `🚚 Envío (${zona.nombre}): ${pedido.envio_gratis ? "GRATIS 🎉" : dinero(pedido.costo_envio)}`,
    `💰 TOTAL: ${dinero(total)}`,
    ``,
    `📅 Entrega: ${new Date(pedido.fecha_entrega + "T00:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })} (${zona.dias_entrega})`,
    `💳 Pago: ${nombreFormaPago(pedido.forma_pago)}${pedido.forma_pago !== "efectivo_contra_entrega" && config.datos_pago ? ` — ${config.datos_pago}` : ""}`,
    ``,
    `📍 ¿Nos confirmás la dirección? ${pedido.direccion}${pedido.referencia ? ` (${pedido.referencia})` : ""}`,
    `Si hay alguna referencia para encontrar la casa (timbre, color de rejas, etc.), ¡avisanos así el repartidor no se pierde!`,
  ];
  return lineas.join("\n");
}

export function textoCuponWhatsApp(nombre, config) {
  return [
    `¡Hola ${nombre}! Gracias por tu primera compra en Nutridiet Market 💚`,
    ``,
    `Te regalamos un ${config.cupon_descuento_pct}% de descuento para tu próximo pedido con el código *${config.cupon_bienvenida}*.`,
    `Válido por ${config.cupon_vigencia_dias} días, compra mínima ${dinero(config.cupon_minimo)}.`,
    ``,
    `¡Te esperamos! 🥗`,
  ].join("\n");
}
