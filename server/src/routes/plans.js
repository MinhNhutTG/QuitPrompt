import { Readable } from "node:stream";
import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { VideoPlan, PLAN_SLOTS, COUNTED_SLOTS, PLAN_STATUSES, FINISHED_STATUSES } from "../models/VideoPlan.js";
import { Product } from "../models/Product.js";
import { User } from "../models/User.js";
import { Script } from "../models/Script.js";
import { Channel } from "../models/Channel.js";
import { channelOut } from "./channels.js";
import { config } from "../config.js";
import { ah, parse, assertId, isId, escapeRegex, text, HttpError } from "../lib/http.js";
import { HANDOFF_HOURS, can, signHandoff } from "../middleware/auth.js";
import { deniedMessage } from "../lib/permissions.js";
import { vnDay } from "../lib/tiers.js";
import { driveConfigured, gapi, getLink, openUpload, stamp, trash } from "../lib/drive.js";
import { ensurePlanFolder, trashPlanFolders } from "../lib/planDrive.js";
import { overview, speak, stripTags } from "../lib/elevenlabs.js";

const router = Router();

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const day = z.string().regex(DAY, "Ngày không hợp lệ.").or(z.literal(""));
const target = z.number({ invalid_type_error: "Mục tiêu phải là số." }).int("Mục tiêu phải là số nguyên.").min(1, "Mục tiêu ít nhất 1 video.").max(999, "Mục tiêu tối đa 999 video.");
const id = (what) => z.string({ required_error: `Chưa chọn ${what}.` }).refine(isId, `Không tìm thấy ${what}.`);

const createSchema = z.object({
  products: z.array(id("sản phẩm"), { required_error: "Chưa chọn sản phẩm." }).min(1, "Chưa chọn sản phẩm.").max(50, "Mỗi lần tối đa 50 sản phẩm."),
  // A plan is one finished video now; the count only stays for older clients.
  target: target.optional().default(1),
  assignee: id("người thực hiện"),
  dueDate: day.optional().default(""),
  note: text("ghi chú", 1000).optional().default(""),
  status: z.enum(PLAN_STATUSES, { errorMap: () => ({ message: "Trạng thái không hợp lệ." }) }).optional().default("todo"),
  done: z.number().int().min(0).max(999).optional().default(0),
  // A saved voice-over and caption of one of the chosen products: its texts go into that product's plan.
  script: id("lời đọc").optional(),
  channels: z.array(id("kênh đăng")).max(20, "Tối đa 20 kênh.").optional().default([]),
});

const patchSchema = z.object({
  target: target.optional(),
  assignee: id("người thực hiện").optional(),
  dueDate: day.optional(),
  note: text("ghi chú", 1000).optional(),
  status: z.enum(PLAN_STATUSES, { errorMap: () => ({ message: "Trạng thái không hợp lệ." }) }).optional(),
  done: z.number().int().min(0).max(999).optional(),
  voiceText: text("lời đọc", 5000).optional(),
  caption: text("mô tả khi đăng", 5000).optional(),
  imageRequest: text("yêu cầu sửa ảnh", 1000).optional(),
  pinned: z.boolean({ invalid_type_error: "Ghim không hợp lệ." }).optional(),
  channels: z.array(id("kênh đăng")).max(20, "Tối đa 20 kênh.").optional(),
  // A saved voice-over and caption of the plan's product: replaces both texts.
  script: id("lời đọc").optional(),
});

// The team works on every plan, whoever it is for: any member changes the status, the texts and the files, and
// pins it and marks where it will be posted. The rest (assignee, due day, note) needs plan.edit.
const WORK_FIELDS = new Set(["status", "done", "voiceText", "caption", "imageRequest", "pinned", "script", "channels"]);

// The chosen channels, without repeats; every one must still exist.
async function checkChannels(ids) {
  const list = [...new Set(ids)];
  if (list.length && (await Channel.countDocuments({ _id: { $in: list } })) !== list.length) {
    throw new HttpError(404, "Có kênh đăng vừa bị xoá. Tải lại trang rồi chọn lại.");
  }
  return list;
}

// A saved voice-over and caption, checked to belong to the product.
async function loadScript(scriptId, productId) {
  const script = await Script.findById(scriptId);
  if (!script) throw new HttpError(404, "Không tìm thấy lời đọc đã chọn. Có thể nó vừa bị xoá.");
  if (String(script.product) !== String(productId)) throw new HttpError(400, "Lời đọc đã chọn không thuộc sản phẩm này.");
  return script;
}

