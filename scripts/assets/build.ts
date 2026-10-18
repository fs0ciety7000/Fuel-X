// Asset pipeline entry (ADR 0007): Blender → gltf-transform chain → validator + contract → codegen → preview.
// Usage:
//   npm run asset -- <name> [<name>…] [--verify] [--no-preview] [--turntable 12] [--verbose]
//   npm run assets [-- --verify]
// --verify rebuilds every asset a second time (no preview) and fails unless raw and optimized GLBs are byte-identical.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { generateAsset, generateIndex } from './codegen.ts';
import { checkContract, parseContract, summarize } from './contract.ts';
import type { AssetContract, GlbSummary } from './contract.ts';
import { optimizeGlb, readGlb, validateGlb } from './optimize.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const P = {
  assets: join(root, 'blender/assets'),
  raw: join(root, 'build/models-raw'),
  verifyRaw: join(root, 'build/models-raw-verify'),
  models: join(root, 'public/models'),
  previews: join(root, 'docs/assets'),
  generated: join(root, 'src/render/assets/generated'),
  tokens: join(root, 'src/tokens/generated/tokens.json'),
  report: join(root, 'test-results/assets.json'),
};

interface Options {
  names: string[];
  all: boolean;
  verify: boolean;
  preview: boolean;
  turntable: number;
  verbose: boolean;
}

function parseArgs(argv: string[]): Options {
  const o: Options = { names: [], all: false, verify: false, preview: true, turntable: 0, verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? '';
    if (a === '--all') o.all = true;
    else if (a === '--verify') o.verify = true;
    else if (a === '--no-preview') o.preview = false;
    else if (a === '--verbose') o.verbose = true;
    else if (a === '--turntable') o.turntable = Number(argv[++i] ?? '12');
    else if (a.startsWith('--turntable=')) o.turntable = Number(a.split('=')[1]);
    else if (a.startsWith('--')) throw new Error(`unknown flag ${a}`);
    else o.names.push(a);
  }
  if (!Number.isInteger(o.turntable) || o.turntable < 0) throw new Error('--turntable needs a frame count');
  return o;
}

const rel = (p: string): string => relative(root, p);
const sha256 = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');
const lodFile = (file: string, lod: number): string => (lod === 0 ? `${file}.glb` : `${file}_lod${lod}.glb`);
const ms = (t0: number): string => `${((performance.now() - t0) / 1000).toFixed(1)} s`;

function findBlender(): string {
  const candidates = [process.env['BLENDER'], 'blender', join(homedir(), '.local/bin/blender')].filter(
    (c): c is string => typeof c === 'string' && c.length > 0,
  );
  for (const c of candidates) {
    const r = spawnSync(c, ['--version'], { encoding: 'utf8' });
    if (r.status === 0) {
      const m = /Blender (\d+)\.(\d+)/.exec(r.stdout);
      if (m && m[1] === '4' && m[2] === '5') return c;
      throw new Error(`assets: ${c} is not Blender 4.5 LTS (${r.stdout.split('\n')[0] ?? '?'})`);
    }
  }
  throw new Error('assets: Blender 4.5 not found — run scripts/install-blender.sh and add ~/.local/bin to PATH');
}

function runBlender(blender: string, name: string, outDir: string, opts: Options, withPreview: boolean): void {
  const args = [
    '-b',
    '--factory-startup',
    '--python-exit-code',
    '1',
    '-P',
    join(P.assets, `${name}.py`),
    '--',
    '--out',
    join(outDir, `${name}.glb`),
    '--tokens',
    P.tokens,
  ];
  if (withPreview && opts.preview) args.push('--preview', join(P.previews, `${name}.png`));
  if (withPreview && opts.turntable > 0) {
    args.push('--turntable', String(opts.turntable), '--turntable-dir', join(P.previews, 'turntable'));
  }
  const r = spawnSync(blender, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, cwd: root });
  const out = `${r.stdout}\n${r.stderr}`;
  if (opts.verbose) process.stdout.write(out);
  else for (const line of out.split('\n')) if (line.startsWith('[fx-asset]')) console.log(`  ${line}`);
  const pyErr = /Traceback|Error:/.test(r.stderr) && !opts.verbose;
  if (r.status !== 0 || pyErr) {
    if (!opts.verbose) process.stderr.write(out);
    throw new Error(`assets: Blender failed for ${name} (exit ${String(r.status)})`);
  }
}

async function writeFormatted(path: string, code: string): Promise<void> {
  const config = (await resolveConfig(path)) ?? {};
  writeFileSync(path, await format(code, { ...config, filepath: path }));
}

interface Built {
  contract: AssetContract;
  summaries: GlbSummary[];
  optimized: Uint8Array[];
}

