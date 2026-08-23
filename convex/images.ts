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

/**
 * Decode one dotted-quad label in any of the encodings URL parsers accept:
 * decimal ("127"), hex ("0x7f"), or octal with leading zero ("0177").
 * Returns null for anything that isn't purely numeric.
 */
function parseIpLabel(p: string): number | null {
  if (/^0[xX][0-9a-fA-F]+$/.test(p)) {
    const n = parseInt(p.slice(2), 16);
    return Number.isNaN(n) ? null : n;
  }
  if (/^\d+$/.test(p)) {
    // Leading zero means octal in inet_aton-style parsing ("0177" -> 127).
    const n = p.length > 1 && p.startsWith("0")
      ? parseInt(p.slice(1), 8)
      : parseInt(p, 10);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

/**
 * Canonicalize a hostname that is actually an IPv4 literal in non-standard
 * form — "2130706433", "0x7f000001", "0177.0.0.1", "127.1" etc. all resolve
 * to 127.0.0.1. Returns the four address bytes, or null if the host is not a
 * numeric IPv4 literal (i.e. it's a regular domain name).
 */
function parseIPv4Literal(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length === 0 || parts.length > 4) return null;
  const nums: number[] = [];
  for (const p of parts) {
    const n = parseIpLabel(p);
    if (n === null) return null;
    nums.push(n);
  }
  const k = nums.length;
  for (let i = 0; i < k - 1; i++) {
    if (nums[i] < 0 || nums[i] > 255) return null;
  }
  // The final component fills the remaining bytes and may be wider
  // (e.g. "127.1" -> 127.0.0.1, "2130706433" -> 127.0.0.1).
  const lastMax = Math.pow(256, 5 - k) - 1;
  if (nums[k - 1] < 0 || nums[k - 1] > lastMax) return null;
  const bytes = [0, 0, 0, 0];
  let v = nums[k - 1];
  for (let i = 3; i >= 4 - (5 - k); i--) {
    bytes[i] = v % 256;
    v = Math.floor(v / 256);
  }
  for (let i = 0; i < k - 1; i++) bytes[i] = nums[i];
  return bytes;
}

function isPrivateIPv4Bytes(bytes: number[]): boolean {
  const [a, b] = bytes;
  if (a === 0) return true; // 0.0.0.0/8 ("this network")
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 incl. cloud metadata
  return false;
}

/**
 * Expand an IPv6 address into its eight 16-bit groups, handling "::"
 * compression and the trailing dotted-quad form ("::ffff:10.0.0.1").
 * Returns null if the string isn't a syntactically valid IPv6 address.
 */
function parseIPv6(host: string): number[] | null {
  // Peel off a trailing dotted quad first — it occupies the final 32 bits
  // whether or not "::" compression is used. Leading-zero labels ("010")
  // are ambiguous (octal vs decimal across resolvers) and rejected.
  let rest = host;
  let v4TailGroups: string[] = [];
  const quadMatch = /^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(host);
  if (quadMatch) {
    const q = quadMatch[2].split(".");
    if (!q.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255 && (p.length === 1 || p[0] !== "0")))
      return null;
    v4TailGroups = [
      ((Number(q[0]) << 8) | Number(q[1])).toString(16),
      ((Number(q[2]) << 8) | Number(q[3])).toString(16),
    ];
    // Keep the trailing ":" so the colon-split below stays balanced.
    rest = quadMatch[1];
  }

  let head: string, tail: string;
  if (rest.includes("::")) {
    const halves = rest.split("::");
    if (halves.length !== 2) return null; // more than one "::"
    head = halves[0];
    tail = halves[1];
  } else {
    head = rest;
    tail = "";
    // Full form needs 7 colons — only 6 when a dotted quad already occupies
    // the final two groups (e.g. "0:0:0:0:0:ffff:127.0.0.1"), since the
    // peeled quad leaves its separating colon in `rest`.
    const expectedColons = v4TailGroups.length ? 6 : 7;
    if ((head.match(/:/g) ?? []).length !== expectedColons) return null;
  }
  const headGroups =
    head === "" ? [] : head.split(":").filter((g) => g !== "");
  const tailColonGroups =
    tail === "" ? [] : tail.split(":").filter((g) => g !== "");
  const tailGroups = [...tailColonGroups, ...v4TailGroups];
  if ([...headGroups, ...tailColonGroups].some((g) => !/^[0-9a-fA-F]{1,4}$/.test(g))) return null;
  const missing = 8 - headGroups.length - tailGroups.length;
  if (missing < 0) return null;
  if (!rest.includes("::") && missing !== 0) return null;
  const groups = [
    ...headGroups.map((g) => parseInt(g, 16)),
    ...new Array(missing).fill(0),
    ...tailGroups.map((g) => parseInt(g, 16)),
  ];
  return groups;
}

function isPrivateIPv6Groups(groups: number[]): boolean {
  const [g0, g1, g2, g3, g4, g5] = groups;
  const allZeroExceptLast = groups.slice(0, 7).every((g) => g === 0);
  // ::1 loopback and :: unspecified
  if (allZeroExceptLast && (groups[7] === 1 || groups[7] === 0)) return true;
  // IPv4-mapped ::ffff:0:0/96 — evaluate the embedded v4 address
  if (
    g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff
  ) {
    return isPrivateIPv4Bytes([(groups[6] >> 8) & 0xff, groups[6] & 0xff, (groups[7] >> 8) & 0xff, groups[7] & 0xff]);
  }
  // fc00::/7 unique-local
  if (g0 >= 0xfc00 && g0 <= 0xfdff) return true;
  // fe80::/10 link-local
  if (g0 >= 0xfe80 && g0 <= 0xfebf) return true;
  return false;
}

export function isBlockedHostname(hostname: string): boolean {
  // URL.hostname keeps the square brackets on IPv6 literals ("[::1]");
  // strip them so the address parsers below see the bare address.
  const lower = hostname
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^\[(.+)\]$/, "$1");
  if (lower === "localhost" || lower.endsWith(".localhost")) return true;
  // Non-canonical IPv4 literals ("2130706433", "0x7f000001", "0177.0.0.1",
  // "127.1") resolve to the same address as their dotted-decimal form, so
  // they must be canonicalized before the range checks — not treating these
  // specially lets e.g. http://2130706433/ reach 127.0.0.1.
  const v4 = parseIPv4Literal(lower);
  if (v4) return isPrivateIPv4Bytes(v4);
  if (lower.includes(":")) {
    const groups = parseIPv6(lower);
    if (groups) return isPrivateIPv6Groups(groups);
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
