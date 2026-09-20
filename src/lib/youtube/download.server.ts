import { createReadStream, statSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { contentDisposition, sanitizeFilename } from "@/lib/format";
import { parseYouTubeInput } from "@/lib/youtube/parse";
import { openInnertubeDownload } from "@/lib/youtube/innertube.server";
import {
  DOWNLOAD_TIMEOUT_MS,
  downloadFileArgs,
  isPresetId,
  runYtDlp,
  ytDlpAvailable,
  type PresetId,
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

function humanizeDownloadError(err: unknown): string {
  const message = err instanceof Error ? err.message : "下载失败";
  const text = message.replace(/\s+/g, " ");
  if (/ENOENT|spawn python/i.test(text)) return "当前环境无法启动下载器，请稍后重试";
  if (/403|Forbidden|non 2xx/i.test(text)) return "YouTube 暂时拒绝取流，请稍后再试";
  if (/not a bot|confirm you|LOGIN_REQUIRED|decipher|evaluator|JavaScript interpreter/i.test(text)) {
    return "YouTube 正在验证流量，请稍等片刻再试";
  }
  if (/unavailable|private/i.test(text)) return "视频不可用或为私密内容";
  return message || "下载失败";
}

async function downloadWithYtDlp(videoId: string, quality: PresetId, title: string, request: Request): Promise<Response> {
  const dir = await mkdtemp(join(tmpdir(), "moxian-"));
  const cleanup = () => {
    void rm(dir, { recursive: true, force: true });
  };
  try {
    const template = join(dir, "%(id)s.%(ext)s");
    await runYtDlp(downloadFileArgs(videoId, quality, template), DOWNLOAD_TIMEOUT_MS);
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
    return fail(humanizeDownloadError(err), 502);
  }
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

  try {
    const media = await openInnertubeDownload(parsed.videoId, rawQ);
    const filename = `${sanitizeFilename(title)}.${media.ext}`;
    const headers: Record<string, string> = {
      "Content-Type": media.contentType,
      "Content-Disposition": contentDisposition(filename),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    };
    if (media.contentLength) headers["Content-Length"] = media.contentLength;
    return new Response(media.body, { status: 200, headers });
  } catch (err) {
    if (ytDlpAvailable()) {
      return downloadWithYtDlp(parsed.videoId, rawQ, title, request);
    }
    return fail(humanizeDownloadError(err), 502);
  }
}