// The plan took this voice-over and caption: it is marked used.
const markUsed = (script, planId) => Script.updateOne({ _id: script._id }, { used: true, usedAt: new Date(), usedPlan: planId });

async function loadPlan(planId) {
  assertId(planId, "kế hoạch");
  const plan = await VideoPlan.findById(planId);
  if (!plan) throw new HttpError(404, "Không tìm thấy kế hoạch.");
  return plan;
}

const loadWorkablePlan = (req) => loadPlan(req.params.id);

const productName = async (plan) => (await Product.findById(plan.product, { name: 1 }).lean())?.name || "";

const slotKey = z.enum(Object.keys(PLAN_SLOTS), { errorMap: () => ({ message: "Mục file không hợp lệ." }) });

const PRODUCT_FIELDS = { name: 1, sku: 1, category: 1, hot: 1, closed: 1, extraNeg: 1, images: { $slice: 1 } };
const GONE_PRODUCT = { name: "(sản phẩm đã xoá)", images: [] };
const GONE_USER = { id: "", displayName: "(tài khoản đã xoá)" };

// Attaches product { _id, name, sku, category, hot, images: [cover] }, assignee and createdBy { id, displayName },
// claim { by: { id, displayName }, at } or null, and channels [{ _id, name, platform }].
async function decorate(plans) {
  const productIds = [...new Set(plans.map((p) => String(p.product)))];
  const userIds = [
    ...new Set(plans.flatMap((p) => [String(p.assignee), String(p.createdBy), ...(p.claimedBy ? [String(p.claimedBy)] : []), ...(p.imageApproved?.by ? [String(p.imageApproved.by)] : [])])),
  ];
  const channelIds = [...new Set(plans.flatMap((p) => (p.channels || []).map(String)))];
  const [products, users, channels] = await Promise.all([
    Product.find({ _id: { $in: productIds } }, PRODUCT_FIELDS).lean(),
    User.find({ _id: { $in: userIds } }, { username: 1, displayName: 1 }).lean(),
    channelIds.length ? Channel.find({ _id: { $in: channelIds } }).lean() : [],
  ]);
  const channelById = new Map(channels.map((c) => [String(c._id), channelOut(c)]));
  const productById = new Map(products.map((p) => [String(p._id), p]));
  const userById = new Map(users.map((u) => [String(u._id), { id: String(u._id), displayName: u.displayName || u.username }]));
  return plans.map(({ __v, claimedBy, claimedAt, imageApproved, ...p }) => ({
    ...p,
    product: productById.get(String(p.product)) || { _id: p.product, ...GONE_PRODUCT },
    assignee: userById.get(String(p.assignee)) || GONE_USER,
    createdBy: userById.get(String(p.createdBy)) || GONE_USER,
    // A claim by a deleted account holds nothing.
    claim: claimedBy && userById.has(String(claimedBy)) ? { by: userById.get(String(claimedBy)), at: claimedAt } : null,
    // The AI image was approved: { by: { id, displayName }, at } or null.
    imageApproved: imageApproved ? { by: userById.get(String(imageApproved.by)) || GONE_USER, at: imageApproved.at } : null,
    channels: (p.channels || []).map((c) => channelById.get(String(c))).filter(Boolean),
  }));
}

async function assertMember(userId) {
  if (!(await User.exists({ _id: userId }))) throw new HttpError(404, "Không tìm thấy người thực hiện.");
}

// Keeps done consistent with the chosen status. A finished plan is no longer anyone's to work on.
function settle(plan) {
  if (plan.status === "todo") plan.done = 0;
  else if (FINISHED_STATUSES.includes(plan.status)) plan.done = plan.target;
  else plan.done = Math.min(Math.max(plan.done || 0, 0), Math.max(plan.target - 1, 0));
  if (FINISHED_STATUSES.includes(plan.status) && plan.claimedBy) {
    plan.claimedBy = null;
    plan.claimedAt = null;
  }
}

// How many of the plan's files and two texts are in (the client's progressOf counts the same).
const ITEM_COUNT = COUNTED_SLOTS.length + 2;
const filled = (plan) => COUNTED_SLOTS.filter((s) => plan.files?.[s]?.id).length + (plan.voiceText ? 1 : 0) + (plan.caption ? 1 : 0);

