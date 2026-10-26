import 'server-only';
import { randomBytes } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { get, put } from '@vercel/blob';
import { sql } from '@/lib/db';

// Uploads go to a *private* Vercel Blob store in production (BLOB_READ_WRITE_TOKEN set), or to
// .data/uploads locally. Either way files are only ever served through /api/files/[id], which
// checks the viewer is allowed to see them; nothing is publicly reachable by URL.

// Vercel functions reject request bodies over 4.5 MB, so uploads are capped just under that.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
const LOCAL_DIR = path.join(process.cwd(), '.data', 'uploads');
const blobConfigured = () => !!process.env.BLOB_READ_WRITE_TOKEN;

export interface StoredFile {
  id: number;
  file_name: string;
  content_type: string;
  size_bytes: number;
  family_id: number | null;
  clinical: boolean;
}

function contentTypeFor(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.toLowerCase().split('.').pop();
  if (ext === 'csv') return 'text/csv';
  if (ext === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (ext === 'pdf') return 'application/pdf';
  return 'application/octet-stream';
}

export async function saveUpload(file: File, opts: { folder: string; familyId?: number | null; uploadedBy: number; clinical?: boolean }): Promise<StoredFile> {
  if (!file || file.size === 0) throw new Error('No file was selected.');
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('That file is too large (4 MB maximum). Try a smaller scan or a photo.');
  const contentType = contentTypeFor(file);
  if (!ALLOWED_TYPES.has(contentType)) throw new Error('Upload a PDF, photo, CSV or Excel file.');

  const safeName = file.name.replace(/[^\w.\- ]+/g, '_').slice(-120) || 'upload';
  const key = `${opts.folder}/${randomBytes(16).toString('hex')}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  let storageKey: string;
  if (blobConfigured()) {
    const blob = await put(key, buffer, { access: 'private', contentType, addRandomSuffix: false });
    storageKey = blob.pathname;
  } else {
    const full = path.join(LOCAL_DIR, key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, buffer);
    storageKey = key;
  }

  const rows = await sql<StoredFile>`
    INSERT INTO files (storage_key, file_name, content_type, size_bytes, family_id, uploaded_by, clinical)
    VALUES (${storageKey}, ${safeName}, ${contentType}, ${file.size}, ${opts.familyId ?? null}, ${opts.uploadedBy}, ${opts.clinical ?? false})
    RETURNING id, file_name, content_type, size_bytes, family_id, clinical
  `;
  return rows[0];
}

export async function getFileRecord(id: number) {
  return (await sql<StoredFile & { storage_key: string }>`SELECT * FROM files WHERE id = ${id}`)[0] ?? null;
}

export async function readStoredFile(storageKey: string): Promise<Buffer> {
  if (blobConfigured()) {
    const result = await get(storageKey, { access: 'private' });
    if (!result || result.statusCode !== 200) throw new Error('File not found in storage.');
    return Buffer.from(await new Response(result.stream).arrayBuffer());
  }
  const full = path.join(LOCAL_DIR, storageKey);
  if (!full.startsWith(LOCAL_DIR)) throw new Error('Invalid path.');
  return readFile(full);
}

/** Pulls an optional single file out of a form submission. */
export function fileFrom(formData: FormData, name: string): File | null {
  const value = formData.get(name);
  return value instanceof File && value.size > 0 ? value : null;
}
