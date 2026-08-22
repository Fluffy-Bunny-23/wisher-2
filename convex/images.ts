import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

export const MAX_BASE64 = 900 * 1024;

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

function absoluteUrl(base: string, maybeRelative: string): string | null {
  try {
    return new URL(maybeRelative, base).href;
  } catch {
    return null;
  }
}

export const fetchOgImage = internalAction({
  args: { itemId: v.id("items") },
  handler: async (ctx, args) => {
    const item = await ctx.runQuery(internal.items.getById, { itemId: args.itemId });
    if (!item) return;
    if (item.image) return; // explicit image already set
    if (!item.url) return;

    try {
      const htmlController = new AbortController();
      const htmlTimer = setTimeout(() => htmlController.abort(), 8000);
      const htmlRes = await fetch(item.url, {
        signal: htmlController.signal,
        headers: { "user-agent": "Mozilla/5.0 (compatible; Wisher/1.0)" },
        redirect: "follow",
      });
      clearTimeout(htmlTimer);
      if (!htmlRes.ok) return;
      const html = await htmlRes.text();
      const ogUrlRaw = parseOgImage(html);
      if (!ogUrlRaw) return;
      const ogUrl = absoluteUrl(item.url, ogUrlRaw);
      if (!ogUrl) return;

      const imgController = new AbortController();
      const imgTimer = setTimeout(() => imgController.abort(), 10000);
      const imgRes = await fetch(ogUrl, { signal: imgController.signal });
      clearTimeout(imgTimer);
      if (!imgRes.ok) return;

      const buffer = await imgRes.arrayBuffer();
      const contentType = (imgRes.headers.get("content-type") || "image/jpeg").split(";")[0];
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
