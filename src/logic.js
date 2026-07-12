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

// Fidelización: la compra que hace que el cliente llegue a un múltiplo de 5
// entregas (contando esta) viaja gratis. Cuenta solo entregas, no cancelados/pendientes.
export function esQuintaCompra(pedidosPrevios) {
  const entregados = (pedidosPrevios || []).filter((p) => p.estado === "entregado").length;
  return (entregados + 1) % 5 === 0;
}

// Motivo del envío gratis (para mostrarlo distinto en la UI): por monto mínimo
// o por fidelización. null si no aplica ninguno.
export function motivoEnvioGratis(montoPedido, config, pedidosPrevios) {
  if (esEnvioGratis(montoPedido, config)) return "monto_minimo";
  if (esQuintaCompra(pedidosPrevios)) return "fidelizacion";
  return null;
}

export function costoEnvio(montoPedido, zona, config, pedidosPrevios) {
  return motivoEnvioGratis(montoPedido, config, pedidosPrevios) ? 0 : Number(zona.tarifa);
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
// Las pospuestas por el repartidor van al final del día, manteniendo su orden entre sí.
// Si el día fue optimizado con la Routes API de Google (orden_ruta cargado),
// ese orden manda — el repartidor eligió la ruta por distancia real y asume
// que los refrigerados aguantan en la conservadora.
export function ordenarRecorrido(pedidos) {
  return [...pedidos].sort((a, b) => {
    const pospuesto = Number(Boolean(a.pospuesto)) - Number(Boolean(b.pospuesto));
    if (pospuesto !== 0) return pospuesto;
    const aRuta = a.orden_ruta != null;
    const bRuta = b.orden_ruta != null;
    if (aRuta && bRuta) return a.orden_ruta - b.orden_ruta;
    if (aRuta !== bRuta) return aRuta ? -1 : 1; // los sin optimizar (cargados después) van al final
    const zona = (a.zona?.orden_recorrido ?? 99) - (b.zona?.orden_recorrido ?? 99);
    if (zona !== 0) return zona;
    const frio = Number(b.tiene_refrigerados) - Number(a.tiene_refrigerados);
    if (frio !== 0) return frio;
    return String(a.created_at).localeCompare(String(b.created_at));
  });
}

// Envío extra acumulado por revisitas (se cobra siempre, incluso con envío gratis).
export function envioReintento(pedido) {
  return Number(pedido.envio_reintento || 0);
}

// Lo que cobra el repartidor en la puerta si es contra entrega.
export function montoACobrar(pedido) {
  return Number(pedido.monto_pedido) + Number(pedido.costo_envio) + envioReintento(pedido);
}

// El formulario carga la dirección en dos campos (Calle + Número) para que
// nunca falte una parte y Google la geocodifique bien — acá se combinan en el
// único string que se guarda. Calle numérica ("9") → "Calle 9 N° 136";
// calle con nombre ("Montevideo") → "Montevideo 136".
export function componerDireccion(calle, numero) {
  const c = (calle || "").trim();
  const n = (numero || "").trim();
  if (!c || !n) return "";
  return /^\d+$/.test(c) ? `Calle ${c} N° ${n}` : `${c} ${n}`;
}

// Inverso de componerDireccion, para precargar Calle/Número al editar un
// pedido ya guardado (incluye los cargados antes de separar los campos).
export function separarDireccion(direccion) {
  const d = direccion || "";
  const conN = d.match(/^calle\s+(\S+)\s*n[°.]?\s*(\d+)$/i);
  if (conN) return { calle: conN[1], numero: conN[2] };
  const conNombre = d.match(/^(.+?)\s+(\d+)$/);
  if (conNombre) return { calle: conNombre[1], numero: conNombre[2] };
  return { calle: d, numero: "" };
}

// Mismo motivo que Calle/Número: dos campos (Nombre + Apellido) para que
// siempre quede en el mismo orden, sin importar quién de la tienda lo carga.
export function componerNombreCompleto(nombre, apellido) {
  return [nombre, apellido].map((s) => (s || "").trim()).filter(Boolean).join(" ");
}

// Inverso, para precargar Nombre/Apellido al editar un pedido ya guardado
// (incluye los cargados antes de separar los campos, con nombres compuestos:
// el primer espacio separa el nombre del resto, que va todo a apellido).
export function separarNombreCompleto(nombreCompleto) {
  const partes = (nombreCompleto || "").trim().split(/\s+/).filter(Boolean);
  if (partes.length <= 1) return { nombre: partes[0] || "", apellido: "" };
  return { nombre: partes[0], apellido: partes.slice(1).join(" ") };
}

// Barrios/localidades que abarca cada zona. El formulario ofrece estas
// opciones al elegir la zona, y la elegida viaja al geocoder: las calles
// numeradas se repiten entre el casco, Los Hornos, Tolosa, etc., así que
// "La Plata" a secas puede geocodificar en el barrio equivocado.
export const BARRIOS_POR_ZONA = {
  1: ["La Plata"],                             // Casco urbano
  2: ["Los Hornos", "Tolosa", "Ringuelet"],    // partido de La Plata
  3: ["City Bell", "Gonnet"],                  // partido de La Plata
  4: ["Berisso", "Ensenada", "Punta Lara"],
};

// Formato que el geocoder de Google resuelve bien en La Plata: "Calle 29 234"
// pelado — sin "N°" y sin "entre X e Y" (probado en Maps: las direcciones que
// resuelve las muestra como "C. 29 400"; con "N° ... entre ..." tira "no
// encuentra"). Acepta lo guardado viejo ("29 n234") y lo nuevo ("Calle 29 N° 234").
function normalizarParaGeocoder(direccion) {
  const m = direccion.match(/^(?:calle\s+)?(\d{1,3})\s*n[°.]?\s*(\d{1,5})\b(.*)$/i);
  return m ? `Calle ${m[1]} ${m[2]}${m[3]}` : direccion;
}

// Las direcciones se cargan sin localidad muchas veces, y sin ese contexto
// Google puede geocodificar en cualquier parte del mundo (ej. terminó en
// España). Le agregamos localidad/país para la búsqueda en Maps —no toca la
// dirección que ve el cliente ni el repartidor. El "entre calles" NO va al
// geocoder (lo rompe); queda visible en la tarjeta para el repartidor.
// Prioridad de localidad: la elegida en el pedido > la primera de la zona.
export function direccionParaMapa(direccion, zona, localidad) {
  const normalizada = normalizarParaGeocoder(direccion);
  if (/la plata|berisso|ensenada|punta lara|city bell|gonnet|tolosa|ringuelet|hornos/i.test(direccion)) {
    return `${normalizada}, Argentina`;
  }
  const loc = localidad || BARRIOS_POR_ZONA[zona?.id]?.[0] || "La Plata";
  return `${normalizada}, ${loc}, Argentina`;
}

// Links de Google Maps con las paradas en orden. Máx. 9 paradas por link;
// si hay más se encadenan links, cada uno arrancando donde terminó el anterior.
export function linksGoogleMaps(direccionLocal, paradas) {
  if (!paradas.length) return [];
  const links = [];
  let origen = direccionLocal;
  for (let i = 0; i < paradas.length; i += 9) {
    const tramo = paradas.slice(i, i + 9);
    const geocodificadas = tramo.map((p) => direccionParaMapa(p.direccion, p.zona, p.localidad));
    const puntos = [origen, ...geocodificadas];
    links.push("https://www.google.com/maps/dir/" + puntos.map(encodeURIComponent).join("/"));
    origen = geocodificadas[geocodificadas.length - 1];
  }
  return links;
}

// Lo que gana el repartidor por un pedido entregado (para el total del día):
// la tarifa de zona si fue envío gratis (la paga Nutridiet), o el costo_envio
// cobrado; más el envío de las revisitas si las hubo.
export function gananciaRepartidor(pedido) {
  const base = pedido.envio_gratis ? Number(pedido.zona?.tarifa ?? 0) : Number(pedido.costo_envio);
  return base + envioReintento(pedido);
}

// Envío que el cliente le pagó a Nutridiet (transferencia/MP) y hay que pasarle
// al repartidor: el envío normal (salvo gratis) más las revisitas.
export function envioCobradoPorNutridiet(pedido) {
  return (pedido.envio_gratis ? 0 : Number(pedido.costo_envio)) + envioReintento(pedido);
}

// Liquidación semanal. Recibe pedidos del rango; solo cuentan los ENTREGADOS.
export function calcularLiquidacion(pedidos) {
  const entregados = pedidos.filter((p) => p.estado === "entregado");

  // Envíos cobrados por Nutridiet (transferencia/MP) que hay que pasarle al
  // repartidor; incluye las revisitas, que se cobran incluso con envío gratis
  const enviosCobrados = entregados.filter(
    (p) =>
      (p.forma_pago === "transferencia" || p.forma_pago === "mercadopago") &&
      envioCobradoPorNutridiet(p) > 0
  );
  // Envíos gratis: Nutridiet le paga la tarifa de zona completa al repartidor
  const enviosGratis = entregados.filter((p) => p.envio_gratis);
  // Efectivo contra entrega: el repartidor cobró mercadería + envío (+ revisitas);
  // se queda los envíos y le debe la mercadería a Nutridiet
  const efectivo = entregados.filter((p) => p.forma_pago === "efectivo_contra_entrega");

  const totalEnviosCobrados = enviosCobrados.reduce((s, p) => s + envioCobradoPorNutridiet(p), 0);
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

function csvEscape(valor) {
  const s = String(valor ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// CSV de la liquidación para pasarle a Excel/contador. Una fila por pedido
// entregado, con lo mismo que ya se calcula para la pantalla.
export function liquidacionCSV(pedidosEntregados) {
  const filas = [
    ["Fecha", "Pedido", "Cliente", "Zona", "Forma de pago", "Mercadería", "Envío cobrado", "Envío gratis", "Revisita", "Ganancia repartidor"],
    ...pedidosEntregados.map((p) => [
      p.fecha_entrega,
      idCorto(p),
      p.cliente_nombre,
      p.zona?.nombre ?? "",
      nombreFormaPago(p.forma_pago),
      p.monto_pedido,
      p.envio_gratis ? 0 : p.costo_envio,
      p.envio_gratis ? (p.motivo_envio_gratis === "fidelizacion" ? "5ta compra" : "monto mínimo") : "",
      envioReintento(p),
      gananciaRepartidor(p),
    ]),
  ];
  return filas.map((fila) => fila.map(csvEscape).join(",")).join("\n");
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

export function linkWhatsApp(telefono, texto) {
  return `https://wa.me/${normalizarTelefono(telefono)}?text=${encodeURIComponent(texto)}`;
}

export function linkAvisoEnCamino(pedido, demora) {
  return linkWhatsApp(pedido.cliente_telefono, mensajeEnCamino(pedido, demora));
}

// Cuando el repartidor marca "No estaba": aviso al cliente recordando la
// política de revisita (los clientes ya la conocen al coordinar la entrega).
export function mensajeNoTeEncontramos(pedido) {
  return (
    `¡Hola ${pedido.cliente_nombre}! Te escribimos de Nutridiet Market 🌱. ` +
    `El repartidor pasó por ${pedido.direccion} con tu pedido ${idCorto(pedido)} y no te encontramos 😔. ` +
    `Escribinos para reprogramar la entrega. Tené en cuenta que, como conversamos al coordinar, ` +
    `la nueva visita suma de nuevo el costo de envío 🙏. ¡Gracias!`
  );
}

// Cuando el repartidor no encuentra al cliente Y reprograma en el momento:
// un solo mensaje con todo (no encontrado + nueva fecha + cargo de revisita).
export function mensajeNoEstabaReprogramado(pedido, fechaISO, extraRevisita) {
  const fecha = new Date(fechaISO + "T00:00:00").toLocaleDateString("es-AR", {
    weekday: "long", day: "numeric", month: "numeric",
  });
  let msg =
    `¡Hola ${pedido.cliente_nombre}! Te escribimos de Nutridiet Market 🌱. ` +
    `El repartidor pasó por ${pedido.direccion} con tu pedido ${idCorto(pedido)} y no te encontramos 😔. ` +
    `Reprogramamos la entrega para el ${fecha}.`;
  if (extraRevisita > 0) {
    msg += ` Como conversamos al coordinar, se suma ${dinero(extraRevisita)} del nuevo envío 🙏.`;
  }
  msg += " Si ese día no te queda bien, escribinos. ¡Gracias! 💚";
  return msg;
}

// Cuando la tienda reprograma para otro día (con o sin cargo de revisita).
export function mensajeReprogramado(pedido, fechaISO, extraRevisita) {
  const fecha = new Date(fechaISO + "T00:00:00").toLocaleDateString("es-AR", {
    weekday: "long", day: "numeric", month: "numeric",
  });
  let msg =
    `¡Hola ${pedido.cliente_nombre}! 🌱 Te escribimos de Nutridiet Market. ` +
    `Reprogramamos tu pedido ${idCorto(pedido)} para el ${fecha}.`;
  if (extraRevisita > 0) {
    msg += ` Al total se suma ${dinero(extraRevisita)} del nuevo envío, como te habíamos avisado 🙏.`;
  }
  msg += " ¡Gracias por la paciencia! 💚";
  return msg;
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
    `📍 ¿Nos confirmás la dirección? ${pedido.direccion}${pedido.entre_calles ? ` entre ${pedido.entre_calles}` : ""}${pedido.referencia ? ` (${pedido.referencia})` : ""}`,
    `Si hay alguna referencia para encontrar la casa (timbre, color de rejas, etc.), ¡avisanos así el repartidor no se pierde!`,
  ];
  return lineas.join("\n");
}

// Vista de Clientes: agrupa pedidos ENTREGADOS por teléfono → nombre más
// reciente, cantidad de compras, gasto total y días desde la última entrega.
// Ordenado por más días sin pedir primero (para priorizar a quién reactivar).
export function agregarClientes(pedidos, hoy = hoyISO()) {
  const mapa = new Map();
  for (const p of pedidos) {
    if (p.estado !== "entregado") continue;
    const tel = p.cliente_telefono;
    const item = mapa.get(tel) || { telefono: tel, nombre: p.cliente_nombre, compras: 0, gastoTotal: 0, ultimaEntrega: null };
    item.compras += 1;
    item.gastoTotal += Number(p.monto_pedido);
    if (!item.ultimaEntrega || p.fecha_entrega > item.ultimaEntrega) {
      item.ultimaEntrega = p.fecha_entrega;
      item.nombre = p.cliente_nombre;
    }
    mapa.set(tel, item);
  }
  const hoyDate = new Date(hoy + "T00:00:00");
  return [...mapa.values()]
    .map((c) => ({ ...c, diasSinPedir: Math.round((hoyDate - new Date(c.ultimaEntrega + "T00:00:00")) / 86400000) }))
    .sort((a, b) => b.diasSinPedir - a.diasSinPedir);
}

export function mensajeReactivacion(cliente) {
  return (
    `¡Hola ${cliente.nombre}! 🌱 Te escribimos de Nutridiet Market. ` +
    `Hace ${cliente.diasSinPedir} días que no te vemos por acá y te extrañamos 💚. ` +
    `¿Te copamos con un pedido esta semana? Escribinos y coordinamos todo.`
  );
}

export function linkReactivacion(cliente) {
  return linkWhatsApp(cliente.telefono, mensajeReactivacion(cliente));
}

// Pedido de reseña de Google tras la primera compra entregada. Flujo aparte
// del cupón de bienvenida (no se ofrece a cambio de la reseña, va contra las
// políticas de Google) — la tienda lo manda cuando le parece, sin condicionarlo.
export function textoResenaWhatsApp(nombre, config) {
  return [
    `¡Hola ${nombre}! 🌱 Te escribimos de Nutridiet Market. Gracias por elegirnos en tu primera compra 💚`,
    ``,
    `¿Nos regalás dos minutitos para dejarnos tu opinión en Google? Nos ayuda un montón a seguir creciendo 🙏`,
    config.link_resena_google,
    ``,
    `¡Gracias por sumarte a la tribu Nutridiet! 🥗`,
  ].join("\n");
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
