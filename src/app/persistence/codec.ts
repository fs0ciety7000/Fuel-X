// Save file codec (8.3): gzip through the native CompressionStream (plain JSON where it is missing), import decoding
// and validation, and the player-facing error texts. Validation / migration itself is `loadSave` (src/sim/save).
import { WORLD_SCHEMA, loadSave } from '@sim/index';
import type { LoadedSave } from '@sim/index';
import { MAX_IMPORT_BYTES, SAVE_EXT_GZ, SAVE_EXT_JSON } from './config';

const SESSION_FORMAT = 'fuelx-session';

const hasCompression = (): boolean => typeof CompressionStream === 'function';
const hasDecompression = (): boolean => typeof DecompressionStream === 'function';

/** Gzip magic bytes 1F 8B. */
export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

async function pipe(bytes: Uint8Array, stream: TransformStream<Uint8Array, Uint8Array>): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** gzip(text) or null when the browser has no CompressionStream. */
export async function gzipText(text: string): Promise<Uint8Array | null> {
  if (!hasCompression()) return null;
  return pipe(new TextEncoder().encode(text), new CompressionStream('gzip') as TransformStream<Uint8Array, Uint8Array>);
}

/** Bytes of an imported file → JSON text (gunzipped when it starts with the gzip magic). */
export async function decodeSaveBytes(bytes: Uint8Array): Promise<string> {
  if (bytes.length > MAX_IMPORT_BYTES) throw new Error('IMPORT_TOO_LARGE');
  if (bytes.length === 0) throw new Error('IMPORT_EMPTY');
  let raw = bytes;
  if (isGzip(bytes)) {
    if (!hasDecompression()) throw new Error('IMPORT_GZIP_UNSUPPORTED');
    try {
      raw = await pipe(bytes, new DecompressionStream('gzip') as TransformStream<Uint8Array, Uint8Array>);
    } catch {
      throw new Error('IMPORT_GZIP_CORRUPT');
    }
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(raw);
  } catch {
    throw new Error('SAVE_NOT_JSON');
  }
}

/**
 * Validates + migrates a save (via `loadSave`) without touching the running world, so a bad file never costs the
 * player the current run. Recognises an EXPORT LOG session file (a different thing, GDD §13.2.3) by its format.
 */
export function checkSave(json: string): LoadedSave {
  try {
    const head = JSON.parse(json) as { format?: unknown } | null;
    if (head && typeof head === 'object' && head.format === SESSION_FORMAT) throw new Error('IMPORT_SESSION_LOG');
  } catch (e) {
    if (e instanceof Error && e.message === 'IMPORT_SESSION_LOG') throw e;
    // not JSON: loadSave reports SAVE_NOT_JSON below
  }
  return loadSave(json);
}

/** Export payload: gzip bytes + `.fuelx.json.gz`, or UTF-8 JSON + `.fuelx.json` without CompressionStream. */
export async function encodeSaveFile(
  json: string,
  base: string,
): Promise<{ name: string; bytes: Uint8Array; mime: string }> {
  const gz = await gzipText(json);
  if (gz) return { name: `${base}${SAVE_EXT_GZ}`, bytes: gz, mime: 'application/gzip' };
  return { name: `${base}${SAVE_EXT_JSON}`, bytes: new TextEncoder().encode(json), mime: 'application/json' };
}

/** `fuelx-save-seed42-t540000`. */
export function saveBaseName(seed: number, tick: number): string {
  return `fuelx-save-seed${seed >>> 0}-t${tick}`;
}

/** Player-facing text for an export / import / storage error code (DESIGN_SYSTEM: uppercase, no blame, a way out). */
export function persistenceErrorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const code = msg.split(':')[0]?.trim() ?? '';
  const newer = /schema (\d+)/.exec(msg)?.[1];
  switch (code) {
    case 'IMPORT_TOO_LARGE':
      return 'NOT A FUEL-X SAVE · FILE TOO LARGE';
    case 'IMPORT_EMPTY':
      return 'NOT A FUEL-X SAVE · FILE IS EMPTY';
    case 'IMPORT_GZIP_UNSUPPORTED':
      return 'THIS BROWSER CANNOT UNZIP SAVES · USE AN UNCOMPRESSED .FUELX.JSON';
    case 'IMPORT_GZIP_CORRUPT':
      return 'CORRUPT SAVE · THE .GZ FILE IS DAMAGED OR TRUNCATED';
    case 'IMPORT_SESSION_LOG':
      return 'THIS IS A SESSION LOG (EXPORT LOG), NOT A SAVE · LOGS CANNOT BE LOADED YET';
    case 'SAVE_NOT_JSON':
      return 'CORRUPT SAVE · NOT READABLE JSON';
    case 'SAVE_BAD_FORMAT':
      return 'NOT A FUEL-X SAVE · UNKNOWN FILE FORMAT';
    case 'SAVE_FROM_NEWER_GAME':
      return `SAVE FROM A NEWER VERSION · SCHEMA ${newer ?? '?'}, THIS BUILD READS UP TO ${WORLD_SCHEMA} · RELOAD TO UPDATE`;
    case 'SAVE_MIGRATION_MISSING':
      return 'SAVE TOO OLD · NO MIGRATION PATH TO THIS VERSION';
    case 'WORLD_INVALID':
      return 'CORRUPT SAVE · WORLD DATA FAILED VALIDATION';
    case 'NO_SAVE':
      return 'NO AUTOSAVE TO CONTINUE';
    default:
      return `SAVE ERROR · ${(code || 'UNKNOWN').toUpperCase()}`;
  }
}
