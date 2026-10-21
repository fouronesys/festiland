---
name: Pruebas Docker en Replit
description: Limitaciones observadas al verificar imágenes Docker desde el entorno del workspace.
---

En este entorno, la construcción y el arranque de contenedores Docker con puertos publicados pueden funcionar aunque `docker exec` falle al entrar al contenedor (`setns process`). Los puertos fijos del host también pueden estar ocupados.

**Why:** El error de `docker exec` puede confundirse con un fallo de la aplicación, aunque la app esté respondiendo correctamente desde el host.

**How to apply:** Asignar un puerto publicado dinámicamente y validar con `curl` desde el host. Usar `docker inspect` para configuración de imagen; no interpretar un fallo de `docker exec` como fallo de salud si las comprobaciones HTTP pasan.
