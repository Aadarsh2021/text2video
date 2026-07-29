const { onRequest } = require("firebase-functions/v2/https");
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// Helper prompt builder
function buildScriptPrompt(requestData) {
  const userPrompt = String(requestData.prompt || '').trim();
  const targetDuration = Number(requestData.duration || requestData.targetDuration) || 30;
  const language = requestData.language || 'Hinglish';
  const voiceGender = requestData.voiceGender || 'Male';
  const sceneCount = targetDuration <= 15 ? 3 : targetDuration <= 30 ? 4 : targetDuration <= 45 ? 6 : 8;
  const sceneDuration = Math.round(targetDuration / sceneCount);

  return `Output strict JSON video script matching user prompt: "${userPrompt}". Duration: ${targetDuration}s, Language: ${language}, Gender: ${voiceGender}. Output format: {"title":"Title","subjectCharacter":"Character","targetDuration":${targetDuration},"hook":"Viral Hook","caption":"Caption #reels","hashtags":["#reels","#viral"],"scenes":[{"sceneNumber":1,"visual":"Visual prompt for AI image","narration":"Hinglish spoken text","spokenNarration":"Hindi spoken text","onScreen":"Scene 01","duration":${sceneDuration}}]}`;
}

// 1. Script Generation Endpoint
app.post("/generate", async (req, res) => {
  const body = req.body || {};
  const promptText = String(body.prompt || '').trim();
  const duration = Number(body.duration) || 30;

  // Try Pollinations Keyless
  try {
    const sysPrompt = buildScriptPrompt(body);
    const pollRes = await fetch(`https://text.pollinations.ai/${encodeURIComponent(sysPrompt)}?json=true`);
    if (pollRes.ok) {
      const txt = await pollRes.text();
      const match = txt.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return res.json({ success: true, provider: 'Pollinations AI (Keyless)', data: parsed });
      }
    }
  } catch (e) {}

  // Fallback to Built-in Concept Director
  const sceneCount = duration <= 15 ? 3 : duration <= 30 ? 4 : duration <= 45 ? 6 : 8;
  const sceneDuration = Math.round(duration / sceneCount);

  const scenes = [];
  for (let i = 0; i < sceneCount; i++) {
    scenes.push({
      sceneNumber: i + 1,
      visual: `${promptText}, scene ${i + 1}, cinematic shot, photorealistic 8k, volumetric lighting`,
      narration: `Scene ${i + 1}: ${promptText} - Ek anokha safar aur adbhut drishti`,
      spokenNarration: `दृश्य ${i + 1}: ${promptText} - एक अनोखा सफर और अद्भुत दृष्टि`,
      onScreen: `Scene 0${i + 1} • ReelShorts AI`,
      color: ['#ea580c', '#2563eb', '#7c3aed', '#dc2626', '#059669', '#d97706'][i % 6],
      duration: sceneDuration
    });
  }

  const reelData = {
    title: 'Cinematic Story: ' + promptText.slice(0, 35),
    subjectCharacter: 'Protagonist',
    targetDuration: duration,
    hook: 'Scroll rokkar dhyan se suno — ek aisi kahani jo aapne pehle kabhi nahi dekhi!',
    caption: '🔥 ' + promptText + ' #Reels #Viral #AIVideo',
    hashtags: ['#viral', '#reels', '#ai', '#cinematic'],
    scenes
  };

  return res.json({ success: true, provider: 'ReelShorts Director Engine 🎬', data: reelData });
});

// 2. AI Image Generator Endpoint
app.get("/image", (req, res) => {
  const prompt = req.query.prompt || 'cinematic portrait';
  const seed = req.query.seed || Math.floor(Math.random() * 10000);
  const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=540&height=960&seed=${seed}&nologo=true`;
  return res.redirect(imageUrl);
});

// Export Cloud Function
exports.api = onRequest({ timeoutSeconds: 60, memory: "512MiB", cors: true }, app);
