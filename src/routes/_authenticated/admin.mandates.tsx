import { createFileRoute } from "@tanstack/react-router";
import { AdminTrustReviews } from "@/components/admin/AdminTrustReviews";

export const Route = createFileRoute("/_authenticated/admin/mandates")({
  head: () => ({
    meta: [
      { title: "Volmachten & bewijsstukken | ROUT Admin" },
      { name: "description", content: "Beoordeel KBO-uittreksels en andere bewijsstukken voor organisatieverificatie." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Volmachten & bewijsstukken | ROUT Admin" },
      { property: "og:description", content: "Beoordeel KBO-uittreksels en andere bewijsstukken voor organisatieverificatie." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminTrustReviews,
});
