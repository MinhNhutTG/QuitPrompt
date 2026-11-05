import { TrendKeyword } from "../models/TrendKeyword.js";

// Trang "Đón sóng" (tài liệu 14): reads public signals for each watched phrase.
// - Google Trends, Vietnam, last 90 days, daily: the same endpoints its own web page calls (no official API).
// - TikTok's search suggestions: what people type on TikTok right now.
// TikTok Creative Center and Shopee refuse requests without a signed-in browser, so they are not used.

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const GT = "https://trends.google.com/trends";
const TIMEOUT = 20 * 1000;
// Google answers 429 to requests that come too fast, so phrases are read one after another with a pause between.
const PAUSE = 2500;
// A phrase is read again when its data is older than this (the page asks on open, the server checks every hour).
export const STALE_MS = 20 * 60 * 60 * 1000;

class Blocked extends Error {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, headers) {
  const res = await fetch(url, { headers: { "user-agent": UA, "accept-language": "vi,en;q=0.8", ...headers }, signal: AbortSignal.timeout(TIMEOUT) });
  if (res.status === 429) throw new Blocked("Google tạm chặn vì hỏi quá nhiều. Thử lại sau khoảng 1 giờ.");
  if (!res.ok) throw new Error(`Nguồn dữ liệu trả lỗi ${res.status}.`);
  return res.text();
}

// Google Trends answers with ")]}'," before the JSON.
const gtJson = (t) => JSON.parse(t.slice(t.indexOf("\n") + 1));

// The trends page sets a cookie that the data endpoints want; kept for a while.
let cookie = { value: "", at: 0 };
async function gtCookie() {
  if (cookie.value && Date.now() - cookie.at < 30 * 60 * 1000) return cookie.value;
  const res = await fetch(`${GT}/?geo=VN`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(TIMEOUT) });
  const value = (res.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
  cookie = { value, at: Date.now() };
  return value;
}

const widgetUrl = (kind, w) =>
  `${GT}/api/widgetdata/${kind}?hl=vi&tz=-420&req=${encodeURIComponent(JSON.stringify(w.request))}&token=${encodeURIComponent(w.token)}`;

// { series: [{ d: "2026-11-01", v: 0..100 }], rising: [{ q, label, v }] }
export async function googleTrends(keyword) {
  const headers = { cookie: await gtCookie() };
  const req = { comparisonItem: [{ keyword, geo: "VN", time: "today 3-m" }], category: 0, property: "" };
  const { widgets } = gtJson(await get(`${GT}/api/explore?hl=vi&tz=-420&req=${encodeURIComponent(JSON.stringify(req))}`, headers));
  const ts = widgets.find((w) => w.id === "TIMESERIES");
  const rq = widgets.find((w) => w.id === "RELATED_QUERIES");
  if (!ts) throw new Error("Google Trends không trả dữ liệu cho cụm này.");

  const timeline = gtJson(await get(widgetUrl("multiline", ts), headers)).default?.timelineData || [];
  // Today's point is still filling up (isPartial) and would look like a drop.
  const series = timeline
    .filter((p) => !p.isPartial)
    .map((p) => ({ d: new Date(Number(p.time) * 1000).toISOString().slice(0, 10), v: Number(p.value?.[0]) || 0 }));

  let rising = [];
  if (rq) {
    await sleep(800);
    try {
      const lists = gtJson(await get(widgetUrl("relatedsearches", rq), headers)).default?.rankedList || [];
      rising = (lists[1]?.rankedKeyword || []).slice(0, 10).map((k) => ({ q: k.query, label: k.formattedValue || "", v: Number(k.value) || 0 }));
    } catch (err) {
      if (err instanceof Blocked) throw err;
      // Related searches are a bonus: the curve alone is still worth keeping.
    }
  }
  return { series, rising };
}

