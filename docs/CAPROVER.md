# Festiland en CapRover · SQLite local

Una sola aplicación sirve la web pública, el POS y `/api` bajo el mismo dominio.
El login, usuarios, sesiones, inventario y contabilidad se guardan en un archivo
SQLite local. **No requiere PostgreSQL, Clerk, APIs de autenticación ni Turso**.
El controlador SQLite utiliza únicamente archivos; no configura conexiones remotas.
El navegador sí se comunica con el servidor propio de Festiland.

## Preparación

1. Crear una aplicación desde **la raíz del repositorio**. `captain-definition`
   usa el `Dockerfile`; no desplegar únicamente el frontend.
2. Activar **Persistent Data** y montar un volumen persistente en **`/data`**.
   La imagen ejecuta Node como usuario `node` (UID 1000): el volumen debe permitirle
   leer y escribir. Si se usa una carpeta existente del servidor, ajustar su dueño
   y permisos antes de arrancar.
3. Mantener **una sola instancia/réplica**. SQLite y las transacciones asíncronas
   se coordinan dentro de ese proceso; no montar el archivo en NFS ni compartirlo
   entre varias instancias. Evitar despliegues con dos procesos escribiendo a la vez.
4. En HTTP Settings: **Container HTTP Port 3000**, dominio, HTTPS y Enforce HTTPS.
5. Configurar las variables en tiempo de ejecución, nunca en el código o la imagen:

| Variable | Uso |
| --- | --- |
| `APP_ORIGIN` | Origen público exacto, por ejemplo `https://festiland.ejemplo.com`, sin ruta; obligatorio en producción. |
| `FESTILAND_OWNER_EMAIL` | Correo inicial del propietario, sólo para una base nueva. |
| `FESTILAND_INITIAL_OWNER_PASSWORD` | Secreto inicial de 12–128 caracteres; no existe contraseña predeterminada. |
| `ZOHO_SMTP_USER` | Correo completo de la cuenta remitente Zoho, si se habilita el envío. |
| `ZOHO_SMTP_PASSWORD` | Contraseña de aplicación Zoho; no incluirla en un archivo del repositorio. |

La imagen define `SQLITE_PATH=/data/festiland.sqlite`, `MIGRATIONS_DIR=/app/migrations`,
`STATIC_DIR=/app/public`, `SERVE_STATIC=true`, `NODE_ENV=production` y `PORT=3000`.
**No configurar `DATABASE_URL`** ni copiar las rutas de desarrollo de Replit.
La aplicación no utiliza las antiguas claves de Clerk ni `SESSION_SECRET`.

6. Desplegar. Las migraciones versionadas son automáticas e idempotentes. Si falla
   el volumen, el esquema o la configuración, el arranque se detiene.
   `/api/healthz` comprueba que el archivo se puede consultar.
7. En una instalación nueva: iniciar sesión y eliminar de las variables el secreto
   `FESTILAND_INITIAL_OWNER_PASSWORD` después de confirmar el primer acceso.
   Reiniciar no vuelve a asignar contraseña ni permisos.
8. Confirmar que los datos siguen presentes tras un redespliegue antes de operar.
   **Sin el volumen `/data`, los datos se perderán al reemplazar el contenedor.**

## Trasladar la instalación actual

El reinicio autorizado dejó operaciones, saldos y existencias en cero y conservó
catálogo, contactos, impuestos, cuentas contables, usuarios, roles y configuración.
Las sesiones previas se invalidaron; es necesario iniciar sesión de nuevo.
El PostgreSQL de origen no se borró. Se conservó un respaldo completo privado
en `data/backups/postgres-before-sqlite-*.json`, excluido de Git y de la imagen.

Los archivos de desarrollo **no viajan dentro de la imagen**. Para conservar esta
instalación al moverla a CapRover, hacer un respaldo SQLite coherente y copiarlo al
volumen como `/data/festiland.sqlite` antes de arrancar la aplicación. No mezclarlo
con otra base instalada. Mantener su historial `__drizzle_migrations`.
Si se inicia con un volumen vacío, se crea una instalación nueva y vacía.

## Respaldos y actualizaciones

