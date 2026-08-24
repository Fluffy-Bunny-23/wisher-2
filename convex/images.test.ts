import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { parseOgImage } from "./images";

describe("images.parseOgImage", () => {
  it("extracts og:image with property before content", () => {
    const html = `<meta property="og:image" content="https://example.com/img.png" />`;
    expect(parseOgImage(html)).toBe("https://example.com/img.png");
  });

  it("extracts og:image with content before property", () => {
    const html = `<meta content="https://example.com/a.jpg" property="og:image" />`;
    expect(parseOgImage(html)).toBe("https://example.com/a.jpg");
  });

  it("returns null when absent", () => {
    expect(parseOgImage("<html><head></head></html>")).toBeNull();
  });
});

describe("import / export", () => {
  it("imports into a new list and exports it back", async () => {
    const t = convexTest(schema, modules);
    const sarah = t.withIdentity({ name: "Sarah", email: "sarah@example.com", subject: "user-sarah" });
    await sarah.mutation(api.users.storeUser);

    const doc = {
      schemaVersion: 1,
      lists: [
        {
          title: "Travel",
          description: "Gear",
          items: [
            { name: "Backpack", priceMinor: 12000, currency: "USD", purchased: false },
            { name: "Passport holder" },
          ],
        },
      ],
    };

    const res = await sarah.mutation(api.import.importLists, { lists: doc.lists });
    expect(res.created).toBe(1);
    expect(res.importedItems).toBe(2);

    const lists = await sarah.query(api.wishlists.getWishlists);
    expect(lists).toHaveLength(1);
    const exported = await sarah.query(api.export.exportList, { listId: lists[0].id });
    expect(exported.schemaVersion).toBe(1);
    expect(exported.lists[0].title).toBe("Travel");
    expect(exported.lists[0].items).toHaveLength(2);
    expect(exported.lists[0].items[0].priceMinor).toBe(12000);
  });

  it("imports into an existing list and dedupes", async () => {
    const t = convexTest(schema, modules);
    const sarah = t.withIdentity({ name: "Sarah", email: "sarah@example.com", subject: "user-sarah" });
    await sarah.mutation(api.users.storeUser);
    const listId = await sarah.mutation(api.wishlists.createWishlist, { title: "Existing" });
    await sarah.mutation(api.items.addItem, {
      wishlistId: listId,
      item: { name: "Dup", url: "https://example.com/dup" },
    });

    const doc = {
      lists: [
        {
          title: "Ignored",
          items: [
            { name: "Dup", url: "https://example.com/dup" },
            { name: "New", url: "https://example.com/new" },
          ],
        },
      ],
    };

    const res = await sarah.mutation(api.import.importLists, {
      lists: doc.lists,
      targetListId: listId,
      dedupe: true,
    });
    expect(res.created).toBe(0);
    expect(res.importedItems).toBe(1);

    const items = await sarah.query(api.items.listItems, { wishlistId: listId });
    expect(items).toHaveLength(2);
  });
});
import {
  absoluteUrl,
  isAllowedUrl,
  isBlockedHostname,
  isContentLengthAllowed,
  readArrayBufferWithCap,
  readTextWithCap,
  MAX_HTML_BYTES,
  MAX_IMAGE_BYTES,
} from "./images";

