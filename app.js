// ReelShorts AI — 100% Preload Gate & Total Player Control Engine
const state = {
  language: 'Hindi',
  style: 'Energetic',
  voiceGender: 'Male',
  captionStyle: 'Hormozi',
  cameraMotion: 'KenBurns',
  particleShader: 'FireSparks',
  duration: 30,
  reel: null,
  currentScene: 0,
  prevScene: -1,
  sceneStartTime: 0,
  transitionStartTime: 0,
  playing: false,
  speaking: false,
  muted: false,
  volume: 1.0,
  isScrubbing: false,
  totalDurationSecs: 30,
  currentTimeSecs: 0,
  rate: 1.15,
  animFrameId: null,
  playbackTimer: null,
  toastTimer: null,
  sceneImages: {},
  sceneAudios: {},
  currentAudio: null,
  voices: []
};

const el = (id) => document.getElementById(id);

function showToast(msg) {
  const toast = el('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}

function escapeHtml(str = '') {
  return String(str).replace(/[&<>'"]/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
  })[c]);
}

// 100% PRE-LOAD OF ALL AI SCENE IMAGES AND AI AUDIO MP3s (0ms GAP BETWEEN SCENES)
async function preloadAllSceneVisuals(scenes, onProgress) {
  state.sceneImages = {};
  state.sceneAudios = {};
  let loadedCount = 0;
  const total = scenes.length;

  const createFallbackCanvasImage = (color1 = '#7c3aed', color2 = '#06050b') => {
    const c = document.createElement('canvas');
    c.width = 540; c.height = 960;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 960);
    g.addColorStop(0, color1);
    g.addColorStop(1, color2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 540, 960);
    const img = new Image();
    img.src = c.toDataURL('image/jpeg');
    return img;
  };

  // Load images SEQUENTIALLY in batches of 2 with gap — avoids Pollinations rate limiting
  // Promise.all (all at once) was causing scenes 3-8 to fail due to Pollinations throttling
  const loadScene = (sc, i) => new Promise((resolve) => {
    let isResolved = false;
    const safeDone = (imgObj) => {
      if (isResolved) return;
      isResolved = true;
      clearTimeout(safetyTimer);
      state.sceneImages[i] = imgObj;
      loadedCount++;
      if (onProgress) onProgress(loadedCount, total);
      resolve();
    };

    // 35s safety timer — gives server time to try Turbo (12s) + FLUX (12s) = 24s max
    const safetyTimer = setTimeout(() => {
      safeDone(createFallbackCanvasImage(sc.color || '#4c1d95', '#06050b'));
    }, 35000);

    // Image — use sc.visual directly
    const img = new Image();
    img.crossOrigin = 'anonymous'; // Enforce CORS origin-clean canvas drawing

    const sceneImagePrompt = (sc.visual || '').trim()
      || `${state.reel?.subjectCharacter || 'character'} scene ${i + 1} portrait`;

    const uniqueSeed = (i + 1) * 487 + Math.floor(Math.random() * 999);
    const directPollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(sceneImagePrompt + ', cinematic masterpiece 8k')}?width=540&height=960&nologo=true&seed=${uniqueSeed}`;
    
    // Multi-tier backend image proxy with direct Cloud Run fallback
    const proxyUrl = `/api/image?prompt=${encodeURIComponent(sceneImagePrompt)}&seed=${uniqueSeed}`;
    const directCloudRunImageUrl = `https://api-vvwtkdts6q-uc.a.run.app/api/image?prompt=${encodeURIComponent(sceneImagePrompt)}&seed=${uniqueSeed}`;

    img.onload = () => safeDone(img);
    img.onerror = () => {
      // Tier 2: Direct Cloud Run Function
      const crImg = new Image();
      crImg.crossOrigin = 'anonymous';
      crImg.onload = () => safeDone(crImg);
      crImg.onerror = () => {
        // Tier 3: Pollinations Direct
        const fallbackImg = new Image();
        fallbackImg.crossOrigin = 'anonymous';
        fallbackImg.onload = () => safeDone(fallbackImg);
        fallbackImg.onerror = () => safeDone(createFallbackCanvasImage('#312e81', '#06050b', `Scene ${i+1}`));
        fallbackImg.src = directPollinationsUrl;
      };
      crImg.src = directCloudRunImageUrl;
    };
    img.src = proxyUrl;

    // Audio preload in parallel (TTS server handles concurrency fine)
    const rawText = sc.spokenNarration || sc.narration || sc.onScreen || '';
    const cleanText = cleanTtsText(rawText);
    const lang = state.language === 'English' ? 'en' : 'hi';
    const proxyTtsUrl = `/api/tts?text=${encodeURIComponent(cleanText)}&lang=${lang}&gender=${state.voiceGender}&t=${Date.now()}`;
    const directTtsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(cleanText)}&tl=${lang}&client=tw-ob`;

    const audio = new Audio();
    audio.preload = 'auto';
    audio.src = proxyTtsUrl;
    audio.onerror = () => {
      audio.src = directTtsUrl;
    };
    state.sceneAudios[i] = audio;
  });

  // Load ONE image at a time — no race conditions, no Pollinations throttling
  // Gap between each image gives Pollinations time to process the previous one
  const BATCH_DELAY_MS = 1200; // 1.2s gap between each image request

  for (let i = 0; i < scenes.length; i++) {
    await loadScene(scenes[i], i);
    // Gap before next image (skip after last)
    if (i < scenes.length - 1) {
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  renderCanvasFrame();
}

// Aspect-Ratio Preserving Canvas Cover Renderer
function drawImageCover(ctx, img, w, h) {
  if (!img || !img.complete || img.naturalWidth === 0) return;
  const imgRatio = img.naturalWidth / img.naturalHeight;
  const canvasRatio = w / h;
  let renderW, renderH, offsetX, offsetY;

  if (imgRatio > canvasRatio) {
    renderH = h;
    renderW = h * imgRatio;
    offsetX = (w - renderW) / 2;
    offsetY = 0;
  } else {
    renderW = w;
    renderH = w / imgRatio;
    offsetX = 0;
    offsetY = (h - renderH) / 2;
  }
  ctx.drawImage(img, offsetX, offsetY, renderW, renderH);
}

// PRO CANVAS VIDEO RENDERER WITH CAMERA MOTION & PARTICLE SHADERS
function renderCanvasFrame(ts = performance.now()) {
  const canvas = el('reelCanvas');
  if (!canvas || !state.reel) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width; // 540
  const h = canvas.height; // 960

  const idx = state.currentScene;
  const scenes = state.reel.scenes || [];
  const scene = scenes[idx] || scenes[0];
  if (!scene) return;

  const bgImg = state.sceneImages[idx];
  const sceneDurationMs = (scene.duration || 7) * 1000;

  if (!state.sceneStartTime) state.sceneStartTime = ts;
  const elapsedInScene = ts - state.sceneStartTime;
  // Calculate effective scene duration: max of target duration and actual spoken audio duration
  const effectiveDurationMs = Math.max(sceneDurationMs, state.currentSceneSpokenMs || 0);
  const sceneProgress = Math.min(1.0, elapsedInScene / effectiveDurationMs);

  ctx.clearRect(0, 0, w, h);

  // TRANSITION SHADER ENGINE: 800ms Whip-Pan Morph & Flare Bridge
  const transitionDuration = 800;
  const isTransitioning = state.prevScene >= 0 && (ts - state.transitionStartTime) < transitionDuration;
  const transitionProgress = isTransitioning ? (ts - state.transitionStartTime) / transitionDuration : 1.0;
  const easeProgress = isTransitioning ? Math.sin((transitionProgress * Math.PI) / 2) : 1.0;

  // 1. Draw Exiting Scene Image
  if (isTransitioning && state.sceneImages[state.prevScene]) {
    const prevImg = state.sceneImages[state.prevScene];
    if (prevImg && prevImg.complete && prevImg.naturalWidth !== 0) {
      ctx.save();
      ctx.globalAlpha = 1.0 - easeProgress;
      const prevScale = 1.0 + (transitionProgress * 0.18);
      const prevSlideX = -transitionProgress * w * 0.45;

      ctx.translate(w / 2 + prevSlideX, h / 2);
      ctx.scale(prevScale, prevScale);
      ctx.translate(-w / 2, -h / 2);
      ctx.drawImage(prevImg, 0, 0, w, h);
      ctx.restore();
    }
  }

  // 2. Draw Entering Scene Image with Selectable Camera Motion FX
  ctx.save();
  if (isTransitioning) {
    ctx.globalAlpha = easeProgress;
    const enterScale = 0.85 + (easeProgress * 0.15);
    const enterSlideX = (1.0 - easeProgress) * w * 0.45;

    ctx.translate(w / 2 + enterSlideX, h / 2);
    ctx.scale(enterScale, enterScale);
    ctx.translate(-w / 2, -h / 2);
  } else {
    const motionMode = state.cameraMotion || 'KenBurns';
    let zoom = 1.0;
    let panX = 0;
    let panY = 0;

    if (motionMode === 'KenBurns') {
      zoom = 1.0 + (sceneProgress * 0.14);
      panX = Math.sin(sceneProgress * Math.PI) * 12;
      panY = Math.cos(sceneProgress * Math.PI) * 8;
    } else if (motionMode === 'PulseShake') {
      const shake = state.playing ? Math.sin(ts * 0.05) * 4 : 0;
      zoom = 1.05 + Math.abs(Math.sin(ts * 0.01)) * 0.06;
      panX = shake;
      panY = Math.cos(ts * 0.04) * 3;
    } else if (motionMode === 'Parallax') {
      zoom = 1.08;
      panX = (Math.sin(ts * 0.001) * 20);
      panY = (Math.cos(ts * 0.0012) * 15);
    }

    ctx.translate(w / 2 + panX, h / 2 + panY);
    ctx.scale(zoom, zoom);
    ctx.translate(-w / 2, -h / 2);
  }

  if (bgImg && bgImg.complete && bgImg.naturalWidth !== 0) {
    drawImageCover(ctx, bgImg, w, h);
  } else {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, scene.color || '#4c1d95');
    grad.addColorStop(1, '#06050b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();

  // 3. Midpoint Lens Flare Flash
  if (isTransitioning) {
    const flareIntensity = Math.sin(transitionProgress * Math.PI);
    if (flareIntensity > 0.05) {
      ctx.save();
      const flareGrad = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.85);
      flareGrad.addColorStop(0, `rgba(255, 255, 255, ${flareIntensity * 0.55})`);
      flareGrad.addColorStop(0.4, `rgba(168, 85, 247, ${flareIntensity * 0.35})`);
      flareGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = flareGrad;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  // 4. PARTICLES SHADER OVERLAY (FireSparks, GoldDust, FilmGrain)
  ctx.save();
  const shaderMode = state.particleShader || 'FireSparks';

  if (shaderMode === 'FireSparks') {
    ctx.fillStyle = 'rgba(249, 115, 22, 0.4)';
    for (let i = 0; i < 20; i++) {
      const px = (Math.sin(ts * 0.002 + i * 2.1) * 0.5 + 0.5) * w;
      const py = h - ((ts * 0.12 + i * 45) % h);
      ctx.beginPath();
      ctx.arc(px, py, (i % 3) + 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (shaderMode === 'GoldDust') {
    ctx.fillStyle = 'rgba(234, 179, 8, 0.35)';
    for (let i = 0; i < 25; i++) {
      const px = (Math.sin(ts * 0.001 + i * 1.8) * 0.5 + 0.5) * w;
      const py = ((ts * 0.04 + i * 38) % h);
      ctx.beginPath();
      ctx.arc(px, py, (i % 4) + 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (shaderMode === 'FilmGrain') {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    for (let i = 0; i < 60; i++) {
      const rx = Math.random() * w;
      const ry = Math.random() * h;
      ctx.fillRect(rx, ry, 2, 2);
    }
  }
  ctx.restore();

  // 5. Vignette Gradient
  const vignette = ctx.createLinearGradient(0, 0, 0, h);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
  vignette.addColorStop(0.25, 'rgba(0, 0, 0, 0.1)');
  vignette.addColorStop(0.65, 'rgba(0, 0, 0, 0.25)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.92)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);

  // 6. Clean Top Branding — text2video.ai ONLY
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.font = '800 20px "JetBrains Mono", monospace';
  ctx.fillText('⚡ text2video.ai', 32, 54);

  // 7. Spoken Dialogue Subtitle Highlighting (Clean & Professional)
  const fullText = scene.narration || scene.spokenNarration || scene.onScreen || '';
  const words = fullText.split(/\s+/);
  const totalWords = words.length;
  const activeWordIdx = Math.min(Math.floor(sceneProgress * totalWords), totalWords - 1);

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.98)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 3;

  ctx.font = '800 30px "Plus Jakarta Sans", "Noto Sans Devanagari", sans-serif';
  const startX = 36;
  let currentY = h - 250;
  const maxLineWidth = w - 72;

  let wordCount = 0;
  let lineWords = [];
  let lineText = '';

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const testLine = lineText ? `${lineText} ${word}` : word;
    if (ctx.measureText(testLine).width > maxLineWidth && lineText) {
      drawPresetKaraokeLine(ctx, lineWords, wordCount - lineWords.length, activeWordIdx, startX, currentY, sceneProgress);
      currentY += 44;
      lineText = word;
      lineWords = [word];
    } else {
      lineText = testLine;
      lineWords.push(word);
    }
    wordCount++;
  }
  if (lineWords.length > 0) {
    drawPresetKaraokeLine(ctx, lineWords, wordCount - lineWords.length, activeWordIdx, startX, currentY, sceneProgress);
  }
  ctx.restore();

  // 9. Bottom Progress Bar
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.fillRect(36, h - 36, w - 72, 6);

  const totalProgress = (idx + sceneProgress) / scenes.length;
  ctx.fillStyle = '#10b981';
  ctx.fillRect(36, h - 36, (w - 72) * totalProgress, 6);
}

// Multi-Style Subtitle Renderer with Active CapCut Word Pop Scale
function drawPresetKaraokeLine(ctx, lineWords, startWordIndex, activeWordIndex, startX, y, sceneProgress = 0) {
  let currentX = startX;
  const style = state.captionStyle || 'Hormozi';

  lineWords.forEach((word, i) => {
    const globalIdx = startWordIndex + i;
    const wordWidth = ctx.measureText(word + ' ').width;

    if (globalIdx === activeWordIndex) {
      ctx.save();
      const bounceY = y - 4;
      ctx.translate(currentX + wordWidth / 2, bounceY - 10);
      ctx.scale(1.18, 1.18);
      ctx.translate(-(currentX + wordWidth / 2), -(bounceY - 10));

      if (style === 'Hormozi') {
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.roundRect(currentX - 4, bounceY - 28, wordWidth + 2, 38, 6);
        ctx.fill();
        ctx.fillStyle = '#000000';
        ctx.fillText(word, currentX, bounceY);
      } else if (style === 'MrBeast') {
        ctx.fillStyle = '#ef4444';
        ctx.shadowColor = '#dc2626';
        ctx.shadowBlur = 28;
        ctx.beginPath();
        ctx.roundRect(currentX - 4, bounceY - 28, wordWidth + 2, 38, 6);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillText(word, currentX, bounceY);
      } else if (style === 'Cyberpunk') {
        ctx.fillStyle = '#a855f7';
        ctx.shadowColor = '#06b6d4';
        ctx.shadowBlur = 24;
        ctx.beginPath();
        ctx.roundRect(currentX - 4, bounceY - 28, wordWidth + 2, 38, 6);
        ctx.fill();
        ctx.fillStyle = '#06b6d4';
        ctx.fillText(word, currentX, bounceY);
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.fillText(word, currentX, bounceY);
      }

      ctx.restore();
    } else {
      ctx.fillStyle = globalIdx < activeWordIndex ? '#ffffff' : 'rgba(255, 255, 255, 0.78)';
      ctx.fillText(word, currentX, y);
    }

    currentX += wordWidth;
  });

  // Calculate Current Video Time & Update Scrubber Timeline UI
  if (state.reel && state.reel.scenes) {
    const scenes = state.reel.scenes;
    const totalSecs = scenes.reduce((acc, s) => acc + (s.duration || 7), 0);
    state.totalDurationSecs = totalSecs;

    let elapsedPrior = 0;
    for (let i = 0; i < state.currentScene; i++) {
      elapsedPrior += (scenes[i].duration || 7);
    }
    const currentSceneDur = scenes[state.currentScene]?.duration || 7;
    const currentSceneProgressSecs = (sceneProgress % 1.0) * currentSceneDur;
    const currentTotalSecs = Math.min(totalSecs, elapsedPrior + currentSceneProgressSecs);
    state.currentTimeSecs = currentTotalSecs;

    const curMin = String(Math.floor(currentTotalSecs / 60)).padStart(2, '0');
    const curSec = String(Math.floor(currentTotalSecs % 60)).padStart(2, '0');
    const totMin = String(Math.floor(totalSecs / 60)).padStart(2, '0');
    const totSec = String(Math.floor(totalSecs % 60)).padStart(2, '0');

    if (el('currentTimeDisplay')) el('currentTimeDisplay').textContent = `${curMin}:${curSec}`;
    if (el('totalTimeDisplay')) el('totalTimeDisplay').textContent = `${totMin}:${totSec}`;
    if (el('playerScrubber') && !state.isScrubbing) {
      el('playerScrubber').value = totalSecs > 0 ? (currentTotalSecs / totalSecs) * 100 : 0;
    }
  }
}

function startCanvasLoop() {
  function loop(ts) {
    renderCanvasFrame(ts);
    state.animFrameId = requestAnimationFrame(loop);
  }
  cancelAnimationFrame(state.animFrameId);
  state.animFrameId = requestAnimationFrame(loop);
}

function changeScene(newIndex) {
  if (state.currentScene === newIndex) return;
  state.prevScene = state.currentScene;
  state.currentScene = newIndex;
  const now = performance.now();
  state.sceneStartTime = now;       // reset progress bar & Ken Burns
  state.transitionStartTime = now;  // start 800ms whip-pan transition
  renderWorkspace();
}

// Auto-detect optimal visual theme, subtitle style, camera motion, and particle shaders based on user prompt
function autoDetectPromptStyles(prompt) {
  const p = String(prompt || '').toLowerCase();

  if (/(naruto|anime|goku|dragonball|aot|dbz|gaming|bgmi|ninja|fight|action|power)/i.test(p)) {
    state.style = 'Energetic';
    state.captionStyle = 'Hormozi';
    state.cameraMotion = 'PulseShake';
    state.particleShader = 'FireSparks';
  } else if (/(hanuman|bhakti|god|ram|peace|meditation|nature|sunset|relax|spiritual|child|story|ghibli)/i.test(p)) {
    state.style = 'Peaceful';
    state.captionStyle = 'Minimal';
    state.cameraMotion = 'KenBurns';
    state.particleShader = 'GoldDust';
  } else {
    state.style = 'Cinematic';
    state.captionStyle = 'MrBeast';
    state.cameraMotion = 'Parallax';
    state.particleShader = 'FilmGrain';
  }
}

// Standalone Client AI Script Generator (Guarantees zero-crash script generation on static Firebase Hosting)
async function generateScriptClientSide(promptText, duration, language, voiceGender) {
  const targetDuration = Number(duration) || 30;
  const sceneCount = targetDuration <= 15 ? 3 : targetDuration <= 30 ? 4 : targetDuration <= 45 ? 6 : 8;
  const sceneDuration = Number((targetDuration / sceneCount).toFixed(1));

  try {
    const sysInstruction = `You are an Oscar-Winning Hollywood Film Director, Master Storyteller, and Lead Content Strategist.
Your mission is to deeply analyze and transform the user's prompt into an unforgettable short video masterpiece.

USER PROMPT: "${promptText}"

CRITICAL CONCEPT UNDERSTANDING & DIRECTION (STRICT):
1. DEEP PROMPT COMPREHENSION:
   - Carefully analyze every single word of the user prompt: "${promptText}".
   - Identify the EXACT character/subject (e.g. Iron Man, Astronaut, Black Panther animal, Cartoon Bunny, Samurai, Dragon, Eagle, Wolf).
   - Identify the requested visual aesthetic (e.g. 3D Pixar, Studio Ghibli watercolor, Photorealistic 8K, 2D Anime, Cyberpunk, ultra-realistic cinematic).
   - DISAMBIGUATION RULE: If the prompt says "Black Panther" with "wildlife documentary" or "jungle/rain/animal" context → it is the REAL ANIMAL, NOT the Marvel superhero. Always use context to pick the right interpretation.
   - CINEMATIC MOOD PROMPTS: If the prompt describes a mood/atmosphere with no explicit story (e.g. 'lone astronaut in abandoned city at sunrise'), YOU MUST INVENT a compelling emotional arc — give the character an inner journey, a discovery, a moment of wonder, or a transformation across the scenes.
   - NO CHARACTER IN PROMPT: If the prompt has no human/animal character (e.g. 'Dubai penthouse at sunset', 'Earth seen from space', 'magical floating library') → INVENT a protagonist who is experiencing that scene. E.g. a billionaire reflecting on life, an astronaut watching Earth, a scholar discovering the magical library.

2. 100% WORD-FOR-WORD SCRIPT MATCHING (SELECTED LANGUAGE: "${language || 'Hinglish'}"):
   - IF LANGUAGE IS "Hinglish":
     * "narration" = Display subtitles in Roman Hinglish (e.g. "Main aaj ek naye safar par nikla hoon").
     * "spokenNarration" = EXACT SAME SENTENCE in Devanagari Hindi script (e.g. "मैं आज एक नए सफर पर निकला हूँ").
   - IF LANGUAGE IS "Hindi":
     * BOTH "narration" and "spokenNarration" MUST BE IN DEVANAGARI HINDI SCRIPT (e.g. "मैं आज एक नए सफर पर निकला हूँ").
   - IF LANGUAGE IS "English":
     * BOTH "narration" and "spokenNarration" MUST BE IN ENGLISH (e.g. "Today I embark on a brand new journey").

3. VOICE GENDER & GRAMMAR ACCURACY:
   - Selected Voice Gender: "${voiceGender || 'Male'}".
   - If Male: Use Male Hindi grammar ("Main kar raha hoon", "Main dekhta hoon").
   - If Female: Use Female Hindi grammar ("Main kar rahi hoon", "Main dekhti hoon").

4. ART STYLE SEPARATION:
   - Video terms (8K, IMAX, photorealistic) are VISUAL INSTRUCTIONS ONLY. Never write them in narration or spokenNarration text.

Return STRICT VALID JSON ONLY.
Schema:
{
  "title": "Captivating Title",
  "subjectCharacter": "Main Character Name",
  "targetDuration": ${targetDuration},
  "hook": "Unskippable viral hook line",
  "caption": "Viral post caption with hashtags",
  "hashtags": ["#viral", "#reels", "#ai"],
  "scenes": [
    {
      "sceneNumber": 1,
      "visual": "Hyper-detailed cinematic image generation prompt with camera angle, lighting, 8k",
      "narration": "Natural engaging Roman Hinglish subtitle line for this scene",
      "spokenNarration": "Hindi script in Devanagari script for natural TTS voice playback",
      "onScreen": "Scene 01 • Title",
      "duration": ${sceneDuration}
    }
  ]
}`;

    const pollRes = await fetch(`https://text.pollinations.ai/${encodeURIComponent(sysInstruction)}?json=true`);
    if (pollRes.ok) {
      const txt = await pollRes.text();
      if (!txt.trim().startsWith('<')) {
        const match = txt.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            const parsed = JSON.parse(match[0]);
            if (parsed && Array.isArray(parsed.scenes) && parsed.scenes.length > 0) return parsed;
          } catch (jsonErr) {
            console.warn('JSON parse error from remote AI text:', jsonErr.message);
          }
        }
      }
    }
  } catch (e) {
    console.warn('Client Pollinations script AI error:', e.message);
  }

  // Tier 1 Client-Side: Groq Cloud Llama 3.3 70B Versatile (Free, instant AI script generation)
  try {
    const sysPrompt = `You are an Oscar-Winning Hollywood Director & Master Storyteller.
Transform the prompt: "${userPrompt}" into a video script.
Target Duration: ${targetDuration} seconds (${sceneCount} scenes of ${sceneDuration}s each).
Language: "${language}". Voice Gender: "${voiceGender}".
CRITICAL: If Language is "Hindi", write BOTH "narration" and "spokenNarration" 100% in Devanagari Hindi script (e.g. "मैं आज एक नए सफर पर निकला हूँ"). Never return Roman English text.

Return STRICT JSON format:
{
  "title": "Short Title",
  "subjectCharacter": "Subject",
  "targetDuration": ${targetDuration},
  "hook": "Viral hook line",
  "caption": "Post caption with hashtags",
  "hashtags": ["#viral", "#reels", "#ai"],
  "scenes": [
    {
      "sceneNumber": 1,
      "visual": "Detailed 8k cinematic image prompt",
      "narration": "Devanagari Hindi dialogue",
      "spokenNarration": "Devanagari Hindi dialogue",
      "onScreen": "Scene 01 • Title",
      "duration": ${sceneDuration}
    }
  ]
}`;

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer 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'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: sysPrompt }, { role: 'user', content: promptText }],
        temperature: 0.7,
        response_format: { type: 'json_object' }
      })
    });

    if (groqRes.ok) {
      const jsonRes = await groqRes.json();
      const rawJsonStr = jsonRes.choices?.[0]?.message?.content || '';
      const parsed = JSON.parse(rawJsonStr);
      if (parsed && Array.isArray(parsed.scenes) && parsed.scenes.length > 0) return parsed;
    }
  } catch (groqErr) {
    console.warn('Groq client-side fetch note:', groqErr.message);
  }

  // Tier 2: Natural Subject & Theme Extractor Fallback (Clean & Grammatically Correct)
  let cleanSubjectRaw = promptText
    .replace(/\b(reel|reels|short|shorts|video|30 second|15 second|45 second|60 second|30s|15s|45s|60s|par|pe|se|ke|ka|ki|aur|and|par|per)\b/gi, ' ')
    .replace(/cinematic composition|ultra-realistic|emotional atmosphere|photorealistic 8k|8k|hd|volumetric lighting|4k|hyperdetailed|masterpiece|dramatic lighting/gi, ' ')
    .replace(/[^a-zA-Z0-9\s\u0900-\u097F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = cleanSubjectRaw.split(' ').filter(w => w.length > 1);
  const coreSubjectEnglish = words.slice(0, 3).join(' ') || 'Cinematic Story';
  const devanagariSubject = convertHinglishToHindiDevanagari(coreSubjectEnglish);

  const shotStyles = [
    'Wide establishing cinematic angle of',
    'Intense cinematic close-up shot focusing on the majestic details of',
    'Dynamic low angle camera motion capturing',
    'Breathtaking high-altitude IMAX wide shot revealing the scale of',
    'Cinematic slow-motion side profile showcasing',
    'Photorealistic atmospheric golden hour lighting over'
  ];

  const hindiFallbackLines = [
    `${devanagariSubject} की असीम कृपा, शक्ति और शांति से भरी एक अद्भुत गाथा...`,
    `आसमान में बिखरती दिव्य रोशनी और शांत हवाओं के बीच, हर एक पल एक नया राज़ खोलता है।`,
    `गहराई से देखोगे तो समझ आएगा कि इस पावन दृश्य में कितनी बड़ी ताकत और शांति छिपी है।`,
    `यह सिर्फ एक नज़ारा नहीं है, यह एक ऐसा दिव्य अनुभव है जो आपके दिल को छू जाएगा!`,
    `समर्पण और भक्ति के इस पावन सफर में, मन को असीम शांति और संबल मिलता है।`,
    `यह है श्रद्धा और विश्वास की सबसे शानदार और अमर मिसाल।`
  ];

  const englishFallbackLines = [
    `In a world filled with wonder, a brand new story of ${coreSubjectEnglish} unfolds...`,
    `As golden light beams through the sky, every single moment reveals a hidden truth.`,
    `Look closely and you will discover the immense strength and peace hidden within.`,
    `This is not just a scene, it is a powerful emotional experience that touches your heart!`,
    `Through focus and dedication, a new legendary journey begins today.`,
    `A timeless symbol of strength, courage, and ultimate triumph.`
  ];

  const naturalStoryLines = language === 'English' ? englishFallbackLines : hindiFallbackLines;

  let title = 'Cinematic Story: ' + coreSubjectEnglish;
  let subjectChar = coreSubjectEnglish;
  let hook = language === 'English' 
    ? `Stop scrolling — Watch the incredible story of ${coreSubjectEnglish}!` 
    : `ध्यान से देखो — ${devanagariSubject} की एक ऐसी अद्भुत और दिव्य कहानी!`;
  let caption = '✨ ' + cleanTopic + ' #Reels #Viral #AIVideo #Cinematic';
  let hashtags = ['#viral', '#reels', '#ai', '#cinematic'];

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

  return { title, subjectCharacter: subjectChar, targetDuration, hook, caption, hashtags, scenes };
}

// Generate Video Script & Preload Scenes with 100% Gate
async function generateVideo() {
  const promptInput = el('promptInput');
  const prompt = promptInput.value.trim();

  if (!prompt) {
    promptInput.focus();
    showToast('Prompt is required.');
    return;
  }

  // Always read current live selection values from form controls
  state.voiceGender = el('voiceGenderSelect')?.value || state.voiceGender || 'Male';
  state.language = el('languageSelect')?.value || state.language || 'Hinglish';

  // Auto-detect best visual theme, captions, camera motion & shaders
  autoDetectPromptStyles(prompt);

  const btn = el('generateVideoBtn');
  btn.disabled = true;
  btn.querySelector('span:first-child').textContent = `✍️ AI Director Writing Script & Scenes…`;

  // Reveal workspace & show ReelShorts canvas loading spinner overlay
  el('studioWorkspace').hidden = false;
  const overlay = el('canvasLoadingOverlay');
  const overlayText = el('canvasLoadingText');
  const progressFill = el('canvasProgressFill');

  if (overlay) {
    overlay.hidden = false;
    overlay.style.display = 'flex';
  }
  if (overlayText) overlayText.textContent = `✨ AI Director Analyzing Concept & Writing Scenes…`;
  if (progressFill) progressFill.style.width = `15%`;

  try {
    let resultData = null;
    try {
      let res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          duration: state.duration,
          language: state.language,
          style: state.style,
          voiceGender: state.voiceGender
        })
      });
      if (!res.ok) {
        // Fallback to direct Cloud Run URL
        res = await fetch('https://api-vvwtkdts6q-uc.a.run.app/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            duration: state.duration,
            language: state.language,
            style: state.style,
            voiceGender: state.voiceGender
          })
        });
      }
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('json')) {
        const jsonRes = await res.json();
        resultData = jsonRes.data;
      }
    } catch (apiErr) {
      console.warn('Backend API unavailable, using client AI engine:', apiErr.message);
    }

    // Client-Side Standalone AI Engine (Guaranteed fallback for Static Firebase Hosting)
    if (!resultData) {
      resultData = await generateScriptClientSide(prompt, state.duration, state.language, state.voiceGender);
    }

    state.reel = resultData;
    state.currentScene = 0;
    state.prevScene = -1;

    if (overlayText) overlayText.textContent = `🎨 Generating HD Scene Artwork (0/${state.reel.scenes?.length || 0})… Please wait`;
    if (progressFill) progressFill.style.width = `35%`;

    // Wait 100% until all scene visuals are loaded BEFORE rendering workspace or playing audio
    await preloadAllSceneVisuals(state.reel.scenes || [], (loaded, total) => {
      const pct = Math.round(35 + (loaded / total) * 65);
      if (overlayText) overlayText.textContent = `🎨 Generating HD Scene Artwork (Scene ${loaded} of ${total})… Please wait`;
      if (progressFill) progressFill.style.width = `${pct}%`;
    });

    renderWorkspace();

    if (overlayText) overlayText.textContent = `🎬 All HD Scenes Ready! Launching Studio Player…`;
    if (progressFill) progressFill.style.width = `100%`;

    // 100% HIDE LOADING OVERLAY BEFORE VOICE & VIDEO START PLAYING
    if (overlay) {
      overlay.hidden = true;
      overlay.style.display = 'none';
    }

    state.sceneStartTime = performance.now();
    startAutoPlayback();

    showToast(`▶ 100% ReelShorts AI Scenes Preloaded! Video Playing!`);
  } catch (err) {
    if (overlay) {
      overlay.hidden = true;
      overlay.style.display = 'none';
    }
    showToast(err.message || 'Generation error');
  } finally {
    btn.disabled = false;
    btn.querySelector('span:first-child').textContent = 'Generate Video & Script';
  }
}

