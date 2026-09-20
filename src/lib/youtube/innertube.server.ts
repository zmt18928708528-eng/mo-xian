import { Innertube, Platform } from "youtubei.js";
import type { PresetId } from "./ytdlp.server";

const CLIENTS = ["ANDROID", "IOS", "MWEB"] as const;
type YtClient = (typeof CLIENTS)[number];

const UA: Record<YtClient, string> = {
  ANDROID: "com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip",
  IOS: "com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X;)",
  MWEB: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
};

Platform.shim.eval = async (data) => new Function(data.output)();

let tubePromise: Promise<Innertube> | null = null;

function getTube(): Promise<Innertube> {
  tubePromise ??= Innertube.create({
    generate_session_locally: true,
    retrieve_player: true,
    enable_session_cache: false,
  }).catch((err: unknown) => {
    tubePromise = null;
    throw err;
  });
  return tubePromise;
}

type LooseFormat = {
  itag?: number;
  url?: string;
  signature_cipher?: string;
  cipher?: string;
  height?: number;
  bitrate?: number;
  mime_type?: string;
  has_audio?: boolean;
  has_video?: boolean;
  audio_quality?: string;
  quality_label?: string;
  content_length?: number | string;
  decipher?: (player: unknown) => string | Promise<string>;
};

function mimeOf(format: LooseFormat): string {
  return String(format.mime_type || "");
}

function hasUrl(format: LooseFormat): boolean {
  return Boolean(format.url || format.signature_cipher || format.cipher);
}

function pickFormat(
  info: { streaming_data?: { formats?: LooseFormat[]; adaptive_formats?: LooseFormat[] } },
  preset: PresetId,
): LooseFormat | null {
  const muxed = (info.streaming_data?.formats ?? []).filter(hasUrl);
  const adaptive = (info.streaming_data?.adaptive_formats ?? []).filter(hasUrl);

  if (preset === "audio") {
    const audio = [...adaptive, ...muxed].filter((f) => mimeOf(f).startsWith("audio/") || f.has_audio);
    const m4a = audio.filter((f) => mimeOf(f).includes("audio/mp4"));
    const pool = m4a.length ? m4a : audio;
    pool.sort((a, b) => (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0));
    return pool[0] ?? null;
  }

  const cap = Number(preset) || 720;
  const ranked = muxed
    .filter((f) => mimeOf(f).includes("video/") || f.has_video)
    .sort((a, b) => (Number(b.height) || 0) - (Number(a.height) || 0));
  const fit = ranked.find((f) => (Number(f.height) || 0) <= cap);
  return fit ?? ranked[ranked.length - 1] ?? ranked[0] ?? null;
}

async function resolveUrl(format: LooseFormat, player: unknown): Promise<string> {
  if (typeof format.decipher === "function" && player) {
    const out = await format.decipher(player);
    if (out) return out;
  }
  if (format.url) return format.url;
  throw new Error("没有可用的取流地址");
}

export async function openInnertubeDownload(
  videoId: string,
  preset: PresetId,
): Promise<{ body: ReadableStream<Uint8Array>; ext: string; contentType: string; contentLength: string | null }> {
  const yt = await getTube();
  let last = "暂时无法下载，请稍后重试";

  for (const client of CLIENTS) {
    try {
      const info = await yt.getBasicInfo(videoId, { client });
      const status = info.playability_status?.status;
      if (status && status !== "OK") {
        last = info.playability_status?.reason || "视频不可播放";
        continue;
      }
      const format = pickFormat(info as never, preset);
      if (!format) {
        last = "没有找到可下载的格式";
        continue;
      }
      const mediaUrl = await resolveUrl(format, yt.session.player);
      const upstream = await fetch(mediaUrl, {
        headers: {
          "User-Agent": UA[client],
          Accept: "*/*",
          Referer: "https://www.youtube.com/",
          Origin: "https://www.youtube.com",
        },
        redirect: "follow",
      });
      if (!upstream.ok || !upstream.body) {
        last = upstream.status === 403 ? "YouTube 暂时拒绝取流，请稍后再试" : "取流失败，请稍后重试";
        continue;
      }
      const audio = preset === "audio";
      const ext = audio ? "m4a" : "mp4";
      const contentType = upstream.headers.get("content-type") || (audio ? "audio/mp4" : "video/mp4");
      return {
        body: upstream.body,
        ext,
        contentType,
        contentLength: upstream.headers.get("content-length"),
      };
    } catch (err) {
      last = err instanceof Error && err.message ? err.message : last;
    }
  }

  throw new Error(last);
}
