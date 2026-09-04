export interface Attachment {
  id: string;
  kind: "image" | "audio";
  /** data URL completo (`data:<mime>;base64,...`). */
  dataUrl: string;
  mime: string;
  name: string;
  size: number;
}

export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.readAsDataURL(file);
  });
}

/** Formato de contenedor aceptado por el gateway para `input_audio`. */
export function audioFormatFromMime(mime: string): string {
  const base = mime.split(";")[0] ?? "";
  if (base.includes("mp4") || base.includes("m4a")) return "m4a";
  if (base.includes("ogg")) return "ogg";
  if (base.includes("wav")) return "wav";
  if (base.includes("mpeg")) return "mp3";
  return "webm";
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
