// Tests de los criterios de aceptación de la spec (la parte de lógica pura).
import test from "node:test";
import assert from "node:assert/strict";
import {
  esEnvioGratis, costoEnvio, validarPedido, validarCupon, esClienteNuevo,
  ordenarRecorrido, montoACobrar, linksGoogleMaps, calcularLiquidacion,
  semanaPasada, gananciaRepartidor, idCorto, siguienteParada, ultimaEntregada,
  demoraEstimada, mensajeEnCamino, linkAvisoEnCamino, envioCobradoPorNutridiet,
  mensajeNoTeEncontramos, mensajeReprogramado, mensajeNoEstabaReprogramado,
} from "../src/logic.js";

const config = {
  umbral_envio_gratis: "100000",
  cupon_minimo: "30000",
  cupon_vigencia_dias: "30",
};

const zonas = {
  casco: { id: 1, nombre: "Casco urbano", tarifa: 3500, orden_recorrido: 1, minimo_compra: null, refrigerados_ok: true },
  hornos: { id: 2, nombre: "Los Hornos / Tolosa / Ringuelet", tarifa: 4500, orden_recorrido: 2, minimo_compra: null, refrigerados_ok: true },
  citybell: { id: 3, nombre: "City Bell / Gonnet", tarifa: 6000, orden_recorrido: 3, minimo_compra: null, refrigerados_ok: false },
  berisso: { id: 4, nombre: "Berisso / Ensenada / Punta Lara", tarifa: 6500, orden_recorrido: 4, minimo_compra: 50000, refrigerados_ok: false },
};

test("pedido de $120.000 a Berisso por MP: envío GRATIS y $6.500 a favor del repartidor", () => {
  assert.equal(esEnvioGratis(120000, config), true);
  assert.equal(costoEnvio(120000, zonas.berisso, config), 0);

  const pedido = {
    estado: "entregado", forma_pago: "mercadopago", monto_pedido: 120000,
    costo_envio: 0, envio_gratis: true, zona: zonas.berisso,
  };
  const liq = calcularLiquidacion([pedido]);
  assert.equal(liq.totalEnviosGratis, 6500);
  assert.equal(liq.debeNutridiet, 6500);
  assert.equal(liq.debeRepartidor, 0);
  assert.equal(liq.neto, 6500);
});

test("pedido de $60.000 al casco contra entrega: cobrar $63.500 y $60.000 a favor de Nutridiet", () => {
  const pedido = {
    estado: "entregado", forma_pago: "efectivo_contra_entrega", monto_pedido: 60000,
    costo_envio: 3500, envio_gratis: false, zona: zonas.casco,
  };
  assert.equal(montoACobrar(pedido), 63500);
  const liq = calcularLiquidacion([pedido]);
  assert.equal(liq.debeRepartidor, 60000);
  assert.equal(liq.debeNutridiet, 0); // el envío ya se lo quedó en la puerta
  assert.equal(liq.neto, -60000); // el repartidor entrega la diferencia
});

test("pedido de $40.000 a Ensenada: bloqueante por mínimo de $50.000", () => {
  const errores = validarPedido({ monto: 40000, zona: zonas.berisso, tieneRefrigerados: false });
  assert.equal(errores.length, 1);
  assert.match(errores[0], /mínimo/i);
});

test("refrigerados a City Bell: bloqueante mientras refrigerados_ok = false", () => {
  const errores = validarPedido({ monto: 80000, zona: zonas.citybell, tieneRefrigerados: true });
  assert.equal(errores.length, 1);
  assert.match(errores[0], /refrigerados/i);
  // sin refrigerados pasa
  assert.equal(validarPedido({ monto: 80000, zona: zonas.citybell, tieneRefrigerados: false }).length, 0);
});

test("dos pedidos al casco el mismo día: el de refrigerados va primero", () => {
  const seco = { id: "a", zona: zonas.casco, tiene_refrigerados: false, created_at: "2026-07-01T09:00:00" };
  const frio = { id: "b", zona: zonas.casco, tiene_refrigerados: true, created_at: "2026-07-01T11:00:00" };
  const orden = ordenarRecorrido([seco, frio]);
  assert.deepEqual(orden.map((p) => p.id), ["b", "a"]);
});

