// Prompt assembly rules (tài liệu 06). Pure functions: no React, no network.
import { ACTIONS, FLAGS } from "./actions.js";

export const DEFAULT_TEMPLATE = `{{continue}}The {{person}} from the reference image, wearing the product shown in it, performs one continuous {{duration}}-second product showcase in the same setting as the reference image. ONE SINGLE UNBROKEN TAKE, no cuts, no scene changes.

Product: reproduce the product exactly as in the reference image, with no changes to color, material, pattern, cut or details.

Action — one continuous chain of movements, each gesture flowing into the next:
{{actions}}

Motion quality: every movement is smooth, confident and controlled, like a high-end fashion commercial. Each gesture flows into the next without stopping, with natural weight shifts and a steady pace. No sudden, jerky or fast movements. {{Possessive}} hands never touch, pull, smooth or adjust the {{garment}}; they keep a clear distance from it at all times, even when gesturing toward it. The {{garment}} moves only with {{possessive}} body movements.

PRODUCT FIDELITY CONSTRAINTS
The {{garment}} is a real product. Keep it exactly as shown in the reference image in every frame: same color, same material and gloss, same pattern size and spacing, same buttons, same closures, same length and same cut. Do not add any new detail: no pockets, zippers, extra buttons, belts, straps, logos, labels, text, patches, prints, trims or lining.{{closed_line}} The pattern stays fixed on the material, moving only with it.

Environment: the same setting as in the reference image, unchanged. No signs, no store name, no logos, no other people.

Style: photorealistic lifestyle fashion commercial, natural skin texture, true-to-life colors, soft even lighting that stays constant throughout.

Camera: locked-off tripod at chest height, no pan, no zoom, no camera movement. The framing changes only because {{pronoun}} walks toward and away from the camera. Focus stays on {{object}}. One continuous take from the first frame to the last.

Quality: 1080p, 24fps, smooth natural motion, sharp detail on the fabric and finishing. Face, hairstyle and the {{garment}} stay identical throughout. Natural hands with five fingers. {{Pronoun}} does not speak.

Audio: {{audio}}

No horizontal video, no 16:9, no square format, no scene cuts, no transitions, no sudden zooms, no camera shake, no product redesign, no changing {{garment}} color, no changing pattern, no missing details, no fabric flickering, no distorted seams{{extra_neg}}, no hands touching the {{garment}}, no deformed hands, no extra fingers, no face distortion, no unnatural eye movement, no sudden pose changes, no clothing changes, no background changes, no added logos, no subtitles, no text overlays, no watermarks.

FINAL REQUIREMENTS

Duration: exactly {{duration}} seconds.
Aspect ratio: 9:16 vertical.
Platform: TikTok and TikTok Shop.
Motion: smooth, natural, realistic.
Priority: accurately showcase the original {{garment}} while preserving the reference model and setting.`;

