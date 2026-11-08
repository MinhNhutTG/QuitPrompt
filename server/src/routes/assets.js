import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { Asset, ASSET_KINDS, MAX_ASSET_IMAGES } from "../models/Asset.js";
import { User } from "../models/User.js";
import { ah, parse, assertId, text, HttpError } from "../lib/http.js";
import { requireCloudinary, uploadBuffer, destroyImages } from "../lib/cloudinary.js";
import { can } from "../middleware/auth.js";

// Kho người mẫu và phông nền (tài liệu 16). Shared by the team; changing them uses the "Tài nguyên" permissions.
const router = Router();

const KIND_LABEL = { model: "người mẫu", background: "phông nền" };

const tags = z
  .array(text("thẻ", 40), { invalid_type_error: "Thẻ không hợp lệ." })
  .max(10, "Tối đa 10 thẻ.")
  .transform((list) => [...new Map(list.filter(Boolean).map((t) => [t.toLowerCase(), t])).values()]);

const fields = {
  kind: z.enum(ASSET_KINDS, { errorMap: () => ({ message: "Loại không hợp lệ (người mẫu hoặc phông nền)." }) }),
  name: text("tên", 80, 1),
  description: text("mô tả cho AI", 1500),
  tags,
  note: text("ghi chú", 1000),
};
const createSchema = z.object({
  ...fields,
  description: fields.description.optional().default(""),
  tags: fields.tags.optional().default([]),
  note: fields.note.optional().default(""),
});
// The kind is fixed once made: a model's photos are not a background.
const patchSchema = z.object({ name: fields.name, description: fields.description, tags: fields.tags, note: fields.note }).partial();

const GONE_USER = { id: "", displayName: "(tài khoản đã xoá)" };

async function decorate(items) {
  const ids = [...new Set(items.map((r) => String(r.createdBy)))];
  const users = await User.find({ _id: { $in: ids } }, { username: 1, displayName: 1 }).lean();
  const byId = new Map(users.map((u) => [String(u._id), { id: String(u._id), displayName: u.displayName || u.username }]));
  return items.map(({ __v, ...r }) => ({ ...r, createdBy: byId.get(String(r.createdBy)) || GONE_USER }));
}
const one = async (doc) => (await decorate([doc.toObject ? doc.toObject() : doc]))[0];

async function findAsset(req) {
  assertId(req.params.id, "mục");
  const doc = await Asset.findById(req.params.id);
  if (!doc) throw new HttpError(404, "Không tìm thấy người mẫu hoặc phông nền này.");
  return doc;
}

// The whole store at once (newest edit first); the page filters it.
router.get(
  "/",
  ah(async (req, res) => {
    const filter = ASSET_KINDS.includes(req.query.kind) ? { kind: req.query.kind } : {};
    const items = await Asset.find(filter).sort({ updatedAt: -1 }).limit(1000).lean();
    res.json({ items: await decorate(items) });
  })
);

router.post(
  "/",
  can("resource.edit"),
  ah(async (req, res) => {
    const data = parse(createSchema, req.body);
    const doc = await Asset.create({ ...data, createdBy: req.userId });
    res.status(201).json({ item: await one(doc) });
  })
);

router.patch(
  "/:id",
  can("resource.edit"),
  ah(async (req, res) => {
    const data = parse(patchSchema, req.body);
    const doc = await findAsset(req);
    doc.set(data);
    await doc.save();
    res.json({ item: await one(doc) });
  })
);

router.delete(
  "/:id",
  can("resource.delete"),
  ah(async (req, res) => {
    const doc = await findAsset(req);
    await doc.deleteOne();
    await destroyImages(doc.images.map((i) => i.publicId));
    res.locals.audit = { label: `${KIND_LABEL[doc.kind]}: ${doc.name}` };
    res.json({ ok: true });
  })
);

// ---- images (same rules as product images)

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|heic|heif|avif)$/i;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 8 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/") || IMAGE_EXT.test(file.originalname)) return cb(null, true);
    cb(new HttpError(400, `“${file.originalname}” không phải ảnh. Chỉ nhận JPG, PNG, WEBP, GIF, HEIC, AVIF.`));
  },
});

function receiveImages(req, res, next) {
  upload.array("images", 8)(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") return next(new HttpError(413, "Ảnh vượt quá 10 MB. Chọn ảnh nhỏ hơn."));
      if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") return next(new HttpError(400, "Mỗi lần tải tối đa 8 ảnh."));
      return next(new HttpError(400, "Không đọc được file ảnh gửi lên."));
    }
    next(err);
  });
}

router.post(
  "/:id/images",
  can("resource.edit"),
  requireCloudinary,
  // The item is checked before the upload body is read.
  ah(async (req, res, next) => {
    req.asset = await findAsset(req);
    next();
  }),
  receiveImages,
  ah(async (req, res) => {
    const files = req.files || [];
    if (!files.length) throw new HttpError(400, "Chưa chọn ảnh nào.");
    const asset = req.asset;
    const cap = MAX_ASSET_IMAGES;
    const room = cap - asset.images.length;
    if (files.length > room) throw new HttpError(400, `Mỗi ${KIND_LABEL[asset.kind]} tối đa ${cap} ảnh. Còn thêm được ${Math.max(0, room)} ảnh.`);

    const folder = `prompt-studio/assets/${asset.kind}/${asset._id}`;
    let uploaded;
    try {
      uploaded = await Promise.all(files.map((f) => uploadBuffer(f.buffer, folder)));
    } catch (err) {
      console.error("Cloudinary: tải ảnh lỗi", err.message);
      throw new HttpError(400, "Cloudinary không nhận ảnh này. Thử ảnh khác hoặc đổi sang JPG.");
    }
    const images = uploaded.map((u) => ({ url: u.secure_url, publicId: u.public_id, width: u.width, height: u.height }));

    // Atomic guard: several uploads may land at once.
    const doc = await Asset.findOneAndUpdate(
      { _id: asset._id, [`images.${cap - images.length}`]: { $exists: false } },
      { $push: { images: { $each: images } } },
      { new: true }
    );
    if (!doc) {
      await destroyImages(images.map((i) => i.publicId));
      throw new HttpError(400, `Mỗi ${KIND_LABEL[asset.kind]} tối đa ${cap} ảnh.`);
    }
    res.locals.audit = { label: `${KIND_LABEL[doc.kind]}: ${doc.name}` };
    res.status(201).json({ item: await one(doc) });
  })
);

router.delete(
  "/:id/images",
  can("resource.edit"),
  ah(async (req, res) => {
    const publicId = String(req.query.publicId || "");
    const asset = await findAsset(req);
    if (!asset.images.some((i) => i.publicId === publicId)) throw new HttpError(404, "Không tìm thấy ảnh này.");
    const doc = await Asset.findOneAndUpdate({ _id: asset._id }, { $pull: { images: { publicId } } }, { new: true });
    await destroyImages([publicId]);
    res.locals.audit = { label: `${KIND_LABEL[doc.kind]}: ${doc.name}` };
    res.json({ item: await one(doc) });
  })
);

router.post(
  "/:id/cover",
  can("resource.edit"),
  ah(async (req, res) => {
    const { publicId } = parse(z.object({ publicId: z.string({ required_error: "Thiếu ảnh cần đặt." }) }), req.body);
    const doc = await findAsset(req);
    const i = doc.images.findIndex((img) => img.publicId === publicId);
    if (i < 0) throw new HttpError(404, "Không tìm thấy ảnh này.");
    const [img] = doc.images.splice(i, 1);
    doc.images.unshift(img);
    await doc.save();
    res.json({ item: await one(doc) });
  })
);

export default router;