test("recorrido: zonas en orden y refrigerados primero dentro de cada zona", () => {
  const p = (id, zona, frio, hora) => ({ id, zona, tiene_refrigerados: frio, created_at: `2026-07-01T${hora}:00:00` });
  const orden = ordenarRecorrido([
    p("berisso", zonas.berisso, false, "08"),
    p("casco-seco", zonas.casco, false, "09"),
    p("hornos-frio", zonas.hornos, true, "10"),
    p("casco-frio", zonas.casco, true, "11"),
  ]);
  assert.deepEqual(orden.map((x) => x.id), ["casco-frio", "casco-seco", "hornos-frio", "berisso"]);
});

test("cliente nuevo: sin pedidos previos no cancelados", () => {
  assert.equal(esClienteNuevo([]), true);
  assert.equal(esClienteNuevo([{ estado: "cancelado" }]), true);
  assert.equal(esClienteNuevo([{ estado: "entregado" }]), false);
  assert.equal(esClienteNuevo([{ estado: "pendiente" }]), false);
});

test("cupón con 3 compras previas entregadas: warning de inválido", () => {
  const previos = [
    { estado: "entregado", fecha_entrega: "2026-06-01" },
    { estado: "entregado", fecha_entrega: "2026-06-10" },
    { estado: "entregado", fecha_entrega: "2026-06-20" },
  ];
  const motivo = validarCupon({ pedidosPrevios: previos, monto: 50000, config, hoy: "2026-07-08" });
  assert.ok(motivo, "debería ser inválido");
  assert.match(motivo, /segunda compra/i);
});

test("cupón válido: exactamente 1 entrega previa, monto ok, dentro de vigencia", () => {
  const previos = [{ estado: "entregado", fecha_entrega: "2026-06-20" }];
  assert.equal(validarCupon({ pedidosPrevios: previos, monto: 35000, config, hoy: "2026-07-08" }), null);
  // por debajo del mínimo
  assert.match(validarCupon({ pedidosPrevios: previos, monto: 20000, config, hoy: "2026-07-08" }), /mínimo/i);
  // vencido (32 días después de la primera entrega)
  assert.match(validarCupon({ pedidosPrevios: previos, monto: 35000, config, hoy: "2026-07-22" }), /venció/i);
});

test("cupón vencido pasada la vigencia", () => {
  const previos = [{ estado: "entregado", fecha_entrega: "2026-05-01" }];
  const motivo = validarCupon({ pedidosPrevios: previos, monto: 35000, config, hoy: "2026-07-08" });
  assert.match(motivo, /venció/i);
});

test("link de Google Maps: origen + paradas en orden, máx. 9 por link", () => {
  const local = "Av. 7 N°136, La Plata";
  const paradas = [{ direccion: "Calle 1 y 50, La Plata" }, { direccion: "Montevideo 456, Berisso" }];
  const links = linksGoogleMaps(local, paradas);
  assert.equal(links.length, 1);
  assert.equal(
    links[0],
    "https://www.google.com/maps/dir/" +
      [local, paradas[0].direccion, paradas[1].direccion].map(encodeURIComponent).join("/")
  );

  // 11 paradas → 2 links; el segundo arranca en la parada 9
  const muchas = Array.from({ length: 11 }, (_, i) => ({ direccion: `Calle ${i + 1}, La Plata` }));
  const dos = linksGoogleMaps(local, muchas);
  assert.equal(dos.length, 2);
  assert.ok(dos[0].endsWith(encodeURIComponent("Calle 9, La Plata")));
  assert.ok(dos[1].startsWith("https://www.google.com/maps/dir/" + encodeURIComponent("Calle 9, La Plata")));
  assert.ok(dos[1].endsWith(encodeURIComponent("Calle 11, La Plata")));
});

test("cancelados y no entregados no aparecen en la liquidación", () => {
  const liq = calcularLiquidacion([
    { estado: "cancelado", forma_pago: "efectivo_contra_entrega", monto_pedido: 99999, costo_envio: 3500, envio_gratis: false, zona: zonas.casco },
    { estado: "pendiente", forma_pago: "transferencia", monto_pedido: 50000, costo_envio: 3500, envio_gratis: false, zona: zonas.casco },
    { estado: "entregado", forma_pago: "transferencia", monto_pedido: 50000, costo_envio: 3500, envio_gratis: false, zona: zonas.casco },
  ]);
  assert.equal(liq.entregados.length, 1);
  assert.equal(liq.debeNutridiet, 3500);
  assert.equal(liq.debeRepartidor, 0);
  assert.equal(liq.neto, 3500);
});

