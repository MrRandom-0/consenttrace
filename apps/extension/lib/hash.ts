/**
 * WebCrypto hashing. Produces the same `sha256:` truncated format as
 * @consenttrace/evidence so extension and cloud evidence are comparable.
 * Raw cookie/storage values are hashed immediately and never persisted.
 */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function valueHash(raw: string): Promise<string> {
  return 'sha256:' + (await sha256Hex(raw)).slice(0, 24);
}