// After a file or text changes, the status follows what is in: none → todo, some → partial, all → done.
// A plan marked done by hand before it was full stays done; one that was done only because it was full drops back.
// A posted plan stays posted whatever changes.
function autoStatus(plan, before) {
  const n = filled(plan);
  if (plan.status === "posted") {
    settle(plan);
    return;
  }
  if (n === ITEM_COUNT) plan.status = "done";
  else if (plan.status !== "done" || before === ITEM_COUNT) plan.status = n ? "partial" : "todo";
  settle(plan);
}

// Filters: assignee, status ("open" = todo + partial, "finished" = done + posted), category, q (product name or sku),
// channel (an id, or "__none" for plans with no channel yet), claim (free | taken | me), dueFrom/dueTo (inclusive days), overdue=1 with today (the viewer's local day, "YYYY-MM-DD").
// Pinned first (newest pin first), then unfinished, then done, posted last; within each, the plans I am working on,
// then the ones nobody took, then other people's; then by due day (none last), then newest.
// Returns one numbered page, a summary of the whole filter, and how many plans each claim view would show.
router.get(
  "/",
  ah(async (req, res) => {
    const match = {};
    const { assignee, status, category } = req.query;
    // Aggregation pipelines are not cast by Mongoose, so ids must be ObjectIds here.
    if (assignee) match.assignee = new mongoose.Types.ObjectId(assertId(String(assignee), "người thực hiện"));
    if (status === "open") match.status = { $in: ["todo", "partial"] };
    else if (status === "finished") match.status = { $in: FINISHED_STATUSES };
    else if (PLAN_STATUSES.includes(status)) match.status = status;
    const { channel } = req.query;
    if (channel === "__none") match.channels = { $in: [null, []] }; // older plans have no field at all
    else if (channel) match.channels = new mongoose.Types.ObjectId(assertId(String(channel), "kênh đăng"));

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

    // Who is on it: free = unfinished and nobody took it, taken = someone is working on it, me = I am.
    // The counts of the three views are for the same filters without this one.
    const me = new mongoose.Types.ObjectId(req.userId);
    const OPEN = { $nin: FINISHED_STATUSES };
    const claimMatch = { free: { claimedBy: null, status: OPEN }, taken: { claimedBy: { $ne: null } }, me: { claimedBy: me } }[req.query.claim];
    const [views = {}] = await VideoPlan.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          all: { $sum: 1 },
          free: { $sum: { $cond: [{ $and: [{ $not: [{ $ifNull: ["$claimedBy", false] }] }, { $not: [{ $in: ["$status", FINISHED_STATUSES] }] }] }, 1, 0] } },
          taken: { $sum: { $cond: [{ $ifNull: ["$claimedBy", false] }, 1, 0] } },
          me: { $sum: { $cond: [{ $eq: ["$claimedBy", me] }, 1, 0] } },
        },
      },
      { $project: { _id: 0 } },
    ]);
    if (claimMatch) {
      const { status: open, ...rest } = claimMatch;
      Object.assign(match, rest);
      // Kept apart so it narrows a chosen status instead of replacing it.
      if (open) match.$and = [{ status: open }];
    }

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
          posted: { $sum: { $cond: [{ $eq: ["$status", "posted"] }, 1, 0] } },
          overdue: {
            $sum: { $cond: [{ $and: [{ $not: [{ $in: ["$status", FINISHED_STATUSES] }] }, { $gt: ["$dueDate", ""] }, { $lt: ["$dueDate", today] }] }, 1, 0] },
          },
        },
      },
    ]);
    const total = summary?.plans || 0;
    const pages = Math.max(Math.ceil(total / limit), 1);
    const page = Math.min(Math.max(Math.floor(Number(req.query.page)) || 1, 1), pages);
    const rows = await VideoPlan.aggregate([
      { $match: match },
      // pin: 0 pinned, 1 not. finish: -1 unfinished, 0 done, 1 posted. who: 0 mine, 1 nobody's, 2 someone else's.
      {
        $addFields: {
          pin: { $cond: [{ $ifNull: ["$pinnedAt", false] }, 0, 1] },
          finish: { $indexOfArray: [FINISHED_STATUSES, "$status"] },
          who: { $cond: [{ $eq: ["$claimedBy", me] }, 0, { $cond: [{ $ifNull: ["$claimedBy", false] }, 2, 1] }] },
          noDue: { $eq: ["$dueDate", ""] },
        },
      },
      { $sort: { pin: 1, pinnedAt: -1, finish: 1, who: 1, noDue: 1, dueDate: 1, _id: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
      { $project: { pin: 0, finish: 0, who: 0, noDue: 0 } },
    ]);
    const { _id, plans, ...counts } = summary || { target: 0, done: 0, todo: 0, partial: 0, finished: 0, posted: 0, overdue: 0 };
    res.json({ items: await decorate(rows), total, page, pages, limit, today, summary: { plans: total, ...counts }, views: { all: 0, free: 0, taken: 0, me: 0, ...views } });
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
    const script = data.script ? await Script.findById(data.script) : null;
    if (data.script && !script) throw new HttpError(404, "Không tìm thấy lời đọc đã chọn. Có thể nó vừa bị xoá.");
    if (script && !productIds.includes(String(script.product))) throw new HttpError(400, "Lời đọc đã chọn không thuộc sản phẩm nào của kế hoạch.");
    const channels = await checkChannels(data.channels);
    const day = vnDay();
    const docs = await VideoPlan.insertMany(
      productIds.map((product) => {
        const plan = { product, target: data.target, assignee: data.assignee, dueDate: data.dueDate, note: data.note, status: data.status, done: data.done, channels, day, createdBy: req.userId };
        if (script && String(script.product) === product) {
          plan.voiceText = script.voiceText;
          plan.caption = script.caption;
          // Left at "chưa thực hiện", the status follows the texts it now has.
          if (plan.status === "todo") autoStatus(plan, 0);
        }
        settle(plan);
        return plan;
      })
    );
    if (script) await markUsed(script, docs.find((d) => String(d.product) === String(script.product))._id);
    // Each plan gets its Drive folder now. Without Drive (or if Google fails) the plan is still saved
    // and the folder is made on its first upload.
    let driveWarning = "";
    if (driveConfigured() && (await getLink())?.rootId) {
      const names = new Map((await Product.find({ _id: { $in: productIds } }, { name: 1 }).lean()).map((p) => [String(p._id), p.name]));
      for (const doc of docs) {
        try {
          await ensurePlanFolder(doc, names.get(String(doc.product)));
        } catch (err) {
          driveWarning = `Chưa tạo được thư mục trên Google Drive (${err.message}). Thư mục sẽ được tạo khi tải file đầu tiên.`;
          break;
        }
      }
    }
    res.status(201).json({ items: await decorate(docs.map((d) => d.toObject())), driveWarning });
  })
);

