import { createFileRoute } from "@tanstack/react-router";

/** Per-isolate answer cache: many visitors of one profile cost one database read per 10 s. */
const memo = new Map<string, { at: number; body: unknown }>();
const MEMO_TTL_MS = 10_000;

/** Public "Now Playing" for a handle — only when the member opted in. */
export const Route = createFileRoute("/api_/presence/now-playing")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { guardRequest } = await import("@/lib/api-guard.server");
        const limited = guardRequest(request, "now-playing", 120, 60000);
        if (limited) return limited;
        const handle = (new URL(request.url).searchParams.get("handle") ?? "").replace(/^@/, "").slice(0, 64);
        const headers = { "cache-control": "public, max-age=5" };
        if (!handle) return Response.json({ playing: false }, { headers });
        const hit = memo.get(handle.toLowerCase());
        if (hit && Date.now() - hit.at < MEMO_TTL_MS) return Response.json(hit.body, { headers });
        try {
          const s = await import("@/lib/spotify-presence.server");
          if (!s.spotifyConfigured()) return Response.json({ playing: false }, { headers });
          const owner = await s.publicSpotifyOwner(handle);
          const body = owner ? await s.cachedNowPlaying(owner) : { playing: false };
          if (memo.size > 1000) memo.clear();
          memo.set(handle.toLowerCase(), { at: Date.now(), body });
          return Response.json(body, { headers });
        } catch (e) {
          console.error("[now-playing]", e instanceof Error ? e.message : e);
          return Response.json({ playing: false }, { headers });
        }
      },
    },
  },
});
