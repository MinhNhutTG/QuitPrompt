import { Router } from "express";
import crypto from "node:crypto";
import mongoose from "mongoose";
import { Product } from "../models/Product.js";
import { Prompt } from "../models/Prompt.js";
import { Settings, MAX_CUSTOM_ACTIONS } from "../models/Settings.js";
import { ah, HttpError } from "../lib/http.js";
import { can } from "../middleware/auth.js";

const router = Router();

// Aggregation pipelines are not cast by Mongoose, so ids must be ObjectIds there.
const oid = (id) => new mongoose.Types.ObjectId(String(id));
const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const ROLES = ["open", "mid", "end"];
const LEGACY_IDS = { o1: "t1", o2: "t9" };

// The old static page stored the chain as one `beats` array: first = opening, last = ending.
function convertLegacySettings(s) {
  if (!s || typeof s !== "object") return {};
  if (!Array.isArray(s.beats) || s.open) return s;
  const { beats, ...rest } = s;
  const b = beats.map((id) => LEGACY_IDS[id] || id);
  return { ...rest, open: b[0], mid: b.slice(1, -1), end: b.length > 1 ? b[b.length - 1] : undefined, endOn: b.length > 1 };
}

function toDate(v) {
  const d = new Date(typeof v === "number" ? v : String(v || ""));
  return Number.isNaN(d.getTime()) ? null : d;
}

