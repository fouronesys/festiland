---
name: Versiones compartidas de React
description: Por qué las aplicaciones de este monorepo deben compartir una versión alineada de React y React DOM.
---

Tratar React y React DOM como dependencias compartidas del workspace, no como versiones independientes por artefacto.

**Why:** las bibliotecas compartidas y la optimización de Vite pueden combinar resoluciones distintas en el navegador aunque los tipos y el build pasen. Una actualización sólo dentro de un artefacto no garantiza que el runtime use la misma pareja.

**How to apply:** al incorporar una integración que requiera otra versión, alinear ambos paquetes en el catálogo y las aplicaciones consumidoras; comprobar el arranque real del navegador además de la compilación.