test("liquidación mixta: neto combina los tres rubros", () => {
  const pedidos = [
    // transferencia con envío: $4.500 al repartidor
    { estado: "entregado", forma_pago: "transferencia", monto_pedido: 70000, costo_envio: 4500, envio_gratis: false, zona: zonas.hornos },
    // envío gratis pagado por MP: tarifa $3.500 al repartidor
    { estado: "entregado", forma_pago: "mercadopago", monto_pedido: 150000, costo_envio: 0, envio_gratis: true, zona: zonas.casco },
    // efectivo: repartidor debe $30.000 (el envío de $3.500 ya se lo quedó)
    { estado: "entregado", forma_pago: "efectivo_contra_entrega", monto_pedido: 30000, costo_envio: 3500, envio_gratis: false, zona: zonas.casco },
  ];
  const liq = calcularLiquidacion(pedidos);
  assert.equal(liq.debeNutridiet, 8000);
  assert.equal(liq.debeRepartidor, 30000);
  assert.equal(liq.neto, -22000);
});

test("ganancia del repartidor por pedido (total del día en el recorrido)", () => {
  assert.equal(gananciaRepartidor({ envio_gratis: true, costo_envio: 0, zona: zonas.berisso }), 6500);
  assert.equal(gananciaRepartidor({ envio_gratis: false, costo_envio: 4500, zona: zonas.hornos }), 4500);
});

test("id corto: numero_pedido serial, o últimos 5 del UUID como fallback", () => {
  assert.equal(idCorto({ numero_pedido: 37, id: "x" }), "#37");
  assert.equal(idCorto({ id: "123e4567-e89b-12d3-a456-9f3a4c8b1f2d" }), "#B1F2D");
});

test("siguiente parada: la primera no entregada respetando zona + refrigerados", () => {
  const orden = ordenarRecorrido([
    { id: "casco-frio", zona: zonas.casco, zona_id: 1, tiene_refrigerados: true, estado: "entregado", created_at: "2026-07-11T08:00:00" },
    { id: "casco-seco", zona: zonas.casco, zona_id: 1, tiene_refrigerados: false, estado: "pendiente", created_at: "2026-07-11T09:00:00" },
    { id: "hornos", zona: zonas.hornos, zona_id: 2, tiene_refrigerados: false, estado: "pendiente", created_at: "2026-07-11T10:00:00" },
  ]);
  assert.equal(siguienteParada(orden).id, "casco-seco");
  assert.equal(ultimaEntregada(orden).id, "casco-frio");
  // sin pendientes → null
  assert.equal(siguienteParada(orden.map((p) => ({ ...p, estado: "entregado" }))), null);
});

test("demora estimada: misma zona 15-20, distinta zona 30-45, primera del día en minutos", () => {
  assert.equal(demoraEstimada({ zona_id: 1 }, { zona_id: 1 }), "15 a 20 minutos");
  assert.equal(demoraEstimada({ zona_id: 2 }, { zona_id: 1 }), "30 a 45 minutos");
  assert.equal(demoraEstimada({ zona_id: 1 }, null), "en los próximos minutos");
});

