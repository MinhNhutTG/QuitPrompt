import { useId } from "react";
import { usePromptFilters } from "../lib/queries.js";

export const CATEGORIES = ["Áo", "Áo khoác", "Quần", "Váy", "Đầm", "Đồ bộ", "Nón", "Túi", "Giày dép", "Phụ kiện"];

// Free text, suggesting the usual kinds plus every category already in use.
export function CategoryInput({ value, onChange }) {
  const listId = useId();
  const { data } = usePromptFilters();
  const options = [...new Set([...CATEGORIES, ...(data?.categories || [])])];
  return (
    <>
      <input className="input" list={listId} value={value} maxLength={60} placeholder="Áo" onChange={(e) => onChange(e.target.value)} />
      <datalist id={listId}>
        {options.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </>
  );
}
