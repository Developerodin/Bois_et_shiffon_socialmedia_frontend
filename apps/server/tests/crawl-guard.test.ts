import { describe, expect, it } from "vitest";
import { assertPublicUrl, extractPage, isPrivateAddress, parseRobots } from "@/server/research/crawl";

describe("SSRF guard", () => {
  it("flags private, loopback, link-local and metadata addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "100.64.0.1", "::ffff:7f00:1", "::ffff:a9fe:a9fe", "::7f00:1", "64:ff9b::a00:1", "2002:7f00:1::"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "151.101.1.1", "2606:4700::1111", "::ffff:808:808"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it("rejects non-http schemes, credentials, odd ports and private hosts", async () => {
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toThrow();
    await expect(assertPublicUrl("https://user:pw@example.com")).rejects.toThrow();
    await expect(assertPublicUrl("http://example.com:8080")).rejects.toThrow();
    await expect(assertPublicUrl("http://127.0.0.1/")).rejects.toThrow();
    await expect(assertPublicUrl("http://[::1]/")).rejects.toThrow();
    await expect(assertPublicUrl("http://[::ffff:127.0.0.1]/")).rejects.toThrow(); // URL turns this into [::ffff:7f00:1]
    await expect(assertPublicUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow();
  });
});

describe("robots + extraction", () => {
  it("reads Disallow rules for User-agent * only", () => {
    const rules = parseRobots("User-agent: Googlebot\nDisallow: /g\n\nUser-agent: *\nDisallow: /cart\nDisallow: /account # private\n");
    expect(rules).toEqual(["/cart", "/account"]);
  });

  it("extracts title, text and same-origin links without scripts", () => {
    const page = extractPage(
      `<html><head><title>Bois &amp; Chiffons</title><script>alert(1)</script></head>
       <body><h1>Tables</h1><p>Chêne massif</p><a href="/collections/tables">x</a><a href="https://other.com/y">y</a><a href="/img.jpg">i</a></body></html>`,
      new URL("https://shop.example/"),
    );
    expect(page.title).toBe("Bois & Chiffons");
    expect(page.text).toContain("Chêne massif");
    expect(page.text).not.toContain("alert");
    expect(page.links).toEqual(["https://shop.example/collections/tables"]);
  });
});
