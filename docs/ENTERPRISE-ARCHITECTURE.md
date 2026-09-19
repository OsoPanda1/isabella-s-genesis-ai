# Isabella AI Genesis — Enterprise Architecture

## 1. Product identity

Isabella AI Genesis es un **FGAIS (Federated Governed Artificial Intelligence System)**: una arquitectura de inteligencia gobernada en la que modelos, aprendizaje, memoria, herramientas y servicios operan bajo políticas de autoridad, evidencia y control.

## 2. Planes

- **Governance Plane:** identidad, CROWN/AEGIS, políticas, autoridad y aprobación.
- **Intelligence Plane:** proveedores, modelos, routing, evaluación y fallback gobernado.
- **Learning Plane:** datasets, provenance, entrenamiento, evaluación y federación.
- **Evidence Plane:** claims, evidencias, hashes, auditorías y release gates.
- **Economic Plane:** ledger, pagos, facturación y reconciliación.
- **Experience Plane:** web, accesibilidad, estados, avisos y UX.
- **Operations Plane:** observabilidad, incidentes, backups, restore y despliegue.

## 3. Fuente de verdad

La persistencia transaccional de producción debe tener una única autoridad explícita. Los stores legacy, JSON e in-memory son exclusivamente de desarrollo/pruebas y deben bloquearse en rutas de producción.

## 4. Flujo de una operación gobernada

`request → identity → tenant isolation → input validation → policy/risk → authority → provider/action → evidence → response → telemetry`

Para acciones sensibles se agrega `human approval` y, para operaciones financieras, `transaction → outbox → provider → reconciliation`.

## 5. Presentación empresarial

La interfaz debe priorizar jerarquía visual, estados claros, lenguaje verificable, consistencia de componentes, responsive design, accesibilidad WCAG objetivo, reduced-motion y separación visible entre información, recomendación y acción.

Las afirmaciones de marketing no deben confundirse con capacidades certificadas. Todo claim técnico debe enlazar a su estado de implementación y evidencia correspondiente.
