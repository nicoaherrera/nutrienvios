// Tests de los criterios de aceptación de la spec (la parte de lógica pura).
import test from "node:test";
import assert from "node:assert/strict";
import {
  esEnvioGratis, costoEnvio, validarPedido, validarCupon, esClienteNuevo,
  ordenarRecorrido, montoACobrar, linksGoogleMaps, calcularLiquidacion,
  semanaPasada, gananciaRepartidor, idCorto, siguienteParada, ultimaEntregada,
  demoraEstimada, mensajeEnCamino, linkAvisoEnCamino, envioCobradoPorNutridiet,
  mensajeReprogramado, mensajeNoEstabaReprogramado, mensajeNoTeEncontramos, mensajeCancelado,
  calcularCostoEnvio, parseTarifario, TARIFARIO_INICIAL, tarifaDelPedido, totalesVentas,
  esQuintaCompra, motivoEnvioGratis, agregarClientes, mensajeReactivacion, linkReactivacion,
  textoResenaWhatsApp, liquidacionCSV, direccionParaMapa, textoConfirmacionWhatsApp,
  componerDireccion, separarDireccion, componerNombreCompleto, separarNombreCompleto,
  ordenRutaAbierta,
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

test("recorrido optimizado: orden_ruta manda sobre zona/frío; pospuestas igual al final", () => {
  const p = (id, zona, extra = {}) => ({
    id, zona, tiene_refrigerados: false, pospuesto: false, created_at: "2026-07-12T09:00:00", ...extra,
  });
  // Google decidió: casco-2 primero aunque por zona/hora iría después
  const orden = ordenarRecorrido([
    p("berisso", zonas.berisso, { orden_ruta: 1 }),
    p("casco-1", zonas.casco, { orden_ruta: 2 }),
    p("casco-2", zonas.casco, { orden_ruta: 0 }),
  ]);
  assert.deepEqual(orden.map((x) => x.id), ["casco-2", "berisso", "casco-1"]);

  // una parada pospuesta va al final aunque tenga orden_ruta
  const conPospuesta = ordenarRecorrido([
    p("a", zonas.casco, { orden_ruta: 0, pospuesto: true }),
    p("b", zonas.casco, { orden_ruta: 1 }),
  ]);
  assert.deepEqual(conPospuesta.map((x) => x.id), ["b", "a"]);

  // un pedido cargado después de optimizar (sin orden_ruta) va al final
  const mixto = ordenarRecorrido([
    p("nuevo", zonas.casco),
    p("optimizado", zonas.berisso, { orden_ruta: 0 }),
  ]);
  assert.deepEqual(mixto.map((x) => x.id), ["optimizado", "nuevo"]);

  // sin optimización, el orden clásico por zona sigue igual
  const clasico = ordenarRecorrido([p("lejos", zonas.berisso), p("cerca", zonas.casco)]);
  assert.deepEqual(clasico.map((x) => x.id), ["cerca", "lejos"]);
});

test("ruta abierta (sin volver al local): invierte el circuito si el tramo de ida es el más largo", () => {
  // circuito: local → City Bell (8km) → ... → Calle 9 (0.2km) → local
  // sin vuelta al local conviene al revés: arrancar por Calle 9 y terminar en City Bell
  const legs = [{ distanceMeters: "8000", duration: "900s" }, { distanceMeters: "3000", duration: "400s" }, { distanceMeters: "200", duration: "60s" }];
  const invertida = ordenRutaAbierta([2, 0, 1], legs);
  assert.deepEqual(invertida.indices, [1, 0, 2]);
  assert.equal(invertida.tramoQuitado.distanceMeters, "8000"); // se ahorra el tramo largo

  // si el circuito ya termina lejos, se mantiene el sentido y se quita la vuelta
  const legsOk = [{ distanceMeters: "200", duration: "60s" }, { distanceMeters: "3000", duration: "400s" }, { distanceMeters: "8000", duration: "900s" }];
  const igual = ordenRutaAbierta([2, 0, 1], legsOk);
  assert.deepEqual(igual.indices, [2, 0, 1]);
  assert.equal(igual.tramoQuitado.distanceMeters, "8000");
});

test("tarifario: localidades de precio fijo, la calle no importa", () => {
  assert.equal(calcularCostoEnvio("Gonnet", "501"), 6500);
  assert.equal(calcularCostoEnvio("City Bell", "Cantilo"), 7000);
  assert.equal(calcularCostoEnvio("Villa Elisa", ""), 8000);
  assert.equal(calcularCostoEnvio("Melchor Romero", "520"), 7000);
  assert.equal(calcularCostoEnvio("Abasto", null), 8000);
  assert.equal(calcularCostoEnvio("Lisandro Olmos", "44"), 8000);
  assert.equal(calcularCostoEnvio("Ensenada", "Ortiz de Rosas"), 7000);
  assert.equal(calcularCostoEnvio("Berisso", "Montevideo"), 7000);
  assert.equal(calcularCostoEnvio("Punta Lara", "Almirante Brown"), 7800);
  // case-insensitive
  assert.equal(calcularCostoEnvio("berisso", "x"), 7000);
});

test("tarifario La Plata: casco base y todos los límites de los tramos de expansión", () => {
  const lp = (calle) => calcularCostoEnvio("La Plata", calle);
  // casco por defecto
  assert.equal(lp("1"), 3300);
  assert.equal(lp("50"), 3300);
  assert.equal(lp("72"), 3300);
  assert.equal(lp("114"), 3300); // entre expansiones: cae al casco
  // expansión este/norte: 115-121 y 122-127
  assert.equal(lp("115"), 3900);
  assert.equal(lp("121"), 3900);
  assert.equal(lp("122"), 4500);
  assert.equal(lp("127"), 4500);
  assert.equal(lp("128"), 3300); // fuera del tramo: base
  // expansión sur/oeste: 73-79, 80-89, 90-99
  assert.equal(lp("73"), 3900);
  assert.equal(lp("79"), 3900);
  assert.equal(lp("80"), 4500);
  assert.equal(lp("89"), 4500);
  assert.equal(lp("90"), 5200);
  assert.equal(lp("99"), 5200);
  assert.equal(lp("100"), 3300);
  // diagonal o calle sin número interpretable: casco base
  assert.equal(lp("Diag 74"), 3300);
});

test("tarifario Los Hornos / Tolosa / Ringuelet: límites de tramos y fuera de rango = consultar", () => {
  const lh = (calle) => calcularCostoEnvio("Los Hornos", calle);
  assert.equal(lh("131"), 3900);
  assert.equal(lh("136"), 3900);
  assert.equal(lh("137"), 4500);
  assert.equal(lh("142"), 4500);
  assert.equal(lh("143"), 5200);
  assert.equal(lh("148"), 5200);
  assert.equal(lh("149"), 5800);
  assert.equal(lh("154"), 5800);
  assert.equal(lh("155"), 6500);
  assert.equal(lh("160"), 6500);
  assert.equal(lh("161"), null); // fuera de todos los tramos, sin base → consultar
  assert.equal(lh("130"), null);

  assert.equal(calcularCostoEnvio("Tolosa", "526"), 3900);
  assert.equal(calcularCostoEnvio("Tolosa", "531"), 3900);
  assert.equal(calcularCostoEnvio("Tolosa", "521"), 4500);
  assert.equal(calcularCostoEnvio("Tolosa", "525"), 4500);
  assert.equal(calcularCostoEnvio("Tolosa", "532"), null);

  assert.equal(calcularCostoEnvio("Ringuelet", "509"), 5200);
  assert.equal(calcularCostoEnvio("Ringuelet", "520"), 5200);
  assert.equal(calcularCostoEnvio("Ringuelet", "508"), null);
});

test("tarifario: casos borde — localidad desconocida o vacía, y tarifario editado desde config", () => {
  assert.equal(calcularCostoEnvio("Marte", "10"), null);
  assert.equal(calcularCostoEnvio("", "10"), null);
  assert.equal(calcularCostoEnvio(null, "10"), null);

  // parseTarifario: usa el JSON de config si está sano, cae al inicial si no
  const editado = { fijos: { Berisso: 9999 }, rangos: {} };
  assert.equal(parseTarifario({ tarifario: JSON.stringify(editado) }).fijos.Berisso, 9999);
  assert.equal(calcularCostoEnvio("Berisso", "x", editado), 9999);
  assert.deepEqual(parseTarifario({ tarifario: "{json roto" }), TARIFARIO_INICIAL);
  assert.deepEqual(parseTarifario({}), TARIFARIO_INICIAL);
});

test("tarifa del pedido: usa la calculada al cargarlo, con fallback a la tarifa plana de la zona", () => {
  assert.equal(tarifaDelPedido({ tarifa_envio: 5200, zona: zonas.casco }), 5200);
  assert.equal(tarifaDelPedido({ zona: zonas.berisso }), 6500); // pedido viejo sin tarifa calculada
  // la liquidación de un envío gratis paga la tarifa de la dirección, no la plana
  assert.equal(gananciaRepartidor({ envio_gratis: true, costo_envio: 0, tarifa_envio: 5200, zona: zonas.casco }), 5200);
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

test("link de Google Maps: origen + paradas en orden, máx. 9 por link, con localidad agregada según la zona de cada una", () => {
  const local = "Av. 7 N°136, La Plata";
  const paradas = [{ direccion: "Calle 1 y 50", zona: zonas.casco }, { direccion: "Montevideo 456", zona: zonas.berisso }];
  const links = linksGoogleMaps(local, paradas);
  assert.equal(links.length, 1);
  assert.equal(
    links[0],
    "https://www.google.com/maps/dir/" +
      [local, "Calle 1 y 50, La Plata, Argentina", "Montevideo 456, Berisso, Argentina"].map(encodeURIComponent).join("/")
  );

  // 11 paradas → 2 links; el segundo arranca en la parada 9 (ya con la localidad puesta)
  const muchas = Array.from({ length: 11 }, (_, i) => ({ direccion: `Calle ${i + 1}`, zona: zonas.casco }));
  const dos = linksGoogleMaps(local, muchas);
  assert.equal(dos.length, 2);
  assert.ok(dos[0].endsWith(encodeURIComponent("Calle 9, La Plata, Argentina")));
  assert.ok(dos[1].startsWith("https://www.google.com/maps/dir/" + encodeURIComponent("Calle 9, La Plata, Argentina")));
  assert.ok(dos[1].endsWith(encodeURIComponent("Calle 11, La Plata, Argentina")));
});

test("dirección para Maps: usa la localidad de la zona del pedido, no siempre La Plata", () => {
  // sin localidad en el texto: usa la de la zona (ej. "29 n234" en Casco urbano mandaba a España)
  assert.equal(direccionParaMapa("29 n234", zonas.casco), "Calle 29 234, La Plata, Argentina");
  assert.equal(direccionParaMapa("Montevideo 456", zonas.berisso), "Montevideo 456, Berisso, Argentina");
  assert.equal(direccionParaMapa("Calle 10", zonas.citybell), "Calle 10, City Bell, Argentina");
  // sin zona (no debería pasar en la práctica): cae a La Plata por defecto
  assert.equal(direccionParaMapa("29 n234"), "Calle 29 234, La Plata, Argentina");
  // si el texto ya menciona una localidad, no la duplica ni fuerza la de la zona
  assert.equal(direccionParaMapa("Montevideo 456, Ensenada", zonas.berisso), "Montevideo 456, Ensenada, Argentina");
  assert.equal(direccionParaMapa("Calle 5, La Plata", zonas.casco), "Calle 5, La Plata, Argentina");
  // la localidad elegida en el pedido manda sobre el default de la zona
  // (las calles numeradas se repiten entre casco, Los Hornos, Tolosa…)
  assert.equal(direccionParaMapa("Calle 137 N° 60", zonas.hornos, "Los Hornos"), "Calle 137 60, Los Hornos, Argentina");
  assert.equal(direccionParaMapa("Montevideo 456", zonas.berisso, "Punta Lara"), "Montevideo 456, Punta Lara, Argentina");
  // sin localidad elegida: cae al primer barrio de la zona
  assert.equal(direccionParaMapa("Calle 137 N° 60", zonas.hornos), "Calle 137 60, Los Hornos, Argentina");
});

test("componer/separar dirección: Calle + Número en dos campos del form, ida y vuelta", () => {
  assert.equal(componerDireccion("9", "136"), "Calle 9 N° 136");
  assert.equal(componerDireccion("Montevideo", "456"), "Montevideo 456");
  assert.equal(componerDireccion("9", ""), ""); // incompleto: no arma nada raro
  assert.equal(componerDireccion("", "136"), "");

  assert.deepEqual(separarDireccion("Calle 9 N° 136"), { calle: "9", numero: "136" });
  assert.deepEqual(separarDireccion("Montevideo 456"), { calle: "Montevideo", numero: "456" });
  // direcciones viejas cargadas como texto libre, sin separador claro
  assert.deepEqual(separarDireccion("cantilo 1234"), { calle: "cantilo", numero: "1234" });
  assert.deepEqual(separarDireccion(""), { calle: "", numero: "" });
});

test("componer/separar nombre completo: Nombre + Apellido en dos campos, siempre en el mismo orden", () => {
  assert.equal(componerNombreCompleto("Ana", "Pérez"), "Ana Pérez");
  assert.equal(componerNombreCompleto("Ana", ""), "Ana");
  assert.equal(componerNombreCompleto("", "Pérez"), "Pérez");

  assert.deepEqual(separarNombreCompleto("Ana Pérez"), { nombre: "Ana", apellido: "Pérez" });
  assert.deepEqual(separarNombreCompleto("Ana"), { nombre: "Ana", apellido: "" });
  // apellido compuesto: todo lo que sigue al primer nombre
  assert.deepEqual(separarNombreCompleto("Juan Carlos Pérez"), { nombre: "Juan", apellido: "Carlos Pérez" });
  assert.deepEqual(separarNombreCompleto(""), { nombre: "", apellido: "" });
});

test("dirección para Maps: normaliza al formato pelado que Google resuelve (\"Calle 29 234\", sin N° ni entre)", () => {
  // el bug real: dos direcciones distintas sin normalizar geocodificaban al mismo punto
  assert.equal(direccionParaMapa("9 n136", zonas.casco), "Calle 9 136, La Plata, Argentina");
  assert.equal(direccionParaMapa("16 n136", zonas.casco), "Calle 16 136, La Plata, Argentina");
  // lo guardado con el formato nuevo del form ("Calle 29 N° 234"): se le quita el N° para Google
  // (Maps mostró "no encuentra Calle 29 N° 234 entre 36 y 37" pero sí resuelve "C. 29 400")
  assert.equal(direccionParaMapa("Calle 29 N° 234", zonas.casco), "Calle 29 234, La Plata, Argentina");
  // el "entre calles" nunca viaja al geocoder: queda solo para el repartidor en la tarjeta
  assert.equal(direccionParaMapa("Calle 29 N° 400", zonas.casco), "Calle 29 400, La Plata, Argentina");
  // calle con nombre no se toca
  assert.equal(direccionParaMapa("Montevideo 456, Berisso", zonas.berisso), "Montevideo 456, Berisso, Argentina");
});

test("confirmación por WhatsApp: menciona el entre calles cuando está cargado", () => {
  const pedido = {
    numero_pedido: 40, cliente_nombre: "Ana", monto_pedido: 60000, costo_envio: 3500,
    envio_gratis: false, fecha_entrega: "2026-07-15", forma_pago: "transferencia",
    direccion: "29 n234", entre_calles: "15 y 16", referencia: "rejas negras",
  };
  const texto = textoConfirmacionWhatsApp(pedido, zonas.casco, config);
  assert.match(texto, /29 n234 entre 15 y 16 \(rejas negras\)/);

  // sin entre calles no rompe ni deja espacios raros
  const sinEntreCalles = textoConfirmacionWhatsApp({ ...pedido, entre_calles: null }, zonas.casco, config);
  assert.match(sinEntreCalles, /29 n234 \(rejas negras\)/);

  // con cantidad de productos la menciona junto a la mercadería
  const conCantidad = textoConfirmacionWhatsApp({ ...pedido, cantidad_productos: 8 }, zonas.casco, config);
  assert.match(conCantidad, /Mercadería: \$60\.000 \(8 productos\)/);
  const unProducto = textoConfirmacionWhatsApp({ ...pedido, cantidad_productos: 1 }, zonas.casco, config);
  assert.match(unProducto, /\(1 producto\)/);
  assert.ok(!texto.includes("producto"), "sin cantidad cargada no la menciona");
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

test("mensajes de reprogramación: estilo Nutridiet con la política de revisita", () => {
  const pedido = {
    numero_pedido: 37, cliente_nombre: "Ana", cliente_telefono: "2215550000",
    direccion: "Calle 5 N°123, La Plata",
  };
  // no estaba y la fecha la coordina la tienda: el aviso sale igual
  const noEstaba = mensajeNoTeEncontramos(pedido);
  assert.match(noEstaba, /pedido #37/);
  assert.match(noEstaba, /no te encontramos/);
  assert.match(noEstaba, /Nos comunicamos para coordinar una nueva entrega/);
  assert.match(noEstaba, /al momento de hacer el pedido/);
  assert.match(noEstaba, /🫶/);

  // el cliente pidió cancelar en el momento: confirmación + reprogramación a coordinar
  const cancelado = mensajeCancelado(pedido);
  assert.match(cancelado, /cancelamos la entrega de hoy de tu pedido #37/);
  assert.match(cancelado, /Nos comunicamos para reprogramarla/);
  assert.match(cancelado, /🫶/);

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
  assert.match(enPuerta, /Como conversamos al momento de hacer el pedido/);
  assert.match(enPuerta, /se suma \$3\.500 del nuevo envío/);
});

test("totales de ventas para la caja: mercadería + envíos cobrados, solo entregados", () => {
  const pedidos = [
    // entregado normal: mercadería 60.000 + envío 3.300
    { estado: "entregado", monto_pedido: 60000, costo_envio: 3300, envio_gratis: false, envio_reintento: 0 },
    // envío gratis: solo suma la mercadería (el cliente no pagó envío)
    { estado: "entregado", monto_pedido: 120000, costo_envio: 0, envio_gratis: true, envio_reintento: 0 },
    // con revisita cobrada: envío 4.500 + revisita 4.500
    { estado: "entregado", monto_pedido: 30000, costo_envio: 4500, envio_gratis: false, envio_reintento: 4500 },
    // pendientes y cancelados no cuentan (todavía no son venta)
    { estado: "pendiente", monto_pedido: 99999, costo_envio: 3300, envio_gratis: false, envio_reintento: 0 },
    { estado: "cancelado", monto_pedido: 88888, costo_envio: 3300, envio_gratis: false, envio_reintento: 0 },
  ];
  const v = totalesVentas(pedidos);
  assert.equal(v.cantidad, 3);
  assert.equal(v.mercaderia, 210000);
  assert.equal(v.envios, 3300 + 4500 + 4500);
  assert.equal(v.total, 210000 + 12300);
});

test("semana pasada: lunes a domingo", () => {
  // miércoles 8 de julio de 2026 → semana pasada = lunes 29/6 a domingo 5/7
  const { desde, hasta } = semanaPasada(new Date("2026-07-08T12:00:00"));
  assert.equal(desde, "2026-06-29");
  assert.equal(hasta, "2026-07-05");
});

test("envío gratis por fidelización: la 5ta, 10ma... entrega es gratis, sin importar el monto", () => {
  const cuatroEntregas = Array.from({ length: 4 }, () => ({ estado: "entregado" }));
  assert.equal(esQuintaCompra(cuatroEntregas), true); // esta sería la 5ta
  assert.equal(esQuintaCompra([...cuatroEntregas, { estado: "cancelado" }]), true); // cancelados no cuentan
  assert.equal(esQuintaCompra(Array.from({ length: 3 }, () => ({ estado: "entregado" }))), false);
  assert.equal(esQuintaCompra(Array.from({ length: 9 }, () => ({ estado: "entregado" }))), true); // sería la 10ma

  assert.equal(motivoEnvioGratis(20000, config, cuatroEntregas), "fidelizacion");
  assert.equal(motivoEnvioGratis(120000, config, []), "monto_minimo"); // el monto prevalece si aplican los dos
  assert.equal(motivoEnvioGratis(20000, config, []), null);
  assert.equal(costoEnvio(20000, zonas.casco, config, cuatroEntregas), 0);
  assert.equal(costoEnvio(20000, zonas.casco, config, Array.from({ length: 3 }, () => ({ estado: "entregado" }))), 3500);
});

test("clientes: agrupa por teléfono con compras, gasto total y días desde la última entrega", () => {
  const pedidos = [
    { cliente_telefono: "221111", cliente_nombre: "Ana", estado: "entregado", monto_pedido: 30000, fecha_entrega: "2026-06-01" },
    { cliente_telefono: "221111", cliente_nombre: "Ana", estado: "entregado", monto_pedido: 50000, fecha_entrega: "2026-06-20" },
    { cliente_telefono: "221111", cliente_nombre: "Ana", estado: "cancelado", monto_pedido: 99999, fecha_entrega: "2026-07-05" },
    { cliente_telefono: "222222", cliente_nombre: "Beto", estado: "entregado", monto_pedido: 40000, fecha_entrega: "2026-07-07" },
  ];
  const clientes = agregarClientes(pedidos, "2026-07-08");
  assert.equal(clientes.length, 2);
  // Ana: más días sin pedir (desde 20/6), va primero
  assert.equal(clientes[0].telefono, "221111");
  assert.equal(clientes[0].compras, 2); // el cancelado no cuenta
  assert.equal(clientes[0].gastoTotal, 80000);
  assert.equal(clientes[0].ultimaEntrega, "2026-06-20");
  assert.equal(clientes[0].diasSinPedir, 18);
  // Beto: pidió ayer
  assert.equal(clientes[1].telefono, "222222");
  assert.equal(clientes[1].diasSinPedir, 1);
});

test("pedido de reseña: mensaje aparte del cupón, con el link de Google configurado", () => {
  const msg = textoResenaWhatsApp("Ana", { ...config, link_resena_google: "https://g.page/r/xyz/review" });
  assert.match(msg, /¡Hola Ana! 🌱/);
  assert.match(msg, /primera compra/);
  assert.match(msg, /https:\/\/g\.page\/r\/xyz\/review/);
  assert.ok(!msg.toLowerCase().includes("cupón"), "no debe mezclarse con el cupón de bienvenida");
});

test("CSV de liquidación: una fila por entregado, con envío gratis por fidelización y comas escapadas", () => {
  const pedidos = [
    {
      numero_pedido: 12, fecha_entrega: "2026-07-06", cliente_nombre: "Ana, la de siempre",
      zona: zonas.casco, forma_pago: "efectivo_contra_entrega", monto_pedido: 60000,
      costo_envio: 3500, envio_gratis: false, envio_reintento: 0,
    },
    {
      numero_pedido: 13, fecha_entrega: "2026-07-07", cliente_nombre: "Beto",
      zona: zonas.berisso, forma_pago: "mercadopago", monto_pedido: 20000,
      costo_envio: 0, envio_gratis: true, motivo_envio_gratis: "fidelizacion", envio_reintento: 0,
    },
  ];
  const csv = liquidacionCSV(pedidos);
  const filas = csv.split("\n");
  assert.equal(filas.length, 3); // encabezado + 2 pedidos
  assert.match(filas[0], /^Fecha,Pedido,Cliente,Zona/);
  assert.match(filas[1], /"Ana, la de siempre"/); // la coma en el nombre queda escapada entre comillas
  assert.match(filas[2], /#13,Beto,Berisso.*5ta compra.*6500$/); // ganancia del repartidor: tarifa de zona por el envío gratis
});

test("mensaje de reactivación: menciona los días sin pedir y arma el link de WhatsApp", () => {
  const cliente = { telefono: "221 555-0000", nombre: "Ana", diasSinPedir: 35 };
  const msg = mensajeReactivacion(cliente);
  assert.match(msg, /¡Hola Ana! 🌱/);
  assert.match(msg, /Hace 35 días que no te vemos/);
  const url = linkReactivacion(cliente);
  assert.ok(url.startsWith("https://wa.me/2215550000?text="));
  assert.equal(decodeURIComponent(url.split("?text=")[1]), msg);
});
