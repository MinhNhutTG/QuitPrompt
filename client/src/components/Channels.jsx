import { Link } from "react-router-dom";
import { useChannels } from "../lib/queries.js";

// Kênh đăng (doc 09 §4c): where a plan's video will be posted. The list is kept by an admin in Quản trị → Kênh đăng.

export const PLATFORMS = {
  tiktok: "TikTok",
  facebook: "Facebook",
  youtube: "YouTube",
  instagram: "Instagram",
  shopee: "Shopee",
  other: "Khác",
};
export const NO_CHANNEL = "__none";

// A plan's channels as small tags. Nothing when it has none.
export function ChannelTags({ channels }) {
  if (!channels?.length) return null;
  return (
    <span className="ch-tags">
      {channels.map((c) => (
        <span key={c._id} className={`ch-tag ch-${c.platform}`} title={`${PLATFORMS[c.platform] || ""} · ${c.name}`}>
          {c.name}
        </span>
      ))}
    </span>
  );
}

// Toggle chips, one per channel. value: channel ids. onChange gets the new list of ids.
export function ChannelPicker({ value, onChange, disabled, isAdmin }) {
  const { data, isLoading } = useChannels();
  const items = data?.items || [];
  if (isLoading) return <span className="hint">Đang tải kênh...</span>;
  if (!items.length)
    return (
      <span className="hint">
        Chưa có kênh nào. {isAdmin ? <Link to="/admin?tab=channels">Thêm kênh trong Quản trị</Link> : "Nhờ quản trị viên thêm kênh trong Quản trị."}
      </span>
    );
  const on = new Set(value);
  return (
    <span className="ch-pick" role="group" aria-label="Kênh đăng">
      {items.map((c) => (
        <button
          key={c._id}
          type="button"
          className={`ch-chip ch-${c.platform} ${on.has(c._id) ? "is-on" : ""}`}
          aria-pressed={on.has(c._id)}
          disabled={disabled}
          title={PLATFORMS[c.platform]}
          onClick={() => onChange(on.has(c._id) ? value.filter((x) => x !== c._id) : [...value, c._id])}
        >
          {on.has(c._id) ? "✓ " : ""}
          {c.name}
        </button>
      ))}
    </span>
  );
}

// <option>s for a filter: every channel, grouped by platform, then "Chưa chọn kênh".
export function ChannelOptions() {
  const { data } = useChannels();
  const items = data?.items || [];
  const groups = [...new Set(items.map((c) => c.platform))];
  return (
    <>
      {groups.map((g) => (
        <optgroup key={g} label={PLATFORMS[g] || g}>
          {items
            .filter((c) => c.platform === g)
            .map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
        </optgroup>
      ))}
      <option value={NO_CHANNEL}>Chưa chọn kênh</option>
    </>
  );
}
