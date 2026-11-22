import { createFileRoute } from "@tanstack/react-router";

/** Per-isolate answer cache: many visitors of one profile cost one database read per 15 s. */
const memo = new Map<string, { at: number; body: unknown }>();
const MEMO_TTL_MS = 15_000;

/** Public, cached live status for a visible profile. Visitors never contact third-party platforms. */
export const Route = createFileRoute("/api_/public/presence/$handle")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { guardRequest } = await import("@/lib/api-guard.server");
        const limited = guardRequest(request, "presence-public", 120, 60000);
        if (limited) return limited;
        const headers = { "cache-control": "public, max-age=15" };
        const handle = params.handle.replace(/^@/, "").slice(0, 64);
        const key = handle.toLowerCase();
        const hit = memo.get(key);
        if (hit && Date.now() - hit.at < MEMO_TTL_MS) return Response.json(hit.body, { headers });
        try {
          const s = await import("@/lib/custom-presence.server");
          const owner = await s.publicPresenceOwner(handle);
          const status = owner ? await s.publicCustomStatus(owner) : null;
          const body = status ? { online: true, status: status.statusText, icon: status.icon, category: status.category, expires_at: status.expiresAt } : { online: false };
          if (memo.size > 1000) memo.clear();
          memo.set(key, { at: Date.now(), body });
          return Response.json(body, { headers });
        } catch (e) {
          console.error("[presence]", e instanceof Error ? e.message : e);
          return Response.json({ online: false }, { headers });
        }
      },
    },
  },
});
