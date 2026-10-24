import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { VideoPlan, PLAN_STATUSES } from "../models/VideoPlan.js";
import { Product } from "../models/Product.js";
import { User } from "../models/User.js";
import { ah, parse, assertId, isId, escapeRegex, text, HttpError } from "../lib/http.js";
import { can } from "../middleware/auth.js";
import { deniedMessage } from "../lib/permissions.js";

const router = Router();

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const day = z.string().regex(DAY, "Ngày không hợp lệ.").or(z.literal(""));
const target = z.number({ invalid_type_error: "Mục tiêu phải là số." }).int("Mục tiêu phải là số nguyên.").min(1, "Mục tiêu ít nhất 1 video.").max(999, "Mục tiêu tối đa 999 video.");
const id = (what) => z.string({ required_error: `Chưa chọn ${what}.` }).refine(isId, `Không tìm thấy ${what}.`);

const createSchema = z.object({
  products: z.array(id("sản phẩm"), { required_error: "Chưa chọn sản phẩm." }).min(1, "Chưa chọn sản phẩm.").max(50, "Mỗi lần tối đa 50 sản phẩm."),
  target,
  assignee: id("người thực hiện"),
  dueDate: day.optional().default(""),
  note: text("ghi chú", 1000).optional().default(""),
  // Whoever adds the row may set the starting status; afterwards only the assignee changes it.
  status: z.enum(PLAN_STATUSES, { errorMap: () => ({ message: "Trạng thái không hợp lệ." }) }).optional().default("todo"),
  done: z.number().int().min(0).max(999).optional().default(0),
});

const patchSchema = z.object({
  target: target.optional(),
  assignee: id("người thực hiện").optional(),
  dueDate: day.optional(),
  note: text("ghi chú", 1000).optional(),
  status: z.enum(PLAN_STATUSES, { errorMap: () => ({ message: "Trạng thái không hợp lệ." }) }).optional(),
  done: z.number().int().min(0).max(999).optional(),
});

const PRODUCT_FIELDS = { name: 1, sku: 1, category: 1, images: { $slice: 1 } };
const GONE_PRODUCT = { name: "(sản phẩm đã xoá)", images: [] };
const GONE_USER = { id: "", displayName: "(tài khoản đã xoá)" };

// Attaches product { _id, name, sku, category, images: [cover] }, assignee and createdBy { id, displayName }.
async function decorate(plans) {
  const productIds = [...new Set(plans.map((p) => String(p.product)))];
  const userIds = [...new Set(plans.flatMap((p) => [String(p.assignee), String(p.createdBy)]))];
  const [products, users] = await Promise.all([
    Product.find({ _id: { $in: productIds } }, PRODUCT_FIELDS).lean(),
    User.find({ _id: { $in: userIds } }, { username: 1, displayName: 1 }).lean(),
  ]);
  const productById = new Map(products.map((p) => [String(p._id), p]));
  const userById = new Map(users.map((u) => [String(u._id), { id: String(u._id), displayName: u.displayName || u.username }]));
  return plans.map(({ __v, ...p }) => ({
    ...p,
    product: productById.get(String(p.product)) || { _id: p.product, ...GONE_PRODUCT },
    assignee: userById.get(String(p.assignee)) || GONE_USER,
    createdBy: userById.get(String(p.createdBy)) || GONE_USER,
  }));
}

async function assertMember(userId) {
  if (!(await User.exists({ _id: userId }))) throw new HttpError(404, "Không tìm thấy người thực hiện.");
}

// Keeps done consistent with the chosen status.
function settle(plan) {
  if (plan.status === "todo") plan.done = 0;
  else if (plan.status === "done") plan.done = plan.target;
  else plan.done = Math.min(Math.max(plan.done || 0, 0), Math.max(plan.target - 1, 0));
}