router.get(
  "/:id",
  ah(async (req, res) => {
    const plan = await loadPlan(req.params.id);
    const [item] = await decorate([plan.toObject()]);
    res.json({ item });
  })
);

// Target, assignee, due day and note need plan.edit; the status, the two texts and pinned are anyone's.
router.patch(
  "/:id",
  ah(async (req, res) => {
    const data = parse(patchSchema, req.body);
    const plan = await loadPlan(req.params.id);
    if (Object.keys(data).some((k) => !WORK_FIELDS.has(k)) && !req.permissions.has("plan.edit")) {
      throw new HttpError(403, deniedMessage("plan.edit"));
    }
    if (data.assignee) await assertMember(data.assignee);
    const before = filled(plan);
    const { pinned, script: scriptId, ...fields } = data;
    if (fields.channels) fields.channels = await checkChannels(fields.channels);
    const script = scriptId ? await loadScript(scriptId, plan.product) : null;
    plan.set(fields);
    if (script) plan.set({ voiceText: script.voiceText, caption: script.caption });
    if (pinned !== undefined) plan.pinnedAt = pinned ? new Date() : null;
    // A status chosen in the same request wins over the automatic one.
    if (data.status === undefined && (data.voiceText !== undefined || data.caption !== undefined || script)) autoStatus(plan, before);
    settle(plan);
    await plan.save();
    if (script) await markUsed(script, plan._id);
    const [item] = await decorate([plan.toObject()]);
    res.json({ item });
  })
);

// ---- "Nhận làm": one member says they are making this video now, so nobody else starts it too.

// "21:05 06/11" on the team's clock (vi-VN Intl would write "21:05 06-11").
const clockParts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", hourCycle: "h23" });
const clock = {
  format: (d) => {
    const p = Object.fromEntries(clockParts.formatToParts(d).map((x) => [x.type, x.value]));
    return `${p.hour}:${p.minute} ${p.day}/${p.month}`;
  },
};
const nameOf = async (userId) => {
  const u = await User.findById(userId, { username: 1, displayName: 1 }).lean();
  return u ? u.displayName || u.username : "";
};
async function takenError(plan) {
  const name = (await nameOf(plan.claimedBy)) || "Một thành viên khác";
  return new HttpError(409, `${name} đang làm kế hoạch này (nhận lúc ${clock.format(plan.claimedAt || new Date())}). Bấm "Nhận làm thay" nếu bạn chắc muốn làm.`);
}

