# Isabella AI Genesis — Telemetry Governance

## Principio

Telemetría suficiente para operar y auditar; mínima para preservar privacidad.

## Permitido por defecto

- latency y duración;
- status/error class;
- request/trace correlation IDs;
- provider/model ID;
- policy version;
- governance decision y risk class;
- counters y agregados;
- resource/health metrics.

## Prohibido por defecto

- API keys, tokens, cookies, passwords;
- claves privadas;
- authorization headers completos;
- contenido completo de prompts/respuestas;
- datos personales innecesarios;
- payloads financieros completos.

## Sampling

Los eventos de contenido deben estar deshabilitados por defecto en producción. Cualquier aumento temporal de logging requiere motivo, ventana temporal, alcance y aprobación.

## Retención

Cada stream debe declarar owner, finalidad, retención, destino y controles de acceso. La evidencia de seguridad no debe utilizarse como excusa para retención ilimitada de contenido.

## Alertas mínimas

- errores 5xx;
- agotamiento de dependencias;
- rate-limit anomalies;
- auth failures;
- policy denials anómalos;
- cambios de configuración sensibles;
- fallos de backup/restore;
- divergencia de modelos/proveedores;
- errores de ledger/reconciliation.
