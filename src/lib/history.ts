import type { VideoInfo } from "@/lib/youtube/types";

const KEY = "moxian.history.v1";
const LIMIT = 12;

export type HistoryItem = {
  videoId: string;
  title: string;
  author: string;
  thumbnail: string;
  duration: number | null;
  at: number;
};

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadHistory(): HistoryItem[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is HistoryItem => {
      return (
        !!item &&
        typeof item === "object" &&
        typeof (item as HistoryItem).videoId === "string" &&
        typeof (item as HistoryItem).title === "string"
      );
    });
  } catch {
    return [];
  }
}

export function rememberVideo(info: VideoInfo): HistoryItem[] {
  const next: HistoryItem = {
    videoId: info.videoId,
    title: info.title,
    author: info.author,
    thumbnail: info.thumbnail,
    duration: info.duration,
    at: Date.now(),
  };
  const rest = loadHistory().filter((item) => item.videoId !== info.videoId);
  const items = [next, ...rest].slice(0, LIMIT);
  if (canUseStorage()) {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  }
  return items;
}

export function clearHistory(): HistoryItem[] {
  if (canUseStorage()) window.localStorage.removeItem(KEY);
  return [];
}