describe("images SSRF guards", () => {
  it("blocks metadata IP 169.254.169.254", () => {
    expect(isAllowedUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isAllowedUrl("http://169.254.169.254:80/")).toBe(false);
    expect(isBlockedHostname("169.254.169.254")).toBe(true);
  });

  it("blocks 169.254.0.0/16 more broadly", () => {
    expect(isAllowedUrl("http://169.254.10.20/")).toBe(false);
    expect(isAllowedUrl("http://169.254.0.1/")).toBe(false);
  });

  it("blocks loopback addresses", () => {
    expect(isAllowedUrl("http://127.0.0.1/")).toBe(false);
    expect(isAllowedUrl("http://127.0.0.2/")).toBe(false);
    expect(isAllowedUrl("http://127.1.2.3/")).toBe(false);
    expect(isAllowedUrl("http://localhost/")).toBe(false);
    expect(isAllowedUrl("http://LOCALHOST/")).toBe(false);
    expect(isAllowedUrl("http://foo.localhost/bar")).toBe(false);
    expect(isAllowedUrl("http://[::1]/")).toBe(false);
    expect(isAllowedUrl("http://0.0.0.0/")).toBe(false);
  });

  it("blocks non-canonical IPv4 literals that resolve to private addresses", () => {
    // Integer form: 2130706433 == 127.0.0.1
    expect(isBlockedHostname("2130706433")).toBe(true);
    expect(isAllowedUrl("http://2130706433/")).toBe(false);
    // Hex form: 0x7f000001 == 127.0.0.1
    expect(isBlockedHostname("0x7f000001")).toBe(true);
    expect(isAllowedUrl("http://0x7f000001/")).toBe(false);
    // Octal labels: 0177.0.0.1 == 127.0.0.1 (Number() would misread as 177)
    expect(isBlockedHostname("0177.0.0.1")).toBe(true);
    expect(isAllowedUrl("http://0177.0.0.1/")).toBe(false);
    // Mixed-width shorthand: 127.1 == 127.0.0.1
    expect(isBlockedHostname("127.1")).toBe(true);
    expect(isAllowedUrl("http://127.1/")).toBe(false);
    // Metadata IP in integer form: 2852039166 == 169.254.169.254
    expect(isBlockedHostname("2852039166")).toBe(true);
    expect(isAllowedUrl("http://2852039166/")).toBe(false);
    // Public integer literals must stay allowed: 134744072 == 8.8.8.8
    expect(isBlockedHostname("134744072")).toBe(false);
    expect(isAllowedUrl("http://134744072/")).toBe(true);
  });

  it("blocks IPv4-mapped IPv6 addresses in hex form", () => {
    // ::ffff:a00:1 == ::ffff:10.0.0.1 (no dot in the string)
    expect(isBlockedHostname("::ffff:a00:1")).toBe(true);
    expect(isAllowedUrl("http://[::ffff:a00:1]/")).toBe(false);
    // Dotted-quad tail form stays blocked
    expect(isBlockedHostname("::ffff:10.0.0.1")).toBe(true);
    expect(isAllowedUrl("http://[::ffff:10.0.0.1]/")).toBe(false);
    expect(isAllowedUrl("http://[::ffff:169.254.169.254]/")).toBe(false);
    // Full-form IPv4-mapped loopback
    expect(isBlockedHostname("0:0:0:0:0:ffff:127.0.0.1")).toBe(true);
    // Public mapped address stays allowed: ::ffff:8.8.8.8
    expect(isBlockedHostname("::ffff:808:808")).toBe(false);
    // Plain IPv6 loopback variants
    expect(isBlockedHostname("0:0:0:0:0:0:0:1")).toBe(true);
  });

  it("blocks NAT64 translation prefixes routing to private IPv4", () => {
    // Well-known prefix 64:ff9b::/96 translates the last 32 bits to IPv4.
    expect(isAllowedUrl("http://[64:ff9b::10.0.0.1]/")).toBe(false);
    expect(isAllowedUrl("http://[64:ff9b::169.254.169.254]/")).toBe(false);
    // Same address in hex form (no dot in the string)
    expect(isBlockedHostname("64:ff9b::a00:1")).toBe(true);
    // Local-use variant 64:ff9b:1::/96
    expect(isAllowedUrl("http://[64:ff9b:1::127.0.0.1]/")).toBe(false);
    // Public targets behind the prefix stay allowed
    expect(isAllowedUrl("http://[64:ff9b::8.8.8.8]/")).toBe(true);
    expect(isAllowedUrl("http://[64:ff9b:1::8.8.8.8]/")).toBe(true);
    // Unrelated prefixes sharing a leading 64: must not match
    expect(isAllowedUrl("http://[64:ff9c::10.0.0.1]/")).toBe(true);
  });

  it("strips IPv6 zone IDs before parsing", () => {
    // URL keeps the percent-encoded "%" of link-local zone IDs ("%25" = "%").
    expect(isBlockedHostname("fe80::1%25eth0")).toBe(true);
    expect(isBlockedHostname("fe80::1%25en0")).toBe(true);
    // A zone suffix must not stop an otherwise-blocked address parsing
    expect(isBlockedHostname("::ffff:127.0.0.1%25eth0")).toBe(true);
    // ...and must not make a public host blocked either
    expect(isBlockedHostname("2001:db8::1%25eth0")).toBe(false);
    // This runtime's WHATWG URL parser rejects zone-id literals outright,
    // so isAllowedUrl fails closed on them regardless of the strip above.
    expect(isAllowedUrl("http://[fe80::1%25eth0]/")).toBe(false);
  });

  it("blocks private ranges 10/8, 172.16/12, 192.168/16, fc00::/7, fe80::/10", () => {
    expect(isAllowedUrl("http://10.0.0.1/")).toBe(false);
    expect(isAllowedUrl("http://10.255.255.255/")).toBe(false);
    expect(isAllowedUrl("http://192.168.1.1/")).toBe(false);
    expect(isAllowedUrl("http://172.16.5.4/")).toBe(false);
    expect(isAllowedUrl("http://172.31.255.255/")).toBe(false);
    expect(isAllowedUrl("http://172.32.0.1/")).toBe(true); // outside 172.16/12
    expect(isBlockedHostname("fc00::1")).toBe(true);
    expect(isBlockedHostname("fd00::1")).toBe(true);
    expect(isBlockedHostname("fe80::1")).toBe(true);
  });

  it("blocks non-http schemes", () => {
    expect(isAllowedUrl("ftp://example.com/file")).toBe(false);
    expect(isAllowedUrl("file:///etc/passwd")).toBe(false);
    expect(isAllowedUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedUrl("data:text/plain,hello")).toBe(false);
    expect(isAllowedUrl("gopher://example.com/")).toBe(false);
  });

  it("allows normal https urls", () => {
    expect(isAllowedUrl("https://example.com/")).toBe(true);
    expect(isAllowedUrl("https://cdn.example.com/img.png")).toBe(true);
    expect(isAllowedUrl("http://example.com:8080/path?q=1")).toBe(true);
  });

  it("relative og:image still resolves via absoluteUrl", () => {
    expect(absoluteUrl("https://example.com/page", "/img.png")).toBe("https://example.com/img.png");
    expect(absoluteUrl("https://example.com/a/b", "../img.jpg")).toBe("https://example.com/img.jpg");
    expect(absoluteUrl("https://example.com/a/", "img.jpg")).toBe("https://example.com/a/img.jpg");
    expect(absoluteUrl("https://example.com/page", "https://cdn.example.com/x.png")).toBe(
      "https://cdn.example.com/x.png",
    );
  });
});