router.post(
  "/import",
  can("data.import"),
  ah(async (req, res) => {
    const body = req.body;
    const owner = req.userId;
    const records = [];
    let productsData = [];
    let actions = [];
    let template = "";
    let negative = "";

    if (Array.isArray(body?.saved)) {
      // Backup from the old static page.
      for (const s of body.saved) {
        records.push({ productName: s?.product, prompt: s?.prompt, negative: s?.negative, note: s?.note, tool: s?.tool, settings: convertLegacySettings(s?.settings), at: s?.at });
      }
      for (const role of ROLES) for (const c of body.custom?.[role] || []) actions.push({ ...c, role });
    } else if (Array.isArray(body?.prompts) || Array.isArray(body?.products)) {
      // Export from this app.
      productsData = Array.isArray(body.products) ? body.products : [];
      for (const p of body.prompts || []) records.push({ ...p, at: p?.createdAt });
      actions = Array.isArray(body.settings?.customActions) ? body.settings.customActions : [];
      template = str(body.settings?.template, 30000);
      negative = str(body.settings?.negative, 5000);
    } else {
      throw new HttpError(400, "File không đúng định dạng sao lưu của Xưởng Prompt.");
    }

    // ---- products (shared by the team), grouped by case-insensitive name
    const existing = await Product.find({}, { name: 1 }).lean();
    const byName = new Map(existing.map((p) => [p.name.toLowerCase(), p._id]));
    let createdProducts = 0;

    async function productFor(name, data = {}) {
      const clean = str(name, 160) || "Chưa đặt tên";
      const key = clean.toLowerCase();
      if (byName.has(key)) return byName.get(key);
      const images = Array.isArray(data.images)
        ? data.images.filter((i) => typeof i?.url === "string" && typeof i?.publicId === "string").slice(0, 12)
        : [];
      const doc = await Product.create({
        owner,
        name: clean,
        sku: str(data.sku, 60),
        category: str(data.category, 60),
        note: str(data.note, 2000),
        extraNeg: str(data.extraNeg, 1000),
        closed: data.closed !== false,
        images: images.map(({ url, publicId, width, height }) => ({ url, publicId, width, height })),
      });
      createdProducts++;
      byName.set(key, doc._id);
      return doc._id;
    }

    for (const p of productsData) if (p?.name) await productFor(p.name, p);

    // ---- prompts, skipping exact duplicates within the same product (whoever saved them)
    let skipped = 0;
    const prepared = [];
    for (const r of records) {
      const prompt = typeof r.prompt === "string" ? r.prompt.trim() : "";
      if (!prompt || prompt.length > 20000) {
        skipped++;
        continue;
      }
      prepared.push({ r, prompt, product: await productFor(r.productName) });
    }

    const touched = [...new Set(prepared.map((p) => String(p.product)))];
    const already = await Prompt.find({ product: { $in: touched } }, { product: 1, prompt: 1 }).lean();
    const seen = new Set(already.map((p) => `${p.product}\n${p.prompt}`));

    const docs = [];
    for (const { r, prompt, product } of prepared) {
      const key = `${product}\n${prompt}`;
      if (seen.has(key)) {
        skipped++;
        continue;
      }
      seen.add(key);
      const at = toDate(r.at);
      docs.push({
        owner,
        product,
        prompt,
        negative: str(r.negative, 5000),
        note: str(r.note, 1000),
        tool: str(r.tool, 60),
        source: r.source === "external" ? "external" : "builder",
        settings: r.settings && typeof r.settings === "object" ? r.settings : {},
        ...(at ? { createdAt: at, updatedAt: at } : {}),
      });
    }
    if (docs.length) await Prompt.insertMany(docs);

    // Recount so promptCount and lastPromptAt stay exact.
    if (touched.length) {
      const stats = await Prompt.aggregate([
        { $match: { product: { $in: touched.map(oid) } } },
        { $group: { _id: "$product", count: { $sum: 1 }, last: { $max: "$createdAt" } } },
      ]);
      await Promise.all(stats.map((s) => Product.updateOne({ _id: s._id }, { $set: { promptCount: s.count, lastPromptAt: s.last } })));
    }

    // ---- custom actions and template
    const settings = (await Settings.findOne({ owner })) || new Settings({ owner });
    const ids = new Set(settings.customActions.map((a) => a.id));
    const sigs = new Set(settings.customActions.map((a) => `${a.label}\n${a.text}`));
    let addedActions = 0;
    for (const a of actions) {
      const label = str(a?.label, 200);
      const text = str(a?.text, 2000);
      const role = ROLES.includes(a?.role) ? a.role : "mid";
      if (!label || !text || sigs.has(`${label}\n${text}`)) continue;
      if (settings.customActions.length >= MAX_CUSTOM_ACTIONS) break;
      let id = str(a?.id, 40);
      if (!id || ids.has(id)) id = "c" + crypto.randomBytes(5).toString("hex");
      settings.customActions.push({ id, role, label, text });
      ids.add(id);
      sigs.add(`${label}\n${text}`);
      addedActions++;
    }
    if (template && !settings.template) settings.template = template;
    if (negative && !settings.negative) settings.negative = negative;
    if (addedActions || settings.isModified()) await settings.save();

    res.json({ products: createdProducts, prompts: docs.length, actions: addedActions, skipped });
  })
);

// Products and prompts are the whole team's; template and custom actions are the exporter's own.
router.get(
  "/export",
  can("data.export"),
  ah(async (req, res) => {
    const owner = req.userId;
    const [products, prompts, settings] = await Promise.all([
      Product.find({}).select("-owner -__v").sort({ createdAt: 1 }).lean(),
      Prompt.find({}).select("-owner -__v").sort({ _id: 1 }).lean(),
      Settings.findOne({ owner }).lean(),
    ]);
    const names = new Map(products.map((p) => [String(p._id), p.name]));
    const data = {
      app: "prompt-studio",
      version: 1,
      exportedAt: new Date().toISOString(),
      products,
      prompts: prompts.map((p) => ({ ...p, productName: names.get(String(p.product)) || "Chưa đặt tên" })),
      settings: { template: settings?.template || "", negative: settings?.negative || "", customActions: settings?.customActions || [] },
    };
    const day = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Disposition", `attachment; filename="xuong-prompt-${day}.json"`);
    res.type("application/json").send(JSON.stringify(data, null, 2));
  })
);

export default router;
