import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

export const MAX_BASE64 = 900 * 1024;
export const MAX_HTML_BYTES = 512 * 1024;
export const MAX_IMAGE_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 3;
const HTML_TIMEOUT_MS = 8000;
const IMAGE_TIMEOUT_MS = 10000;

/** Extract the og:image URL from an HTML string, if present. */
export function parseOgImage(html: string): string | null {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+property=["']og:image:url["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image:url["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) return m[1].trim();
  }
  return null;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

function toDataUrl(bytes: ArrayBuffer, contentType: string): string {
  const base64 = arrayBufferToBase64(bytes);
  return `data:${contentType};base64,${base64}`;
}

export function absoluteUrl(base: string, maybeRelative: string): string | null {
  try {
    return new URL(maybeRelative, base).href;
  } catch {
    return null;
  }
}

// ---------- SSRF guards ----------

function isIPv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return false;
    const n = Number(p);
    if (n < 0 || n > 255) return false;
  }
  return true;
}

function isIPv6Loopback(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "::1") return true;
  if (h === "0:0:0:0:0:0:0:1") return true;
  // compressed zeros variations that still equal ::1 (e.g. 0::1)
  // Normalize: expand and compare; simple check for common forms
  if (h === "0::1" || h === "::0001" || h === "0000:0000:0000:0000:0000:0000:0000:0001") return true;
  return false;
}

function isPrivateIPv6(host: string): boolean {
  const lower = host.toLowerCase();
  // fc00::/7  -> fc00 - fdff  (first byte fc or fd)
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  // fe80::/10 -> fe80 - febf  (fe8*, fe9*, fea*, feb*)
  if (
    lower.startsWith("fe8") ||
    lower.startsWith("fe9") ||
    lower.startsWith("fea") ||
    lower.startsWith("feb")
  )
    return true;
  return false;
}

export function isBlockedHostname(hostname: string): boolean {
  // URL.hostname keeps the square brackets on IPv6 literals ("[::1]");
  // strip them so the IPv6 range checks below see the bare address.
  const lower = hostname
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^\[(.+)\]$/, "$1");
  if (lower === "localhost" || lower.endsWith(".localhost")) return true;
  if (lower === "0.0.0.0") return true;
  if (isIPv4(lower)) {
    const parts = lower.split(".").map(Number);
    const [a, b] = parts;
    if (a === 127) return true; // 127.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 169 && b === 254) return true; // 169.254.0.0/16
    return false;
  }
  if (lower.includes(":")) {
    if (isIPv6Loopback(lower)) return true;
    if (isPrivateIPv6(lower)) return true;
    // Embedded IPv4 in IPv6 e.g. ::ffff:192.168.1.1
    if (lower.includes(".")) {
      const last = lower.split(":").pop() ?? "";
      if (isIPv4(last)) {
        const parts = last.split(".").map(Number);
        const [a, b] = parts;
        if (a === 127) return true;
        if (a === 10) return true;
        if (a === 192 && b === 168) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 169 && b === 254) return true;
        if (a === 0 && last === "0.0.0.0") return true;
      }
    }
  }
  return false;
}

export function isAllowedUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const hostname = url.hostname;
    if (!hostname) return false;
    if (isBlockedHostname(hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

export function isContentLengthAllowed(
  contentLengthHeader: string | null,
  maxBytes: number,
): boolean {
  if (contentLengthHeader == null) return true;
  const n = Number.parseInt(contentLengthHeader, 10);
  if (Number.isNaN(n)) return true;
  return n <= maxBytes;
}

export async function readTextWithCap(
  res: Response,
  maxBytes: number,
): Promise<string | null> {
  if (!isContentLengthAllowed(res.headers.get("content-length"), maxBytes)) return null;
  // Prefer streaming to enforce cap.
  const body = res.body;
  if (!body) {
    const text = await res.text();
    const len = new TextEncoder().encode(text).length;
    if (len > maxBytes) return null;
    return text;
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        received += value.length;
        if (received > maxBytes) {
          try {
            await reader.cancel();
          } catch {}
          return null;
        }
        chunks.push(value);
      }
    }
  } catch {
    try {
      await reader.cancel();
    } catch {}
    return null;
  }
  const merged = new Uint8Array(received);
  let off = 0;
  for (const c of chunks) {
    merged.set(c, off);
    off += c.length;
  }
  return new TextDecoder().decode(merged);
}

