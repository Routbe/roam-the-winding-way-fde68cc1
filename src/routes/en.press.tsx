import { createFileRoute } from "@tanstack/react-router";
import { PressKitPage } from "@/components/press/PressKitPage";
import { pressHead } from "@/lib/press/press-kit";

export const Route = createFileRoute("/en/press")({
  head: () => pressHead("en"),
  component: PressKitRoute,
});

function PressKitRoute() {
  return <PressKitPage locale="en" />;
}
