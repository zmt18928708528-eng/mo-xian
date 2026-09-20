import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import type { FormatOption, PlaylistInfo, ResolveResult, VideoInfo } from "./types";
import { playlistUrl, thumbnailUrl, watchUrl } from "./parse";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const INFO_TIMEOUT_MS = 40_000;
const DOWNLOAD_TIMEOUT_MS = 180_000;

export const FORMAT_PRESETS = {
  "1080": {
    id: "1080",
    kind: "video" as const,
    label: "1080p",
    note: "高清",
    ext: "mp4",
    height: 1080,
    ytdlp: "bv*[height<=1080]+ba/b[height<=1080]/b",
  },
  "720": {
    id: "720",
    kind: "video" as const,
    label: "720p",
    note: "清晰",
    ext: "mp4",
    height: 720,
    ytdlp: "bv*[height<=720]+ba/b[height<=720]/b",
  },
  "480": {
    id: "480",
    kind: "video" as const,
    label: "480p",
    note: "标清",
    ext: "mp4",
    height: 480,
    ytdlp: "bv*[height<=480]+ba/b[height<=480]/b",
  },
  "360": {
    id: "360",
    kind: "video" as const,
    label: "360p",
    note: "流畅",
    ext: "mp4",
    height: 360,
    ytdlp: "b[height<=360]/bv*[height<=360]+ba/b",
  },
  audio: {
    id: "audio",
    kind: "audio" as const,
    label: "音频",
    note: "最佳音质",
    ext: "m4a",
    ytdlp: "ba[ext=m4a]/ba/b",
  },
} as const;

export type PresetId = keyof typeof FORMAT_PRESETS;

export function isPresetId(value: string): value is PresetId {
  return value in FORMAT_PRESETS;
}

type YtFormat = {
  format_id?: string;
  ext?: string;
  height?: number | null;
  vcodec?: string;
  acodec?: string;
  filesize?: number | null;
  filesize_approx?: number | null;
};

type YtVideo = {
  id?: string;
  title?: string;
  uploader?: string;
  channel?: string;
  duration?: number | null;
  view_count?: number | null;
  thumbnail?: string;
  description?: string;
  live_status?: string;
  formats?: YtFormat[];
  thumbnails?: Array<{ url?: string }>;
  entries?: YtEntry[];
  playlist_count?: number;
  playlist_title?: string;
  _type?: string;
};

type YtEntry = {
  id?: string;
  title?: string;
  uploader?: string;
  duration?: number | null;
  thumbnails?: Array<{ url?: string }>;
};

function pythonBin(): string | null {
  if (existsSync("/usr/local/bin/python3")) return "/usr/local/bin/python3";
  if (existsSync("/usr/bin/python3")) return "/usr/bin/python3";
  return null;
}

function bin(): { cmd: string; prefix: string[] } | null {
  if (existsSync("/usr/local/bin/yt-dlp")) return { cmd: "/usr/local/bin/yt-dlp", prefix: [] };
  if (existsSync("/usr/bin/yt-dlp")) return { cmd: "/usr/bin/yt-dlp", prefix: [] };
  const python = pythonBin();
  if (python) return { cmd: python, prefix: ["-m", "yt_dlp"] };
  return null;
}

export function ytDlpAvailable(): boolean {
  return (
    existsSync("/usr/local/bin/yt-dlp") ||
    existsSync("/usr/bin/yt-dlp") ||
    existsSync("/usr/local/lib/python3.10/dist-packages/yt_dlp") ||
    existsSync("/usr/local/lib/python3.10/site-packages/yt_dlp")
  );
}

function commonArgs(): string[] {
  return [
    "--no-warnings",
    "--no-check-certificates",
    "--socket-timeout",
    "20",
    "--retries",
    "1",
    "--fragment-retries",
    "1",
    "--file-access-retries",
    "1",
    "--user-agent",
    UA,
    "--extractor-args",
    "youtube:player_client=default,ios,tv",
  ];
}

function humanizeError(stderr: string, fallback: string): string {
  const text = stderr.replace(/\s+/g, " ");
  if (/ENOENT|spawn/i.test(text)) {
    return "当前环境无法启动下载器，请稍后重试";
  }
  if (/403: Forbidden|HTTP Error 403/i.test(text)) {
    return "YouTube 暂时拒绝取流，请稍后再试";
  }
  if (/not a bot|confirm you/i.test(text) || /429/.test(text)) {
    return "YouTube 正在验证流量，请稍等片刻再试";
  }
  if (/private video|unavailable|Video unavailable/i.test(text)) {
    return "视频不可用或为私密内容";
  }
  if (/live event will begin|Premieres in/i.test(text)) {
    return "直播或首播尚未开始";
  }
  if (/Sign in to confirm your age|age-restricted/i.test(text)) {
    return "该视频有年龄限制，暂时无法解析";
  }
  if (/Unsupported URL|No video formats/i.test(text)) {
    return "没有找到可下载的格式";
  }
  return fallback;
}

export function runYtDlp(args: string[], timeoutMs: number): Promise<string> {
  const found = bin();
  if (!found) {
    return Promise.reject(new Error("当前环境无法启动下载器，请稍后重试"));
  }
  const { cmd, prefix } = found;
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, [...prefix, ...args], {
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("操作超时，请稍后重试"));
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(humanizeError(err.message || "", "无法启动下载器")));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(humanizeError(stderr || stdout, "解析失败，请检查链接后重试")));
    });
  });
}

