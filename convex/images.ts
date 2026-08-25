import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

import {
  isAllowedUrl,
  isBlockedHostname,
  parseIPv4Literal,
  parseIPv6,
} from "../src/lib/urlGuard";

export { isAllowedUrl, isBlockedHostname } from "../src/lib/urlGuard";

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

// DNS rebinding defense: hostnames that are not literal IPs must also be
// checked after DNS resolution, otherwise evil.example.com -> 169.254.169.254
// bypasses isBlockedHostname. Convex actions don't expose Node's dns module,
// so resolution uses DNS-over-HTTPS (dns.google) which is available via the
// action's fetch. This is a best-effort check-then-fetch guard; TOCTOU
// remains (DNS can change between check and fetch, Host/SNI pinning would
// require fetching the resolved IP literal which breaks TLS cert validation
// for https). Mitigate fully with an egress proxy/allowlist if available
// in the deployment.
async function dohLookup(hostname: string, rrType: "A" | "AAAA"): Promise<string[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    const res = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=${rrType}`,
      {
        headers: { accept: "application/dns-json" },
        signal: controller.signal,
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      Status?: number;
      Answer?: { data: string; type: number }[];
    };
    if (data.Status !== 0) {
      // NXDOMAIN (3) means no such name — no private IP, safe to allow.
      // All other non-zero statuses (SERVFAIL etc.) mean we couldn't verify.
      if (data.Status === 3) return [];
      return null;
    }
    if (!data.Answer) return [];
    const wantType = rrType === "A" ? 1 : 28;
    return data.Answer.filter((a) => a.type === wantType).map((a) => a.data);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveHostnameIps(hostname: string): Promise<string[] | null> {
  // Strip the same decorations isBlockedHostname does, then skip literal IPs
  // (already covered by the synchronous check).
  const stripped = hostname
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^\[(.+)\]$/, "$1");
  const lower = stripped.split("%")[0];
  if (parseIPv4Literal(lower)) return [];
  if (lower.includes(":") && parseIPv6(lower)) return [];
  // Regular domain name — resolve via DoH.
  try {
    const [a, aaaa] = await Promise.all([dohLookup(hostname, "A"), dohLookup(hostname, "AAAA")]);
    if (a === null || aaaa === null) return null;
    return [...a, ...aaaa];
  } catch {
    // Fail closed: if we can't confirm the hostname doesn't resolve to a
    // private address, don't fetch it.
    return null;
  }
}

export async function isAllowedUrlAsync(urlString: string): Promise<boolean> {
  if (!isAllowedUrl(urlString)) return false;
  let hostname: string;
  try {
    hostname = new URL(urlString).hostname;
  } catch {
    return false;
  }
  if (!hostname) return false;
  const ips = await resolveHostnameIps(hostname);
  if (ips === null) return false;
  for (const ip of ips) {
    if (isBlockedHostname(ip)) return false;
  }
  return true;
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
    if (!(await isAllowedUrlAsync(currentUrl))) return null;
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
      if (!(await isAllowedUrlAsync(nextUrl))) return null;
      // Allow https-upgrade hops only; downgrades (https→http) and any other
      // cross-scheme hop stay refused.
      const nextProto = new URL(nextUrl).protocol;
      const curProto = new URL(currentUrl).protocol;
      if (nextProto !== curProto && !(curProto === "http:" && nextProto === "https:")) {
        return null;
      }
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

    // Validate BEFORE fetching (sync literal check + async DNS rebinding check).
    if (!(await isAllowedUrlAsync(item.url))) return;

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
      if (!(await isAllowedUrlAsync(ogUrl))) return;

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
