import { createFileRoute } from "@tanstack/react-router";
import { HomePage } from "@/components/moxian/home-page";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <HomePage />;
}