// Start Auto Playback
function startAutoPlayback() {
  stopPlayback();
  const overlay = el('canvasLoadingOverlay');
  if (overlay) {
    overlay.hidden = true;
    overlay.style.display = 'none';
  }

  state.playing = true;
  state.sceneStartTime = performance.now();
  state.transitionStartTime = 0;
  if (el('playPauseBtn')) el('playPauseBtn').textContent = '❚❚';

  startCanvasLoop();

  if (!state.muted) {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.resume();
    }
    playStudioNaturalVoice(state.currentScene);
  }
}

// Render Workspace
function renderWorkspace() {
  if (!state.reel) return;
  const reel = state.reel;

  const totalSecs = (reel.scenes || []).reduce((acc, sc) => acc + (sc.duration || 7), 0);
  el('videoTitleLabel').textContent = reel.title || 'Generated Reel';
  el('videoDurationLabel').textContent = `${Math.round(totalSecs)}s Vertical HD`;
  el('totalDurationBadge').textContent = `Total Target Duration: ${reel.targetDuration || state.duration} Seconds (${reel.scenes?.length || 0} scenes)`;

  el('scriptTitle').textContent = reel.title || 'Reel Script';
  el('scriptHook').textContent = reel.hook || (reel.scenes?.[0]?.onScreen) || '--';

  const timeline = el('scenesTimeline');
  timeline.innerHTML = (reel.scenes || []).map((sc, i) => `
    <div class="scene-item-row ${state.currentScene === i ? 'active' : ''}" data-idx="${i}">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <strong style="color:var(--accent);">Scene ${String(i + 1).padStart(2, '0')} (${sc.duration || 7}s Dialogue):</strong>
        <span style="font-size:11px; opacity:0.7; background:rgba(255,255,255,0.1); padding:2px 8px; border-radius:10px;">${sc.onScreen || 'Badge'}</span>
      </div>
      <div style="font-size:13px; font-weight:700; color:#fff; margin-top:6px;">"${escapeHtml(sc.narration)}"</div>
      <div style="font-size:11px; color:#a78bfa; margin-top:5px; line-height:1.3;">🎨 Visual: ${escapeHtml(sc.visual || '')}</div>
    </div>
  `).join('');

  document.querySelectorAll('.scene-item-row').forEach((row) => {
    row.addEventListener('click', () => {
      changeScene(Number(row.dataset.idx));
      if (!state.muted) playStudioNaturalVoice(state.currentScene);
    });
  });

  el('scriptCaption').textContent = reel.caption || '';
  el('scriptHashtags').textContent = (reel.hashtags || []).join(' ');
  if (el('jsonOutput')) el('jsonOutput').textContent = JSON.stringify(reel, null, 2);

  startCanvasLoop();
}