// Option 2: mirror-selfie showcase, the phone hides the face in every frame.
export const SELFIE_TEMPLATE = `{{continue}}The {{person}} from the reference image, wearing the product shown in it, performs one continuous {{duration}}-second mirror-selfie style product showcase in the same setting as the reference image. ONE SINGLE UNBROKEN TAKE, no cuts, no scene changes.

FACE COVERED BY PHONE (mandatory, every frame): {{Pronoun}} holds a plain black smartphone vertically in {{possessive}} right hand directly in front of {{possessive}} face, its back with the camera lenses facing the viewer, exactly like a mirror selfie. The phone fully covers {{possessive}} face from forehead to chin in every single frame, from the first frame to the last. The phone never lowers, never moves aside, and {{possessive}} face is never visible. {{Possessive}} right hand stays fixed holding the phone; all movement comes from {{possessive}} body, legs and {{possessive}} relaxed left arm. The phone has no logo and no text.

Product: reproduce the product exactly as in the reference image, with no changes to color, material, pattern, print, cut or details.

Action — one continuous chain of movements, each gesture flowing into the next:
{{actions}}

Motion quality: every movement is slow, fluid and graceful, like a high-end fashion film. Each gesture flows into the next without stopping, with natural weight shifts and a steady unhurried pace. No sudden, jerky or fast movements. Every hand gesture above is made with the left hand only; the right hand never leaves the phone. {{Possessive}} hands never touch, pull, smooth or adjust the {{garment}}; {{possessive}} left hand stays relaxed away from it. The {{garment}} moves only with {{possessive}} body movements.

PRODUCT FIDELITY CONSTRAINTS
The {{garment}} is a real product. Keep it exactly as shown in the reference image in every frame: same color, same material and texture, same pattern size and spacing, same buttons, same closures, same length and same cut. Any print, text or logo already on the {{garment}} stays exactly the same in every frame: same color, same position, same size, same spelling; the letters never change, blur, warp or rearrange. Do not add any new detail: no pockets, zippers, extra buttons, belts, straps, logos, labels, text, patches, prints, embroidery, trims or lining.{{closed_line}} The pattern and print stay fixed on the material, moving only with it. Accessories stay exactly as shown.

Environment: the same setting as in the reference image, unchanged, with soft lighting that stays consistent throughout. No signs, no store name, no readable text in the background, no logos, no other people.

Style: photorealistic lifestyle fashion commercial, natural skin texture on hands and arms, true-to-life colors, the colors of the {{garment}} accurate and crisp.

Camera: locked-off tripod at chest height, no pan, no zoom, no camera movement. The framing changes only because {{pronoun}} walks toward and away from the camera. Focus stays on {{object}}. One continuous take from the first frame to the last.

Quality: 1080p, 24fps, smooth natural motion, sharp detail on the fabric texture and any print. {{Possessive}} hair, the phone position and the {{garment}} stay identical throughout. Natural hands with five fingers. {{Pronoun}} does not speak.

Audio: {{audio}}

No visible face, no lowering the phone, no phone logo, no horizontal video, no 16:9, no square format, no scene cuts, no transitions, no sudden zooms, no camera shake, no product redesign, no changing {{garment}} color, no changing pattern or print, no missing details, no fabric flickering, no distorted seams{{extra_neg}}, no hands touching the {{garment}}, no deformed hands, no extra fingers, no sudden pose changes, no clothing changes, no background changes, no added logos, no subtitles, no text overlays, no watermarks.

FINAL REQUIREMENTS

Duration: exactly {{duration}} seconds.
Aspect ratio: 9:16 vertical.
Platform: TikTok and TikTok Shop.
Motion: smooth, natural, realistic.
Priority: accurately showcase the original {{garment}} while the phone keeps the face hidden.`;

export const KINDS = [
  { value: "show", label: "Trình diễn" },
  { value: "selfie", label: "Selfie che mặt" },
];

// Actions that need the phone hand or show the face: kept out of random selfie chains, warned when picked.
const NO_SELFIE = new Set(["t5", "t6", "p3", "e6"]);
export const selfieUnfit = (a) => a && !a.custom && (a.cat === "head" || NO_SELFIE.has(a.id));

export const DEFAULT_NEGATIVE =
  "wind, breeze, fluttering, camera cut, jump cut, scene change, zoom, camera pan, back view, extra people, pockets, zipper, logo, label, text, extra buttons, opened garment, changed pattern, hand touching garment, hands pulling fabric, morphing, jerky motion, watermark";

export const TEMPLATE_VARS = [
  "continue", "person", "duration", "actions", "closed_line", "extra_neg", "audio",
  "pronoun", "Pronoun", "possessive", "Possessive", "object", "garment",
];

export const DURATIONS = [10, 15, 20];
export const ROLE_DEFAULT = { open: "ob1", mid: "mb1", end: "eb1" };
const LEGACY_IDS = { o1: "t1", o2: "t9" };
const DEFAULT_MID_COUNT = { 10: 3, 15: 4, 20: 6 };

export const DEFAULT_STATE = {
  productId: null,
  kind: "show",
  gender: "f",
  dur: 10,
  style: "bold",
  open: "ob1",
  mid: ["mb1", "mb2"],
  end: "eb1",
  endOn: false,
  closed: true,
  cont: false,
  audio: "none",
  extraNeg: "",
};

