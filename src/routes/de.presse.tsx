import { createFileRoute } from "@tanstack/react-router";
import { PressKitPage } from "@/components/press/PressKitPage";
import { pressHead } from "@/lib/press/press-kit";

export const Route = createFileRoute("/de/presse")({
  head: () => pressHead("de"),
  component: PressKitRoute,
});

function PressKitRoute() {
  return <PressKitPage locale="de" />;
}