describe("images size caps", () => {
  it("rejects content-length exceeding cap", () => {
    expect(isContentLengthAllowed("9999999", MAX_HTML_BYTES)).toBe(false);
    expect(isContentLengthAllowed(String(MAX_HTML_BYTES + 1), MAX_HTML_BYTES)).toBe(false);
    expect(isContentLengthAllowed(String(MAX_HTML_BYTES), MAX_HTML_BYTES)).toBe(true);
    expect(isContentLengthAllowed(null, MAX_HTML_BYTES)).toBe(true);
  });

  it("rejects oversized HTML body via readTextWithCap (header fast-path)", async () => {
    const res = new Response("x", { headers: { "content-length": String(MAX_HTML_BYTES + 1) } });
    expect(await readTextWithCap(res, MAX_HTML_BYTES)).toBeNull();
  });

  it("rejects oversized HTML body via streaming cap", async () => {
    const big = "a".repeat(100);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(big));
        controller.enqueue(new TextEncoder().encode(big));
        controller.close();
      },
    });
    const res = new Response(stream, { headers: { "content-type": "text/html" } });
    // cap smaller than total bytes (200)
    expect(await readTextWithCap(res, 50)).toBeNull();
  });

  it("rejects oversized image body via readArrayBufferWithCap (header fast-path)", async () => {
    const res = new Response(new ArrayBuffer(10), {
      headers: { "content-length": String(MAX_IMAGE_BYTES + 1) },
    });
    expect(await readArrayBufferWithCap(res, MAX_IMAGE_BYTES)).toBeNull();
  });

  it("rejects oversized image body via streaming cap", async () => {
    const chunk = new Uint8Array(60);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(chunk);
        controller.enqueue(chunk);
        controller.close();
      },
    });
    const res = new Response(stream);
    expect(await readArrayBufferWithCap(res, 100)).toBeNull();
  });

  it("accepts body within cap", async () => {
    const res = new Response("hello world");
    expect(await readTextWithCap(res, 100)).toBe("hello world");
    const res2 = new Response(new TextEncoder().encode("hello").buffer as ArrayBuffer);
    const buf = await readArrayBufferWithCap(res2, 100);
    expect(buf).not.toBeNull();
    expect(buf!.byteLength).toBe(5);
  });
});