// force: take it over from whoever has it. The swap is one conditional update, so two people pressing at once
// cannot both get it: the slower one is told who won.
router.post(
  "/:id/claim",
  ah(async (req, res) => {
    const { force } = parse(z.object({ force: z.boolean().optional().default(false) }), req.body || {});
    const plan = await loadPlan(req.params.id);
    if (FINISHED_STATUSES.includes(plan.status)) throw new HttpError(409, "Kế hoạch này đã hoàn thành, không cần nhận làm nữa.");
    const name = await productName(plan);
    const mine = String(plan.claimedBy) === String(req.userId);
    if (!mine) {
      if (plan.claimedBy && !force) throw await takenError(plan);
      const prev = plan.claimedBy;
      const won = await VideoPlan.findOneAndUpdate(
        { _id: plan._id, claimedBy: prev, status: { $nin: FINISHED_STATUSES } },
        { claimedBy: req.userId, claimedAt: new Date() },
        { new: true }
      ).lean();
      if (!won) throw await takenError(await loadPlan(req.params.id));
      res.locals.audit = { label: prev ? `${name} (thay ${(await nameOf(prev)) || "người khác"})` : name };
      const [item] = await decorate([won]);
      return res.json({ item });
    }
    res.locals.audit = { label: name };
    const [item] = await decorate([plan.toObject()]);
    res.json({ item });
  })
);

// Lets it go: the one working on it, or whoever may edit plans (someone forgot). Others take it over instead.
router.delete(
  "/:id/claim",
  ah(async (req, res) => {
    const plan = await loadPlan(req.params.id);
    if (plan.claimedBy && String(plan.claimedBy) !== String(req.userId) && !req.permissions.has("plan.edit")) {
      throw new HttpError(403, `Chỉ ${(await nameOf(plan.claimedBy)) || "người đang làm"} hoặc người có quyền sửa kế hoạch mới thả được. Muốn làm thì bấm "Nhận làm thay".`);
    }
    const released = await VideoPlan.findOneAndUpdate({ _id: plan._id }, { claimedBy: null, claimedAt: null }, { new: true }).lean();
    res.locals.audit = { label: await productName(plan) };
    const [item] = await decorate([released]);
    res.json({ item });
  })
);

// A new plan like this one: same product, assignee, due day and note, starting over as "todo" today.
// texts: also the voice-over and caption. files: slots whose Drive files are copied into the new plan's folder.
router.post(
  "/:id/copy",
  can("plan.edit"),
  ah(async (req, res) => {
    const data = parse(z.object({ texts: z.boolean().optional().default(false), files: z.array(slotKey).max(Object.keys(PLAN_SLOTS).length).optional().default([]) }), req.body);
    const src = await loadPlan(req.params.id);
    const name = await productName(src);
    if (!name) throw new HttpError(404, "Sản phẩm của kế hoạch này đã bị xoá.");
    await assertMember(src.assignee).catch(() => {
      throw new HttpError(404, "Người thực hiện của kế hoạch này không còn. Thêm kế hoạch mới thay vì sao chép.");
    });
    const plan = await VideoPlan.create({
      product: src.product,
      assignee: src.assignee,
      dueDate: src.dueDate,
      note: src.note,
      day: vnDay(),
      createdBy: req.userId,
      ...(data.texts && { voiceText: src.voiceText, caption: src.caption }),
    });

    let driveWarning = "";
    const slots = [...new Set(data.files)].filter((s) => src.files?.[s]?.id);
    if (driveConfigured() && (await getLink())?.rootId) {
      try {
        const folder = await ensurePlanFolder(plan, name);
        for (const slot of slots) {
          const f = await gapi("POST", `/files/${src.files[slot].id}/copy`, {
            query: { fields: "id,name,size,mimeType" },
            body: { name: src.files[slot].name, parents: [folder], appProperties: await stamp(req) },
          });
          plan.set(`files.${slot}`, { id: f.id, name: f.name, size: Number(f.size) || 0, mimeType: f.mimeType || "", by: req.userId, at: new Date() });
        }
        await plan.save();
      } catch (err) {
        await plan.save().catch(() => {});
        driveWarning = `Đã tạo kế hoạch nhưng chưa chép xong trên Google Drive (${err.message}).`;
      }
    } else if (slots.length) {
      driveWarning = "Google Drive chưa được kết nối nên chưa chép được file.";
    }
    autoStatus(plan, 0);
    if (plan.isModified()) await plan.save();
    res.locals.audit = { label: name };
    const [item] = await decorate([plan.toObject()]);
    res.status(201).json({ item, driveWarning });
  })
);