// Structural clean-up of a settings snapshot (saved prompt, draft, or the old static `beats` format).
export function normalizeSettings(raw) {
  const s = raw && typeof raw === "object" ? { ...raw } : {};
  if (Array.isArray(s.beats) && !s.open) {
    const b = s.beats;
    s.open = b[0];
    s.mid = b.slice(1, -1);
    s.end = b.length > 1 ? b[b.length - 1] : undefined;
    s.endOn = b.length > 1;
  }
  const id = (v, fallback) => (typeof v === "string" && v ? LEGACY_IDS[v] || v : fallback);
  return {
    kind: s.kind === "selfie" ? "selfie" : "show",
    gender: s.gender === "m" ? "m" : "f",
    dur: DURATIONS.includes(Number(s.dur)) ? Number(s.dur) : 10,
    style: s.style === "soft" ? "soft" : "bold",
    open: id(s.open, ROLE_DEFAULT.open),
    mid: Array.isArray(s.mid) ? s.mid.filter((x) => typeof x === "string").map((x) => LEGACY_IDS[x] || x) : [],
    end: id(s.end, ROLE_DEFAULT.end),
    endOn: Boolean(s.endOn),
    closed: s.closed !== false,
    cont: Boolean(s.cont),
    audio: s.audio === "amb" ? "amb" : "none",
    extraNeg: typeof s.extraNeg === "string" ? s.extraNeg : "",
  };
}

// The part of the builder state stored with a saved prompt.
export function snapshot(state) {
  const { productId, ...rest } = state;
  return normalizeSettings(rest);
}

// Replaces ids that no longer exist (deleted custom actions) with the default of their slot.
export function sanitizeIds(state, index) {
  const ok = (id) => index.byId.has(id);
  const open = ok(state.open) ? state.open : ROLE_DEFAULT.open;
  const end = ok(state.end) ? state.end : ROLE_DEFAULT.end;
  const mid = state.mid.map((id) => (ok(id) ? id : ROLE_DEFAULT.mid));
  const changed = open !== state.open || end !== state.end || mid.some((id, i) => id !== state.mid[i]);
  return changed ? { ...state, open, mid, end } : state;
}

export function timeline({ dur: T, open, mid, end, endOn }) {
  const k = mid.length;
  const E = endOn ? 2 : 0;
  const O = k || endOn ? 2 : T; // only an opening: it fills the whole clip
  const M = T - O - E;
  const out = [{ role: "open", id: open, a: 0, b: k ? O : T - E }];
  mid.forEach((id, j) => out.push({ role: "mid", id, a: O + (M * j) / k, b: O + (M * (j + 1)) / k }));
  if (endOn) out.push({ role: "end", id: end, a: T - E, b: T });
  return out;
}

export const fmtSec = (x) => String(Math.round(x * 10) / 10);
export const fmtSecVi = (x) => fmtSec(x).replace(".", ",");

const pronouns = (gender) => {
  const f = gender !== "m";
  return {
    person: f ? "woman" : "man",
    pronoun: f ? "she" : "he",
    Pronoun: f ? "She" : "He",
    possessive: f ? "her" : "his",
    Possessive: f ? "Her" : "His",
    object: f ? "her" : "him",
    garment: "product",
  };
};

export function fillAction(text, v) {
  return text
    .replace(/\{S\}/g, v.Pronoun)
    .replace(/\{s\}/g, v.pronoun)
    .replace(/\{p\}/g, v.possessive)
    .replace(/(\b[Tt]he\s+)?\{g\}/g, (m, the) => (the && the[0] === "T" ? "The product" : "the product"));
}

export function extraNegList(input) {
  return String(input || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => (/^no\s/i.test(x) ? x : "no " + x));
}

const START = "Starting exactly as in the reference image, ";
const lcFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);

