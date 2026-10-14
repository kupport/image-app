// Shared by the client (early feedback) and the API route (enforcement).

export const ALLOWED_EXTENSIONS = ['jpeg', 'jpg', 'png', 'webp'];
export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const ACCEPT = '.jpeg,.jpg,.png,.webp,image/jpeg,image/png,image/webp';
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_MB = MAX_UPLOAD_BYTES / (1024 * 1024);

/** Returns an error message, or null when the file is acceptable. */
export function validateImageFile(file: { name: string; type: string; size: number }): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  // Some browsers report an empty MIME type, so the extension check is the fallback
  if (!ALLOWED_EXTENSIONS.includes(ext) || (file.type && !ALLOWED_TYPES.includes(file.type))) {
    return 'Unsupported file type. Please upload a JPEG, JPG, PNG or WEBP image.';
  }
  if (file.size === 0) return 'The file is empty.';
  if (file.size > MAX_UPLOAD_BYTES) return `Images must be ${MAX_UPLOAD_MB} MB or smaller.`;
  return null;
}

/** Identifies JPEG/PNG/WEBP by their magic bytes, ignoring the client-supplied name and MIME type. */
export function sniffImageType(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}