test("mensaje en camino: estilo Nutridiet, con número de pedido y demora", () => {
  const pedido = {
    numero_pedido: 37, cliente_nombre: "Ana", cliente_telefono: "221 555 0000",
    direccion: "Calle 5 N°123, La Plata", tiene_refrigerados: false,
  };
  const msg = mensajeEnCamino(pedido, "15 a 20 minutos");
  assert.match(msg, /¡Hola Ana! 🌱/);
  assert.match(msg, /pedido #37 ya está en camino a Calle 5 N°123, La Plata/);
  assert.match(msg, /llega en unos 15 a 20 minutos/);
  assert.match(msg, /Gracias por elegirnos! 💚/);
  assert.ok(!msg.includes("❄️"), "sin refrigerados no menciona la conservadora");

  // con refrigerados agrega la conservadora
  const conFrio = mensajeEnCamino({ ...pedido, tiene_refrigerados: true }, "30 a 45 minutos");
  assert.match(conFrio, /conservadora ❄️/);
  assert.match(conFrio, /fresquitos/);

  // primera del día: redacción sin "en unos"
  assert.match(mensajeEnCamino(pedido, "en los próximos minutos"), /El repartidor llega en los próximos minutos/);
});

test("link wa.me del aviso: teléfono normalizado y texto codificado", () => {
  const pedido = {
    numero_pedido: 37, cliente_nombre: "Ana", cliente_telefono: "221 555-0000",
    direccion: "Calle 5 N°123, La Plata", tiene_refrigerados: false,
  };
  const url = linkAvisoEnCamino(pedido, "15 a 20 minutos");
  assert.ok(url.startsWith("https://wa.me/2215550000?text="));
  const texto = decodeURIComponent(url.split("?text=")[1]);
  assert.equal(texto, mensajeEnCamino(pedido, "15 a 20 minutos"));
  assert.ok(!url.split("?text=")[1].includes(" "), "el texto va URL-encoded");
});

test("parada pospuesta por el repartidor va al final y deja de ser la próxima", () => {
  const p = (id, zona, extra = {}) => ({
    id, zona, zona_id: zona.id, tiene_refrigerados: false, estado: "pendiente",
    created_at: "2026-07-11T09:00:00", pospuesto: false, ...extra,
  });
  const orden = ordenarRecorrido([
    p("casco", zonas.casco, { pospuesto: true }),
    p("hornos", zonas.hornos),
    p("berisso", zonas.berisso),
  ]);
  // la del casco iría primera, pero pospuesta pasa al final
  assert.deepEqual(orden.map((x) => x.id), ["hornos", "berisso", "casco"]);
  assert.equal(siguienteParada(orden).id, "hornos");
  // al retomarla vuelve a su lugar
  const retomada = ordenarRecorrido(orden.map((x) => ({ ...x, pospuesto: false })));
  assert.deepEqual(retomada.map((x) => x.id), ["casco", "hornos", "berisso"]);
});

test("revisita: se cobra en la puerta y la gana el repartidor", () => {
  const pedido = {
    estado: "entregado", forma_pago: "efectivo_contra_entrega", monto_pedido: 60000,
    costo_envio: 3500, envio_reintento: 3500, envio_gratis: false, zona: zonas.casco,
  };
  assert.equal(montoACobrar(pedido), 67000); // mercadería + envío + revisita
  assert.equal(gananciaRepartidor(pedido), 7000); // dos viajes
  // en la liquidación el repartidor sigue debiendo solo la mercadería
  const liq = calcularLiquidacion([pedido]);
  assert.equal(liq.debeRepartidor, 60000);
  assert.equal(liq.debeNutridiet, 0);
});

test("revisita en pedido con envío GRATIS pagado por MP: la revisita se cobra igual", () => {
  const pedido = {
    estado: "entregado", forma_pago: "mercadopago", monto_pedido: 120000,
    costo_envio: 0, envio_reintento: 6500, envio_gratis: true, zona: zonas.berisso,
  };
  assert.equal(envioCobradoPorNutridiet(pedido), 6500); // solo la revisita
  const liq = calcularLiquidacion([pedido]);
  // tarifa del envío gratis ($6.500, la paga Nutridiet) + revisita cobrada al cliente ($6.500)
  assert.equal(liq.totalEnviosGratis, 6500);
  assert.equal(liq.totalEnviosCobrados, 6500);
  assert.equal(liq.neto, 13000);
  assert.equal(gananciaRepartidor(pedido), 13000);
});

test("mensajes de no-encontrado y reprogramación: estilo Nutridiet con la política de revisita", () => {
  const pedido = {
    numero_pedido: 37, cliente_nombre: "Ana", cliente_telefono: "2215550000",
    direccion: "Calle 5 N°123, La Plata",
  };
  const noEstaba = mensajeNoTeEncontramos(pedido);
  assert.match(noEstaba, /pedido #37/);
  assert.match(noEstaba, /no te encontramos/);
  assert.match(noEstaba, /suma de nuevo el costo de envío/);

  const conCargo = mensajeReprogramado(pedido, "2026-07-12", 3500);
  assert.match(conCargo, /Reprogramamos tu pedido #37/);
  assert.match(conCargo, /domingo/);
  assert.match(conCargo, /se suma \$3\.500 del nuevo envío/);

  const sinCargo = mensajeReprogramado(pedido, "2026-07-12", 0);
  assert.ok(!sinCargo.includes("se suma"), "sin cargo no menciona monto extra");

  // el repartidor reprograma en la puerta: un solo mensaje con todo
  const enPuerta = mensajeNoEstabaReprogramado(pedido, "2026-07-12", 3500);
  assert.match(enPuerta, /no te encontramos/);
  assert.match(enPuerta, /Reprogramamos la entrega para el domingo/);
  assert.match(enPuerta, /se suma \$3\.500 del nuevo envío/);
});

test("semana pasada: lunes a domingo", () => {
  // miércoles 8 de julio de 2026 → semana pasada = lunes 29/6 a domingo 5/7
  const { desde, hasta } = semanaPasada(new Date("2026-07-08T12:00:00"));
  assert.equal(desde, "2026-06-29");
  assert.equal(hasta, "2026-07-05");
});
