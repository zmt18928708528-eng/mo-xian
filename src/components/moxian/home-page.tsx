import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  ClipboardPaste,
  Download,
  Eraser,
  Link2,
  ListMusic,
  LoaderCircle,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { BrushLine } from "@/components/moxian/brush-line";
import { InkField } from "@/components/moxian/ink-field";
import { SealMark } from "@/components/moxian/seal";
import { formatBytes, formatCount, formatDuration, sanitizeFilename } from "@/lib/format";
import { clearHistory, loadHistory, rememberVideo, type HistoryItem } from "@/lib/history";
import { issueVisitorFn, resolveMediaFn } from "@/lib/youtube/actions";
import { mintPoTokens } from "@/lib/youtube/browser-pot";
import { EXAMPLE_VIDEO, parseYouTubeInput, watchUrl } from "@/lib/youtube/parse";
import type { FormatOption, PlaylistInfo, ResolveResult, VideoInfo } from "@/lib/youtube/types";
import { cn } from "@/lib/utils";

function errorText(err: unknown): string {
  if (err instanceof Error && err.message) {
    const msg = err.message.replace(/^Server function[^:]*:\s*/i, "");
    return msg || "解析失败，请稍后重试";
  }
  if (typeof err === "string" && err) return err;
  return "解析失败，请稍后重试";
}

