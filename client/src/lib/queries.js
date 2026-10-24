import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
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

// One numbered page ({ items, total, page, pages }); the old page stays on screen while the next loads.
export const usePromptPage = (params) =>
  useQuery({ queryKey: ["prompts", "page", params], queryFn: () => api.prompts({ ...params, limit: 20 }), placeholderData: keepPreviousData });

export const usePlans = (params) =>
  useQuery({ queryKey: ["plans", params], queryFn: () => api.plans({ ...params, limit: 20 }), placeholderData: keepPreviousData });

export const useResources = () => useQuery({ queryKey: ["resources"], queryFn: api.resources });

export const useAdminStats = () => useQuery({ queryKey: ["admin", "stats"], queryFn: () => api.adminStats() });
export const useAdminUsers = () => useQuery({ queryKey: ["admin", "users"], queryFn: api.adminUsers });
export const useAdminTiers = () => useQuery({ queryKey: ["admin", "tiers"], queryFn: api.adminTiers });
export const useAdminRoles = () => useQuery({ queryKey: ["admin", "roles"], queryFn: api.adminRoles });
export const useAdminLogs = (params) => useQuery({ queryKey: ["admin", "logs", params], queryFn: () => api.adminLogs(params), placeholderData: keepPreviousData });

// Members and product categories for the saved-prompts filters (also the category suggestions).
export const usePromptFilters = () => useQuery({ queryKey: ["prompt-filters"], queryFn: api.promptFilters, staleTime: 60 * 1000 });

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

// Applies fn to every cached prompt list (all filters at once), infinite or numbered.
export function mapCachedPrompts(qc, fn) {
  qc.setQueriesData({ queryKey: ["prompts"] }, (old) => {
    if (!old) return old;
    if (old.pages) return { ...old, pages: old.pages.map((pg) => ({ ...pg, items: fn(pg.items) })) };
    return { ...old, items: fn(old.items) };
  });
}