export async function tiktokSuggestions(keyword) {
  try {
    const url = `https://www.tiktok.com/api/search/general/sug/?keyword=${encodeURIComponent(keyword)}&aid=1988&region=VN`;
    const data = JSON.parse(await get(url));
    return (data.sug_list || []).map((s) => String(s.content || "").trim()).filter(Boolean).slice(0, 10);
  } catch {
    return null; // TikTok down or changed: keep the last list.
  }
}

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Reads the phase of a wave from 90 daily points (Google scales them 0..100 against their own maximum).
//   early: climbing from a low base — the time to prepare videos.
//   mid:   near its 90-day high, well above its usual level and not falling — post now.
//   spike: one or two days carry the jump — likely a short fad, careful.
//   down:  falling from its high.  flat: nothing much.  low: too few searches to read.
export function analyse(series) {
  const v = series.map((p) => p.v);
  if (v.length < 35) return { phase: "low", growth: 0, level: 0 };
  const last7 = v.slice(-7);
  const prev21 = v.slice(-28, -7);
  const r7 = mean(last7);
  const p21 = mean(prev21);
  // Peak of the weekly average, so a single spiky day does not set the bar.
  let peak = 0;
  for (let i = 7; i <= v.length; i++) peak = Math.max(peak, mean(v.slice(i - 7, i)));
  if (peak < 1 || (mean(v) < 3 && Math.max(...v) < 20)) return { phase: "low", growth: 0, level: 0 };

  const growth = (r7 - p21) / Math.max(p21, 1);
  const level = Math.min(1, r7 / peak);
  const sorted = [...last7].sort((a, b) => b - a);
  const total = last7.reduce((s, x) => s + x, 0);
  const spike = total > 0 && sorted[0] + sorted[1] > 0.6 * total && sorted[0] >= 2.5 * Math.max(median(v.slice(-21)), 1);

  // What the phrase usually gets: the two months before the last four weeks. A wave stands clearly above it; a phrase
  // searched the same all year is always "at its peak" without being a wave.
  const base = median(v.slice(0, -28));
  let phase = "flat";
  if (growth >= 0.2 && p21 <= 0.6 * peak) phase = "early";
  else if (level >= 0.7 && growth > -0.15 && r7 >= 1.25 * Math.max(base, 1)) phase = "mid";
  else if (growth <= -0.2) phase = "down";
  if (spike && (phase === "early" || phase === "mid" || phase === "flat")) phase = "spike";
  return { phase, growth: Math.round(growth * 100) / 100, level: Math.round(level * 100) / 100 };
}

// ---- One scan at a time for the whole server; the page shows its progress.
export const scan = { running: false, done: 0, total: 0, error: "", startedAt: null, finishedAt: null };

export const scanState = () => ({ ...scan });

async function scanOne(doc) {
  const { series, rising } = await googleTrends(doc.keyword);
  const tiktok = await tiktokSuggestions(doc.keyword);
  const a = analyse(series);
  doc.series = series;
  doc.phase = a.phase;
  doc.growth = a.growth;
  doc.level = a.level;
  doc.rising = rising;
  if (tiktok) {
    const before = new Set(doc.tiktok.map((s) => s.toLowerCase()));
    // Nothing is "new" on the first scan.
    doc.tiktokNew = doc.tiktok.length ? tiktok.filter((s) => !before.has(s.toLowerCase())) : [];
    doc.tiktok = tiktok;
  }
  doc.scannedAt = new Date();
  doc.scanError = "";
  await doc.save();
}

// Scans the given phrases (all stale ones when ids is empty) in the background. Returns false if one is running.
export function startScan({ ids = null, force = false } = {}) {
  if (scan.running) return false;
  Object.assign(scan, { running: true, done: 0, total: 0, error: "", startedAt: new Date(), finishedAt: null });
  (async () => {
    try {
      const filter = ids ? { _id: { $in: ids } } : force ? {} : { $or: [{ scannedAt: null }, { scannedAt: { $lt: new Date(Date.now() - STALE_MS) } }] };
      const docs = await TrendKeyword.find(filter).sort({ scannedAt: 1 });
      scan.total = docs.length;
      for (const doc of docs) {
        try {
          await scanOne(doc);
        } catch (err) {
          if (err instanceof Blocked) {
            scan.error = err.message;
            break;
          }
          doc.scanError = err.name === "TimeoutError" ? "Nguồn dữ liệu không trả lời kịp." : err.message;
          doc.scannedAt = new Date();
          await doc.save().catch(() => {});
        }
        scan.done++;
        if (scan.done < scan.total) await sleep(PAUSE);
      }
    } catch (err) {
      scan.error = "Không quét được. Thử lại sau.";
      console.error("Quét xu hướng:", err);
    } finally {
      scan.running = false;
      scan.finishedAt = new Date();
    }
  })();
  return true;
}

// While the server is awake it keeps the data fresh on its own.
export function scheduleTrendScans() {
  setInterval(() => {
    TrendKeyword.exists({ $or: [{ scannedAt: null }, { scannedAt: { $lt: new Date(Date.now() - STALE_MS) } }] })
      .then((stale) => stale && startScan())
      .catch(() => {});
  }, 60 * 60 * 1000).unref();
}
