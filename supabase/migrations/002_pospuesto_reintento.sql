-- Solo para bases creadas ANTES de esta migración (el schema.sql actual ya las trae).
-- pospuesto: el repartidor saltea la parada y la manda al final del recorrido del día.
-- envio_reintento: envío extra acumulado por revisitas (si no había nadie, la nueva
-- visita se cobra siempre, incluso en pedidos con envío gratis).
alter table pedidos add column pospuesto boolean not null default false;
alter table pedidos add column envio_reintento int not null default 0;
