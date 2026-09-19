/**
 * IGDS — Transporte RFC 3161 (src/lib/igds/rfc3161.ts)
 * -----------------------------------------------------------------
 * Codificador/decodificador DER mínimo y cliente HTTP para obtener sellos de
 * tiempo RFC 3161 sin dependencias externas.
 *
 * Alcance honesto:
 *   * Se valida el estado de la respuesta, el messageImprint (algoritmo y
 *     hash) y se extrae `genTime`, `serialNumber`, `policy` y el token DER.
 *   * La firma criptográfica de la TSA y su cadena X.509 NO se validan aquí;
 *     eso requiere un `TsaVerifier` inyectable con la raíz de confianza.
 */
import { digestHex } from "./digests";
import type { TimestampToken } from "./types";
import type { TsaClient, TsaVerifier } from "./tsa";
import { SHA256_OID } from "./tsa";

export interface DerNode {
  tag: number;
  constructed: boolean;
  /** Bytes de contenido (sin cabecera). */
  bytes: Buffer;
  /** TLV completo (cabecera + contenido). */
  raw: Buffer;
  children: DerNode[];
}

function derLength(length: number): Buffer {
  if (length < 0x80) return Buffer.from([length]);
  const bytes: number[] = [];
  let value = length;
  while (value > 0) {
    bytes.unshift(value & 0xff);
    value >>>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function tlv(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), derLength(content.length), content]);
}

function printable(value: string): Buffer {
  return Buffer.from(value, "latin1");
}

function encodeBase128(value: number): number[] {
  const bytes = [value & 0x7f];
  let rest = Math.floor(value / 128);
  while (rest > 0) {
    bytes.unshift((rest & 0x7f) | 0x80);
    rest = Math.floor(rest / 128);
  }
  return bytes;
}

export function encodeOid(dotted: string): Buffer {
  const arcs = dotted.split(".").map((part) => Number.parseInt(part, 10));
  if (arcs.length < 2 || arcs.some((arc) => !Number.isInteger(arc) || arc < 0)) {
    throw new Error(`IGDS DER: OID inválido "${dotted}".`);
  }
  const body: number[] = [40 * arcs[0]! + arcs[1]!];
  for (const arc of arcs.slice(2)) body.push(...encodeBase128(arc));
  return tlv(0x06, Buffer.from(body));
}

export function encodeUnsignedInteger(bytes: Buffer): Buffer {
  const normalized =
    bytes.length > 0 && (bytes[0]! & 0x80) !== 0 ? Buffer.concat([Buffer.from([0]), bytes]) : bytes;
  return tlv(0x02, normalized);
}

function encodeIntegerNumber(value: number): Buffer {
  const bytes: number[] = [];
  let rest = value;
  do {
    bytes.unshift(rest & 0xff);
    rest = Math.floor(rest / 256);
  } while (rest > 0);
  return encodeUnsignedInteger(Buffer.from(bytes));
}

function encodeOctetString(bytes: Buffer): Buffer {
  return tlv(0x04, bytes);
}

function encodeSequence(parts: Buffer[]): Buffer {
  return tlv(0x30, Buffer.concat(parts));
}

function encodeExplicit(tag: number, content: Buffer): Buffer {
  return tlv(0xa0 | tag, content);
}

function toGeneralizedTime(date: Date): Buffer {
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");
  const value =
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
  return tlv(0x18, printable(value));
}

export function readDer(buffer: Buffer, offset = 0): { node: DerNode; next: number } {
  if (offset + 2 > buffer.length) throw new Error("IGDS DER: buffer truncado.");
  const tag = buffer[offset]!;
  const lengthByte = buffer[offset + 1]!;
  let cursor = offset + 2;
  let length: number;
  if (lengthByte & 0x80) {
    const count = lengthByte & 0x7f;
    if (count === 0 || count > 4) throw new Error("IGDS DER: longitud no soportada.");
    length = 0;
    for (let index = 0; index < count; index += 1) {
      length = length * 256 + buffer[cursor + index]!;
    }
    cursor += count;
  } else {
    length = lengthByte;
  }
  const end = cursor + length;
  if (end > buffer.length) throw new Error("IGDS DER: contenido fuera de rango.");
  const node: DerNode = {
    tag,
    constructed: (tag & 0x20) !== 0,
    bytes: buffer.subarray(cursor, end),
    raw: buffer.subarray(offset, end),
    children: [],
  };
  if (node.constructed) {
    let pointer = cursor;
    while (pointer < end) {
      const parsed = readDer(buffer, pointer);
      node.children.push(parsed.node);
      pointer = parsed.next;
    }
  }
  return { node, next: end };
}