// Filters: assignee, status ("open" = todo + partial), category, q (product name or sku),
// dueFrom/dueTo (inclusive days), overdue=1 with today (the viewer's local day, "YYYY-MM-DD").
// Unfinished first, done last; within each, by due day (none last), then newest. Returns one numbered page plus a summary of the whole filter.
router.get(
  "/",
  ah(async (req, res) => {
    const match = {};
    const { assignee, status, category } = req.query;
    // Aggregation pipelines are not cast by Mongoose, so ids must be ObjectIds here.
    if (assignee) match.assignee = new mongoose.Types.ObjectId(assertId(String(assignee), "người thực hiện"));
    if (status === "open") match.status = { $in: ["todo", "partial"] };
    else if (PLAN_STATUSES.includes(status)) match.status = status;

    const productConds = [];
    if (typeof category === "string" && category) {
      const c = category.trim().slice(0, 60);
      productConds.push(c === "__none" ? { category: { $in: ["", null] } } : { category: new RegExp(`^${escapeRegex(c)}$`, "i") });
    }
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
    if (q) {
      const rx = new RegExp(escapeRegex(q), "i");
      productConds.push({ $or: [{ name: rx }, { sku: rx }] });
    }
    if (productConds.length) {
      const ids = await Product.find({ $and: productConds }, { _id: 1 }).lean();
      match.product = { $in: ids.map((p) => p._id) };
    }

    const today = DAY.test(String(req.query.today)) ? String(req.query.today) : new Date().toISOString().slice(0, 10);
    const due = {};
    if (DAY.test(String(req.query.dueFrom))) due.$gte = String(req.query.dueFrom);
    if (DAY.test(String(req.query.dueTo))) due.$lte = String(req.query.dueTo);
    if (req.query.overdue === "1") {
      due.$lt = today;
      if (!match.status) match.status = { $in: ["todo", "partial"] };
    }
    if (Object.keys(due).length) match.dueDate = { $gt: "", ...due };

    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    const [summary] = await VideoPlan.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          plans: { $sum: 1 },
          target: { $sum: "$target" },
          done: { $sum: "$done" },
          todo: { $sum: { $cond: [{ $eq: ["$status", "todo"] }, 1, 0] } },
          partial: { $sum: { $cond: [{ $eq: ["$status", "partial"] }, 1, 0] } },
          finished: { $sum: { $cond: [{ $eq: ["$status", "done"] }, 1, 0] } },
          overdue: {
            $sum: { $cond: [{ $and: [{ $ne: ["$status", "done"] }, { $gt: ["$dueDate", ""] }, { $lt: ["$dueDate", today] }] }, 1, 0] },
          },
        },
      },
    ]);
    const total = summary?.plans || 0;
    const pages = Math.max(Math.ceil(total / limit), 1);
    const page = Math.min(Math.max(Math.floor(Number(req.query.page)) || 1, 1), pages);
    const rows = await VideoPlan.aggregate([
      { $match: match },
      { $addFields: { isDone: { $eq: ["$status", "done"] }, noDue: { $eq: ["$dueDate", ""] } } },
      { $sort: { isDone: 1, noDue: 1, dueDate: 1, _id: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
      { $project: { isDone: 0, noDue: 0 } },
    ]);
    const { _id, plans, ...counts } = summary || { target: 0, done: 0, todo: 0, partial: 0, finished: 0, overdue: 0 };
    res.json({ items: await decorate(rows), total, page, pages, limit, today, summary: { plans: total, ...counts } });
  })
);

router.post(
  "/",
  can("plan.edit"),
  ah(async (req, res) => {
    const data = parse(createSchema, req.body);
    const productIds = [...new Set(data.products)];
    const [found] = await Promise.all([Product.countDocuments({ _id: { $in: productIds } }), assertMember(data.assignee)]);
    if (found !== productIds.length) throw new HttpError(404, "Có sản phẩm không còn tồn tại. Tải lại trang rồi chọn lại.");
    const docs = await VideoPlan.insertMany(
      productIds.map((product) => {
        const plan = { product, target: data.target, assignee: data.assignee, dueDate: data.dueDate, note: data.note, status: data.status, done: data.done, createdBy: req.userId };
        settle(plan);
        return plan;
      })
    );
    res.status(201).json({ items: await decorate(docs.map((d) => d.toObject())) });
  })
);

// Target, assignee, due day and note need plan.edit; the status is the assignee's alone, whatever their role.
router.patch(
  "/:id",
  ah(async (req, res) => {
    assertId(req.params.id, "kế hoạch");
    const data = parse(patchSchema, req.body);
    const plan = await VideoPlan.findById(req.params.id);
    if (!plan) throw new HttpError(404, "Không tìm thấy kế hoạch.");
    if ((data.status !== undefined || data.done !== undefined) && String(plan.assignee) !== String(req.userId)) {
      throw new HttpError(403, "Chỉ người thực hiện mới cập nhật được trạng thái.");
    }
    if (Object.keys(data).some((k) => k !== "status" && k !== "done") && !req.permissions.has("plan.edit")) {
      throw new HttpError(403, deniedMessage("plan.edit"));
    }
    if (data.assignee) await assertMember(data.assignee);
    plan.set(data);
    settle(plan);
    await plan.save();
    const [item] = await decorate([plan.toObject()]);
    res.json({ item });
  })
);

const bulkDeleteSchema = z.object({
  ids: z.array(id("kế hoạch"), { required_error: "Chưa chọn kế hoạch nào." }).min(1, "Chưa chọn kế hoạch nào.").max(500, "Mỗi lần xoá tối đa 500 kế hoạch."),
});

// Deletes every chosen plan in one go; plans already gone are simply skipped.
router.post(
  "/bulk-delete",
  can("plan.delete"),
  ah(async (req, res) => {
    const { ids } = parse(bulkDeleteSchema, req.body);
    const { deletedCount } = await VideoPlan.deleteMany({ _id: { $in: [...new Set(ids)] } });
    res.json({ ok: true, deleted: deletedCount });
  })
);

router.delete(
  "/:id",
  can("plan.delete"),
  ah(async (req, res) => {
    assertId(req.params.id, "kế hoạch");
    const plan = await VideoPlan.findByIdAndDelete(req.params.id);
    if (!plan) throw new HttpError(404, "Không tìm thấy kế hoạch.");
    const product = await Product.findById(plan.product, { name: 1 }).lean();
    res.locals.audit = { label: product?.name || "", meta: { target: plan.target } };
    res.json({ ok: true });
  })
);

export default router;
