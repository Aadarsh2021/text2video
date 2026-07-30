const { onRequest } = require("firebase-functions/v2/https");
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const GROQ_API_KEY = process.env.GROQ_API_KEY || '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';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AQ.Ab8RN6ITYPEDxsbPTNwX1cEquNaJk1_k5QTph85lGccm5lSGLg';

// Shared prompt builder for all providers with Deep Concept Understanding Engine
function buildScriptPrompt(requestData) {
  const userPrompt = String(requestData.prompt || '').trim();
  const targetDuration = Number(requestData.duration || requestData.targetDuration) || 30;
  const language = requestData.language || 'Hindi';
  const voiceGender = requestData.voiceGender || 'Male';
  const sceneCount = targetDuration <= 15 ? 3 : targetDuration <= 30 ? 4 : targetDuration <= 45 ? 6 : 8;
  const sceneDuration = Math.round(targetDuration / sceneCount);
  const targetWords = Math.round(sceneDuration * 2.5); // e.g. 8s = ~20 words

  return `You are an Oscar-Winning Hollywood Film Director, Master Storyteller, and Lead Content Strategist.
Your mission is to deeply analyze and transform the user's prompt into an unforgettable short video masterpiece.

USER PROMPT: "${userPrompt}"

CRITICAL CONCEPT UNDERSTANDING & DIRECTION (STRICT):
1. DEEP PROMPT COMPREHENSION:
   - Carefully analyze every single word of the user prompt: "${userPrompt}".
   - Identify the EXACT character/subject (e.g. Iron Man, Astronaut, Black Panther animal, Cartoon Bunny, Samurai, Dragon, Eagle, Wolf).
   - Identify the requested visual aesthetic (e.g. 3D Pixar, Studio Ghibli watercolor, Photorealistic 8K, 2D Anime, Cyberpunk, ultra-realistic cinematic).
   - DISAMBIGUATION RULE: If the prompt says "Black Panther" with "wildlife documentary" or "jungle/rain/animal" context → it is the REAL ANIMAL, NOT the Marvel superhero. Always use context to pick the right interpretation.
   - CINEMATIC MOOD PROMPTS: If the prompt describes a mood/atmosphere with no explicit story (e.g. 'lone astronaut in abandoned city at sunrise'), YOU MUST INVENT a compelling emotional arc — give the character an inner journey, a discovery, a moment of wonder, or a transformation across the scenes.
   - NO CHARACTER IN PROMPT: If the prompt has no human/animal character (e.g. 'Dubai penthouse at sunset', 'Earth seen from space', 'magical floating library') → INVENT a protagonist who is experiencing that scene. E.g. a billionaire reflecting on life, an astronaut watching Earth, a scholar discovering the magical library.

2. TARGET DURATION & SCENE TIMING:
   - Target Duration: EXACTLY ${targetDuration} seconds (${sceneCount} scenes of ${sceneDuration}s each).
   - Scene Narration Length: EXACTLY 20 to 30 WORDS per scene (2-3 full descriptive sentences per scene). NEVER write short 5-word lines. Each scene narration must fill the entire ${sceneDuration} seconds of narration time continuously.

3. 100% SCRIPT MATCHING (SELECTED LANGUAGE: "${language}"):
   - IF LANGUAGE IS "Hindi":
     * BOTH "narration" and "spokenNarration" MUST BE 100% IN DEVANAGARI HINDI SCRIPT (e.g. "मैं आज एक नए सफर पर निकला हूँ"). NEVER return Roman English text.
   - IF LANGUAGE IS "English":
     * BOTH "narration" and "spokenNarration" MUST BE IN ENGLISH (e.g. "Today I embark on a brand new journey").

4. VOICE GENDER & GRAMMAR ACCURACY:
   - Selected Voice Gender: "${voiceGender}".
   - If Male ("${voiceGender}" === "Male"): Use Male Hindi grammar ("Main kar raha hoon", "Main dekhta hoon", "Main gaya").
   - If Female ("${voiceGender}" === "Female"): Use Female Hindi grammar ("Main kar rahi hoon", "Main dekhti hoon", "Main gayi").

5. VISUAL ARTWORK PROMPT IN EVERY SCENE:
   - Every single scene's "visual" MUST combine:
     [Subject Character Name] + [Scene Specific Action & Pose] + [User Requested Art Style & Lighting].
   - EVERY SCENE MUST FEATURE THE MAIN CHARACTER IN ACTION! Never return empty landscapes.

6. ART STYLE SEPARATION (CRITICAL — DO NOT BREAK THIS RULE):
   - Art style keywords (e.g. "3D Pixar", "Studio Ghibli", "Photorealistic 8K", "Cyberpunk neon", "2D Anime", "Watercolor") are VISUAL RENDERING INSTRUCTIONS ONLY.
   - They MUST appear ONLY in the "visual" field for image generation.
   - They must NEVER appear in "narration" or "spokenNarration" dialogue text.

7. Return STRICT VALID JSON ONLY. No markdown wrapper, no extra text.

JSON Structure (strict):
{
  "title": "Captivating Title matching prompt",
  "subjectCharacter": "Exact Main Character/Subject Name",
  "targetDuration": ${targetDuration},
  "hook": "Unskippable viral hook line (10+ words)",
  "caption": "Viral Instagram post caption with relevant emojis and hashtags",
  "hashtags": ["#viral", "#reels", "#ai"],
  "scenes": [
    {
      "sceneNumber": 1,
      "visual": "Hyper-detailed cinematic image generation prompt with camera angle, lighting, subject action, 8k",
      "narration": "Natural engaging Roman Hinglish subtitle line for this scene",
      "spokenNarration": "Hindi script in Devanagari script for natural TTS voice playback",
      "onScreen": "Scene 01 • Scene Title",
      "duration": ${sceneDuration}
    }
  ]
}`;
}