// ---- the AI image (doc 09 §4b): approving it lets the clips be made from it. Any member may approve or undo.
router.post(
  "/:id/image-approval",
  ah(async (req, res) => {
    const plan = await loadWorkablePlan(req);
    if (!plan.files?.aiImage?.id) throw new HttpError(400, "Kế hoạch chưa có ảnh AI để duyệt.");
    plan.imageApproved = { by: req.userId, at: new Date() };
    await plan.save();
    res.locals.audit = { label: await productName(plan) };
    const [item] = await decorate([plan.toObject()]);
    res.json({ item });
  })
);

router.delete(
  "/:id/image-approval",
  ah(async (req, res) => {
    const plan = await loadWorkablePlan(req);
    plan.imageApproved = null;
    await plan.save();
    res.locals.audit = { label: await productName(plan) };
    const [item] = await decorate([plan.toObject()]);
    res.json({ item });
  })
);

// ---- the plan's files, kept in its own Drive folder

// Makes the folder now (plans made while Drive was not connected have none yet).
router.post(
  "/:id/folder",
  ah(async (req, res) => {
    const plan = await loadWorkablePlan(req);
    await ensurePlanFolder(plan, await productName(plan));
    const [item] = await decorate([plan.toObject()]);
    res.json({ item });
  })
);

// Opens a Google upload session in the plan's folder; the browser sends the bytes straight to Google,
// then reports the new file with POST /:id/files.
router.post(
  "/:id/uploads",
  ah(async (req, res) => {
    const max = config.driveMaxUploadMb;
    const data = parse(
      z.object({
        slot: slotKey,
        name: text("tên file", 200, 1),
        mimeType: z.string().trim().max(200).regex(/^[\w.+-]+\/[\w.+-]+$/, "Loại file không hợp lệ.").or(z.literal("")).default(""),
        size: z.number({ invalid_type_error: "Dung lượng file không hợp lệ." }).int().min(0).max(max * 1024 * 1024, `Mỗi file tối đa ${max} MB.`),
      }),
      req.body
    );
    const plan = await loadWorkablePlan(req);
    const folder = await ensurePlanFolder(plan, await productName(plan));
    // Named after its slot so the folder reads clearly in Google Drive; the extension is kept.
    const ext = /\.[\w]{1,8}$/.exec(data.name)?.[0].toLowerCase() || "";
    const origin = req.get("origin") || config.clientOrigin || new URL(config.googleRedirectUri).origin;
    const uploadUrl = await openUpload({
      parent: folder,
      name: PLAN_SLOTS[data.slot] + ext,
      mimeType: data.mimeType,
      size: data.size,
      appProperties: await stamp(req),
      origin,
      fields: "id,name,size,mimeType",
    });
    res.status(201).json({ uploadUrl });
  })
);

const fileIdSchema = z.string().regex(/^[\w-]{10,120}$/, "File không hợp lệ.");

// An upload into the plan's folder finished: the file goes into its slot, and the file it replaces goes to Drive's bin.
async function putFile(req, res, plan, slot, fileId) {
  const f = await gapi("GET", `/files/${fileId}`, { query: { fields: "id,name,size,mimeType,parents,trashed" } });
  if (f.trashed || !plan.folder?.id || !f.parents?.includes(plan.folder.id)) throw new HttpError(400, "File này không nằm trong thư mục của kế hoạch.");
  const old = plan.files?.[slot];
  const before = filled(plan);
  plan.set(`files.${slot}`, { id: f.id, name: f.name, size: Number(f.size) || 0, mimeType: f.mimeType || "", by: req.userId, at: new Date() });
  // A new AI image has not been checked yet.
  if (slot === "aiImage") plan.imageApproved = null;
  autoStatus(plan, before);
  await plan.save();
  if (old?.id && old.id !== f.id) await trash(old.id).catch((err) => console.error("Drive: không xoá được file cũ", old.id, err.message));
  res.locals.audit = { label: `${PLAN_SLOTS[slot]}: ${f.name}` };
  const [item] = await decorate([plan.toObject()]);
  res.json({ item });
}