async function buildAsset(blender: string, name: string, opts: Options): Promise<Built> {
  const contractPath = join(P.assets, `${name}.contract.json`);
  if (!existsSync(contractPath)) throw new Error(`assets: missing ${rel(contractPath)}`);
  const contract = parseContract(JSON.parse(readFileSync(contractPath, 'utf8')), rel(contractPath));
  if (contract.file !== name) throw new Error(`${rel(contractPath)}: file '${contract.file}' != script '${name}'`);

  let t0 = performance.now();
  runBlender(blender, name, P.raw, opts, true);
  console.log(`  blender ${ms(t0)}`);

  t0 = performance.now();
  const summaries: GlbSummary[] = [];
  const optimized: Uint8Array[] = [];
  const errors: string[] = [];
  for (let lod = 0; lod < contract.lods; lod++) {
    const rawPath = join(P.raw, lodFile(name, lod));
    if (!existsSync(rawPath)) {
      errors.push(`LOD${lod}: Blender did not write ${rel(rawPath)}`);
      continue;
    }
    const raw = new Uint8Array(readFileSync(rawPath));
    for (const e of await validateGlb(raw, rawPath)) errors.push(`LOD${lod} raw validator: ${e}`);
    const opt = await optimizeGlb(raw);
    for (const e of await validateGlb(opt, lodFile(name, lod))) errors.push(`LOD${lod} validator: ${e}`);
    optimized.push(opt);
    summaries.push(summarize(await readGlb(opt), opt.byteLength, lod));
  }
  errors.push(...checkContract(contract, summaries));
  if (errors.length > 0) throw new Error(`assets: ${name} violates its contract:\n  - ${errors.join('\n  - ')}`);

  mkdirSync(P.models, { recursive: true });
  optimized.forEach((b, lod) => writeFileSync(join(P.models, lodFile(name, lod)), b));
  mkdirSync(P.generated, { recursive: true });
  const hashes = optimized.map(sha256);
  await writeFormatted(join(P.generated, `${name}.ts`), generateAsset({ contract, summaries, hashes }));
  console.log(`  optimize + contract + codegen ${ms(t0)}`);
  for (const s of summaries) {
    console.log(
      `  LOD${s.lod}: ${s.triangles} tris, ${(s.bytes / 1024).toFixed(1)} KB, ${s.drawCalls} draw calls, ${s.nodes.length} nodes`,
    );
  }
  return { contract, summaries, optimized };
}

async function verifyAsset(blender: string, name: string, built: Built, opts: Options): Promise<void> {
  rmSync(P.verifyRaw, { recursive: true, force: true });
  mkdirSync(P.verifyRaw, { recursive: true });
  runBlender(blender, name, P.verifyRaw, { ...opts, verbose: false }, false);
  for (let lod = 0; lod < built.contract.lods; lod++) {
    const a = readFileSync(join(P.raw, lodFile(name, lod)));
    const b = readFileSync(join(P.verifyRaw, lodFile(name, lod)));
    if (!a.equals(b)) throw new Error(`assets: --verify ${name} LOD${lod}: raw GLB differs between two builds`);
    const opt = await optimizeGlb(new Uint8Array(b));
    if (!Buffer.from(opt).equals(Buffer.from(built.optimized[lod] ?? new Uint8Array()))) {
      throw new Error(`assets: --verify ${name} LOD${lod}: optimized GLB differs between two builds`);
    }
  }
  console.log(`  verify: ${built.contract.lods} LOD(s) byte-identical (sha256 ${sha256(built.optimized[0] ?? new Uint8Array()).slice(0, 12)})`);
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const available = existsSync(P.assets)
    ? readdirSync(P.assets)
        .filter((f) => f.endsWith('.py'))
        .map((f) => f.slice(0, -3))
        .sort()
    : [];
  const targets = opts.all ? available : opts.names;
  if (!opts.all && targets.length === 0) {
    console.error('usage: npm run asset -- <name>   (or npm run assets)');
    process.exit(2);
  }
  const unknown = targets.filter((n) => !available.includes(n));
  if (unknown.length > 0) {
    console.error(`assets: no blender/assets/<name>.py for: ${unknown.join(', ')}`);
    process.exit(1);
  }
  if (targets.length === 0) {
    console.log('assets: no asset scripts yet (blender/assets/*.py) — nothing to build');
    return;
  }
  const blender = findBlender();
  const t0 = performance.now();
  const report: Record<string, unknown> = existsSync(P.report)
    ? (JSON.parse(readFileSync(P.report, 'utf8')) as Record<string, unknown>)
    : {};
  for (const name of targets) {
    console.log(`asset ${name}`);
    const t = performance.now();
    const built = await buildAsset(blender, name, opts);
    if (opts.verify) await verifyAsset(blender, name, built, opts);
    report[name] = { budget: built.contract.budget, lods: built.summaries.map(({ nodes: _n, ...s }) => s) };
    console.log(`  done ${ms(t)}`);
  }
  const generatedFiles = readdirSync(P.generated)
    .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
    .map((f) => f.slice(0, -3));
  await writeFormatted(join(P.generated, 'index.ts'), generateIndex(generatedFiles));
  mkdirSync(dirname(P.report), { recursive: true });
  writeFileSync(P.report, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`assets: ${targets.length} built in ${ms(t0)}`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
