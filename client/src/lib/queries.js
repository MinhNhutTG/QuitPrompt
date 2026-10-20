import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { api } from "../api.js";

export const useProducts = () => useQuery({ queryKey: ["products"], queryFn: () => api.products({ limit: 500 }) });

export const useSettings = () => useQuery({ queryKey: ["settings"], queryFn: api.settings, staleTime: 5 * 60 * 1000 });

export const usePrompts = (params) =>
  useInfiniteQuery({
    queryKey: ["prompts", params],
    queryFn: ({ pageParam }) => api.prompts({ ...params, cursor: pageParam, limit: 20 }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor || undefined,
  });

// Keeps the product list and the detail cache in sync after any product change.
export function putProduct(qc, item) {
  qc.setQueryData(["product", item._id], { item });
  qc.setQueryData(["products"], (old) => old && { ...old, items: [item, ...old.items.filter((p) => p._id !== item._id)] });
}

export function dropProduct(qc, id) {
  qc.setQueryData(["products"], (old) => old && { ...old, items: old.items.filter((p) => p._id !== id) });
  qc.removeQueries({ queryKey: ["product", id] });
  qc.invalidateQueries({ queryKey: ["prompts"] });
}

// Applies fn to every cached prompt page (all filters at once).
export function mapCachedPrompts(qc, fn) {
  qc.setQueriesData({ queryKey: ["prompts"] }, (old) =>
    old ? { ...old, pages: old.pages.map((pg) => ({ ...pg, items: fn(pg.items) })) } : old
  );
}
