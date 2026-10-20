import { Router } from "express";
import { z } from "zod";
import { Settings, publicSettings, MAX_CUSTOM_ACTIONS } from "../models/Settings.js";
import { ah, parse, text } from "../lib/http.js";

const router = Router();

const actionSchema = z.object({
  id: text("mã động tác", 40, 1),
  role: z.enum(["open", "mid", "end"], { errorMap: () => ({ message: "Vị trí động tác phải là mở đầu, giữa hoặc kết." }) }),
  label: text("tên động tác", 200, 1),
  text: text("câu lệnh tiếng Anh", 2000, 1),
});

const putSchema = z.object({
  template: z.string().max(30000, "Template tối đa 30.000 ký tự.").optional(),
  negative: z.string().max(5000, "Negative tối đa 5.000 ký tự.").optional(),
  customActions: z.array(actionSchema).max(MAX_CUSTOM_ACTIONS, `Tối đa ${MAX_CUSTOM_ACTIONS} động tác riêng.`).optional(),
});

router.get(
  "/",
  ah(async (req, res) => {
    res.json(publicSettings(await Settings.findOne({ owner: req.userId }).lean()));
  })
);

router.put(
  "/",
  ah(async (req, res) => {
    const data = parse(putSchema, req.body);
    // The owner equality in the filter is copied into the document on insert.
    const doc = await Settings.findOneAndUpdate({ owner: req.userId }, { $set: data }, { new: true, upsert: true, runValidators: true }).lean();
    res.json(publicSettings(doc));
  })
);

export default router;
