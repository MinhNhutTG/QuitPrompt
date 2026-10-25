export const STATUS = {
  todo: { label: "Chưa thực hiện", tone: "todo" },
  partial: { label: "Còn thiếu", tone: "partial" },
  done: { label: "Đã hoàn thành", tone: "done" },
};

// What every plan collects. The labels match the file names the server gives them in Drive.
export const SLOTS = [
  { key: "clip1", label: "Video 10s 1", accept: "video/*", kind: "video" },
  { key: "clip2", label: "Video 10s 2", accept: "video/*", kind: "video" },
  { key: "audio", label: "Lời đọc (mp3)", accept: "audio/*,.mp3", kind: "audio" },
  { key: "final", label: "Video thành phẩm", accept: "video/*", kind: "video" },
];

// How many of the plan's files and two texts are in, out of all of them.
export function progressOf(plan) {
  const have = SLOTS.filter((s) => plan.files?.[s.key]).length + (plan.voiceText ? 1 : 0) + (plan.caption ? 1 : 0);
  return { have, total: SLOTS.length + 2 };
}
