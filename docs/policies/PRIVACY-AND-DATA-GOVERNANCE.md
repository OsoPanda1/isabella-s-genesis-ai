# Isabella AI — Política de privacidad y gobernanza de datos

**Estado:** Política base; requiere validación jurídica para la jurisdicción concreta.

## 1. Principios

Isabella adopta minimización, finalidad, proporcionalidad, seguridad, trazabilidad, retención limitada y control de acceso por defecto.

## 2. Datos que pueden procesarse

Dependiendo de la función utilizada pueden existir mensajes, archivos, metadatos técnicos, identificadores de tenant/actor, telemetría operacional, eventos de seguridad y evidencia de gobernanza. No se debe recolectar información que no sea necesaria para prestar la función o cumplir una obligación legítima documentada.

## 3. Datos enviados a proveedores de modelos

Una solicitud solo puede enviarse al proveedor seleccionado cuando exista autorización de gobernanza para esa ruta. La política de cada proveedor, ubicación del procesamiento, retención contractual y uso secundario deben evaluarse antes de habilitar una ruta de producción.

## 4. Telemetría

La telemetría operacional debe priorizar métricas agregadas y eventos técnicos. Los mensajes, secretos, tokens, credenciales, contenido sensible y datos personales no deben aparecer en logs por defecto. Los identificadores deben ser pseudonimizados cuando sea suficiente.

## 5. Retención

Cada clase de dato debe tener un periodo de retención documentado. La evidencia de auditoría puede requerir mayor retención que los datos de contenido; esto no autoriza conservar el contenido indefinidamente.

## 6. Derechos y solicitudes

La implementación de derechos de acceso, rectificación, supresión, oposición, portabilidad u otros derechos dependerá de la jurisdicción y base jurídica aplicables. Antes de declarar cumplimiento legal, debe existir una matriz jurisdiccional y evidencia operacional.

## 7. Seguridad

El acceso debe aplicar mínimo privilegio, aislamiento por tenant, autenticación fuerte para operaciones sensibles, rotación de secretos, cifrado en tránsito y en reposo cuando corresponda, auditoría y procedimientos de respuesta a incidentes.

## 8. Proveedores y transferencias

Los proveedores externos deben estar identificados en un registro de terceros. La evaluación debe incluir finalidad, datos compartidos, subprocesadores, región, retención, controles de seguridad y mecanismo contractual aplicable.

## 9. Menores y categorías especialmente sensibles

No debe inferirse ni procesarse información especialmente sensible sin una base y controles apropiados. Las experiencias dirigidas a menores requieren un análisis específico y no deben habilitarse por defecto.

## 10. Estado jurídico

Este documento es una política técnica-operacional y no constituye por sí mismo asesoría jurídica ni certificación de cumplimiento. La aplicación de leyes concretas debe ser validada por asesoría jurídica competente.
