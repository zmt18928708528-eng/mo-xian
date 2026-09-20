import type { ParsedLink } from "./types";

const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;
const HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "youtu.be",
  "www.youtu.be",
  "youtube.googleapis.com",
]);

function asUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    if (/^https?:\/\//i.test(trimmed)) return new URL(trimmed);
    if (trimmed.startsWith("www.") || trimmed.startsWith("youtu") || trimmed.startsWith("m.youtube") || trimmed.startsWith("music.youtube")) {
      return new URL(`https://${trimmed}`);
    }
  } catch {
    return null;
  }
  return null;
}

function video(id: string | null | undefined): ParsedLink | null {
  if (!id) return null;
  const cleaned = id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 11);
  if (VIDEO_ID.test(cleaned)) return { type: "video", videoId: cleaned };
  return null;
}

export function parseYouTubeInput(raw: string): ParsedLink {
  const trimmed = raw.trim();
  if (!trimmed) return { type: "invalid", reason: "请粘贴 YouTube 链接" };

  if (VIDEO_ID.test(trimmed)) return { type: "video", videoId: trimmed };

  const url = asUrl(trimmed);
  if (!url) return { type: "invalid", reason: "无法识别这段链接" };

  const host = url.hostname.toLowerCase();
  if (!HOSTS.has(host)) {
    return { type: "invalid", reason: "请使用 YouTube 链接" };
  }

  const path = url.pathname.replace(/\/+$/, "");
  const segments = path.split("/").filter(Boolean);
  const vParam = url.searchParams.get("v");
  const listParam = url.searchParams.get("list");

  if (host === "youtu.be" || host === "www.youtu.be") {
    const found = video(segments[0]);
    if (found) return found;
  }

  const kind = segments[0];
  if (kind === "watch" || kind === "watch.html") {
    const found = video(vParam) ?? video(segments[1]);
    if (found) return found;
  }
  if (kind === "shorts" || kind === "embed" || kind === "live" || kind === "v" || kind === "e") {
    const found = video(segments[1]);
    if (found) return found;
  }
  if (kind === "playlist") {
    if (listParam) return { type: "playlist", listId: listParam };
  }
  if (vParam) {
    const found = video(vParam);
    if (found) return found;
  }
  if (listParam) return { type: "playlist", listId: listParam };

  return { type: "invalid", reason: "链接里没有找到视频" };
}

export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function playlistUrl(listId: string): string {
  return `https://www.youtube.com/playlist?list=${listId}`;
}

export function thumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export const EXAMPLE_VIDEO = {
  id: "jNQXAC9IVRw",
  url: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
  label: "试用：YouTube 上的第一条影像",
};
