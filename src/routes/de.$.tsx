import { createFileRoute, notFound } from "@tanstack/react-router";

/**
 * /de/… is the language namespace for explainer and landing pages, never a profile link:
 * an unknown page here is a real 404 instead of "a link of the member @de".
 */
export const Route = createFileRoute("/de/$")({
  beforeLoad: () => {
    throw notFound();
  },
});
