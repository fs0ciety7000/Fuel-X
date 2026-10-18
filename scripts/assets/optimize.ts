// glTF-Transform stage (ADR 0007 stage 2): the verified chain from ASSETS_GUIDE §7, via the pinned JS API.
//   dedup → prune (keepLeaves: sockets are empty leaves, keepExtras) → weld → meshopt (level medium)
// Never `optimize()` / join / flatten / instance / simplify / palette (they delete or merge contract nodes).
import { Logger, NodeIO } from '@gltf-transform/core';
import type { Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { validateBytes } from 'gltf-validator';

let ioPromise: Promise<NodeIO> | null = null;

export function getIO(): Promise<NodeIO> {
  ioPromise ??= (async () => {
    await MeshoptEncoder.ready;
    await MeshoptDecoder.ready;
    return new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
  })();
  return ioPromise;
}

export async function optimizeGlb(raw: Uint8Array): Promise<Uint8Array> {
  const io = await getIO();
  const doc = await io.readBinary(raw);
  doc.setLogger(new Logger(Logger.Verbosity.WARN));
  await doc.transform(
    dedup(),
    prune({ keepLeaves: true, keepExtras: true }),
    weld(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  return io.writeBinary(doc);
}

export async function readGlb(bytes: Uint8Array): Promise<Document> {
  return (await getIO()).readBinary(bytes);
}

/** Khronos glTF-Validator (what `gltf-transform validate` runs). Returns error messages; warnings ignored. */
export async function validateGlb(bytes: Uint8Array, uri: string): Promise<string[]> {
  const report = await validateBytes(bytes, { uri, maxIssues: 50, ignoredIssues: ['UNSUPPORTED_EXTENSION'] });
  return report.issues.messages.filter((m) => m.severity === 0).map((m) => `${m.code} ${m.pointer ?? ''} ${m.message}`);
}
