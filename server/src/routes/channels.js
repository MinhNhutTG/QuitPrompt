import { Router } from "express";
import { z } from "zod";
import { Channel, PLATFORMS } from "../models/Channel.js";
import { VideoPlan } from "../models/VideoPlan.js";
import { ah, parse, assertId, text, HttpError } from "../lib/http.js";
import { requireAdmin } from "../middleware/auth.js";

// Kênh đăng (doc 09 §4c): every member reads the list (plan pickers and filters), only an admin changes it.

const TAKEN = "Đã có kênh tên này.";
const platform = z.enum(PLATFORMS, { errorMap: () => ({ message: "Nền tảng không hợp lệ." }) });
const createSchema = z.object({ name: text("tên kênh", 60, 1), platform: platform.optional().default("tiktok") });
const patchSchema = z.object({ name: text("tên kênh", 60, 1).optional(), platform: platform.optional() });

export const channelOut = (c) => ({ _id: String(c._id), name: c.name, platform: c.platform });

// Sorted by platform (in PLATFORMS order), then name.
export async function listChannels() {
  const rows = await Channel.find().collation({ locale: "vi" }).sort({ name: 1 }).lean();
  return rows.sort((a, b) => PLATFORMS.indexOf(a.platform) - PLATFORMS.indexOf(b.platform)).map(channelOut);
}

const duplicate = (err) => {
  if (err.code === 11000) throw new HttpError(409, TAKEN);
  throw err;
};

export const channelRoutes = Router();

channelRoutes.get(
  "/",
  ah(async (req, res) => {
    const items = await listChannels();
    // How many plans each channel is on, for the admin list.
    const counts = await VideoPlan.aggregate([{ $unwind: "$channels" }, { $group: { _id: "$channels", n: { $sum: 1 } } }]);
    const byId = new Map(counts.map((c) => [String(c._id), c.n]));
    res.json({ items: items.map((c) => ({ ...c, plans: byId.get(c._id) || 0 })), platforms: PLATFORMS });
  })
);

channelRoutes.post(
  "/",
  requireAdmin,
  ah(async (req, res) => {
    const data = parse(createSchema, req.body);
    const doc = await Channel.create(data).catch(duplicate);
    res.status(201).json({ item: channelOut(doc) });
  })
);

channelRoutes.patch(
  "/:id",
  requireAdmin,
  ah(async (req, res) => {
    const data = parse(patchSchema, req.body);
    assertId(req.params.id, "kênh");
    const doc = await Channel.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true }).catch(duplicate);
    if (!doc) throw new HttpError(404, "Không tìm thấy kênh.");
    res.json({ item: channelOut(doc) });
  })
);

// Takes the channel off every plan too.
channelRoutes.delete(
  "/:id",
  requireAdmin,
  ah(async (req, res) => {
    assertId(req.params.id, "kênh");
    const doc = await Channel.findByIdAndDelete(req.params.id);
    if (!doc) throw new HttpError(404, "Không tìm thấy kênh.");
    const { modifiedCount } = await VideoPlan.updateMany({ channels: doc._id }, { $pull: { channels: doc._id } });
    res.locals.audit = { label: doc.name };
    res.json({ ok: true, plans: modifiedCount });
  })
);
