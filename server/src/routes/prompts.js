import { Router } from "express";
import { z } from "zod";
import { Prompt } from "../models/Prompt.js";
import { Product } from "../models/Product.js";
import { User } from "../models/User.js";
import { ah, parse, assertId, isId, escapeRegex, text, HttpError } from "../lib/http.js";
import { findOrCreateProduct } from "./products.js";

const router = Router();

const createSchema = z
  .object({
    product: z.string().optional(),
    productName: text("tên sản phẩm", 160, 1).optional(),
    prompt: text("prompt", 20000, 1),
    negative: text("negative", 5000).optional().default(""),
    note: text("ghi chú", 1000).optional().default(""),
    tool: text("tên công cụ", 60).optional().default(""),
    settings: z.record(z.unknown()).optional().default({}),
    source: z.enum(["builder", "external"]).optional().default("builder"),
  })
  .refine((d) => d.product || d.productName, { message: "Chọn sản phẩm hoặc gõ tên sản phẩm mới." });

const patchSchema = z.object({
  note: text("ghi chú", 1000).optional(),
  tool: text("tên công cụ", 60).optional(),
  prompt: text("prompt", 20000, 1).optional(),
  negative: text("negative", 5000).optional(),
});

const PRODUCT_FIELDS = { name: 1, sku: 1, category: 1, images: { $slice: 1 } };

// Sent as ?category= to find prompts whose product has no category yet.
const NO_CATEGORY = "__none";

// "2026-10-21T00:00:00.000Z" → Date, anything unparsable → null.
function dateParam(v) {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// The saver is looked up by owner id (not stored as text), so a renamed account shows its current name.
async function savedByMap(prompts) {
  const ids = [...new Set(prompts.map((p) => String(p.owner)))];
  const users = await User.find({ _id: { $in: ids } }, { username: 1, displayName: 1 }).lean();
  return new Map(users.map((u) => [String(u._id), { username: u.username, displayName: u.displayName || u.username }]));
}

const GONE = { username: "", displayName: "(tài khoản đã xoá)" };

// Attaches product { _id, name, sku, category, images: [cover] }, savedBy { username, displayName } and mine
// (whether the viewer saved it, so may edit it); drops the raw owner id.
async function decorate(viewer, prompts) {
  const ids = [...new Set(prompts.map((p) => String(p.product)))];
  const [products, savers] = await Promise.all([Product.find({ _id: { $in: ids } }, PRODUCT_FIELDS).lean(), savedByMap(prompts)]);
  const byId = new Map(products.map((p) => [String(p._id), p]));
  return prompts.map(({ owner: o, ...p }) => ({
    ...p,
    product: byId.get(String(p.product)) || { _id: p.product, name: "(sản phẩm đã xoá)", images: [] },
    savedBy: savers.get(String(o)) || GONE,
    mine: String(o) === String(viewer),
  }));
}

// Options for the filters on the saved-prompts page: every member, every product category in use.
router.get(
  "/filters",
  ah(async (req, res) => {
    const [users, categories] = await Promise.all([
      User.find({}, { username: 1, displayName: 1 }).sort({ createdAt: 1 }).lean(),
      Product.distinct("category"),
    ]);
    res.json({
      members: users.map((u) => ({ id: String(u._id), username: u.username, displayName: u.displayName || u.username })),
      // "áo" and "Áo" are one category (filters match case-insensitively); one spelling is kept.
      categories: [...new Map(categories.filter(Boolean).map((c) => [c.toLowerCase(), c])).values()].sort((a, b) => a.localeCompare(b, "vi")),
    });
  })
);

// Every member sees every saved prompt. Filters: by (saver id) or mine=1, product, category, q, from/to (createdAt).
// With ?page= it answers one numbered page plus the total; without it, cursor pages (nextCursor).
router.get(
  "/",
  ah(async (req, res) => {
    const filter = {};
    const and = [];
    if (req.query.mine === "1") filter.owner = req.userId;
    else if (req.query.by) filter.owner = assertId(String(req.query.by), "thành viên");
    const { product, cursor } = req.query;
    if (product) filter.product = assertId(String(product), "sản phẩm");

    if (typeof req.query.category === "string" && req.query.category) {
      const category = req.query.category.trim().slice(0, 60);
      const cond = category === NO_CATEGORY ? { category: { $in: ["", null] } } : { category: new RegExp(`^${escapeRegex(category)}$`, "i") };
      const inCategory = await Product.find(cond, { _id: 1 }).lean();
      and.push({ product: { $in: inCategory.map((p) => p._id) } });
    }

    const from = dateParam(req.query.from);
    const to = dateParam(req.query.to);
    if (from || to) filter.createdAt = { ...(from && { $gte: from }), ...(to && { $lt: to }) };

    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
    if (q) {
      const rx = new RegExp(escapeRegex(q), "i");
      const matching = await Product.find({ $or: [{ name: rx }, { sku: rx }] }, { _id: 1 }).lean();
      and.push({ $or: [{ note: rx }, { tool: rx }, { product: { $in: matching.map((p) => p._id) } }] });
    }
    if (and.length) filter.$and = and;

    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);

    if (req.query.page !== undefined) {
      const total = await Prompt.countDocuments(filter);
      const pages = Math.max(Math.ceil(total / limit), 1);
      const page = Math.min(Math.max(Math.floor(Number(req.query.page)) || 1, 1), pages);
      const rows = await Prompt.find(filter).select("-__v").sort({ _id: -1 }).skip((page - 1) * limit).limit(limit).lean();
      return res.json({ items: await decorate(req.userId, rows), total, page, pages, limit });
    }

    if (cursor && isId(String(cursor))) filter._id = { $lt: cursor };
    const rows = await Prompt.find(filter).select("-__v").sort({ _id: -1 }).limit(limit + 1).lean();
    const page = rows.slice(0, limit);
    res.json({
      items: await decorate(req.userId, page),
      nextCursor: rows.length > limit ? String(page[page.length - 1]._id) : null,
    });
  })
);

