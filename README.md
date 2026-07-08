# Nutridiet Envíos 🥗🚚

App de gestión de envíos a domicilio para Nutridiet Market (La Plata). Los pedidos entran por WhatsApp, acá se cargan, se arma el recorrido del repartidor y se calcula la liquidación semanal.

**Stack:** React + Vite (Vercel) + Supabase, mismo patrón que la app `serenisima`. Las claves viven solo en las funciones serverless de `/api` — nunca con prefijo `VITE_`.

## Puesta en marcha

### 1. Supabase
1. Crear proyecto en [supabase.com](https://supabase.com) (plan free).
2. SQL Editor → pegar todo [supabase/schema.sql](supabase/schema.sql) → Run. Crea las tablas `zonas` (con las 4 zonas cargadas), `config` y `pedidos`, con RLS activado sin policies (solo accede la service key).
3. Anotar de **Project Settings → API**: la URL del proyecto y la **service_role key** (no la anon).

### 2. Vercel
1. Subir este repo a GitHub e importarlo en Vercel (framework: Vite, sin config extra).
2. En **Settings → Environment Variables** cargar (ver [.env.example](.env.example)):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `TOKEN_TIENDA` — string largo inventado (ej. salida de `openssl rand -hex 16`)
   - `TOKEN_REPARTIDOR` — otro string distinto
3. Deploy.

### 3. Repartir los links
- **Tienda:** `https://tu-app.vercel.app/#/tienda/<TOKEN_TIENDA>`
- **Repartidor:** `https://tu-app.vercel.app/#/reparto/<TOKEN_REPARTIDOR>`

El link es la llave: no compartirlo fuera de cada rol. El token del repartidor solo permite ver el recorrido y marcar entregas/cobros.

## Desarrollo local

```bash
npm install
npm test          # lógica de negocio (criterios de aceptación de la spec)
vercel dev        # frontend + funciones /api juntos (requiere .env con las 4 variables)
```

`npm run dev` solo levanta el frontend (las llamadas a `/api` van a fallar sin `vercel dev`).

## Cómo funciona la plata (resumen)

- El cliente paga todo junto (mercadería + envío). El 100% del envío es del repartidor.
- **Transferencia/MP:** el envío entra a Nutridiet y se liquida al repartidor cada semana.
- **Efectivo contra entrega:** el repartidor se queda el envío en la puerta y debe la mercadería.
- **Envío gratis** (pedido ≥ umbral, hoy $100.000): Nutridiet le paga la tarifa de zona completa al repartidor.
- La pantalla **Liquidación** calcula el neto semanal con el desglose de los tres rubros y los pedidos que los componen.

## Estructura

```
api/            funciones serverless de Vercel (proxy a Supabase con service key + auth por token)
src/logic.js    toda la lógica de negocio pura (envío gratis, cupón, recorrido, liquidación, textos de WhatsApp)
src/pages/      Tablero, NuevoPedido, Recorrido (repartidor), Liquidacion, Config
supabase/       schema.sql con seed de zonas y parámetros
tests/          criterios de aceptación de la spec (node --test)
```

## Decisiones que conviene saber

- `pedidos.cliente_nuevo` se guarda como snapshot al crear el pedido (alimenta el badge y los recordatorios de cupón); `cupon_enviado_at` marca el recordatorio como resuelto.
- El cupón de bienvenida NO se ofrece a cambio de reseñas de Google (va contra sus políticas); son flujos separados.
- Imágenes/comprobantes quedan para v2: si se agregan, comprimir client-side a máx. 1024px JPEG 0.75 (límite de 4.5MB del serverless free de Vercel).
- Fuera de alcance del MVP: login real, WhatsApp API, Tienda Nube, optimización real de rutas, catálogo de productos.
