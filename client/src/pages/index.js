import { lazy } from "react";

// Every page is its own JS chunk. preload() starts the download on hover/touch of a nav link.
const loaders = {
  login: () => import("./Login.jsx"),
  builder: () => import("./Builder.jsx"),
  products: () => import("./Products.jsx"),
  productDetail: () => import("./ProductDetail.jsx"),
  saved: () => import("./Saved.jsx"),
  plans: () => import("./Plans.jsx"),
  resources: () => import("./Resources.jsx"),
  library: () => import("./Library.jsx"),
  settings: () => import("./Settings.jsx"),
  notFound: () => import("./NotFound.jsx"),
};

export const pages = Object.fromEntries(Object.entries(loaders).map(([k, load]) => [k, lazy(load)]));

export const preload = (name) => loaders[name]?.().catch(() => {});
