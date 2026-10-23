import { Router } from "express";
import { z } from "zod";
import { Resource, RESOURCE_KINDS } from "../models/Resource.js";
import { User } from "../models/User.js";
import { ah, parse, assertId, text, HttpError } from "../lib/http.js";

const router = Router();

const tags = z
  .array(text("thẻ", 40), { invalid_type_error: "Thẻ không hợp lệ." })
  .max(10, "Tối đa 10 thẻ.")
  // Dedupe case-insensitively, keep the first spelling.
  .transform((list) => [...new Map(list.filter(Boolean).map((t) => [t.toLowerCase(), t])).values()]);
const link = z
  .string()
  .trim()
  .max(500, "Liên kết tối đa 500 ký tự.")
  .refine((s) => !s || /^https?:\/\/\S+$/i.test(s), "Liên kết phải bắt đầu bằng http:// hoặc https://.");

const fields = {
  kind: z.enum(RESOURCE_KINDS, { errorMap: () => ({ message: "Loại tài nguyên không hợp lệ." }) }),
  title: text("tên", 200, 1),
  content: text("nội dung", 20000, 1),
  negative: text("negative", 5000),
  tool: text("công cụ", 60),
  tags,
  note: text("ghi chú", 1000),
  link,
};

const createSchema = z.object({
  ...fields,
  negative: fields.negative.optional().default(""),
  tool: fields.tool.optional().default(""),
  tags: fields.tags.optional().default([]),
  note: fields.note.optional().default(""),
  link: fields.link.optional().default(""),
});
const patchSchema = z.object(fields).partial();

const GONE_USER = { id: "", displayName: "(tài khoản đã xoá)" };

async function decorate(items) {
  const ids = [...new Set(items.map((r) => String(r.createdBy)))];
  const users = await User.find({ _id: { $in: ids } }, { username: 1, displayName: 1 }).lean();
  const byId = new Map(users.map((u) => [String(u._id), { id: String(u._id), displayName: u.displayName || u.username }]));
  return items.map(({ __v, ...r }) => ({ ...r, createdBy: byId.get(String(r.createdBy)) || GONE_USER }));
}

// The whole team's store, newest edit first. Small enough to send at once; the page filters it.
router.get(
  "/",
  ah(async (req, res) => {
    const items = await Resource.find({}).sort({ updatedAt: -1 }).limit(1000).lean();
    res.json({ items: await decorate(items) });
  })
);

router.post(
  "/",
  ah(async (req, res) => {
    const data = parse(createSchema, req.body);
    const doc = await Resource.create({ ...data, createdBy: req.userId });
    const [item] = await decorate([doc.toObject()]);
    res.status(201).json({ item });
  })
);

// Shared like products and plans: any member may edit or delete.
router.patch(
  "/:id",
  ah(async (req, res) => {
    assertId(req.params.id, "tài nguyên");
    const data = parse(patchSchema, req.body);
    const doc = await Resource.findById(req.params.id);
    if (!doc) throw new HttpError(404, "Không tìm thấy tài nguyên.");
    doc.set(data);
    await doc.save();
    const [item] = await decorate([doc.toObject()]);
    res.json({ item });
  })
);

router.delete(
  "/:id",
  ah(async (req, res) => {
    assertId(req.params.id, "tài nguyên");
    const doc = await Resource.findByIdAndDelete(req.params.id);
    if (!doc) throw new HttpError(404, "Không tìm thấy tài nguyên.");
    res.json({ ok: true });
  })
);

export default router;
