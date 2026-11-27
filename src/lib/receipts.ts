/**
 * Receipt photos for expenses. Stored in a private Supabase Storage bucket,
 * one folder per user (<user id>/<random>.jpg). Photos are shrunk on the phone
 * first (max 1600 px, JPEG) so uploads are quick on mobile data.
 */
import { supabase } from './supabase';

const BUCKET = 'receipts';
export const receiptsAvailable = !!supabase;

/** Shrink a photo to at most `max` px on the long side, as JPEG. Falls back to the original file. */
export async function shrink(file: File, max = 1600): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.82));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

/** Upload a receipt photo. Returns its path, to keep on the expense. */
export async function uploadReceipt(file: File): Promise<string> {
  if (!supabase) throw new Error('Receipts need an account');
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) throw new Error('Sign in to add receipts');
  const blob = await shrink(file);
  const type = blob.type || 'image/jpeg';
  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${uid}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: type, upsert: false });
  if (error) throw new Error(navigator.onLine ? "Couldn't upload the photo. Try again." : "You're offline — add the photo when you're back online.");
  return path;
}

const cache = new Map<string, { url: string; until: number }>();
/** A short-lived link to view a receipt (only you can create it). */
export async function receiptUrl(path: string): Promise<string | null> {
  const hit = cache.get(path);
  if (hit && hit.until > Date.now()) return hit.url;
  if (!supabase) return null;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (!data?.signedUrl) return null;
  cache.set(path, { url: data.signedUrl, until: Date.now() + 50 * 60_000 });
  return data.signedUrl;
}

/** Delete a receipt photo (best effort). */
export async function removeReceipt(path?: string) {
  if (!path || !supabase) return;
  cache.delete(path);
  await supabase.storage.from(BUCKET).remove([path]).then(
    () => undefined,
    () => undefined,
  );
}

/** "27 Nov, 3:15 pm" */
export const stamp = (ms: number) =>
  new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).replace(/\b(am|pm)\b/i, (m) => m.toLowerCase());

/** "3:15 pm" */
export const clock = (ms: number) => new Date(ms).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
