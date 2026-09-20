import { createReadStream, statSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { contentDisposition, sanitizeFilename } from "@/lib/format";
import { parseYouTubeInput } from "@/lib/youtube/parse";
import {
  DOWNLOAD_TIMEOUT_MS,
  downloadFileArgs,
  isPresetId,
  runYtDlp,
} from "@/lib/youtube/ytdlp.server";

const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;

function fail(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "bin";
}

function mimeFor(ext: string): string {
  if (ext === "mp4") return "video/mp4";
  if (ext === "m4a" || ext === "mp3" || ext === "aac") return "audio/mp4";
  if (ext === "webm") return "video/webm";
  if (ext === "opus" || ext === "ogg") return "audio/ogg";
  if (ext === "mkv") return "video/x-matroska";
  return "application/octet-stream";
}

export async function handleDownload(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const rawV = url.searchParams.get("v") ?? "";
  const rawQ = url.searchParams.get("q") ?? "720";
  const title = url.searchParams.get("title") ?? "moxian";

  const parsed = VIDEO_ID.test(rawV)
    ? { type: "video" as const, videoId: rawV }
    : parseYouTubeInput(rawV);
  if (parsed.type !== "video") return fail("缺少有效的视频编号");
  if (!isPresetId(rawQ)) return fail("不支持的画质");

  const dir = await mkdtemp(join(tmpdir(), "moxian-"));
  const cleanup = () => {
    void rm(dir, { recursive: true, force: true });
  };

  try {
    const template = join(dir, "%(id)s.%(ext)s");
    await runYtDlp(downloadFileArgs(parsed.videoId, rawQ, template), DOWNLOAD_TIMEOUT_MS);
    const files = (await readdir(dir)).filter((name) => !name.endsWith(".part"));
    if (files.length === 0) {
      cleanup();
      return fail("没有生成文件", 502);
    }
    const file = files[0] ?? "";
    const filePath = join(dir, file);
    const size = statSync(filePath).size;
    const ext = extOf(file);
    const filename = `${sanitizeFilename(title)}.${ext}`;
    const nodeStream = createReadStream(filePath);
    nodeStream.on("close", cleanup);
    nodeStream.on("error", cleanup);
    request.signal.addEventListener("abort", cleanup);

    const stream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": mimeFor(ext),
        "Content-Length": String(size),
        "Content-Disposition": contentDisposition(filename),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    cleanup();
    const message = err instanceof Error ? err.message : "下载失败";
    return fail(message, 502);
  }
}
