import { Router } from "express";
import { ah } from "../lib/http.js";
import { credits, listModels, listVoices, ttsConfigured } from "../lib/elevenlabs.js";

// What the "Tạo lời đọc" dialog needs: whether ElevenLabs is set up, the account's voices and Vietnamese models, and
// the credit left this month. Reading it is free; making the mp3 is POST /api/plans/:id/tts.
const router = Router();

router.get(
  "/",
  ah(async (req, res) => {
    if (!ttsConfigured()) return res.json({ configured: false, voices: [], models: [], credits: null });
    const [voices, models, left] = await Promise.all([listVoices(), listModels(), credits()]);
    res.json({ configured: true, voices, models, credits: left });
  })
);

export default router;
