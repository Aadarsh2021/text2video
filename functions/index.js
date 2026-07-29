const { onRequest } = require("firebase-functions/v2/https");
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// Deep LLM Master Director Prompt Builder
function buildScriptPrompt(requestData) {
  const userPrompt = String(requestData.prompt || '').trim();
  const targetDuration = Number(requestData.duration || requestData.targetDuration) || 30;
  const language = requestData.language || 'Hinglish';
  const voiceGender = requestData.voiceGender || 'Male';
  const sceneCount = targetDuration <= 15 ? 3 : targetDuration <= 30 ? 4 : targetDuration <= 45 ? 6 : 8;
  const sceneDuration = Math.round(targetDuration / sceneCount);

  return `You are ChatGPT and Gemini level Master Content Director AI. Analyze user concept deeply: "${userPrompt}".
Understand subject, theme, emotional tone, visual aesthetic, and audience engagement strategy.
Generate a high-converting short video script for Instagram Reels / TikTok in ${language}.
Output ONLY a raw valid JSON object (no markdown, no backticks) with schema:
{
  "title": "Short punchy video title",
  "subjectCharacter": "Main subject",
  "targetDuration": ${targetDuration},
  "hook": "Attention-grabbing viral opening hook line",
  "caption": "Engaging social post caption with hashtags",
  "hashtags": ["#viral", "#reels", "#ai"],
  "scenes": [
    {
      "sceneNumber": 1,
      "visual": "Detailed cinematic AI image generation prompt with camera angle, lighting, aesthetic, 8k",
      "narration": "Natural engaging Hinglish spoken text line for this scene",
      "spokenNarration": "Hindi script in Devanagari script for TTS voice engine",
      "onScreen": "Scene 01 • Scene Title",
      "duration": ${sceneDuration}
    }
  ]
}
Ensure exactly ${sceneCount} scenes. Make visual prompts hyper-detailed and cinematic for text-to-image AI models.`;
}

// 1. Script Generation Endpoint
app.post("/generate", async (req, res) => {
  const body = req.body || {};
  const promptText = String(body.prompt || '').trim();
  const duration = Number(body.duration) || 30;
  const sysPrompt = buildScriptPrompt(body);

  // TIER 1: Groq Cloud (Llama 3.3 70B Versatile)
  const groqKey = body.groqKey || process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${groqKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: 'You are an Oscar-Winning Hollywood Director & Viral Script Strategist. Output valid JSON only.' },
            { role: 'user', content: sysPrompt }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.7
        })
      });
      if (groqRes.ok) {
        const json = await groqRes.json();
        const content = json.choices?.[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content);
          if (parsed && Array.isArray(parsed.scenes)) {
            return res.json({ success: true, provider: 'Groq (Llama 3.3 70B Free LPU)', data: parsed });
          }
        }
      }
    } catch (e) { console.warn('Groq Cloud error:', e.message); }
  }

  // TIER 2: Google Gemini 2.5 Flash
  const geminiKey = body.geminiKey || process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const gemRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: sysPrompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.7 }
        })
      });
      if (gemRes.ok) {
        const json = await gemRes.json();
        const txt = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (txt) {
          const parsed = JSON.parse(txt);
          if (parsed && Array.isArray(parsed.scenes)) {
            return res.json({ success: true, provider: 'Google Gemini 2.5 Flash', data: parsed });
          }
        }
      }
    } catch (e) { console.warn('Gemini error:', e.message); }
  }

  // TIER 3: Pollinations Keyless LLM
  try {
    const pollRes = await fetch(`https://text.pollinations.ai/${encodeURIComponent(sysPrompt)}?json=true&model=openai`);
    if (pollRes.ok) {
      const txt = await pollRes.text();
      const match = txt.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (parsed && Array.isArray(parsed.scenes) && parsed.scenes.length > 0) {
          return res.json({ success: true, provider: 'Pollinations AI (OpenAI Engine)', data: parsed });
        }
      }
    }
  } catch (e) { }

  // TIER 2: Pollinations POST LLM
  try {
    const pollPostRes = await fetch('https://text.pollinations.ai/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: 'You are a master viral reel script writer. Output strict JSON only.' },
          { role: 'user', content: sysPrompt }
        ],
        jsonMode: true,
        model: 'searchgpt'
      })
    });
    if (pollPostRes.ok) {
      const txt = await pollPostRes.text();
      const match = txt.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (parsed && Array.isArray(parsed.scenes) && parsed.scenes.length > 0) {
          return res.json({ success: true, provider: 'Pollinations AI (SearchGPT)', data: parsed });
        }
      }
    }
  } catch (e) { }

  // Natural Subject & Theme Extractor
  let cleanTopic = promptText
    .replace(/cinematic composition|ultra-realistic|emotional atmosphere|photorealistic 8k|8k|hd|volumetric lighting|4k|hyperdetailed|masterpiece|dramatic lighting/gi, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = cleanTopic.split(' ');
  const coreSubject = words.slice(0, 5).join(' ') || 'Cinematic Story';

  const shotStyles = [
    'Wide establishing cinematic angle of',
    'Intense cinematic close-up shot focusing on the majestic details of',
    'Dynamic low angle camera motion capturing',
    'Breathtaking high-altitude IMAX wide shot revealing the scale of',
    'Cinematic slow-motion side profile showcasing',
    'Photorealistic atmospheric golden hour lighting over'
  ];

  const naturalStoryLines = [
    `Khamoshi aur gehrai se bhari is shandar duniya mein, ${coreSubject} ki ek adbhut jhalak...`,
    `Aasman mein bikharti roshni aur thandi hawaon ke beech, har ek pal ek naya raaz kholta hai.`,
    `Gahrai se dekhoge toh samajh aayega ki is drishti mein kitni badi taakat aur shanti chhipi hai.`,
    `Yeh sirf ek nazara nahi hai, yeh ek aisa anubhav hai jo aapke dil ko chhu jayega!`,
    `Akelapan aur shanti ke beech, ek naye safar ki shuruaat hoti hai.`,
    `Yeh hai safalta aur dridhta ki sabse shandar aur yaadgar misaal.`
  ];

  const sceneCount = duration <= 15 ? 3 : duration <= 30 ? 4 : duration <= 45 ? 6 : 8;
  const sceneDuration = Math.round(duration / sceneCount);

  const scenes = [];
  for (let i = 0; i < sceneCount; i++) {
    const stylePrefix = shotStyles[i % shotStyles.length];
    const narrationLine = naturalStoryLines[i % naturalStoryLines.length];

    scenes.push({
      sceneNumber: i + 1,
      visual: `${stylePrefix} ${cleanTopic}, scene ${i + 1}, cinematic lighting, photorealistic 8k, volumetric atmosphere`,
      narration: narrationLine,
      spokenNarration: narrationLine,
      onScreen: `Scene 0${i + 1} • ${coreSubject}`,
      color: ['#ea580c', '#2563eb', '#7c3aed', '#dc2626', '#059669', '#d97706'][i % 6],
      duration: sceneDuration
    });
  }

  const reelData = {
    title: 'Cinematic Story: ' + coreSubject,
    subjectCharacter: coreSubject,
    targetDuration: duration,
    hook: `Scroll rokkar dhyan se dekho — ${coreSubject} ki ek aisi adbhut aur viral kahani!`,
    caption: '✨ ' + cleanTopic + ' #Reels #Viral #AIVideo #Cinematic',
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
