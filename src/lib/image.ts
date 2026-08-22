export const DEFAULT_MAX_DIMENSION = 500;
export const DEFAULT_QUALITY = 0.8;
export const MAX_BASE64 = 900 * 1024;

/** Pure helper: compute scaled dimensions preserving aspect ratio within a max dimension. */
export function downscaleDimensions(
  width: number,
  height: number,
  maxDimension = DEFAULT_MAX_DIMENSION,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width, height };
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function readFileAsDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

/**
 * Compress/resize an image (file, blob or data URL) to a JPEG/WebP base64 data
 * URL sized so Convex documents stay well under the 1 MB limit.
 */
export async function compressImage(
  source: File | Blob | string,
  opts: { maxDimension?: number; quality?: number; type?: "image/jpeg" | "image/webp" } = {},
): Promise<string> {
  const maxDimension = opts.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const quality = opts.quality ?? DEFAULT_QUALITY;
  const type = opts.type ?? "image/jpeg";

  const dataUrl =
    typeof source === "string" ? source : await readFileAsDataUrl(source);
  const img = await loadImage(dataUrl);
  const { width, height } = downscaleDimensions(
    img.naturalWidth || img.width,
    img.naturalHeight || img.height,
    maxDimension,
  );

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(img, 0, 0, width, height);
  const compressed = canvas.toDataURL(type, quality);
  if (compressed.length > MAX_BASE64) {
    throw new Error("Image is too large after compression");
  }
  return compressed;
}

/** Build an inline SVG placeholder data URL used when no image is available. */
export function placeholderImage(label: string): string {
  const safe = (label || "W").slice(0, 1).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#e2e8f0"/><text x="200" y="165" font-family="sans-serif" font-size="80" fill="#94a3b8" text-anchor="middle" dominant-baseline="middle">${safe}</text></svg>`;
  // UTF-8 safe base64 (btoa alone throws on non-ASCII labels).
  return `data:image/svg+xml;base64,${btoa(String.fromCharCode(...new TextEncoder().encode(svg)))}`;
}