// 1. Script Generation Endpoint (Handles both /generate and /api/generate)
app.post(["/generate", "/api/generate"], async (req, res) => {
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

function convertHinglishToHindiDevanagari(text) {
  if (!text) return '';
  // If string contains no English letters (pure Devanagari), return as is
  if (!/[a-zA-Z]/.test(text)) return text;

  const wordMap = {
    'main': 'मैं', 'aaj': 'आज', 'ek': 'एक', 'naye': 'नए', 'safar': 'सफर', 'par': 'पर', 'nikla': 'निकला', 'hoon': 'हूँ',
    'hai': 'है', 'hain': 'हैं', 'yeh': 'यह', 'woh': 'वह', 'kya': 'क्या', 'aapko': 'आपको', 'pata': 'पता', 'bhi': 'भी',
    'nahi': 'नहीं', 'nahin': 'नहीं', 'aur': 'और', 'se': 'से', 'ko': 'को', 'ka': 'का', 'ki': 'की', 'ke': 'के',
    'baarish': 'बारिश', 'boondon': 'बूंदों', 'beech': 'बीच', 'shehar': 'शहर', 'sabse': 'सबसे', 'bada': 'बड़ा',
    'khamoshi': 'खामोशी', 'gehrai': 'गहराई', 'bhari': 'भरी', 'is': 'इस', 'shandar': 'शानदार', 'duniya': 'दुनिया',
    'mein': 'में', 'jhalak': 'झलक', 'aasman': 'आसमान', 'bikharti': 'बिखरती', 'roshni': 'रोशनी', 'thandi': 'ठंडी',
    'hawaon': 'हवाओं', 'raaz': 'राज़', 'kholta': 'खोलता', 'drishti': 'दृष्टि', 'taakat': 'ताकत', 'shanti': 'शांति',
    'chhipi': 'छिपी', 'nazara': 'नज़ारा', 'anubhav': 'अनुभव', 'chhu': 'छू', 'jayega': 'जाएगा', 'adbhut': 'अद्भुत',
    'kahani': 'कहानी', 'viral': 'वायरल', 'dhyan': 'ध्यान', 'dekho': 'देखो', 'rokkar': 'रोककर', 'scroll': 'स्क्रॉल',
    'hanuman': 'हनुमान', 'bhakti': 'भक्ति', 'har': 'हर', 'pal': 'पल', 'toh': 'तो', 'samajh': 'समझ', 'aayega': 'आएगा'
  };

  let out = String(text);
  Object.keys(wordMap).forEach(w => {
    const reg = new RegExp('\\b' + w + '\\b', 'gi');
    out = out.replace(reg, wordMap[w]);
  });

  const vowels = {
    'aa': 'आ', 'ai': 'ऐ', 'au': 'औ', 'ee': 'ई', 'oo': 'ऊ',
    'a': 'अ', 'i': 'इ', 'u': 'उ', 'e': 'ए', 'o': 'ओ'
  };

  const matras = {
    'aa': 'ा', 'ai': 'ै', 'au': 'ौ', 'ee': 'ी', 'oo': 'ू',
    'i': 'ि', 'u': 'ु', 'e': 'े', 'o': 'ो'
  };

  const consonants = {
    'ksh': 'क्ष', 'gy': 'ज्ञ', 'tr': 'त्र',
    'kh': 'ख', 'gh': 'घ', 'ch': 'छ', 'jh': 'झ', 'th': 'थ', 'dh': 'ध',
    'ph': 'फ', 'bh': 'भ', 'sh': 'श',
    'k': 'क', 'g': 'ग', 'c': 'च', 'j': 'ज', 't': 'त', 'd': 'द', 'n': 'न',
    'p': 'प', 'f': 'फ', 'b': 'ब', 'm': 'म', 'y': 'य', 'r': 'र', 'l': 'ल',
    'v': 'व', 'w': 'व', 's': 'स', 'h': 'ह', 'z': 'ज़', 'q': 'क़'
  };

  return out.split(/(\s+)/).map(token => {
    if (/^\s+$/.test(token) || /[\u0900-\u097F]/.test(token) || /^[0-9.,!?]+$/.test(token)) return token;
    let w = token.toLowerCase();
    let res = '';
    let i = 0;
    while (i < w.length) {
      let matched = false;
      for (let len of [3, 2, 1]) {
        let sub = w.substr(i, len);
        if (consonants[sub]) {
          res += consonants[sub];
          i += len;
          for (let vLen of [2, 1]) {
            let vSub = w.substr(i, vLen);
            if (matras[vSub]) {
              res += matras[vSub];
              i += vLen;
              break;
            }
          }
          matched = true;
          break;
        }
      }
      if (!matched) {
        let v2 = w.substr(i, 2);
        let v1 = w.substr(i, 1);
        if (vowels[v2]) { res += vowels[v2]; i += 2; }
        else if (vowels[v1]) { res += vowels[v1]; i += 1; }
        else { res += w[i]; i++; }
      }
    }
    return res;
  }).join('');
}

const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");
const fs = require("fs").promises;
const os = require("os");
const path = require("path");

// 3. 100% Free Real Male & Female Neural MP3 TTS Voice Endpoint (Handles both /tts and /api/tts)
app.get(["/tts", "/api/tts"], async (req, res) => {
  const rawText = req.query.text || 'नमस्ते';
  const gender = req.query.gender || 'Male';
  const langParam = req.query.lang === 'en' ? 'en' : 'hi';

  let cleaned = String(rawText || '')
    .replace(/#\w+/g, '')
    .replace(/[()[\]{}]/g, '')
    .replace(/\bAI\b/gi, 'ए आई')
    .replace(/\bVS\b/gi, 'वर्सेस')
    .replace(/%/g, ' प्रतिशत')
    .replace(/&/g, ' और ');

  if (langParam === 'hi') {
    const numMap = {
      '15': 'पंद्रह', '30': 'तीस', '45': 'पैंतालीस', '60': 'साठ',
      '1': 'एक', '2': 'दो', '3': 'तीन', '4': 'चार', '5': 'पांच',
      '6': 'छह', '7': 'सात', '8': 'आठ', '9': 'नौ', '10': 'दस'
    };
    Object.keys(numMap).forEach(n => {
      cleaned = cleaned.replace(new RegExp('\\b' + n + '\\b', 'g'), numMap[n]);
    });
  }

  cleaned = cleaned
    .replace(/[^a-zA-Z0-9\s.,!?\u0900-\u097F]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Transliterate Roman Hinglish to Devanagari Hindi for pure Indian TTS voice
  const cleanNarration = langParam === 'hi' ? convertHinglishToHindiDevanagari(cleaned) : cleaned;

  if (!cleanNarration) return res.status(400).send('Empty text');

  // Voice Map: Real Indian Male (Madhur) vs Female (Swara) Neural Voices
  const VOICE_MAP = {
    'Male_hi': 'hi-IN-MadhurNeural',      // Deep Male Heroic Voice
    'Female_hi': 'hi-IN-SwaraNeural',     // Energetic Female Host Voice
    'Male_en': 'en-IN-PrabhatNeural',     // Male English Voice
    'Female_en': 'en-IN-NeerjaNeural'     // Female English Voice
  };

  const isHindi = langParam === 'hi' || /[\u0900-\u097F]/.test(cleanNarration);
  const voiceKey = `${gender === 'Female' ? 'Female' : 'Male'}_${isHindi ? 'hi' : 'en'}`;
  const voiceName = VOICE_MAP[voiceKey] || 'hi-IN-MadhurNeural';

  try {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'edge-tts-'));
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    const fileResult = await tts.toFile(tmpDir, cleanNarration);
    const finalBuffer = await fs.readFile(fileResult.audioFilePath);
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

    if (finalBuffer && finalBuffer.length > 0) {
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(finalBuffer);
    }
  } catch (e) {
    console.warn('Edge TTS streaming note, using Google fallback:', e.message);
  }

  // Fallback to Google Translate TTS
  try {
    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(cleanNarration)}&tl=${langParam}&client=tw-ob`;
    const googleRes = await fetch(ttsUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });

    if (googleRes.ok) {
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      const arrayBuffer = await googleRes.arrayBuffer();
      return res.send(Buffer.from(arrayBuffer));
    }
  } catch (e) {
    console.warn('Google TTS streaming error:', e.message);
  }

  return res.status(500).json({ error: 'TTS stream failed' });
});

// 2. Multi-Tier AI Image Generator Endpoint (Handles both /image and /api/image)
app.get(["/image", "/api/image"], async (req, res) => {
  const prompt = req.query.prompt || 'cinematic portrait';
  const seed = req.query.seed || Math.floor(Math.random() * 10000);
  const cleanPrompt = String(prompt).slice(0, 300);

  // Helper to fetch & stream image buffer with 6s timeout
  async function streamImage(url, providerName) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const imgRes = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (imgRes.ok) {
        const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
        if (contentType.includes('image') || contentType.includes('video')) {
          res.setHeader('Content-Type', contentType);
          res.setHeader('Cache-Control', 'public, max-age=86400');
          const arrayBuffer = await imgRes.arrayBuffer();
          res.send(Buffer.from(arrayBuffer));
          return true;
        }
      }
    } catch (e) {
      console.warn(`[Image Failover] ${providerName} failed:`, e.message);
    }
    return false;
  }

  // Tier 1: Pollinations FLUX Ultra HD (1080x1920)
  const hdQualityPrompt = `${cleanPrompt}, masterpiece, 8k resolution, ultra-realistic, IMAX 70mm, volumetric dramatic lighting, highly detailed subject, sharp focus`;
  const fluxUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(hdQualityPrompt)}?width=1080&height=1920&nologo=true&model=flux&enhance=true&seed=${seed}`;
  if (await streamImage(fluxUrl, 'Pollinations FLUX Ultra HD')) return;

  // Tier 2: Pollinations Turbo HD
  const turboUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(hdQualityPrompt)}?width=1080&height=1920&nologo=true&model=turbo&enhance=true&seed=${seed}`;
  if (await streamImage(turboUrl, 'Pollinations Turbo HD')) return;

  // Tier 3: Picsum Guaranteed Photographic HD Engine (Never rate limits)
  const picsumUrl = `https://picsum.photos/seed/${seed}/1080/1920`;
  if (await streamImage(picsumUrl, 'Picsum Engine')) return;

  // Tier 4: SVG Poster Concept
  const svgPlaceholder = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0f0c29"/><stop offset="100%" stop-color="#302b63"/></linearGradient></defs>
    <rect width="1080" height="1920" fill="url(#g)"/>
    <text x="540" y="860" font-family="Arial" font-size="96" fill="#a78bfa" text-anchor="middle">🎬</text>
    <text x="540" y="1000" font-family="Arial" font-size="36" font-weight="bold" fill="#e2e8f0" text-anchor="middle">AI Visual Concept</text>
    <text x="540" y="1080" font-family="Arial" font-size="24" fill="#94a3b8" text-anchor="middle">${cleanPrompt.slice(0, 45)}</text>
  </svg>`;
  res.setHeader('Content-Type', 'image/svg+xml');
  return res.send(svgPlaceholder);
});

// 4. REAL AI VIDEO GENERATOR ENDPOINT (Handles both /video and /api/video)
app.get(["/video", "/api/video"], async (req, res) => {
  const prompt = req.query.prompt || 'cinematic moving scene';
  const seed = req.query.seed || Math.floor(Math.random() * 10000);
  const cleanPrompt = String(prompt).slice(0, 300);

  const videoPrompt = `${cleanPrompt}, highly dynamic motion video, 8k resolution, cinematic moving subject, photorealistic video clip, fluid motion`;

  try {
    const videoUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(videoPrompt)}?model=video&width=540&height=960&nologo=true&seed=${seed}`;
    const vidRes = await fetch(videoUrl);
    if (vidRes.ok) {
      const contentType = vidRes.headers.get('content-type') || 'video/mp4';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      const buffer = await vidRes.arrayBuffer();
      return res.send(Buffer.from(buffer));
    }
  } catch (e) {
    console.warn('Real AI Video endpoint note, redirecting to image endpoint:', e.message);
  }

  // Fallback to high-res image stream
  return res.redirect(`/api/image?prompt=${encodeURIComponent(prompt)}&seed=${seed}`);
});

// Export Cloud Function with public unauthenticated invoker access
exports.api = onRequest({ timeoutSeconds: 60, memory: "512MiB", cors: true, invoker: "public" }, app);