router.post(
  "/:id/files",
  ah(async (req, res) => {
    const data = parse(z.object({ slot: slotKey, fileId: fileIdSchema }), req.body);
    await putFile(req, res, await loadWorkablePlan(req), data.slot, data.fileId);
  })
);

// ---- ElevenLabs: reads the plan's saved voice-over aloud and puts the mp3 in its "Lời đọc" slot, replacing what
// was there (the old file goes to Drive's bin). Spends the team's ElevenLabs credit, hence its own permission.
const ttsBusy = new Set(); // plan ids being read, so a double click does not pay twice

router.post(
  "/:id/tts",
  can("plan.tts"),
  ah(async (req, res) => {
    const data = parse(
      z.object({
        voiceId: z.string({ required_error: "Chưa chọn giọng đọc." }).regex(/^[\w-]{5,64}$/, "Giọng đọc không hợp lệ."),
        modelId: z.string({ required_error: "Chưa chọn model." }).regex(/^[\w.-]{3,64}$/, "Model không hợp lệ."),
      }),
      req.body
    );
    const plan = await loadWorkablePlan(req);
    const { models } = await overview();
    const model = models.find((m) => m.id === data.modelId);
    if (!model) throw new HttpError(400, "Model này không đọc được tiếng Việt hoặc không còn trên ElevenLabs.");
    // Older models would read [excited] or [pause] out loud.
    const speech = model.tags ? plan.voiceText.trim() : stripTags(plan.voiceText);
    if (!speech) throw new HttpError(400, "Kế hoạch chưa có lời đọc. Viết và lưu lời đọc trước.");
    if (speech.length > model.maxChars) throw new HttpError(400, `Lời đọc dài ${speech.length} ký tự, model ${model.name} chỉ nhận tối đa ${model.maxChars}. Rút gọn hoặc chọn model khác.`);

    const key = String(plan._id);
    if (ttsBusy.has(key)) throw new HttpError(409, "Đang tạo lời đọc cho kế hoạch này, chờ xong đã.");
    ttsBusy.add(key);
    try {
      // Drive first: if it is not connected, nothing is read and no credit is spent.
      const folder = await ensurePlanFolder(plan, await productName(plan));
      const { mp3, keyName } = await speak({ text: speech, voiceId: data.voiceId, modelId: model.id });
      // Server to Google in one resumable session (the same kind the browser uses for its uploads).
      const uploadUrl = await openUpload({
        parent: folder,
        name: PLAN_SLOTS.audio + ".mp3",
        mimeType: "audio/mpeg",
        size: mp3.length,
        appProperties: await stamp(req),
        origin: req.get("origin") || config.clientOrigin || "https://localhost",
        fields: "id,name,size,mimeType",
      });
      const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "audio/mpeg" }, body: mp3 });
      if (!put.ok) throw new HttpError(502, `Google Drive không nhận file mp3 (mã ${put.status}). Thử lại.`);
      const f = await put.json();
      await putFile(req, res, plan, "audio", f.id);
      res.locals.audit = { label: `Lời đọc: ${model.name}, ${speech.length} ký tự, key ${keyName}` };
    } finally {
      ttsBusy.delete(key);
    }
  })
);

// ---- QuickEdit (the desktop editor). "Tạo video" asks for a token here and hands it to QuickEdit with a
// quickedit:// link; QuickEdit then uses the routes in quickeditRoutes below with that token.

// QuickEdit starts from the two clips and the voice-over, or the voice-over's text: it can read that aloud itself.
const SOURCE_SLOTS = ["clip1", "clip2"];

router.post(
  "/:id/quickedit",
  ah(async (req, res) => {
    const plan = await loadWorkablePlan(req);
    const missing = SOURCE_SLOTS.filter((s) => !plan.files?.[s]?.id).map((s) => PLAN_SLOTS[s]);
    if (!plan.files?.audio?.id && !plan.voiceText) missing.push(PLAN_SLOTS.audio);
    if (missing.length) throw new HttpError(400, `Kế hoạch còn thiếu ${missing.join(", ")}.`);
    res.locals.audit = { label: await productName(plan) };
    res.status(201).json({ token: signHandoff(req.userId, req.session.v || 0, plan._id), expiresAt: new Date(Date.now() + HANDOFF_HOURS * 3600e3) });
  })
);

export const quickeditRoutes = Router();

// The token's plan (its user's account is checked with the token, see middleware/auth.js).
const handoffPlan = (req) => loadPlan(req.planId);

