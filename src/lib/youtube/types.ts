export type FormatKind = "video" | "audio";

export type FormatOption = {
  id: string;
  kind: FormatKind;
  label: string;
  note: string;
  ext: string;
  height?: number;
  size?: number | null;
};

export type VideoInfo = {
  type: "video";
  videoId: string;
  title: string;
  author: string;
  duration: number | null;
  viewCount: number | null;
  thumbnail: string;
  description?: string;
  isLive: boolean;
  formats: FormatOption[];
};

export type PlaylistEntry = {
  videoId: string;
  title: string;
  author?: string;
  duration: number | null;
  thumbnail: string;
};

export type PlaylistInfo = {
  type: "playlist";
  listId: string;
  title: string;
  author: string;
  count: number;
  thumbnail: string;
  entries: PlaylistEntry[];
};

export type ResolveResult = VideoInfo | PlaylistInfo;

export type ParsedLink =
  | { type: "video"; videoId: string }
  | { type: "playlist"; listId: string }
  | { type: "invalid"; reason: string };