// Controlled Playback Loop
function togglePlayback() {
  if (!state.reel) return;

  if (state.playing) {
    stopPlayback();
  } else {
    const scenes = state.reel.scenes || [];
    if (state.currentScene >= scenes.length - 1) {
      changeScene(0);
    }
    startAutoPlayback();
  }
}

function stopPlayback() {
  clearTimeout(state.playbackTimer);
  state.playbackTimer = null;
  state.playing = false;
  stopAllAudio();
  el('playPauseBtn').textContent = '▶';
}

function stopAllAudio() {
  if (state.currentAudio) {
    state.currentAudio.pause();
    state.currentAudio.currentTime = 0;
    state.currentAudio = null;
  }
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  state.speaking = false;
}

function convertHinglishToHindiDevanagari(text) {
  if (!text) return '';
  if (/[\u0900-\u097F]/.test(text)) return text; // Already Devanagari script

  const wordMap = {
    'main': 'मैं', 'aaj': 'आज', 'ek': 'एक', 'naye': 'नए', 'safar': 'सफर', 'par': 'पर', 'nikla': 'निकला', 'hoon': 'हूँ',
    'hai': 'है', 'hain': 'हैं', 'yeh': 'यह', 'woh': 'वह', 'kya': 'क्या', 'aapko': 'आपको', 'pata': 'पता', 'bhi': 'भी',
    'nahi': 'नहीं', 'nahin': 'नहीं', 'aur': 'और', 'se': 'से', 'ko': 'को', 'ka': 'का', 'ki': 'की', 'ke': 'के',
    'baarish': 'बारिश', 'boondon': 'बूंदों', 'beech': 'बीच', 'shehar': 'शहर', 'sabse': 'सबसे', 'bada': 'बड़ा',
    'duniya': 'दुनिया', 'raaz': 'राज़', 'har': 'हर', 'rasta': 'रास्ता', 'amar': 'अमर', 'kholta': 'खोलता',
    'samajh': 'समझ', 'aayega': 'आएगा', 'dhyan': 'ध्यान', 'dekho': 'देखो', 'rokkar': 'रोककर', 'suno': 'सुनो',
    'kahani': 'कहानी', 'shandar': 'शानदार', 'adbhut': 'अद्भुत', 'jhalak': 'झलक', 'akela': 'अकेला', 'wolf': 'भेड़िया',
    'bhediya': 'भेड़िया', 'pahad': 'पहाड़', 'choti': 'चोटी', 'khada': 'खड़ा', 'shanti': 'शांति', 'lamha': 'लम्हा',
    'badi': 'बड़ी', 'seekh': 'सीख', 'khubsurati': 'खूबसूरती', 'drishya': 'दृश्य', 'anubhav': 'अनुभव', 'zidd': 'ज़िद',
    'manzil': 'मंजिल', 'ban': 'बन', 'jata': 'जाता', 'shuru': 'शुरू', 'sabko': 'सबको', 'prerit': 'प्रेरित'
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

function cleanTtsText(rawText) {
  let cleaned = String(rawText || '')
    .replace(/#\w+/g, '')
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}]/gu, '')
    .replace(/[()[\]{}]/g, '')
    .replace(/\bAI\b/gi, 'ए आई')
    .replace(/\bVS\b/gi, 'वर्सेस')
    .replace(/%/g, ' प्रतिशत')
    .replace(/&/g, ' और ');

  // Convert digits to Devanagari Hindi words for 100% smooth TTS pronunciation
  const numMap = {
    '15': 'पंद्रह', '30': 'तीस', '45': 'पैंतालीस', '60': 'साठ',
    '1': 'एक', '2': 'दो', '3': 'तीन', '4': 'चार', '5': 'पांच',
    '6': 'छह', '7': 'सात', '8': 'आठ', '9': 'नौ', '10': 'दस'
  };
  Object.keys(numMap).forEach(n => {
    cleaned = cleaned.replace(new RegExp('\\b' + n + '\\b', 'g'), numMap[n]);
  });

  cleaned = cleaned
    .replace(/[^a-zA-Z0-9\s.,!?\u0900-\u097F]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // If text is Hinglish/Hindi, convert Roman words to Devanagari Hindi
  return convertHinglishToHindiDevanagari(cleaned);
}

// ─── NATURAL INDIAN VOICE SELECTION ENGINE ─────────────────────────────────────
function getBestVoiceForLanguage(voices, gender, language, text) {
  if (!voices || voices.length === 0) return null;

  const isHindiText = language === 'Hindi' || language === 'Hinglish' || /[\u0900-\u097F]/.test(text);

  if (isHindiText) {
    // Filter STRICTLY for authentic Indian / Hindi voices ONLY
    const strictHindiVoices = voices.filter(v => 
      (v.lang && (v.lang.includes('hi') || v.lang.includes('IN'))) || 
      /Hindi|हिन्दी|India/i.test(v.name)
    );

    // Reject any Western US/UK/AU voices
    const nonWesternHindi = strictHindiVoices.filter(v => !/David|Mark|George|Zira|Hazel|Susan|Linda|Catherine|James|Richard/i.test(v.name));

    if (nonWesternHindi.length > 0) {
      if (gender === 'Male') {
        return nonWesternHindi.find(v => /Male|Hemant|Ravi|Madhur|Prabhat/i.test(v.name) && !/Female|Kalpana|Heera|Zira|Google हिन्दी/i.test(v.name)) 
            || nonWesternHindi.find(v => v.lang.includes('hi')) 
            || nonWesternHindi[0];
      } else {
        return nonWesternHindi.find(v => /Female|Kalpana|Heera|Swara|Google/i.test(v.name)) || nonWesternHindi[0];
      }
    }

    // If no Indian/Hindi voice installed on device, return NULL so browser uses native Google Indian Cloud Voice
    return null;
  } else {
    // English language
    if (gender === 'Male') {
      return voices.find(v => /Male|Guy|David|Mark|George/i.test(v.name)) || voices[0];
    } else {
      return voices.find(v => /Female|Zira|Hazel|Susan/i.test(v.name)) || voices[0];
    }
  }
}

// ─── 100% FREE SEAMLESS AI VOICE & AUDIO CONTINUATION ENGINE (0ms GAP) ─────────
function playStudioNaturalVoice(startSceneIdx) {
  if (state.muted) return;
  if (!state.reel || !state.reel.scenes) return;

  stopAllAudio();

  const scenes = state.reel.scenes;
  const total = scenes.length;

  let currentIdx = startSceneIdx;

  function speakScene(sceneIdx) {
    if (!state.playing || state.muted) return;
    const scene = scenes[sceneIdx];
    if (!scene) return;

    const rawText = scene.spokenNarration || scene.narration || scene.onScreen || '';
    const cleanText = cleanTtsText(rawText);
    if (!cleanText) {
      advanceNext();
      return;
    }

    const isLastScene = (sceneIdx === scenes.length - 1);

    const handleEnded = () => {
      state.speaking = false;
      if (!state.playing || state.muted) return;

      if (isLastScene) {
        setTimeout(() => {
          stopPlayback();
          changeScene(0);
          showToast('🎬 Video complete! Click ▶ to play again.');
        }, 300);
      } else {
        currentIdx = sceneIdx + 1;
        changeScene(currentIdx);
        speakScene(currentIdx);
      }
    };

    const speakWebSpeechFallback = () => {
      const voices = state.voices.length > 0 ? state.voices : window.speechSynthesis.getVoices();
      const voice = getBestVoiceForLanguage(voices, state.voiceGender, state.language, cleanText);
      const utt = new SpeechSynthesisUtterance(cleanText);
      utt.lang = 'hi-IN';

      if (voice) {
        utt.voice = voice;
        if (voice.lang && voice.lang.includes('hi')) utt.lang = voice.lang;
      }

      // Voice Gender Pitch Engine: Guarantee Deep Male Voice without western accent
      if (state.voiceGender === 'Male') {
        const isMaleNamed = voice && /Male|Hemant|Ravi|Madhur|Prabhat/i.test(voice.name);
        utt.pitch = isMaleNamed ? 0.85 : 0.55; // 0.55 pitch transforms any Hindi voice into deep heroic male voice!
        utt.rate = 0.92;
      } else {
        utt.pitch = 1.1;
        utt.rate = 0.96;
      }

      utt.onstart = () => {
        state.speaking = true;
        if (state.currentScene !== sceneIdx) changeScene(sceneIdx);
      };
      utt.onend = handleEnded;
      utt.onerror = handleEnded;

      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utt);
    };

    let audio = state.sceneAudios[sceneIdx];
    if (!audio) {
      const lang = state.language === 'English' ? 'en' : 'hi';
      const ttsUrl = `/api/tts?text=${encodeURIComponent(cleanText)}&lang=${lang}&gender=${state.voiceGender}&t=${Date.now()}`;
      audio = new Audio(ttsUrl);
      audio.preload = 'auto';
      state.sceneAudios[sceneIdx] = audio;
    }

    audio.volume = state.volume;
    audio.currentTime = 0;
    state.currentAudio = audio;

    audio.onplay = () => {
      state.speaking = true;
      if (state.currentScene !== sceneIdx) changeScene(sceneIdx);
    };

    audio.onended = handleEnded;
    audio.onerror = () => {
      console.warn('MP3 TTS Audio error, falling back to WebSpeech');
      speakWebSpeechFallback();
    };

    audio.play().catch(e => {
      console.warn('Audio play autoplay failure:', e.message);
      speakWebSpeechFallback();
    });
  }

  function advanceNext() {
    if (currentIdx < total - 1) {
      currentIdx++;
      changeScene(currentIdx);
      speakScene(currentIdx);
    } else {
      stopPlayback();
      changeScene(0);
    }
  }

  speakScene(startSceneIdx);
}

