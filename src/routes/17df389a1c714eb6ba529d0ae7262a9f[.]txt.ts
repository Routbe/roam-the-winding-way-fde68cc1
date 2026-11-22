import { createFileRoute } from "@tanstack/react-router";
import { indexNowKeyFileResponse } from "@/lib/indexnow/indexnow";

/** IndexNow key file (Option 1): https://rout.be/<key>.txt returns exactly the key. */
export const Route = createFileRoute("/17df389a1c714eb6ba529d0ae7262a9f.txt")({
  server: {
    handlers: {
      GET: async () => indexNowKeyFileResponse(),
      HEAD: async () => {
        const res = indexNowKeyFileResponse();
        return new Response(null, { status: res.status, headers: res.headers });
      },
    },
  },
});
