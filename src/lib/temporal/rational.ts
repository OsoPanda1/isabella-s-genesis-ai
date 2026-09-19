/**
 * Temporal Media Core — Tiempo racional exacto (src/lib/temporal/rational.ts)
 * ---------------------------------------------------------------------------
 * El §9 de "Isabella-Engine-Video X" exige que el tiempo NUNCA use flotantes:
 *
 *   - Video:   frame_index (entero)
 *   - Audio:   sample_index (entero)
 *   - Subtítulos: tick de alta resolución
 *   - Eventos: timestamp racional
 *
 * Todo instante es un racional `numerator / denominator` con BigInt, de modo
 * que 24 fps y 48000 Hz comparten un álgebra exacta y determinista, sin
 * error de redondeo acumulado y reproducibles en cualquier plataforma.
 *
 * Invariantes:
 *  - El racional SIEMPRE está normalizado (fracción irreducible, denominador > 0).
 *  - Aritmética entera exacta: suma, resta, comparación sin pérdida.
 *  - La conversión a frames es por redondeo definido y determinista
 *    (round-half-even / redondeo banquero), nunca truncamiento.
 */

export interface RationalTime {
  numerator: bigint;
  denominator: bigint;
}

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

/** Normaliza: fracción irreducible, denominador positivo. */
export function normalizeRational(time: RationalTime): RationalTime {
  let { numerator, denominator } = time;
  if (denominator === 0n) {
    throw new Error("Temporal: denominador cero no permitido.");
  }
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const g = gcd(numerator, denominator);
  return { numerator: numerator / g, denominator: denominator / g };
}

export const ZERO: RationalTime = { numerator: 0n, denominator: 1n };

/** Combina a/b · c/d con normalización. */
export function multiplyRatios(a: RationalTime, b: RationalTime): RationalTime {
  return normalizeRational({
    numerator: a.numerator * b.numerator,
    denominator: a.denominator * b.denominator,
  });
}

/** t + u con aritmética entera exacta. */
export function addTimes(a: RationalTime, b: RationalTime): RationalTime {
  return normalizeRational({
    numerator: a.numerator * b.denominator + b.numerator * a.denominator,
    denominator: a.denominator * b.denominator,
  });
}

/** t − u con aritmética entera exacta. */
export function subtractTimes(a: RationalTime, b: RationalTime): RationalTime {
  return normalizeRational({
    numerator: a.numerator * b.denominator - b.numerator * a.denominator,
    denominator: a.denominator * b.denominator,
  });
}

export function multiplyTime(t: RationalTime, scalar: bigint): RationalTime {
  return normalizeRational({ numerator: t.numerator * scalar, denominator: t.denominator });
}

export function divideTime(t: RationalTime, scalar: bigint): RationalTime {
  if (scalar === 0n) {
    throw new Error("Temporal: división por cero.");
  }
  return normalizeRational({ numerator: t.numerator, denominator: t.denominator * scalar });
}

/** Comparación exacta: -1 | 0 | 1. */
export function compareTimes(a: RationalTime, b: RationalTime): -1 | 0 | 1 {
  const lhs = a.numerator * b.denominator;
  const rhs = b.numerator * a.denominator;
  if (lhs < rhs) return -1;
  if (lhs > rhs) return 1;
  return 0;
}

export function timesEqual(a: RationalTime, b: RationalTime): boolean {
  return compareTimes(a, b) === 0;
}

/** Instante → frames (redondeo banquero determinista). */
export function timeToFrames(t: RationalTime, fps: RationalTime): bigint {
  const scaled = multiplyTimes(t, { numerator: fps.numerator, denominator: 1n });
  const exact = multiplyRatios(scaled, { numerator: 1n, denominator: fps.denominator });
  return roundHalfEven(exact.numerator, exact.denominator);
}

/**
 * Redondeo banquero (round-half-even) sobre racionales; determinista entre
 * plataformas y sin depender del modo de redondeo del hardware.
 */
export function roundHalfEven(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) {
    throw new Error("Temporal: división por cero.");
  }
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = n / d;
  const r = n % d;
  // si 2r == d → empate → par
  if (r * 2n === d) {
    return q % 2n === 0n ? (negative ? -q : q) : (negative ? -(q + 1n) : q + 1n);
  }
  const rounded = q + (r * 2n > d ? 1n : 0n);
  return negative ? -rounded : rounded;
}

/** frames → instante (frame n = n/fps). */
export function frameToTime(frameIndex: bigint, fps: RationalTime): RationalTime {
  const allowed = normalizeRational(fps);
  if (allowed.numerator <= 0n) {
    throw new Error("Temporal: fps debe ser positivo.");
  }
  return normalizeRational({
    numerator: frameIndex * allowed.denominator,
    denominator: allowed.numerator,
  });
}

/** seconds (float, solo E/S) → RationalTime exacto con la precisión dada. */
export function secondsToRational(seconds: number, precision: RationalTime): RationalTime {
  if (!Number.isFinite(seconds)) {
    throw new Error("Temporal: seconds no finito.");
  }
  const scaled = Math.round(seconds * Number(precision.denominator));
  return normalizeRational({ numerator: BigInt(scaled), denominator: precision.denominator });
}

/** Nota: las funciones multiplyTimes/addTimes analíticas se reexportan abajo */
export {
  addTimes,
  subtractTimes,
  multiplyTimes,
  multiplyTime,
  divideTime,
  compareTimes,
  timesEqual,
  timeToFrames,
  frameToTime,
  secondsToRational,
  roundHalfEven,
  normalizeRational,
  ZERO,
};
