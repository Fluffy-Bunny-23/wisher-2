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
 * URL sized so Convex documents stay well under the 1 MB limit (~900 KB budget).
 *
 * Enforces the budget with a quality + max-dimension fallback loop: tries the
 * requested dimensions first, then progressively lowers JPEG quality and shrinks
 * the long edge until the data URL fits under MAX_BASE64.
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
  const origW = img.naturalWidth || img.width;
  const origH = img.naturalHeight || img.height;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  // Build quality steps from requested quality down to 0.3.
  function qualitySteps(start: number): number[] {
    const clamped = Math.max(0.1, Math.min(1, start));
    const steps: number[] = [];
    for (let q = clamped; q >= 0.32; q = Math.round((q - 0.12) * 100) / 100) {
      steps.push(q);
      if (q <= 0.35) break;
    }
    if (steps[steps.length - 1] !== 0.3) steps.push(0.3);
    return steps;
  }

  // Dimension steps: requested maxDimension, then geometrically smaller.
  const dimSteps: number[] = [];
  {
    let d = maxDimension;
    // Include requested and up to 5 reductions down to ~160px.
    for (let i = 0; i < 6; i++) {
      dimSteps.push(Math.max(160, Math.round(d)));
      if (d <= 160) break;
      d *= 0.72;
    }
  }

  const qs = qualitySteps(quality);

  let smallest: string | null = null;

  for (const dim of dimSteps) {
    const { width, height } = downscaleDimensions(origW, origH, dim);
    canvas.width = width;
    canvas.height = height;
    // Reset any prior scaling state after resize.
    ctx.drawImage(img, 0, 0, width, height);

    for (const q of qs) {
      const compressed = canvas.toDataURL(type, q);
      if (compressed.length <= MAX_BASE64) return compressed;
      if (!smallest || compressed.length < smallest.length) smallest = compressed;
    }
  }

  // As a final guard, if even the smallest rendition is over budget, reject
  // with context so callers can surface a friendly message. The loop above
  // guarantees we already tried minimum dimensions + lowest quality.
  if (smallest && smallest.length <= MAX_BASE64) return smallest;
  throw new Error(
    `Image is too large after compression (${smallest ? smallest.length : 0} chars > ${MAX_BASE64} budget)`,
  );
}

/** Build an inline SVG placeholder data URL used when no image is available. */
export function placeholderImage(label: string): string {
  const safe = (label || "W").slice(0, 1).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#e2e8f0"/><text x="200" y="165" font-family="sans-serif" font-size="80" fill="#94a3b8" text-anchor="middle" dominant-baseline="middle">${safe}</text></svg>`;
  // UTF-8 safe base64 (btoa alone throws on non-ASCII labels).
  return `data:image/svg+xml;base64,${btoa(String.fromCharCode(...new TextEncoder().encode(svg)))}`;
}
