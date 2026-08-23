/**
 * Evidence object storage behind an adapter. Local mode: filesystem under
 * STORAGE_DIR. Production swaps this module for S3/Supabase storage with
 * short-lived signed URLs — the read path here (authorization check in the
 * artifact route, then stream) mirrors that model.
 */
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { isAbsolute, join, normalize, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';

const BASE = process.env.CT_STORAGE_DIR
  ? resolve(process.env.CT_STORAGE_DIR)
  : resolve(process.cwd(), '../../storage');

export function storageBase(): string {
  return BASE;
}

export async function scanOutputDir(scanId: string): Promise<string> {
  // scanId is generated server-side (uuid); still normalize defensively.
  const dir = join(BASE, 'scans', scanId.replace(/[^a-zA-Z0-9_-]/g, ''));
  await mkdir(dir, { recursive: true });
  return dir;
}

/** Resolve an artifact path inside a scan's directory. Rejects traversal. */
export function resolveArtifact(scanId: string, relPath: string): string | null {
  if (isAbsolute(relPath) || relPath.includes('..') || relPath.includes('\0')) return null;
  const root = join(BASE, 'scans', scanId.replace(/[^a-zA-Z0-9_-]/g, ''));
  const target = normalize(join(root, relPath));
  if (target !== root && !target.startsWith(root + sep)) return null;
  return existsSync(target) ? target : null;
}

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.json': 'application/json',
  '.html': 'text/html; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

export function contentTypeFor(path: string): string {
  const ext = path.slice(path.lastIndexOf('.'));
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

export async function streamArtifact(absPath: string): Promise<Response> {
  const info = await stat(absPath);
  const stream = Readable.toWeb(createReadStream(absPath)) as ReadableStream;
  const isHtml = absPath.endsWith('.html');
  return new Response(stream, {
    headers: {
      'content-type': contentTypeFor(absPath),
      'content-length': String(info.size),
      'cache-control': 'private, max-age=300',
      // Reports render in an isolated context; everything else downloads/inlines safely.
      ...(isHtml ? { 'content-security-policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'" } : {}),
      'x-content-type-options': 'nosniff',
    },
  });
}