function parseOne(buffer: Buffer): DerNode {
  return readDer(buffer, 0).node;
}

export function decodeOid(bytes: Buffer): string {
  if (bytes.length === 0) throw new Error("IGDS DER: OID vacío.");
  const arcs: number[] = [Math.floor(bytes[0]! / 40), bytes[0]! % 40];
  let value = 0;
  for (let index = 1; index < bytes.length; index += 1) {
    const byte = bytes[index]!;
    value = value * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) {
      arcs.push(value);
      value = 0;
    }
  }
  return arcs.join(".");
}

function readInteger(node: DerNode): number {
  let value = 0;
  for (const byte of node.bytes) value = value * 256 + byte;
  return value;
}

function hexOf(bytes: Buffer): string {
  return Buffer.from(bytes).toString("hex");
}

function generalizedTimeToIso(text: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.(\d+))?Z$/.exec(text.trim());
  if (!match) throw new Error(`IGDS TSA: genTime no reconocido "${text}".`);
  const fraction = match[7] ? `.${match[7].slice(0, 3).padEnd(3, "0")}` : "";
  const iso = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}${fraction}Z`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) throw new Error(`IGDS TSA: genTime inválido "${text}".`);
  return parsed.toISOString();
}

/** Construye un `TimeStampReq` DER (sha256, con nonce y certReq). */
export function buildTimestampRequest(
  digestValue: string,
  options: { policy?: string; nonce?: Buffer; certReq?: boolean } = {},
): Buffer {
  const hashedMessage = /^[0-9a-fA-F]{64}$/.test(digestValue)
    ? Buffer.from(digestValue, "hex")
    : Buffer.from(digestHex("sha256", digestValue), "hex");
  const nonce =
    options.nonce ??
    Buffer.from(digestHex("sha256", `${Date.now()}:${Math.random()}`).slice(0, 16), "hex");
  const messageImprint = encodeSequence([
    encodeSequence([encodeOid(SHA256_OID), tlv(0x05, Buffer.alloc(0))]),
    encodeOctetString(hashedMessage),
  ]);
  const parts: Buffer[] = [encodeIntegerNumber(1), messageImprint];
  if (options.policy) parts.push(encodeOid(options.policy));
  parts.push(encodeUnsignedInteger(nonce));
  if (options.certReq !== false) parts.push(tlv(0x01, Buffer.from([0xff])));
  return encodeSequence(parts);
}

function extractTstInfo(contentInfo: DerNode): DerNode {
  const explicit = contentInfo.children[1];
  if (!explicit || explicit.tag !== 0xa0) throw new Error("IGDS TSA: ContentInfo sin contenido.");
  const signedData = explicit.children[0];
  if (!signedData || signedData.children.length < 3) {
    throw new Error("IGDS TSA: SignedData malformado.");
  }
  const encap = signedData.children[2]!;
  const eContent = encap.children[1];
  const octets = eContent?.children[0];
  if (!octets || octets.tag !== 0x04) throw new Error("IGDS TSA: eContent ausente.");
  return parseOne(octets.bytes);
}

export interface Rfc3161Response {
  status: number;
  granted: boolean;
  token: TimestampToken | null;
}

/** Decodifica un `TimeStampResp` DER y devuelve el token si fue concedido. */
export function decodeTimestampResponse(
  response: Buffer,
  expectedDigest?: string,
): Rfc3161Response {
  const root = parseOne(response);
  if (root.tag !== 0x30 || root.children.length < 1) {
    throw new Error("IGDS TSA: respuesta no es un TimeStampResp.");
  }
  const statusInfo = root.children[0]!;
  const status = statusInfo.children.length > 0 ? readInteger(statusInfo.children[0]!) : -1;
  const tokenNode = root.children[1];
  if (status !== 0 && status !== 1) return { status, granted: false, token: null };
  if (!tokenNode) throw new Error("IGDS TSA: estado concedido sin token.");

  const tstInfo = extractTstInfo(tokenNode);
  if (tstInfo.children.length < 5) throw new Error("IGDS TSA: TSTInfo incompleto.");
  const policy = decodeOid(tstInfo.children[1]!.bytes);
  const imprint = tstInfo.children[2]!;
  const algOid = decodeOid(imprint.children[0]!.children[0]!.bytes);
  if (algOid !== SHA256_OID) {
    throw new Error(`IGDS TSA: algoritmo de imprint no soportado (${algOid}).`);
  }
  const hashedMessage = hexOf(imprint.children[1]!.bytes);
  const serialNumber = hexOf(tstInfo.children[3]!.bytes);
  const genTime = tstInfo.children[4]!.bytes.toString("latin1");

  if (expectedDigest !== undefined) {
    const normalized = /^[0-9a-fA-F]{64}$/.test(expectedDigest)
      ? expectedDigest.toLowerCase()
      : digestHex("sha256", expectedDigest);
    if (normalized !== hashedMessage) {
      throw new Error("IGDS TSA: el token no cubre el digest solicitado.");
    }
  }

  return {
    status,
    granted: true,
    token: {
      protocol: "RFC3161",
      status: "granted",
      policy,
      gen_time: generalizedTimeToIso(genTime),
      serial_number: serialNumber,
      message_imprint: { algorithm: "sha256", value: hashedMessage },
      tsa_certificate_chain: [],
      encoded_timestamp_token: Buffer.from(tokenNode.raw).toString("base64"),
    },
  };
}

export interface Rfc3161ClientOptions {
  url: string;
  timeoutMs?: number;
  policy?: string;
  fetchImpl?: typeof fetch;
}

/** Cliente RFC 3161 real (POST application/timestamp-query). */
export function createRfc3161TsaClient(options: Rfc3161ClientOptions): TsaClient {
  const fetcher = options.fetchImpl ?? fetch;
  return {
    async timestamp(digestValue) {
      const request = buildTimestampRequest(digestValue, { policy: options.policy });
      const response = await fetcher(options.url, {
        method: "POST",
        headers: {
          "content-type": "application/timestamp-query",
          accept: "application/timestamp-reply",
        },
        body: new Uint8Array(request),
        signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
      });
      if (!response.ok) {
        throw new Error(`IGDS TSA: HTTP ${response.status} desde ${options.url}.`);
      }
      const decoded = decodeTimestampResponse(
        Buffer.from(await response.arrayBuffer()),
        digestValue,
      );
      if (!decoded.granted || !decoded.token) {
        throw new Error(`IGDS TSA: solicitud rechazada (status=${decoded.status}).`);
      }
      return decoded.token;
    },
  };
}

/**
 * Primitivas DER expuestas para composición avanzada y pruebas sin red.
 * No forman parte del contrato de sellado de alto nivel.
 */
export const der = {
  tlv,
  encodeOid,
  encodeSequence,
  encodeExplicit,
  encodeOctetString,
  encodeUnsignedInteger,
  encodeIntegerNumber,
  toGeneralizedTime,
};

/**
 * Verificador de disponibilidad: comprueba que el token cubre el digest, pero
 * NO valida la firma de la TSA. Nunca debe usarse para `long-term` en
 * producción sin un verificador X.509 real.
 */
export function createImprintOnlyTsaVerifier(): TsaVerifier {
  return {
    verify(token, digestValue) {
      return Promise.resolve(
        token.message_imprint.algorithm === "sha256" &&
          token.message_imprint.value.toLowerCase() === digestValue.toLowerCase(),
      );
    },
  };
}