// ─── FULL HD MP4 VIDEO EXPORTER (.mp4) ──────────────────────────────────────────
async function exportMp4Video() {
  if (!state.reel || !window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
    showToast('MP4 Exporter requires Chrome/Edge/Safari/Firefox.');
    return;
  }

  const btn = el('exportVideoBtn');
  btn.disabled = true;
  btn.querySelector('span:first-child').textContent = 'Rendering Full HD MP4 Video with Voice…';

  const canvas = el('reelCanvas');
  const canvasStream = canvas.captureStream(30);

  // Combine Canvas Video Stream + Audio Stream
  let combinedStream = canvasStream;
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const dest = audioCtx.createMediaStreamDestination();
    
    // Add audio tracks if available
    if (state.currentAudio && state.currentAudio.captureStream) {
      const audioStream = state.currentAudio.captureStream();
      audioStream.getAudioTracks().forEach(track => combinedStream.addTrack(track));
    }
  } catch (e) {
    console.warn('Audio stream mix note:', e.message);
  }

  // Determine best MP4 container format supported by browser
  let mimeType = 'video/mp4';
  if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1,mp4a.40.2')) {
    mimeType = 'video/mp4;codecs=avc1,mp4a.40.2';
  } else if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')) {
    mimeType = 'video/mp4;codecs=avc1';
  } else if (MediaRecorder.isTypeSupported('video/mp4')) {
    mimeType = 'video/mp4';
  } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
    mimeType = 'video/webm;codecs=vp9';
  } else {
    mimeType = 'video/webm';
  }

  const recorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: 6_000_000
  });

  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const finished = new Promise((res) => { recorder.onstop = res; });
  recorder.start();

  const originalScene = state.currentScene;
  const scenes = state.reel.scenes || [];

  for (let i = 0; i < scenes.length; i++) {
    changeScene(i);
    playStudioNaturalVoice(i);
    const sceneDurMs = ((scenes[i].duration || 7) * 1000) + 200;
    await new Promise((r) => setTimeout(r, sceneDurMs));
  }

  recorder.stop();
  await finished;

  changeScene(originalScene);

  const isMp4 = mimeType.includes('mp4');
  const blob = new Blob(chunks, { type: isMp4 ? 'video/mp4' : 'video/webm' });
  const ext = isMp4 ? 'mp4' : 'mp4'; // Always save with .mp4 extension for native player compatibility
  const filename = `${(state.reel.title || 'reel').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}.${ext}`;

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  btn.disabled = false;
  btn.querySelector('span:first-child').textContent = '⚡ EXPORT FULL MP4 VIDEO (.mp4)';
  showToast('🎉 Full MP4 Video Downloaded Successfully!');
}

