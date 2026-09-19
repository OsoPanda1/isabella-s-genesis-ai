/**
 * IGDS — Canonicalización JSON (src/lib/igds/canonical.ts)
 * -----------------------------------------------------------------
 * Serialización determinista compatible con RFC 8785 (JSON Canonicalization
 * Scheme). Toda firma, digest de entrada y digest de manifiesto DEBE usar esta
 * función para que el mismo objeto produzca siempre los mismos bytes.
 *
 * Reglas aplicadas:
 *  - Claves de objeto ordenadas por code unit UTF-16.
 *  - Sin espacios ni saltos de línea.
 *  - Números finitos serializados con la representación ECMAScript.
 *  - `undefined`, funciones, símbolos, BigInt y NaN/Infinity se rechazan.
 *  - Solo se aceptan objetos JSON planos (prohibido Date/Map/Set/clases).
 */

export function canonicalize(value: unknown): string {
  return encode(value);
}

export function canonicalizeBytes(value: unknown): Buffer {
  return Buffer.from(canonicalize(value), "utf8");
}

function encode(value: unknown): string {
  if (value === null) return "null";

  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      return encodeNumber(value);
    case "string":
      return JSON.stringify(value);
    case "object":
      return encodeObject(value);
    default:
      throw new TypeError(`IGDS canonicalization: tipo no serializable (${typeof value}).`);
  }
}

function encodeNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new TypeError("IGDS canonicalization: NaN e Infinity no son serializables.");
  }
  if (Object.is(value, -0)) return "0";
  return JSON.stringify(value);
}

function encodeObject(value: object): string {
  if (Array.isArray(value)) {
    const items = value.map((item) => {
      if (item === undefined) {
        throw new TypeError("IGDS canonicalization: arrays no admiten elementos undefined.");
      }
      return encode(item);
    });
    return `[${items.join(",")}]`;
  }

  const prototype = Object.getPrototypeOf(value) as object | null;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("IGDS canonicalization: solo se admiten objetos JSON planos.");
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  const pairs = keys.map((key) => `${JSON.stringify(key)}:${encode(record[key])}`);
  return `{${pairs.join(",")}}`;
}
