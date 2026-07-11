-- Solo para bases creadas ANTES de esta migración (si corriste el schema.sql
-- actual, la columna ya existe y esto no hace falta).
-- Agrega el número de pedido corto; Postgres numera solo los pedidos existentes.
alter table pedidos add column numero_pedido serial;