- Respaldar antes de cada actualización y con frecuencia durante la operación.
  Guardar copias cifradas también fuera del servidor; el volumen no es un respaldo.
- No copiar sólo el `.sqlite` mientras haya actividad: WAL puede contener cambios
  confirmados. Usar la API de respaldo de SQLite o `VACUUM INTO`.
- Desde la consola del contenedor, en `/app`, se puede producir una copia coherente
  con el controlador que ya viene instalado:

```sh
node --input-type=module <<'JS'
import { createClient } from "@libsql/client/sqlite3";
import { mkdir } from "node:fs/promises";
process.umask(0o077);
await mkdir("/data/backups", { recursive: true, mode: 0o700 });
const target = `/data/backups/festiland-${Date.now()}.sqlite`;
const db = createClient({ url: `file:${process.env.SQLITE_PATH}` });
try {
  await db.execute({ sql: "VACUUM INTO ?", args: [target] });
  console.log("Respaldo creado:", target);
} finally { db.close(); }
JS
```

Si SQLite informa que está ocupada, repetir cuando no haya una transacción activa.
Probar la copia con `PRAGMA integrity_check`. Para restaurar, detener la aplicación,
preservar aparte la base y sus archivos `-wal`/`-shm` actuales y colocar el respaldo
como archivo principal; no combinarlo con archivos WAL de otra copia.

El esquema nuevo se genera con
`pnpm --filter @workspace/db exec drizzle-kit generate`, se revisa y se versiona
en `lib/db/migrations-sqlite`. No usar `push --force` en producción.
Las migraciones PostgreSQL antiguas sólo se conservan como referencia histórica.

## Usuarios y correo propietario

No hay registro público. El propietario crea cuentas en **Equipo** con contraseña
temporal; el usuario debe cambiarla antes de operar. Los gerentes no pueden crear
propietarios ni restablecer sus contraseñas. Siempre debe quedar un propietario activo.

El propietario cambia su correo en **Preferencias → Correo del propietario**,
confirmando la contraseña actual. Se conserva el identificador, rol e historial,
se revocan las sesiones anteriores y se renueva la actual. Desde ese momento se
ingresa con el correo nuevo. El correo inicial de las variables **no lo revierte**.
No es necesario que SMTP funcione para realizar el cambio local.

Si se pierde la contraseña: configurar temporalmente `FESTILAND_RECOVERY_PASSWORD`
y ejecutar `node /app/dist/reset-owner.mjs --confirm`. Por defecto recupera al
propietario inicial por su identificador estable, aunque haya cambiado su correo.
`FESTILAND_RECOVERY_EMAIL` permite escoger otro propietario activo explícitamente.
La recuperación no reactiva usuarios ni devuelve roles revocados. Eliminar después
el secreto de recuperación; el siguiente acceso exige cambiar esa contraseña.

## Zoho SMTP

En **Preferencias → Correo saliente** configurar el servidor exacto que muestra
Zoho para la cuenta y su región: `smtppro.zoho.com` suele corresponder a cuentas de
dominio de pago; `smtp.zoho.com`, a otras cuentas. Se permiten **465 con SSL** o
**587 con STARTTLS obligatorio** y se valida el certificado.
Las credenciales sólo se leen del entorno. La cuenta debe tener acceso SMTP;
si tiene 2FA, utilizar una contraseña de aplicación de Zoho.

El correo remitente debe coincidir con la cuenta autenticada. Guardar y usar
**Enviar prueba**; Zoho debe aceptar el mensaje y después se revisa la bandeja
del propietario, incluido correo no deseado. Permitir conexiones salientes 465/587
en el servidor. Un SMTP fallido nunca impide el login local y nunca se presenta
como un envío exitoso. La web pública usa llamadas e Instagram, no un formulario
que simule enviar correo.

## Impresoras

Impresión desde el navegador en 58 mm, 80 mm o A4 con una impresora instalada en
el dispositivo. CapRover no da acceso al USB de la tienda. La impresión silenciosa,
ESC/POS y la apertura de gaveta requieren integrar y validar el hardware específico.

Referencias: [CapRover](https://caprover.com/docs/app-configuration.html) ·
[Zoho SMTP](https://www.zoho.com/mail/help/zoho-smtp.html).
