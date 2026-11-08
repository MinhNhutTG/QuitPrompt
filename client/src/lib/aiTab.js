// Opens an AI site (ChatGPT, Dola…) in its own named tab, and next time switches back to that tab instead of
// loading the site again (slow, and loses what is on the page).
//   1. This page still holds the tab it opened → focus it.
//   2. Otherwise ask the browser for the tab by name (it survives reloading this app): window.open("", name) returns
//      the existing tab untouched, or a new blank one. A tab already on the AI site is another origin, so reading its
//      location throws → reuse it; a blank one is new → send it to the site.
// Returns "reused", "opened" or "blocked" (popup blocker).
const handles = new Map();

export function openAiTab(key, url) {
  const known = handles.get(key);
  if (known && !known.closed) {
    known.focus();
    return "reused";
  }
  const w = window.open("", `qp-ai-${key}`);
  if (!w) return "blocked";
  handles.set(key, w);
  let blank;
  try {
    blank = w.location.href === "about:blank";
  } catch {
    blank = false;
  }
  if (!blank) {
    w.focus();
    return "reused";
  }
  // No "noopener" here on purpose: without an opener Chrome moves the tab to a separate group when it goes to the
  // other site, and step 2 could no longer find it by name after this app reloads. Only used for well-known AI sites.
  w.location.href = url;
  return "opened";
}