export function HomePage() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ResolveResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [tab, setTab] = useState<"video" | "audio">("video");
  const [downloading, setDownloading] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  async function resolve(raw: string) {
    const parsed = parseYouTubeInput(raw);
    if (parsed.type === "invalid") {
      setError(parsed.reason);
      setResult(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await resolveMediaFn({ data: { url: raw } });
      setResult(data);
      setTab("video");
      if (data.type === "video") {
        setHistory(rememberVideo(data));
      }
    } catch (err) {
      setResult(null);
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void resolve(url);
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        toast.error("剪贴板是空的");
        return;
      }
      setUrl(text.trim());
      void resolve(text.trim());
    } catch {
      toast.error("无法读取剪贴板，请直接粘贴");
    }
  }

  async function downloadFormat(info: VideoInfo, format: FormatOption) {
    setDownloading(format.id);
    setProgress(null);
    try {
      const params = new URLSearchParams({
        v: info.videoId,
        q: format.id,
        title: info.title,
      });
      try {
        const { visitorData } = await issueVisitorFn();
        const tokens = await mintPoTokens(visitorData, info.videoId);
        params.set("visitor", visitorData);
        params.set("vpo", tokens.visitorPo);
        params.set("cpo", tokens.contentPo);
      } catch {
        /* 浏览器验证失败时仍尝试服务端取流 */
      }
      const response = await fetch(`/api/download?${params.toString()}`);
      if (!response.ok) {
        let message = "下载失败";
        try {
          const body = (await response.json()) as { error?: string };
          if (body.error) message = body.error;
        } catch {
          /* ignore */
        }
        throw new Error(message);
      }
      const total = Number(response.headers.get("content-length") || 0);
      if (!response.body) throw new Error("空的下载流");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.byteLength;
        if (total > 0) setProgress(Math.min(99, Math.round((received / total) * 100)));
      }
      const blob = new Blob(chunks as BlobPart[], { type: response.headers.get("content-type") || undefined });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `${sanitizeFilename(info.title)}.${format.ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
      toast.success("已保存到本地");
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setDownloading(null);
      setProgress(null);
    }
  }

  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <InkField />
      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 pb-16 pt-6 sm:px-8 sm:pt-10">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <SealMark />
            <div>
              <p className="font-display text-lg leading-none text-fg">墨线</p>
              <p className="mt-1 text-xs tracking-[0.28em] text-subtle">MO XIAN</p>
            </div>
          </div>
          <p className="hidden text-xs text-subtle sm:block">仅下载你拥有权利的内容</p>
        </header>

        <section className="stagger-in mt-14 sm:mt-20">
          <p className="text-xs tracking-[0.32em] text-muted">一纸墨线 · 取影成章</p>
          <h1 className="mt-4 font-display text-3xl font-medium text-fg">
            把链接落成
            <br className="sm:hidden" />
            可带走的影像
          </h1>
          <BrushLine className="mt-5 h-3 w-48 text-seal/80" />
          <p className="mt-5 max-w-md text-sm text-muted">
            粘贴 YouTube 链接，选取画质或音频，墨线替你收束到本地。支持视频、Shorts 与播放列表。
          </p>
        </section>

        <form onSubmit={onSubmit} className="mt-10 rounded-xl border border-border bg-surface p-3 sm:p-4">
          <label htmlFor="yt-url" className="sr-only">
            YouTube 链接
          </label>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
              <Input
                id="yt-url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="粘贴 youtube.com / youtu.be 链接"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                className="pl-10"
                name="url"
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1 sm:flex-none"
                onClick={() => void pasteFromClipboard()}
              >
                <ClipboardPaste />
                粘贴
              </Button>
              <Button type="submit" className="flex-1 sm:min-w-28 sm:flex-none" disabled={busy}>
                {busy ? <LoaderCircle className="animate-spin" /> : null}
                {busy ? "解析中" : "解析"}
              </Button>
            </div>
          </div>
          <button
            type="button"
            className="mt-3 text-left text-xs text-muted underline-offset-4 transition-colors duration-[var(--motion-quick)] hover:text-fg hover:underline"
            onClick={() => {
              setUrl(EXAMPLE_VIDEO.url);
              void resolve(EXAMPLE_VIDEO.url);
            }}
          >
            {EXAMPLE_VIDEO.label}
          </button>
        </form>

        <div className="mt-8 flex-1">
          {busy ? <ResultSkeleton /> : null}
          {!busy && error ? <ErrorPanel message={error} /> : null}
          {!busy && result?.type === "video" ? (
            <VideoCard
              info={result}
              tab={tab}
              onTab={setTab}
              downloading={downloading}
              progress={progress}
              onDownload={(format) => void downloadFormat(result, format)}
            />
          ) : null}
          {!busy && result?.type === "playlist" ? (
            <PlaylistCard
              info={result}
              onPick={(videoId) => {
                const next = watchUrl(videoId);
                setUrl(next);
                void resolve(next);
              }}
            />
          ) : null}
        </div>

        <HistorySection
          items={history}
          onPick={(item) => {
            const next = watchUrl(item.videoId);
            setUrl(next);
            void resolve(next);
          }}
          onClear={() => setHistory(clearHistory())}
        />

        <footer className="mt-12 border-t border-border pt-6 text-xs leading-relaxed text-subtle">
          墨线是取影工具，不隶属 YouTube。请遵守服务条款与当地法律，只下载你拥有权利、获授权或法律允许的内容。
        </footer>
      </div>
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-seal/30 bg-seal/10 px-5 py-4 text-sm text-fg">
      <p className="font-medium text-seal">未能落墨</p>
      <p className="mt-1 text-muted">{message}</p>
    </div>
  );
}

function ResultSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <Skeleton className="aspect-video w-full rounded-none" />
      <div className="space-y-3 p-5">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/3" />
        <div className="flex gap-2 pt-2">
          <Skeleton className="h-11 flex-1" />
          <Skeleton className="h-11 flex-1" />
        </div>
      </div>
    </div>
  );
}

function VideoCard({
  info,
  tab,
  onTab,
  downloading,
  progress,
  onDownload,
}: {
  info: VideoInfo;
  tab: "video" | "audio";
  onTab: (tab: "video" | "audio") => void;
  downloading: string | null;
  progress: number | null;
  onDownload: (format: FormatOption) => void;
}) {
  const videoFormats = useMemo(() => info.formats.filter((item) => item.kind === "video"), [info.formats]);
  const audioFormats = useMemo(() => info.formats.filter((item) => item.kind === "audio"), [info.formats]);
  const shown = tab === "video" ? videoFormats : audioFormats;

  return (
    <article className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="relative aspect-video overflow-hidden bg-surface-2">
        <img
          src={info.thumbnail}
          alt=""
          className="size-full object-cover"
          referrerPolicy="no-referrer"
        />
        {info.duration != null ? (
          <span className="absolute bottom-3 right-3 rounded-sm bg-bg/80 px-2 py-0.5 font-mono text-xs tabular-nums text-fg">
            {formatDuration(info.duration)}
          </span>
        ) : null}
      </div>
      <div className="p-5 sm:p-6">
        <h2 className="font-display text-xl font-medium leading-snug text-fg">{info.title}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          <span>{info.author}</span>
          {info.viewCount != null ? <span>{formatCount(info.viewCount)} 次观看</span> : null}
        </div>

        <div className="mt-6 inline-flex rounded-lg bg-bg p-1">
          <TabButton active={tab === "video"} onClick={() => onTab("video")} icon={<Download className="size-3.5" />}>
            影像
          </TabButton>
          <TabButton active={tab === "audio"} onClick={() => onTab("audio")} icon={<Volume2 className="size-3.5" />}>
            音频
          </TabButton>
        </div>

        <ul className="mt-4 flex flex-col gap-2">
          {shown.length === 0 ? (
            <li className="rounded-lg border border-border px-4 py-3 text-sm text-muted">此分类暂无可下载格式</li>
          ) : (
            shown.map((format) => {
              const active = downloading === format.id;
              return (
                <li key={format.id}>
                  <button
                    type="button"
                    disabled={!!downloading}
                    onClick={() => onDownload(format)}
                    className={cn(
                      "flex h-14 w-full items-center justify-between gap-3 rounded-lg border border-border bg-bg px-4 text-left transition-[border-color,background-color] duration-[var(--motion-quick)]",
                      "hover:border-accent/40 hover:bg-surface-2 disabled:opacity-60",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-fg">{format.label}</span>
                      <span className="block text-xs text-muted">
                        {format.note}
                        {format.ext ? ` · ${format.ext}` : ""}
                        {format.size ? ` · ${formatBytes(format.size)}` : ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-sm text-accent">
                      {active ? (
                        <>
                          <LoaderCircle className="size-4 animate-spin" />
                          {progress != null ? (
                            <span className="tabular-nums">{progress}%</span>
                          ) : (
                            <span>落墨中</span>
                          )}
                        </>
                      ) : (
                        <>
                          <Download className="size-4" />
                          下载
                        </>
                      )}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </article>
  );
}

function TabButton({
  active,
  onClick,
  children,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-9 min-w-24 items-center justify-center gap-1.5 rounded-md px-3 text-sm transition-[background-color,color] duration-[var(--motion-quick)]",
        active ? "bg-surface text-fg" : "text-muted hover:text-fg",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function PlaylistCard({ info, onPick }: { info: PlaylistInfo; onPick: (id: string) => void }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <ListMusic className="mt-0.5 size-5 text-muted" />
        <div className="min-w-0">
          <h2 className="font-display text-xl font-medium text-fg">{info.title}</h2>
          <p className="mt-1 text-sm text-muted">
            {info.author ? `${info.author} · ` : ""}
            {info.count} 条影像
          </p>
        </div>
      </div>
      <Separator className="my-5" />
      <ul className="flex flex-col gap-2">
        {info.entries.map((entry) => (
          <li key={entry.videoId}>
            <button
              type="button"
              onClick={() => onPick(entry.videoId)}
              className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors duration-[var(--motion-quick)] hover:bg-bg"
            >
              <img
                src={entry.thumbnail}
                alt=""
                className="h-14 w-24 shrink-0 rounded-sm object-cover bg-surface-2"
                referrerPolicy="no-referrer"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-fg">{entry.title}</span>
                <span className="mt-1 block text-xs text-muted">
                  {entry.author ?? ""}
                  {entry.duration != null ? ` · ${formatDuration(entry.duration)}` : ""}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HistorySection({
  items,
  onPick,
  onClear,
}: {
  items: HistoryItem[];
  onPick: (item: HistoryItem) => void;
  onClear: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="mt-12">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm tracking-[0.2em] text-muted">近日墨迹</h2>
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          <Eraser />
          清空
        </Button>
      </div>
      <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.videoId}>
            <button
              type="button"
              onClick={() => onPick(item)}
              className="flex w-full items-center gap-3 rounded-lg border border-border bg-surface p-2 text-left transition-colors duration-[var(--motion-quick)] hover:bg-surface-2"
            >
              <img
                src={item.thumbnail}
                alt=""
                className="h-14 w-24 shrink-0 rounded-sm object-cover bg-surface-2"
                referrerPolicy="no-referrer"
              />
              <span className="min-w-0">
                <span className="block truncate text-sm text-fg">{item.title}</span>
                <span className="mt-1 block truncate text-xs text-muted">{item.author}</span>
              </span>
              {item.duration != null ? (
                <Badge className="ml-auto hidden sm:inline-flex">{formatDuration(item.duration)}</Badge>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
