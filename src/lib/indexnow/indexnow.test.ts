// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { filterIndexNowUrls, indexNowKeyForEnv, indexNowUrl } from "./indexnow";

const KEY = "17df389a1c714eb6ba529d0ae7262a9f";
const PROD = { INDEXNOW_KEY: KEY, PUBLIC_ORIGIN: "https://rout.be", VERCEL_ENV: "production" };

describe("IndexNow key file", () => {
  it("https://rout.be/<key>.txt returns exactly the key as UTF-8 plain text", async () => {
    const { Route } = await import("@/routes/17df389a1c714eb6ba529d0ae7262a9f[.]txt");
    const handlers = (Route.options as unknown as { server: { handlers: Record<string, () => Promise<Response>> } }).server.handlers;
    const res = await handlers["GET"]!();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await res.text()).toBe(KEY);
  });
});

describe("IndexNow URL privacy", () => {
  it("never submits /u/ profiles, however the path is written", () => {
    for (const path of ["/u/jdelplanche", "/u/@jdelplanche", "/U/jdelplanche", "/%75/jdelplanche", "/nl/../u/x", "/u", "https://rout.be/u/x"]) {
      expect(indexNowUrl(path), path).toBeNull();
    }
  });

  it("never submits /admin, /api or /auth", () => {
    for (const path of ["/admin", "/admin/users", "/api/public/health", "/auth/callback", "/API/x"]) {
      expect(indexNowUrl(path), path).toBeNull();
    }
  });

  it("submits root profiles, workspaces and language landing pages on rout.be only", () => {
    expect(filterIndexNowUrls(["/jdelplanche", "/w/maximilien", "/nl/alternatief-voor-linktree", "/u/x", "https://evil.example/x", "/jdelplanche"])).toEqual([
      "https://rout.be/jdelplanche",
      "https://rout.be/w/maximilien",
      "https://rout.be/nl/alternatief-voor-linktree",
    ]);
  });
});

describe("IndexNow runs only in production", () => {
  it("is off without the key, on preview, on localhost or another origin", () => {
    expect(indexNowKeyForEnv({ PUBLIC_ORIGIN: "https://rout.be" })).toBeNull();
    expect(indexNowKeyForEnv({ ...PROD, VERCEL_ENV: "preview" })).toBeNull();
    expect(indexNowKeyForEnv({ ...PROD, PUBLIC_ORIGIN: "http://localhost:8080" })).toBeNull();
    expect(indexNowKeyForEnv({ ...PROD, PUBLIC_ORIGIN: "https://rout.dlp.li" })).toBeNull();
    expect(indexNowKeyForEnv({ ...PROD, INDEXNOW_KEY: "another-key" })).toBeNull();
    expect(indexNowKeyForEnv(PROD)).toBe(KEY);
  });
});

describe("IndexNow submission", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts host, key, keyLocation and only allowed URLs", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { submitIndexNow } = await import("./indexnow.server");
    const result = await submitIndexNow(["/w/submit-test", "/u/hidden", "/admin"], PROD);
    expect(result).toEqual({ sent: 1, status: 200 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.indexnow.org/IndexNow");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      host: "rout.be",
      key: KEY,
      keyLocation: `https://rout.be/${KEY}.txt`,
      urlList: ["https://rout.be/w/submit-test"],
    });
  });

  it("sends nothing outside production", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { submitIndexNow } = await import("./indexnow.server");
    expect(await submitIndexNow(["/w/preview-test"], { PUBLIC_ORIGIN: "https://rout.be" })).toEqual({ sent: 0, skipped: "disabled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a failing IndexNow never throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("timeout"); }));
    const { submitIndexNow } = await import("./indexnow.server");
    await expect(submitIndexNow(["/w/failing-test"], PROD)).resolves.toEqual({ sent: 0, error: true });
  });
});