function pickThumbnail(raw: YtVideo, videoId: string): string {
  const thumbs = raw.thumbnails ?? [];
  const last = thumbs[thumbs.length - 1]?.url;
  return last || raw.thumbnail || thumbnailUrl(videoId);
}

function noneCodec(value?: string): boolean {
  return !value || value === "none";
}

function buildFormats(raw: YtVideo): FormatOption[] {
  const formats = raw.formats ?? [];
  let maxHeight = 0;
  let hasAudio = false;
  const sizeByHeight = new Map<number, number>();

  for (const format of formats) {
    const height = format.height ?? 0;
    const hasVideo = !noneCodec(format.vcodec);
    const hasSound = !noneCodec(format.acodec);
    if (hasSound) hasAudio = true;
    if (hasVideo && height > maxHeight) maxHeight = height;
    const size = format.filesize ?? format.filesize_approx ?? 0;
    if (hasVideo && height && size) {
      const prev = sizeByHeight.get(height) ?? 0;
      if (size > prev) sizeByHeight.set(height, size);
    }
  }

  const options: FormatOption[] = [];
  const videoPresets = [FORMAT_PRESETS["1080"], FORMAT_PRESETS["720"], FORMAT_PRESETS["480"], FORMAT_PRESETS["360"]];
  for (const preset of videoPresets) {
    if (maxHeight > 0 && preset.height > maxHeight && maxHeight < preset.height - 80) continue;
    const size = sizeByHeight.get(Math.min(preset.height, maxHeight || preset.height)) ?? null;
    options.push({
      id: preset.id,
      kind: "video",
      label: preset.label,
      note: maxHeight > 0 && maxHeight < preset.height ? `最高 ${maxHeight}p` : preset.note,
      ext: preset.ext,
      height: Math.min(preset.height, maxHeight || preset.height),
      size,
    });
  }

  if (options.length === 0) {
    options.push(
      {
        id: "720",
        kind: "video",
        label: "720p",
        note: "清晰",
        ext: "mp4",
        height: 720,
        size: null,
      },
      {
        id: "360",
        kind: "video",
        label: "360p",
        note: "流畅",
        ext: "mp4",
        height: 360,
        size: null,
      },
    );
  }

  if (hasAudio || formats.length === 0) {
    options.push({
      id: "audio",
      kind: "audio",
      label: "音频",
      note: "m4a / 最佳音质",
      ext: "m4a",
      size: null,
    });
  }

  const seen = new Set<string>();
  return options.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function toVideo(raw: YtVideo, fallbackId: string): VideoInfo {
  const videoId = raw.id || fallbackId;
  const live = raw.live_status === "is_live";
  return {
    type: "video",
    videoId,
    title: raw.title || "未命名影像",
    author: raw.uploader || raw.channel || "未知作者",
    duration: typeof raw.duration === "number" ? raw.duration : null,
    viewCount: typeof raw.view_count === "number" ? raw.view_count : null,
    thumbnail: pickThumbnail(raw, videoId),
    description: raw.description?.slice(0, 280),
    isLive: live,
    formats: live ? [] : buildFormats(raw),
  };
}

function toPlaylist(raw: YtVideo, listId: string): PlaylistInfo {
  const entries = (raw.entries ?? [])
    .map((entry) => {
      const videoId = entry.id;
      if (!videoId) return null;
      return {
        videoId,
        title: entry.title || "未命名影像",
        author: entry.uploader,
        duration: typeof entry.duration === "number" ? entry.duration : null,
        thumbnail: entry.thumbnails?.[entry.thumbnails.length - 1]?.url || thumbnailUrl(videoId),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .slice(0, 40);

  return {
    type: "playlist",
    listId,
    title: raw.title || raw.playlist_title || "播放列表",
    author: raw.uploader || raw.channel || "",
    count: raw.playlist_count ?? entries.length,
    thumbnail: entries[0]?.thumbnail || "",
    entries,
  };
}

export async function resolveWithYtDlp(kind: "video" | "playlist", id: string): Promise<ResolveResult> {
  const url = kind === "video" ? watchUrl(id) : playlistUrl(id);
  const args =
    kind === "video"
      ? [...commonArgs(), "--no-playlist", "-J", url]
      : [...commonArgs(), "--flat-playlist", "-J", url];
  const stdout = await runYtDlp(args, INFO_TIMEOUT_MS);
  const start = stdout.indexOf("{");
  if (start < 0) throw new Error("解析失败，请稍后重试");
  const raw = JSON.parse(stdout.slice(start)) as YtVideo;
  if (kind === "playlist" || raw._type === "playlist") {
    return toPlaylist(raw, id);
  }
  const video = toVideo(raw, id);
  if (video.isLive) {
    throw new Error("直播进行中，无法下载");
  }
  return video;
}

export function downloadFileArgs(videoId: string, preset: PresetId, outputTemplate: string): string[] {
  const spec = FORMAT_PRESETS[preset];
  const extra =
    spec.kind === "video"
      ? ["--merge-output-format", "mp4"]
      : [];
  return [
    ...commonArgs(),
    "--no-playlist",
    "--no-part",
    "--newline",
    "-f",
    spec.ytdlp,
    ...extra,
    "-o",
    outputTemplate,
    watchUrl(videoId),
  ];
}

export { DOWNLOAD_TIMEOUT_MS };
