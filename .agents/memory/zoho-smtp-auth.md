---
name: Autenticación SMTP de Zoho
description: Distinguir un servidor Zoho incorrecto de credenciales inválidas sin exponer secretos.
---

Ante EAUTH/554, comprobar el servidor que corresponde al tipo de cuenta y región antes de pedir otra contraseña.

**Why:** Zoho rechazó unas credenciales válidas en el servidor `smtppro.zoho.com`; las mismas credenciales autenticaron correctamente en `smtp.zoho.com`. El rechazo no demostraba que la contraseña fuera incorrecta.

**How to apply:** Consultar los servidores oficiales de Zoho y verificar el endpoint adecuado con TLS y validación de certificado. No deshabilitar la seguridad ni probar proveedores ajenos. Registrar sólo códigos de error y resultados, nunca valores de credenciales ni respuestas SMTP sin sanitizar.
