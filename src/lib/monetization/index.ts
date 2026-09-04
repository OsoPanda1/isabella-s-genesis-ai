/**
 * MÓDULO DE MONETIZACIÓN (src/lib/monetization/index.ts)
 * -----------------------------------------------------------------
 * Punto de entrada del dominio de monetización de Isabella.
 *
 * Modelo económico:
 *   - La suscripción activa DESBLOQUEA la capacidad de monetizar.
 *   - El reparto del 100% de los ingresos generados es 85% usuario /
 *     15% plataforma (soporte de infraestructura).
 *   - Los ingresos pasan por maduración (14-30 días), se registran en
 *     BookPI y se liquidan una vez al mes con mínimo de $50 USD.
 */

export * from "./types";
export * from "./revenue";
export * from "./eligibility";
export * from "./guides";
export * from "./withdrawal";