router.post(
  "/",
  ah(async (req, res) => {
    const data = parse(createSchema, req.body);
    const owner = req.userId;
    let product;
    if (data.product) {
      assertId(data.product, "sản phẩm");
      product = await Product.findById(data.product);
      if (!product) throw new HttpError(404, "Không tìm thấy sản phẩm.");
    } else {
      product = await findOrCreateProduct(owner, data.productName);
    }

    const doc = await Prompt.create({
      owner,
      product: product._id,
      prompt: data.prompt,
      negative: data.negative,
      note: data.note,
      tool: data.tool,
      source: data.source,
      settings: data.source === "external" ? {} : data.settings,
    });
    const updated = await Product.findByIdAndUpdate(
      product._id,
      { $inc: { promptCount: 1 }, $set: { lastPromptAt: new Date() } },
      { new: true, projection: PRODUCT_FIELDS }
    ).lean();

    const [item] = await decorate(owner, [doc.toObject()]);
    res.status(201).json({ item: { ...item, product: updated }, product: { _id: updated._id, name: updated.name } });
  })
);

router.patch(
  "/:id",
  ah(async (req, res) => {
    assertId(req.params.id, "prompt");
    const data = parse(patchSchema, req.body);
    const doc = await Prompt.findOneAndUpdate({ _id: req.params.id, owner: req.userId }, { $set: data }, { new: true })
      .select("-__v")
      .lean();
    if (!doc) throw new HttpError(404, "Không tìm thấy prompt.");
    const [item] = await decorate(req.userId, [doc]);
    res.json({ item });
  })
);

router.delete(
  "/:id",
  ah(async (req, res) => {
    assertId(req.params.id, "prompt");
    // Any member may delete any prompt (the app asks for confirmation); editing stays with the saver.
    const doc = await Prompt.findOneAndDelete({ _id: req.params.id });
    if (!doc) throw new HttpError(404, "Không tìm thấy prompt.");
    await Product.updateOne({ _id: doc.product, promptCount: { $gt: 0 } }, { $inc: { promptCount: -1 } });
    res.json({ ok: true });
  })
);

export default router;
