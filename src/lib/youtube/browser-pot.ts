import { BotGuardClient, getChallenge } from "bgutils-js/botguard";
import { WebPoMinter } from "bgutils-js/webpo";
import { buildURL, getHeaders } from "bgutils-js/utils";
import type { WebPoSignalOutput } from "bgutils-js/shared-types";

const REQUEST_KEY = "O43z0dpjhgX20SCx4KAo";

type MinterSession = {
  visitorData: string;
  minter: WebPoMinter;
};

let sessionPromise: Promise<MinterSession> | null = null;

function loadInterpreter(source: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.async = true;
    if (/^https?:/i.test(source) || source.startsWith("//")) {
      script.src = source.startsWith("//") ? `https:${source}` : source;
    } else {
      script.text = source;
    }
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("无法加载验证脚本"));
    document.head.appendChild(script);
    if (!script.src) queueMicrotask(() => resolve());
  });
}

async function createMinter(visitorData: string): Promise<MinterSession> {
  const challenge = await getChallenge({
    requestKey: REQUEST_KEY,
    fetchFunction: fetch.bind(globalThis),
    useYouTubeAPI: true,
  });

  const inline = challenge.interpreterJavascript?.privateDoNotAccessOrElseSafeScriptWrappedValue;
  const remote = challenge.interpreterUrl?.privateDoNotAccessOrElseTrustedResourceUrlWrappedValue;
  if (inline) {
    new Function(inline)();
  } else if (remote) {
    await loadInterpreter(remote);
  } else {
    throw new Error("没有收到验证程序");
  }

  if (!challenge.program || !challenge.globalName) {
    throw new Error("验证挑战不完整");
  }

  const botGuard = await BotGuardClient.create({
    program: challenge.program,
    globalName: challenge.globalName,
    globalObject: globalThis,
  });

  const webPoSignalOutput: WebPoSignalOutput = [];
  const botguardResponse = await botGuard.snapshot({ webPoSignalOutput });

  const integrityResponse = await fetch(buildURL("GenerateIT", true), {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify([REQUEST_KEY, botguardResponse]),
  });
  if (!integrityResponse.ok) {
    throw new Error("验证服务暂时不可用");
  }
  const integrityJson = (await integrityResponse.json()) as [string, number, number, string];
  const [integrityToken, estimatedTtlSecs, mintRefreshThreshold, websafeFallbackToken] = integrityJson;
  if (!integrityToken) throw new Error("没有收到完整性令牌");

  const minter = await WebPoMinter.create(
    { integrityToken, estimatedTtlSecs, mintRefreshThreshold, websafeFallbackToken },
    webPoSignalOutput,
  );
  return { visitorData, minter };
}

export async function mintPoTokens(
  visitorData: string,
  videoId: string,
): Promise<{ visitorPo: string; contentPo: string }> {
  sessionPromise ??= createMinter(visitorData).catch((err) => {
    sessionPromise = null;
    throw err;
  });
  const session = await sessionPromise;
  if (session.visitorData !== visitorData) {
    sessionPromise = null;
    return mintPoTokens(visitorData, videoId);
  }
  const [visitorPo, contentPo] = await Promise.all([
    session.minter.mintAsWebsafeString(visitorData),
    session.minter.mintAsWebsafeString(videoId),
  ]);
  return { visitorPo, contentPo };
}