// What QuickEdit needs to build the video: names and texts, and which files there are.
quickeditRoutes.get(
  "/plan",
  ah(async (req, res) => {
    const plan = await handoffPlan(req);
    const [item] = await decorate([plan.toObject()]);
    res.json({
      id: String(plan._id),
      product: item.product.name,
      sku: item.product.sku || "",
      day: plan.day,
      voiceText: plan.voiceText,
      caption: plan.caption,
      files: Object.fromEntries(COUNTED_SLOTS.filter((s) => plan.files?.[s]?.id).map((s) => [s, { name: plan.files[s].name, size: plan.files[s].size }])),
      // The slots QuickEdit may send into; a server from before this list only took the finished video.
      accepts: Object.keys(SENT),
    });
  })
);

// One of the plan's files, streamed from Drive.
quickeditRoutes.get(
  "/files/:slot",
  ah(async (req, res) => {
    const slot = parse(slotKey, req.params.slot);
    const plan = await handoffPlan(req);
    const file = plan.files?.[slot];
    if (!file?.id) throw new HttpError(404, `Kế hoạch chưa có ${PLAN_SLOTS[slot]}.`);
    const up = await gapi("GET", `/files/${file.id}`, { query: { alt: "media" }, raw: true });
    res.setHeader("Content-Type", up.headers.get("content-type") || "application/octet-stream");
    const len = up.headers.get("content-length");
    if (len) res.setHeader("Content-Length", len);
    const body = Readable.fromWeb(up.body);
    req.on("close", () => body.destroy());
    body.on("error", () => res.destroy());
    body.pipe(res);
  })
);

// What QuickEdit sends back: the finished video, and the voice-over it read aloud.
const SENT = { final: { ext: ".mp4", mimeType: "video/mp4" }, audio: { ext: ".mp3", mimeType: "audio/mpeg" } };
const sentSlot = z.enum(Object.keys(SENT), { errorMap: () => ({ message: "Mục file không hợp lệ." }) }).default("final");

// An upload session into the plan's folder (QuickEdit sends the bytes straight to Google), then POST /files with
// the new file's id puts it in its slot.
quickeditRoutes.post(
  "/uploads",
  ah(async (req, res) => {
    const max = config.driveMaxUploadMb;
    const data = parse(
      z.object({
        slot: sentSlot,
        size: z.number({ invalid_type_error: "Dung lượng file không hợp lệ." }).int().min(1).max(max * 1024 * 1024, `Mỗi file tối đa ${max} MB.`),
      }),
      req.body
    );
    const plan = await handoffPlan(req);
    const folder = await ensurePlanFolder(plan, await productName(plan));
    const uploadUrl = await openUpload({
      parent: folder,
      name: PLAN_SLOTS[data.slot] + SENT[data.slot].ext,
      mimeType: SENT[data.slot].mimeType,
      size: data.size,
      appProperties: await stamp(req),
      origin: config.clientOrigin || new URL(config.googleRedirectUri).origin,
      fields: "id,name,size,mimeType",
    });
    res.status(201).json({ uploadUrl });
  })
);

quickeditRoutes.post(
  "/files",
  ah(async (req, res) => {
    const { slot, fileId } = parse(z.object({ slot: sentSlot, fileId: fileIdSchema }), req.body);
    await putFile(req, res, await handoffPlan(req), slot, fileId);
  })
);

router.delete(
  "/:id/files/:slot",
  ah(async (req, res) => {
    const slot = parse(slotKey, req.params.slot);
    const plan = await loadWorkablePlan(req);
    const old = plan.files?.[slot];
    if (old?.id) {
      try {
        await trash(old.id);
      } catch (err) {
        // Already gone from Drive: just clear the slot.
        if (err.status !== 404) throw err;
      }
    }
    const before = filled(plan);
    plan.set(`files.${slot}`, undefined);
    if (slot === "aiImage") plan.imageApproved = null;
    autoStatus(plan, before);
    await plan.save();
    res.locals.audit = { label: PLAN_SLOTS[slot] };
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
    const unique = [...new Set(ids)];
    const folders = await VideoPlan.find({ _id: { $in: unique } }, { folder: 1 }).lean();
    const { deletedCount } = await VideoPlan.deleteMany({ _id: { $in: unique } });
    await trashPlanFolders(folders);
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
    await trashPlanFolders([plan]);
    res.locals.audit = { label: await productName(plan) };
    res.json({ ok: true });
  })
);

export default router;
