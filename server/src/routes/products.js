import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { Product, MAX_IMAGES } from "../models/Product.js";
import { Prompt } from "../models/Prompt.js";
import { VideoPlan } from "../models/VideoPlan.js";
import { ah, parse, assertId, escapeRegex, text, HttpError } from "../lib/http.js";
import { requireCloudinary, uploadBuffer, destroyImages } from "../lib/cloudinary.js";
import { can } from "../middleware/auth.js";
import { useDaily } from "../lib/tiers.js";
import { trashPlanFolders } from "../lib/planDrive.js";

const router = Router();

const createSchema = z.object({
  name: text("tên sản phẩm", 160, 1),
  sku: text("mã sản phẩm", 60).optional(),
  category: text("loại sản phẩm", 60).optional(),
  note: text("ghi chú", 2000).optional(),
  extraNeg: text("lỗi riêng cần chặn", 1000).optional(),
  closed: z.boolean({ invalid_type_error: "Ô “Áo luôn đóng” không hợp lệ." }).optional(),
  hot: z.boolean({ invalid_type_error: "Ô “Đang hot” không hợp lệ." }).optional(),
});
const patchSchema = createSchema.partial();

// Products belong to the whole team: everyone may read them; changing or deleting needs the role's permission.
// `owner` only records who created it.
async function findProduct(req, id = req.params.id) {
  assertId(id, "sản phẩm");
  const item = await Product.findById(id);
  if (!item) throw new HttpError(404, "Không tìm thấy sản phẩm.");
  return item;
}

router.get(
  "/",
  ah(async (req, res) => {
    const filter = {};
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
    if (q) {
      const rx = new RegExp(escapeRegex(q), "i");
      filter.$or = [{ name: rx }, { sku: rx }];
    }
    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
    const items = await Product.find(filter).select("-owner -__v").sort({ updatedAt: -1 }).limit(limit).lean();
    res.json({ items });
  })
);

router.post(
  "/",
  can("product.edit"),
  ah(async (req, res) => {
    const data = parse(createSchema, req.body);
    const refund = await useDaily(req, "productsPerDay");
    let item;
    try {
      item = await Product.create({ ...data, owner: req.userId });
    } catch (err) {
      await refund();
      throw err;
    }
    res.status(201).json({ item });
  })
);

router.get(
  "/:id",
  ah(async (req, res) => {
    res.json({ item: await findProduct(req) });
  })
);

router.patch(
  "/:id",
  can("product.edit"),
  ah(async (req, res) => {
    const data = parse(patchSchema, req.body);
    const item = await findProduct(req);
    item.set(data);
    await item.save();
    res.json({ item });
  })
);

router.delete(
  "/:id",
  can("product.delete"),
  ah(async (req, res) => {
    const item = await findProduct(req);
    const plans = await VideoPlan.find({ product: item._id }, { folder: 1 }).lean();
    await Promise.all([Prompt.deleteMany({ product: item._id }), VideoPlan.deleteMany({ product: item._id })]);
    await item.deleteOne();
    await destroyImages(item.images.map((i) => i.publicId));
    await trashPlanFolders(plans);
    res.locals.audit = { label: item.name };
    res.json({ ok: true });
  })
);

// ---- images

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
      if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE")
        return next(new HttpError(400, "Mỗi lần tải tối đa 8 ảnh."));
      return next(new HttpError(400, "Không đọc được file ảnh gửi lên."));
    }
    next(err);
  });
}

router.post(
  "/:id/images",
  can("product.edit"),
  requireCloudinary,
  // The product is checked before the upload body is read.
  ah(async (req, res, next) => {
    req.product = await findProduct(req);
    next();
  }),
  receiveImages,
  ah(async (req, res) => {
    const files = req.files || [];
    if (!files.length) throw new HttpError(400, "Chưa chọn ảnh nào.");
    const product = req.product;
    // The uploader's tier may allow fewer images than the app-wide maximum.
    const cap = Math.min(MAX_IMAGES, req.limits?.imagesPerProduct ?? MAX_IMAGES);
    const room = cap - product.images.length;
    if (files.length > room) throw new HttpError(400, `Mỗi sản phẩm tối đa ${cap} ảnh${cap < MAX_IMAGES ? " với hạng tài khoản của bạn" : ""}. Còn thêm được ${Math.max(0, room)} ảnh.`);

    const folder = `prompt-studio/${req.userId}/${product._id}`;
    let uploaded;
    try {
      uploaded = await Promise.all(files.map((f) => uploadBuffer(f.buffer, folder)));
    } catch (err) {
      console.error("Cloudinary: tải ảnh lỗi", err.message);
      throw new HttpError(400, "Cloudinary không nhận ảnh này. Thử ảnh khác hoặc đổi sang JPG.");
    }
    const images = uploaded.map((u) => ({ url: u.secure_url, publicId: u.public_id, width: u.width, height: u.height }));

    // Atomic guard: the browser uploads several images in parallel.
    const item = await Product.findOneAndUpdate(
      { _id: product._id, [`images.${cap - images.length}`]: { $exists: false } },
      { $push: { images: { $each: images } } },
      { new: true }
    );
    if (!item) {
      await destroyImages(images.map((i) => i.publicId));
      throw new HttpError(400, `Mỗi sản phẩm tối đa ${cap} ảnh.`);
    }
    res.status(201).json({ item });
  })
);

router.delete(
  "/:id/images",
  can("product.edit"),
  ah(async (req, res) => {
    const publicId = String(req.query.publicId || "");
    const product = await findProduct(req);
    if (!product.images.some((i) => i.publicId === publicId)) throw new HttpError(404, "Không tìm thấy ảnh này.");
    const item = await Product.findOneAndUpdate({ _id: product._id }, { $pull: { images: { publicId } } }, { new: true });
    await destroyImages([publicId]);
    res.json({ item });
  })
);

router.post(
  "/:id/cover",
  can("product.edit"),
  ah(async (req, res) => {
    const { publicId } = parse(z.object({ publicId: z.string({ required_error: "Thiếu ảnh cần đặt." }) }), req.body);
    const item = await findProduct(req);
    const i = item.images.findIndex((img) => img.publicId === publicId);
    if (i < 0) throw new HttpError(404, "Không tìm thấy ảnh này.");
    const [img] = item.images.splice(i, 1);
    item.images.unshift(img);
    await item.save();
    res.json({ item });
  })
);

export default router;

// Case-insensitive exact name match across the team; created (owned by `owner`) when missing,
// unless `create` is false (then null). With req, creating counts toward that account's daily product limit.
// Used when saving prompts.
export async function findOrCreateProduct(owner, name, create = true, req = null) {
  const clean = name.trim().slice(0, 160);
  const existing = await Product.findOne({ name: new RegExp(`^${escapeRegex(clean)}$`, "i") });
  if (existing || !create) return existing;
  const refund = req ? await useDaily(req, "productsPerDay") : async () => {};
  try {
    return await Product.create({ owner, name: clean });
  } catch (err) {
    await refund();
    throw err;
  }
}
