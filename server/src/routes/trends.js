import { Router } from "express";
import { z } from "zod";
import { TrendKeyword, keyOf } from "../models/TrendKeyword.js";
import { Product } from "../models/Product.js";
import { ah, parse, assertId, isId, text, HttpError } from "../lib/http.js";
import { can } from "../middleware/auth.js";
import { STALE_MS, scanState, startScan } from "../lib/trends.js";

// Trang "Đón sóng" (tài liệu 14). Everyone reads and may start a scan; adding, linking and removing phrases follows
// the product permission, since the list is the team's shared product research.
const router = Router();
const MAX_KEYWORDS = 200;

const productRef = z.union([z.string().refine(isId, "Sản phẩm không hợp lệ."), z.null()]).optional();
const createSchema = z.object({ keyword: text("từ khoá", 80, 2), product: productRef });
const patchSchema = z.object({ product: productRef });

const populate = (q) => q.populate("product", "name hot images");

async function checkProduct(id) {
  if (id && !(await Product.exists({ _id: id }))) throw new HttpError(404, "Không tìm thấy sản phẩm.");
}

router.get(
  "/",
  ah(async (req, res) => {
    const items = await populate(TrendKeyword.find({}).select("-__v -createdBy").sort({ createdAt: -1 })).lean();
    // Opening the page refreshes whatever is a day old.
    if (items.some((k) => !k.scannedAt || Date.now() - new Date(k.scannedAt) > STALE_MS)) startScan();
    res.json({ items, scan: scanState() });
  })
);

router.get("/scan", (req, res) => res.json({ scan: scanState() }));

// { ids?: [...] } scans those now; without ids, every phrase.
router.post(
  "/scan",
  ah(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(isId).slice(0, MAX_KEYWORDS) : null;
    if (!startScan({ ids: ids?.length ? ids : null, force: true })) throw new HttpError(409, "Đang quét rồi, chờ xong lượt này.");
    res.status(202).json({ scan: scanState() });
  })
);

router.post(
  "/",
  can("product.edit"),
  ah(async (req, res) => {
    const data = parse(createSchema, req.body);
    await checkProduct(data.product);
    if ((await TrendKeyword.countDocuments()) >= MAX_KEYWORDS) throw new HttpError(400, `Tối đa ${MAX_KEYWORDS} từ khoá. Xoá bớt từ khoá không còn cần.`);
    const key = keyOf(data.keyword);
    if (await TrendKeyword.exists({ key })) throw new HttpError(409, "Từ khoá này đã có trong danh sách.");
    const doc = await TrendKeyword.create({ keyword: data.keyword.replace(/\s+/g, " "), key, product: data.product || null, createdBy: req.userId });
    // Read it right away when nothing else is running; otherwise the next scan picks it up.
    startScan({ ids: [doc._id] });
    res.status(201).json({ item: await populate(TrendKeyword.findById(doc._id).select("-__v -createdBy")).lean(), scan: scanState() });
  })
);

router.patch(
  "/:id",
  can("product.edit"),
  ah(async (req, res) => {
    assertId(req.params.id, "từ khoá");
    const data = parse(patchSchema, req.body);
    await checkProduct(data.product);
    const item = await populate(TrendKeyword.findByIdAndUpdate(req.params.id, { product: data.product || null }, { new: true }).select("-__v -createdBy")).lean();
    if (!item) throw new HttpError(404, "Không tìm thấy từ khoá.");
    res.json({ item });
  })
);

router.delete(
  "/:id",
  can("product.edit"),
  ah(async (req, res) => {
    assertId(req.params.id, "từ khoá");
    const r = await TrendKeyword.deleteOne({ _id: req.params.id });
    if (!r.deletedCount) throw new HttpError(404, "Không tìm thấy từ khoá.");
    res.json({ ok: true });
  })
);

export default router;