export async function readArrayBufferWithCap(
  res: Response,
  maxBytes: number,
): Promise<ArrayBuffer | null> {
  if (!isContentLengthAllowed(res.headers.get("content-length"), maxBytes)) return null;
  const body = res.body;
  if (!body) {
    const buf = await res.arrayBuffer();
    if (buf.byteLength > maxBytes) return null;
    return buf;
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        received += value.length;
        if (received > maxBytes) {
          try {
            await reader.cancel();
          } catch {}
          return null;
        }
        chunks.push(value);
      }
    }
  } catch {
    try {
      await reader.cancel();
    } catch {}
    return null;
  }
  const merged = new Uint8Array(received);
  let off = 0;
  for (const c of chunks) {
    merged.set(c, off);
    off += c.length;
  }
  // Return a clean ArrayBuffer
  return merged.buffer.slice(merged.byteOffset, merged.byteOffset + merged.byteLength) as ArrayBuffer;
}

async function fetchWithManualRedirect(
  initialUrl: string,
  timeoutMs: number,
  headers: Record<string, string>,
): Promise<{ res: Response; finalUrl: string } | null> {
  let currentUrl = initialUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isAllowedUrl(currentUrl)) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(currentUrl, {
        signal: controller.signal,
        headers,
        redirect: "manual",
      });
    } catch {
      clearTimeout(timer);
      return null;
    }
    clearTimeout(timer);

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return null;
      let nextUrl: string;
      try {
        nextUrl = new URL(location, currentUrl).href;
      } catch {
        return null;
      }
      if (!isAllowedUrl(nextUrl)) return null;
      if (new URL(nextUrl).protocol !== new URL(currentUrl).protocol) return null;
      if (hop === MAX_REDIRECTS) return null;
      currentUrl = nextUrl;
      continue;
    }

    if (!res.ok) return null;
    return { res, finalUrl: currentUrl };
  }
  return null;
}

export const fetchOgImage = internalAction({
  args: { itemId: v.id("items") },
  handler: async (ctx, args) => {
    const item = await ctx.runQuery(internal.items.getById, { itemId: args.itemId });
    if (!item) return;
    if (item.image) return; // explicit image already set
    if (!item.url) return;

    // Validate BEFORE fetching.
    if (!isAllowedUrl(item.url)) return;

    try {
      const htmlResult = await fetchWithManualRedirect(item.url, HTML_TIMEOUT_MS, {
        "user-agent": "Mozilla/5.0 (compatible; Wisher/1.0)",
      });
      if (!htmlResult) return;
      const html = await readTextWithCap(htmlResult.res, MAX_HTML_BYTES);
      if (html == null) return;

      const ogUrlRaw = parseOgImage(html);
      if (!ogUrlRaw) return;
      const ogUrl = absoluteUrl(htmlResult.finalUrl, ogUrlRaw);
      if (!ogUrl) return;
      if (!isAllowedUrl(ogUrl)) return;

      const imgResult = await fetchWithManualRedirect(ogUrl, IMAGE_TIMEOUT_MS, {});
      if (!imgResult) return;

      const buffer = await readArrayBufferWithCap(imgResult.res, MAX_IMAGE_BYTES);
      if (buffer == null) return;

      const contentType = (imgResult.res.headers.get("content-type") || "image/jpeg").split(";")[0].trim() || "image/jpeg";
      const dataUrl = toDataUrl(buffer, contentType);

      if (dataUrl.length > MAX_BASE64) return; // too large; keep placeholder

      await ctx.runMutation(internal.items.setFetchedImage, {
        itemId: args.itemId,
        image: dataUrl,
      });
    } catch {
      // Graceful: leave image unset so a placeholder is shown.
    }
  },
});
