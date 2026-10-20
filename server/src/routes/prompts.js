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

const PRODUCT_FIELDS = { name: 1, sku: 1, images: { $slice: 1 } };

// The saver is looked up by owner id (not stored as text), so a renamed account shows its current name.
async function savedByMap(prompts) {
  const ids = [...new Set(prompts.map((p) => String(p.owner)))];
  const users = await User.find({ _id: { $in: ids } }, { username: 1, displayName: 1 }).lean();
  return new Map(users.map((u) => [String(u._id), { username: u.username, displayName: u.displayName || u.username }]));
}

const GONE = { username: "", displayName: "(tài khoản đã xoá)" };

// Attaches product { _id, name, sku, images: [cover] } and savedBy { username, displayName }; drops the raw owner id.
async function decorate(owner, prompts) {
  const ids = [...new Set(prompts.map((p) => String(p.product)))];
  const [products, savers] = await Promise.all([Product.find({ owner, _id: { $in: ids } }, PRODUCT_FIELDS).lean(), savedByMap(prompts)]);
  const byId = new Map(products.map((p) => [String(p._id), p]));
  return prompts.map(({ owner: o, ...p }) => ({
    ...p,
    product: byId.get(String(p.product)) || { _id: p.product, name: "(sản phẩm đã xoá)", images: [] },
    savedBy: savers.get(String(o)) || GONE,
  }));
}

router.get(
  "/",
  ah(async (req, res) => {
    const owner = req.userId;
    const filter = { owner };
    const { product, cursor } = req.query;
    if (product) filter.product = assertId(String(product), "sản phẩm");
    if (cursor && isId(String(cursor))) filter._id = { $lt: cursor };

    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
    if (q) {
      const rx = new RegExp(escapeRegex(q), "i");
      const matching = await Product.find({ owner, $or: [{ name: rx }, { sku: rx }] }, { _id: 1 }).lean();
      filter.$or = [{ note: rx }, { tool: rx }, { product: { $in: matching.map((p) => p._id) } }];
    }

    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    const rows = await Prompt.find(filter).select("-__v").sort({ _id: -1 }).limit(limit + 1).lean();
    const page = rows.slice(0, limit);
    res.json({
      items: await decorate(owner, page),
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
      product = await Product.findOne({ _id: data.product, owner });
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
    const doc = await Prompt.findOneAndDelete({ _id: req.params.id, owner: req.userId });
    if (!doc) throw new HttpError(404, "Không tìm thấy prompt.");
    await Product.updateOne({ _id: doc.product, promptCount: { $gt: 0 } }, { $inc: { promptCount: -1 } });
    res.json({ ok: true });
  })
);

export default router;
