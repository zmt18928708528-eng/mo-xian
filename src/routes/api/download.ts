import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/download")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleDownload } = await import("@/lib/youtube/download.server");
        return handleDownload(request);
      },
    },
  },
});
