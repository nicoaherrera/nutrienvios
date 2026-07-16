-- Nutridiet Envíos — schema inicial
-- Correr en Supabase: SQL Editor > pegar todo > Run

create table zonas (
  id int primary key,
  nombre text not null,
  tarifa int not null,
  orden_recorrido int not null,
  dias_entrega text not null,
  minimo_compra int,
  refrigerados_ok boolean not null default true
);

insert into zonas (id, nombre, tarifa, orden_recorrido, dias_entrega, minimo_compra, refrigerados_ok) values
  (1, 'Casco urbano',                    3500, 1, 'Todos los días de reparto', null,  true),
  (2, 'Los Hornos / Tolosa / Ringuelet', 4500, 2, 'Todos los días de reparto', null,  true),
  (3, 'City Bell / Gonnet',              6000, 3, 'Martes y viernes',          null,  false),
  (4, 'Berisso / Ensenada / Punta Lara', 6500, 4, 'Miércoles y sábado',        50000, false);

create table config (
  clave text primary key,
  valor text not null
);

insert into config (clave, valor) values
  ('umbral_envio_gratis', '100000'),
  ('direccion_local', 'Av. 7 N°136, La Plata'),
  ('cupon_bienvenida', 'BIENVENIDA10'),
  ('cupon_descuento_pct', '10'),
  ('cupon_minimo', '30000'),
  ('cupon_vigencia_dias', '30'),
  ('datos_pago', 'Alias: nutridiet.market (Mercado Pago)'),
  ('link_resena_google', 'https://g.page/r/COMPLETAR/review'),
  -- Tarifario de envíos por localidad y rango de calles (JSON editable desde Config;
  -- el valor inicial es TARIFARIO_INICIAL de src/logic.js)
  ('tarifario', '{"fijos":{"Gonnet":6500,"City Bell":7000,"Villa Elisa":8000,"Melchor Romero":7000,"Abasto":8000,"Lisandro Olmos":8000,"Ensenada":7000,"Berisso":7000,"Punta Lara":7800},"rangos":{"La Plata":{"base":3300,"tramos":[{"desde":115,"hasta":121,"precio":3900},{"desde":122,"hasta":127,"precio":4500},{"desde":73,"hasta":79,"precio":3900},{"desde":80,"hasta":89,"precio":4500},{"desde":90,"hasta":99,"precio":5200}]},"Los Hornos":{"tramos":[{"desde":131,"hasta":136,"precio":3900},{"desde":137,"hasta":142,"precio":4500},{"desde":143,"hasta":148,"precio":5200},{"desde":149,"hasta":154,"precio":5800},{"desde":155,"hasta":160,"precio":6500}]},"Tolosa":{"tramos":[{"desde":526,"hasta":531,"precio":3900},{"desde":521,"hasta":525,"precio":4500}]},"Ringuelet":{"tramos":[{"desde":509,"hasta":520,"precio":5200}]}}}');

create table pedidos (
  id uuid primary key default gen_random_uuid(),
  numero_pedido serial, -- ID corto para hablar con el cliente ("pedido #37")
  fecha_entrega date not null,
  cliente_nombre text not null,
  cliente_telefono text not null,
  direccion text not null,
  entre_calles text, -- "15 y 16" — para el repartidor (no va a Google: rompe el geocoder)
  localidad text, -- barrio/localidad dentro de la zona ("Los Hornos", "City Bell") — desambigua las calles numeradas repetidas para Maps
  referencia text,
  zona_id int not null references zonas(id),
  monto_pedido int not null,
  costo_envio int not null,
  tarifa_envio int, -- tarifa calculada por el tarifario para esta dirección (aunque el envío salga gratis: es lo que se le paga al repartidor)
  envio_gratis boolean not null default false,
  motivo_envio_gratis text check (motivo_envio_gratis in ('monto_minimo', 'fidelizacion')), -- por qué fue gratis, para mostrarlo distinto en el Tablero
  tiene_refrigerados boolean not null default false,
  cantidad_productos int,    -- cuántos productos lleva el pedido (para armar y controlar la carga)
  cantidad_refrigerados int, -- cuántos de esos van refrigerados (conservadora)
  incluye_cooler boolean not null default false,
  cliente_nuevo boolean not null default false,
  cupon_usado text,
  forma_pago text not null check (forma_pago in ('transferencia', 'mercadopago', 'efectivo_contra_entrega')),
  pago_recibido boolean not null default false,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_reparto', 'entregado', 'cancelado')),
  pospuesto boolean not null default false, -- salteado dentro del día, decisión del repartidor
  orden_ruta int, -- posición asignada por la optimización de ruta (Google Routes API); null = sin optimizar
  envio_reintento int not null default 0,   -- envío extra acumulado por revisitas (se cobra siempre, incluso con envío gratis)
  cupon_enviado_at timestamptz,
  resena_enviada_at timestamptz, -- pedido de reseña de Google (solo primera compra, aparte del cupón)
  notas text,
  created_at timestamptz not null default now()
);

create index pedidos_fecha_idx on pedidos (fecha_entrega);
create index pedidos_telefono_idx on pedidos (cliente_telefono);

-- RLS activado sin policies: la anon key no puede leer nada.
-- Todo acceso pasa por las funciones serverless con la service_role key.
alter table zonas enable row level security;
alter table config enable row level security;
alter table pedidos enable row level security;
