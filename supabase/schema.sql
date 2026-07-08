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
  ('datos_pago', 'Alias: nutridiet.market (Mercado Pago)');

create table pedidos (
  id uuid primary key default gen_random_uuid(),
  fecha_entrega date not null,
  cliente_nombre text not null,
  cliente_telefono text not null,
  direccion text not null,
  referencia text,
  zona_id int not null references zonas(id),
  monto_pedido int not null,
  costo_envio int not null,
  envio_gratis boolean not null default false,
  tiene_refrigerados boolean not null default false,
  incluye_cooler boolean not null default false,
  cliente_nuevo boolean not null default false,
  cupon_usado text,
  forma_pago text not null check (forma_pago in ('transferencia', 'mercadopago', 'efectivo_contra_entrega')),
  pago_recibido boolean not null default false,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_reparto', 'entregado', 'cancelado')),
  cupon_enviado_at timestamptz,
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
