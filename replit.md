# Festiland · Punto de venta y gestión

Sistema de operación para una tienda de regalos y celebraciones en República Dominicana: POS, inventario y contabilidad de partida doble.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- DB local: `SQLITE_PATH` (archivo) y `MIGRATIONS_DIR` (migraciones SQLite); no requiere `DATABASE_URL`.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5; interfaz React + Vite; autenticación local con correo y contraseña, sesiones en SQLite
- DB: SQLite local + Drizzle ORM; controlador de archivos sin servicio remoto
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (ESM bundle); controlador SQLite nativo y Nodemailer como dependencias de runtime

## Where things live

- `artifacts/festiland-gestion` — interfaz y recursos de marca del negocio.
- `artifacts/api-server` — API, permisos y transacciones contables.
- `lib/api-spec/openapi.yaml` — contrato; regenerar clientes y validadores con codegen.
- `lib/db/src/schema/festiland.ts` — esquema del negocio.

## Architecture decisions

- No hay registro público ni proveedor de identidad externo. El primer propietario se inicializa con `FESTILAND_OWNER_EMAIL` y el secreto `FESTILAND_INITIAL_OWNER_PASSWORD`; el equipo se crea con contraseñas temporales. No hay contraseñas predeterminadas. Conservar los identificadores y roles al migrar cuentas.
- El destino de despliegue es CapRover: interfaz y servidor bajo un mismo dominio HTTPS. Consultar `docs/CAPROVER.md`; `Dockerfile` y `captain-definition` se mantienen en la raíz. No reintroducir Clerk ni depender de Replit para el acceso en producción.
- El usuario eligió SQLite en un archivo local, sin base externa. Se requiere volumen `/data` y una sola instancia. Mantener transacciones asíncronas reales y acceso serializado; dentro de una transacción usar `tx`, nunca el `db` global, para evitar bloqueos o confirmaciones parciales.
- El correo propietario se puede cambiar con su contraseña actual; el marcador inicial debe conservar su identificador y no volver a imponer el correo del entorno. Zoho se conecta por SMTP seguro, no por API; sus credenciales sólo van en el entorno.
- Los cambios de inventario, ventas, devoluciones y asientos se guardan en una sola transacción para evitar estados parciales.
- Valuación por costo promedio móvil, con precisión adicional en el costo unitario. No sustituirlo por el precio de la última compra sin revisar el libro de inventario.

## Product

- Moneda DOP; zona horaria America/Santo_Domingo; interfaz en español, adaptable a móvil, tablet y PC.
- El usuario no necesita integración de facturación electrónica. Los impuestos se configuran y asignan expresamente; no suponer una tasa fiscal activa ni certificar cumplimiento DGII.
- Impresión mediante el navegador en 58 mm, 80 mm y A4. No prometer ESC/POS directo, apertura de gaveta o Bluetooth sin integrar y validar el hardware concreto.
- Catálogo e inventario real: no precargar existencias, precios o transacciones de ejemplo como datos operativos.
- La raíz pública es una web del negocio, no publicidad del software. Mantenerla independiente de la sesión/API; el POS y la gestión siguen privados.
- Dirección confirmada por el negocio: C. Rosario 86, Moca 56000, República Dominicana. Teléfono confirmado: (809) 528-0233. El teléfono antiguo de Maps no es válido; no asumir que el nuevo tiene WhatsApp.
- Instagram verificado: https://www.instagram.com/festilandsrl/ . Maps: https://maps.app.goo.gl/KzRrf3W35wt9hafi7?g_st=ac . Horario consultado: lunes a sábado 9:00 a. m.–6:00 p. m.; domingo cerrado.

## User preferences

El usuario aprobó iniciar con contabilidad de partida doble: diario, mayor, cuentas por cobrar/pagar, caja/banco, gastos, ajustes e informes.

## Gotchas

- Después de cambiar el contrato, ejecutar codegen; los clientes y validadores son generados.
- Validación contable sin conservar datos: compilar `scripts/verify-accounting.ts` desde el paquete API con esbuild y ejecutarlo; todos sus registros de prueba se revierten. Las pruebas HTTP ampliadas requieren `FESTILAND_TEST_DATABASE=1` y un `SQLITE_PATH` aislado llamado `verify-*.sqlite`; nunca usar la base operativa.
- Antes de operar: autorizar el correo propietario, cargar los datos reales del comercio y revisar impuestos, saldos iniciales e impresión con el contador y el hardware del negocio.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