export function buildPrompt(state, index, { template, negative } = {}) {
  const v = { ...pronouns(state.gender), duration: String(state.dur) };
  const fallback = (role) => index.byId.get(ROLE_DEFAULT[role]);
  const beats = timeline(state).map((b) => ({ ...b, action: index.byId.get(b.id) || fallback(b.role) }));

  v.actions = beats
    .map((b, i) => {
      let t = fillAction(b.action.text, v);
      if (i === 0 && !/^starting exactly/i.test(t)) t = START + lcFirst(t);
      return `${fmtSec(b.a)}–${fmtSec(b.b)}s: ${t}`;
    })
    .join("\n");
  v.closed_line = state.closed ? " The product stays fully closed and is never opened." : "";
  v.continue = state.cont ? "Continue exactly from the provided image: " : "";
  v.extra_neg = extraNegList(state.extraNeg).map((x) => ", " + x).join("");
  v.audio = state.audio === "amb" ? "soft quiet ambience only, no music, no speech." : "none.";

  // Settings edit only the first template; the selfie one is fixed. Unknown variables stay visible as {{...}}.
  const selfie = state.kind === "selfie";
  let prompt = (selfie ? SELFIE_TEMPLATE : template || DEFAULT_TEMPLATE).replace(/\{\{(\w+)\}\}/g, (m, k) => (k in v ? v[k] : m));
  if (state.cont) prompt = prompt.replace("Continue exactly from the provided image: The ", "Continue exactly from the provided image: the ");

  const baseNeg = negative || DEFAULT_NEGATIVE;
  const needsBack = beats.some((b) => b.action.conds.includes("B"));
  let negativeOut = needsBack
    ? baseNeg.split(",").map((x) => x.trim()).filter((x) => x && x.toLowerCase() !== "back view").join(", ")
    : baseNeg;
  if (selfie) negativeOut += ", visible face, lowered phone, phone moving away from face, phone logo";

  const warnings = [];
  for (const b of beats) {
    for (const c of b.action.conds) warnings.push({ id: b.action.id + c, text: `“${b.action.label}” (${FLAGS[c].label}): ${FLAGS[c].warn}` });
    if (selfie && selfieUnfit(b.action))
      warnings.push({ id: b.action.id + "selfie", text: `“${b.action.label}”: mặt bị điện thoại che, tay phải cầm máy, nên động tác này dễ lỗi. Chọn động tác khác.` });
  }
  const k = state.mid.length;
  const perMid = k ? (state.dur - 2 - (state.endOn ? 2 : 0)) / k : 0;
  if (k && perMid < 2) warnings.push({ id: "short", text: "Mỗi động tác chưa tới 2 giây, AI dễ làm vội và giật. Bớt động tác hoặc tăng thời lượng." });

  return {
    prompt,
    negative: negativeOut,
    beats,
    warnings,
    perMid,
    words: prompt.trim().split(/\s+/).filter(Boolean).length,
  };
}

// ---- random chains (tài liệu 06, mục 6): built-in actions without conditions only

const pick = (list) => list[Math.floor(Math.random() * list.length)];

function pools(style, kind) {
  const safe = ACTIONS.filter((a) => a.conds.length === 0 && !(style === "soft" && a.bold) && !(kind === "selfie" && selfieUnfit(a)));
  return {
    open: safe.filter((a) => a.roles.includes("o")),
    mid: safe.filter((a) => a.roles.includes("m") && a.cat !== "end"),
    end: safe.filter((a) => a.roles.includes("e") && (a.cat === "end" || a.cat === "point")),
  };
}

function midCandidates(list, used) {
  const pointed = [...used].some((id) => ACTIONS.find((a) => a.id === id)?.cat === "point");
  return list.filter(
    (a) => !used.has(a.id) && (a.id !== "m8" || used.has("m1") || used.has("mb1")) && !(pointed && a.cat === "point")
  );
}

export function shuffleChain(state) {
  const p = pools(state.style, state.kind);
  const bold = state.style !== "soft";
  const k = state.mid.length || DEFAULT_MID_COUNT[state.dur] || 3;
  const used = new Set();
  const take = (list, all) => {
    const a = pick(list.length ? list : all);
    used.add(a.id);
    return a.id;
  };

  const open = take(p.open.filter((a) => !used.has(a.id)), p.open);
  const mid = [];
  for (let j = 0; j < k; j++) {
    let list = midCandidates(p.mid, used);
    if (bold && j === 0) list = list.filter((a) => a.bold);
    mid.push(take(list, p.mid));
  }
  let ends = p.end.filter((a) => !used.has(a.id) && (!bold || a.bold));
  const pointed = mid.some((id) => ACTIONS.find((a) => a.id === id)?.cat === "point");
  if (pointed && ends.some((a) => a.cat !== "point")) ends = ends.filter((a) => a.cat !== "point");
  const end = take(ends, p.end);
  return { ...state, open, mid, end };
}

// One more safe middle action that fits the current chain.
export function nextMid(state) {
  const p = pools(state.style, state.kind);
  const used = new Set([state.open, ...state.mid]);
  const list = midCandidates(p.mid, used);
  return pick(list.length ? list : p.mid).id;
}
