import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ResolveResult } from "./types";
import { resolveMedia } from "./fetch.server";

export const resolveMediaFn = createServerFn({ method: "POST" })
  .validator(z.object({ url: z.string().min(1).max(500) }))
  .handler(async ({ data }): Promise<ResolveResult> => {
    return resolveMedia(data.url);
  });

export const issueVisitorFn = createServerFn({ method: "POST" }).handler(async () => {
  const { makeVisitorData } = await import("./innertube.server");
  return { visitorData: makeVisitorData() };
});
