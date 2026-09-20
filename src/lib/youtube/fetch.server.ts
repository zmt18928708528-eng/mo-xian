import type { PlaylistInfo, ResolveResult, VideoInfo } from "./types";
import { parseYouTubeInput, thumbnailUrl } from "./parse";
import { resolveWithYtDlp, ytDlpAvailable } from "./ytdlp.server";

const cache = new Map<string, { expires: number; value: ResolveResult }>();
const TTL_MS = 10 * 60 * 1000;

const DEFAULT_FORMATS: VideoInfo["formats"] = [
  { id: "1080", kind: "video", label: "1080p", note: "高清", ext: "mp4", height: 1080, size: null },
  { id: "720", kind: "video", label: "720p", note: "清晰", ext: "mp4", height: 720, size: null },
  { id: "480", kind: "video", label: "480p", note: "标清", ext: "mp4", height: 480, size: null },
  { id: "360", kind: "video", label: "360p", note: "流畅", ext: "mp4", height: 360, size: null },
  { id: "audio", kind: "audio", label: "音频", note: "m4a / 最佳音质", ext: "m4a", size: null },
];

function cacheGet(key: string): ResolveResult | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(key: string, value: ResolveResult) {
  cache.set(key, { expires: Date.now() + TTL_MS, value });
}

async function oembedVideo(videoId: string): Promise<VideoInfo | null> {
  try {
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    };
    if (!data.title) return null;
    return {
      type: "video",
      videoId,
      title: data.title,
      author: data.author_name || "未知作者",
      duration: null,
      viewCount: null,
      thumbnail: data.thumbnail_url || thumbnailUrl(videoId),
      isLive: false,
      formats: DEFAULT_FORMATS,
    };
  } catch {
    return null;
  }
}

export async function resolveMedia(url: string): Promise<ResolveResult> {
  const parsed = parseYouTubeInput(url);
  if (parsed.type === "invalid") throw new Error(parsed.reason);

  const key = `${parsed.type}:${parsed.type === "video" ? parsed.videoId : parsed.listId}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  if (parsed.type === "video") {
    const meta = await oembedVideo(parsed.videoId);
    if (!meta) {
      throw new Error("找不到这段影像，请确认链接可公开访问");
    }
    cacheSet(key, meta);
    return meta;
  }

  if (!ytDlpAvailable()) {
    throw new Error("暂时无法读取播放列表，请改为粘贴单条视频链接");
  }
  try {
    const result = await resolveWithYtDlp("playlist", parsed.listId);
    cacheSet(key, result);
    return result;
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : "暂时无法读取播放列表");
  }
}

export async function resolveVideoById(videoId: string): Promise<VideoInfo> {
  const result = await resolveMedia(`https://www.youtube.com/watch?v=${videoId}`);
  if (result.type !== "video") throw new Error("不是视频链接");
  return result;
}

export function isPlaylist(result: ResolveResult): result is PlaylistInfo {
  return result.type === "playlist";
}
