# Festiland en CapRover

La imagen sirve la interfaz y `/api` desde **un mismo dominio**. El acceso usa
correo y contraseña locales en PostgreSQL, sin Clerk, Google ni servicios de
autenticación externos. No necesita las claves de Clerk ni `SESSION_SECRET`.
El navegador sigue comunicándose con el servidor propio del POS.

## Preparación

1. Desplegar PostgreSQL en CapRover, con volumen persistente, contraseña segura y
   copias de seguridad. No publicar su puerto en Internet. Conservar el nombre de
   red interno que indique CapRover: según la versión puede ser el nombre del
   servicio o `srv-captain--NOMBRE`.
2. Crear una aplicación web para Festiland. Usar este repositorio **desde su raíz**;
   `captain-definition` apunta al `Dockerfile`. No desplegar sólo la carpeta del
   frontend.
3. En **HTTP Settings**, poner **Container HTTP Port: 3000**, asignar el dominio,
   habilitar HTTPS y activar **Enforce HTTPS**. No mapear públicamente el puerto
   interno de Node.
4. En **App Config**, configurar estas variables en tiempo de ejecución, nunca
   como argumentos de construcción ni dentro del repositorio:

| Variable | Valor |
| --- | --- |
| `DATABASE_URL` | URI de la base PostgreSQL propia, usando su nombre de red interno y credenciales. Codificar los caracteres especiales de la contraseña en la URI. |
| `APP_ORIGIN` | Origen público exacto, por ejemplo `https://pos.ejemplo.com`, sin ruta. Es obligatorio en producción. |
| `FESTILAND_OWNER_EMAIL` | Correo de la cuenta propietaria indicada por el negocio. |
| `FESTILAND_INITIAL_OWNER_PASSWORD` | Contraseña inicial **secreta**, de 12 a 128 caracteres. No hay contraseña predeterminada. |

La imagen ya define `NODE_ENV=production`, `PORT=3000`, `SERVE_STATIC=true`,
`STATIC_DIR=/app/public` y `MIGRATIONS_DIR=/app/migrations`. No deben sobreescribirse
salvo que se cambie también la configuración correspondiente.

5. Desplegar desde la raíz. Al arrancar se aplican las migraciones SQL y después
   se inicia la aplicación. Una migración fallida detiene el arranque; no se
   ejecuta `drizzle-kit push` en producción. Revisar los registros y
   `/api/healthz`, que comprueba también la conexión a PostgreSQL.
6. Iniciar sesión con la cuenta propietaria y revisar la configuración del negocio,
   impuestos, impresoras y saldos. Después del primer arranque correcto, **eliminar
   `FESTILAND_INITIAL_OWNER_PASSWORD`** de CapRover y volver a desplegar/reiniciar.
   La cuenta ya está en la base; reiniciar no cambia su contraseña ni sus permisos.

No hace falta un volumen para Node: los datos, sesiones y usuarios se guardan en
PostgreSQL. Si en el futuro se añaden archivos subidos, necesitarán almacenamiento
persistente específico. Guardar copias de seguridad fuera del mismo servidor.

## Usuarios y contraseñas

- No hay registro público ni reclamación de administración desde el navegador.
- El propietario crea cuentas en **Equipo** y entrega la contraseña temporal por
  un medio seguro. El usuario debe cambiarla antes de entrar al POS.
- Los gerentes sólo crean/restablecen cajeros, inventario y contables. Sólo el
  propietario cambia roles y activa/desactiva cuentas; siempre debe quedar un
  propietario activo.
- Las cuentas antiguas conservan su identificador, rol e historial. Las que no
  tengan acceso local muestran **Sin contraseña**: el propietario usa **Asignar
  acceso**. Las contraseñas de Clerk no se importan.
- Cada usuario cambia su contraseña en **Preferencias**. Un restablecimiento, un
  cambio de contraseña, de rol o de estado revoca las sesiones correspondientes.
- Las sesiones duran hasta 7 días y vencen tras 12 horas sin actividad. Se guardan
  sólo hashes de los tokens y contraseñas con scrypt. Las cookies son HttpOnly,
  SameSite y Secure en producción.
- El acceso está limitado por correo y dirección IP durante ventanas de 15
  minutos. Mantener Node detrás del proxy de CapRover; confía en un salto de proxy.
- El cierre de sesión necesita confirmación del servidor: no basta con cerrar la
  pestaña, especialmente en un dispositivo compartido.

## Recuperación del propietario sin servicios externos

Si un propietario activo olvida su contraseña:

1. Verificar que `FESTILAND_OWNER_EMAIL` corresponde al propietario activo que se
   recuperará.
2. Configurar temporalmente `FESTILAND_RECOVERY_PASSWORD` como secreto de entorno
   del servicio. Usar una contraseña nueva de entre 12 y 128 caracteres.
3. Abrir la consola del contenedor y ejecutar:

   ```sh
   node /app/dist/reset-owner.mjs --confirm
   ```

4. Quitar `FESTILAND_RECOVERY_PASSWORD` de la configuración del servicio y
   reiniciarlo. Iniciar sesión con la temporal y cambiarla cuando se solicite.

La recuperación revoca las sesiones anteriores y se audita. No crea usuarios, no
reactiva cuentas y no devuelve permisos revocados. Nunca escribir contraseñas en
el comando, el historial de la terminal ni los registros.

## Datos existentes y actualizaciones

La migración inicial está preparada para una **base nueva**. Los datos del entorno
de desarrollo no se copian automáticamente. No restaurar tablas a mano y después
ejecutar la migración inicial encima: daría conflictos.

Para trasladar una base ya poblada, hacer antes una copia completa, probar la
restauración y acordar un procedimiento de importación/adopción del historial de
migraciones. No borrar tablas ni usar `push --force` para resolver esos conflictos.
Una base ya instalada mediante estas migraciones sí puede restaurarse junto con
su esquema `drizzle` de historial.

Antes de cada actualización, hacer respaldo y revisar el SQL nuevo. Las
migraciones están versionadas en `lib/db/migrations`; un cambio de esquema se
genera con `pnpm --filter @workspace/db exec drizzle-kit generate`, se revisa y se
incluye en el repositorio. Probar primero con una copia de la base. Evitar cambios
incompatibles durante despliegues con varias réplicas o actualizaciones graduales.

## Impresoras

La impresión sigue siendo desde el navegador (58 mm, 80 mm o A4), usando una
impresora instalada en el equipo. El diálogo y la disponibilidad dependen del
dispositivo. CapRover no da acceso directo al USB del comercio; la impresión
silenciosa y el cajón requieren validar el equipo y, si corresponde, un puente
local adicional.

Referencias:
- https://caprover.com/docs/captain-definition-file.html
- https://caprover.com/docs/app-configuration.html
