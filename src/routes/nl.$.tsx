import { createFileRoute, notFound } from "@tanstack/react-router";

/**
 * /nl/… is the language namespace for explainer and landing pages, never a profile link:
 * an unknown page here is a real 404 instead of "a link of the member @nl".
 */
export const Route = createFileRoute("/nl/$")({
  beforeLoad: () => {
    throw notFound();
  },
});