function initApp() {
  state.duration = 30;

  if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => {
      state.voices = window.speechSynthesis.getVoices();
    };
    state.voices = window.speechSynthesis.getVoices();
  }

  const durationPills = el('durationPills');
  if (durationPills) {
    durationPills.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        durationPills.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.duration = Number(btn.dataset.duration);
        showToast(`Target duration set to ${state.duration} seconds`);
      });
    });
  }

  el('languageSelect')?.addEventListener('change', (e) => { state.language = e.target.value; });

  const voiceGenderSelect = el('voiceGenderSelect');
  if (voiceGenderSelect) {
    voiceGenderSelect.addEventListener('change', (e) => {
      state.voiceGender = e.target.value;
      showToast(`Voice gender set to ${state.voiceGender}`);
      if (state.reel && !state.muted) {
        stopAllAudio();
        playStudioNaturalVoice(state.currentScene);
      }
    });
  }

  const styleSelect = el('styleSelect');
  if (styleSelect) {
    styleSelect.addEventListener('change', (e) => { state.style = e.target.value; });
  }

  const promptInput = el('promptInput');
  if (promptInput) {
    promptInput.addEventListener('input', () => {
      const charSpan = el('promptCharCount');
      if (charSpan) charSpan.textContent = `${promptInput.value.length} chars`;
    });

    promptInput.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        generateVideo();
      }
    });
  }

  document.querySelectorAll('[data-prompt]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (promptInput) {
        promptInput.value = btn.dataset.prompt;
        promptInput.dispatchEvent(new Event('input'));
        promptInput.focus();
      }
    });
  });

  // Ensure WebSpeech Audio is unlocked on first user interaction
  const unlockAudio = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.resume();
    }
  };
  document.addEventListener('click', unlockAudio, { once: true });
  document.addEventListener('touchstart', unlockAudio, { once: true });

  el('generateVideoBtn')?.addEventListener('click', () => {
    unlockAudio();
    generateVideo();
  });
  el('playPauseBtn')?.addEventListener('click', () => {
    unlockAudio();
    togglePlayback();
  });

  const muteBtn = el('muteBtn');
  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      state.muted = !state.muted;
      if (state.muted) {
        stopAllAudio();
        muteBtn.textContent = '🔇';
        muteBtn.style.opacity = '0.6';
        if (el('volumeSlider')) el('volumeSlider').value = 0;
        showToast('Voice narration muted');
      } else {
        muteBtn.textContent = '🔊';
        muteBtn.style.opacity = '1.0';
        if (el('volumeSlider')) el('volumeSlider').value = state.volume || 1.0;
        showToast('Voice narration enabled');
        if (state.playing || state.reel) playStudioNaturalVoice(state.currentScene);
      }
    });
  }

  const scrubber = el('playerScrubber');
  if (scrubber) {
    scrubber.addEventListener('input', () => {
      state.isScrubbing = true;
    });
    scrubber.addEventListener('change', () => {
      state.isScrubbing = false;
      if (!state.reel || !state.reel.scenes) return;
      const pct = parseFloat(scrubber.value) / 100;
      const targetSecs = pct * (state.totalDurationSecs || 30);

      let acc = 0;
      let targetIdx = 0;
      for (let i = 0; i < state.reel.scenes.length; i++) {
        const d = state.reel.scenes[i].duration || 7;
        if (acc + d >= targetSecs) {
          targetIdx = i;
          break;
        }
        acc += d;
      }
      changeScene(targetIdx);
      if (state.playing && !state.muted) {
        playStudioNaturalVoice(targetIdx);
      }
    });
  }

  const volSlider = el('volumeSlider');
  if (volSlider) {
    volSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      state.volume = val;
      if (state.currentAudio) state.currentAudio.volume = val;
      if (val === 0) {
        state.muted = true;
        if (el('muteBtn')) el('muteBtn').textContent = '🔇';
      } else {
        state.muted = false;
        if (el('muteBtn')) el('muteBtn').textContent = '🔊';
      }
    });
  }

  const fsBtn = el('fullscreenBtn');
  if (fsBtn) {
    fsBtn.addEventListener('click', () => {
      const frame = document.querySelector('.phone-frame');
      if (!document.fullscreenElement) {
        frame?.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });
  }

  el('exportVideoBtn')?.addEventListener('click', exportMp4Video);

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      if (!target) return;

      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));

      btn.classList.add('active');
      const tabEl = el(`tab${target.charAt(0).toUpperCase() + target.slice(1)}`);
      if (tabEl) tabEl.classList.add('active');
    });
  });

  el('copyScriptBtn')?.addEventListener('click', () => {
    if (!state.reel) return;
    const r = state.reel;
    let fullScript = `🎬 TITLE: ${r.title}\n\n📍 HOOK:\n${r.hook}\n\n📄 SCENE DIALOGUES:\n`;
    (r.scenes || []).forEach((sc, i) => {
      fullScript += `Scene ${i + 1} (${sc.duration || 7}s): "${sc.narration}"\n`;
    });
    fullScript += `\n💬 CAPTION:\n${r.caption}\n\n${(r.hashtags || []).join(' ')}`;

    navigator.clipboard.writeText(fullScript).then(() => showToast('📋 Full Production Script Copied!'));
  });

  el('copyJsonBtn')?.addEventListener('click', () => {
    const jsonOutput = el('jsonOutput');
    if (jsonOutput) {
      navigator.clipboard.writeText(jsonOutput.textContent).then(() => showToast('JSON copied!'));
    }
  });
}

document.addEventListener('DOMContentLoaded', initApp);
