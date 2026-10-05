#!/usr/bin/env node
/*
 * Gera UM vídeo contínuo do tour (fachada → interior → fundos) com o kie.ai
 * e prepara os quadros que a landing page usa para acompanhar o scroll.
 *
 * Como funciona:
 *   1. Envia as 5 imagens de assets/ para o kie.ai (upload de arquivo).
 *   2. Pede 4 clipes ao Kling v2.1 Pro, cada um começando numa imagem e
 *      terminando na seguinte (image_url → tail_image_url). Assim a câmera
 *      sai da fachada, entra na casa e termina na área externa sem cortes.
 *   3. Junta os 4 clipes com ffmpeg em assets/video/tour.mp4 (o vídeo único).
 *   4. Extrai os quadros em assets/frames/ + manifest.js; o tour.js usa
 *      esses quadros quando existem (sem eles, usa a animação das fotos).
 *
 * Uso:
 *   KIE_AI_API_KEY=... node scripts/gerar-video.mjs      (ou a chave no .env)
 *   node scripts/gerar-video.mjs --dry-run               mostra o plano, sem gastar créditos
 *   node scripts/gerar-video.mjs --from-clips <pasta>    pula o kie.ai e usa clipes 1..4.mp4 locais
 *
 * Os taskIds ficam em scripts/.kie-cache.json: se algo falhar no meio,
 * rodar de novo reaproveita os clipes já pagos.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://api.kie.ai/api/v1";
const UPLOAD_API = "https://kieai.redpandaai.co/api/file-base64-upload";
const MODEL = "kling/v2-1-pro";
const CACHE_FILE = path.join(ROOT, "scripts/.kie-cache.json");
const CLIPS_DIR = path.join(ROOT, "build/clips");
const VIDEO_OUT = path.join(ROOT, "assets/video/tour.mp4");
const FRAMES_DIR = path.join(ROOT, "assets/frames");
const FRAME_FPS = 12;      // quadros por segundo extraídos para o scroll
const FRAME_WIDTH = 720;   // largura dos quadros (as fotos originais têm ~530px)

const IMAGES = [
  "assets/01-fachada.jpg",
  "assets/02-sala.jpg",
  "assets/03-jantar.jpg",
  "assets/04-cascata.jpg",
  "assets/05-area-externa.jpg",
];

const STYLE = "Single continuous cinematic take, smooth stabilized gimbal movement, constant slow speed, " +
  "photorealistic architectural visualization, natural light, no people, no text, no cuts.";
const NEGATIVE = "people, text, watermark, cut, scene change, fast motion, shaking camera, distortion, warped architecture";

const TRANSITIONS = [
  "The camera glides forward from the street, up the front steps and through the front door of the modern house, " +
    "entering the bright open-plan living room with grey sofa, kitchen island and wooden TV panel.",
  "The camera moves forward through the living room and turns gently left toward the dining area, " +
    "arriving beside the wooden dining table with grey chairs and the tall glass wall to the garden.",
  "The camera moves past the dining table toward the floor-to-ceiling glass and steps outside into the backyard, " +
    "revealing the waterfall pouring from the dark frame into the natural stone pool.",
  "The camera slowly rises and pulls back from the waterfall, revealing the whole backyard: " +
    "stone pool with spa, lawn, tropical plants and the illuminated gourmet area under the house.",
];

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const fromClipsIdx = args.indexOf("--from-clips");
const FROM_CLIPS = fromClipsIdx >= 0 ? path.resolve(args[fromClipsIdx + 1] || "") : null;

const log = (...m) => console.log("›", ...m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readKey() {
  if (process.env.KIE_AI_API_KEY) return process.env.KIE_AI_API_KEY.trim();
  for (let dir = process.cwd(); ; dir = path.dirname(dir)) {
    const f = path.join(dir, ".env");
    if (fs.existsSync(f)) {
      const m = fs.readFileSync(f, "utf8").match(/^\s*KIE_AI_API_KEY\s*=\s*["']?([^"'\r\n]+)/m);
      if (m) return m[1].trim();
    }
    if (dir === path.dirname(dir)) return null;
  }
}

const loadCache = () => (fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) : {});
const saveCache = (c) => fs.writeFileSync(CACHE_FILE, JSON.stringify(c, null, 2));

async function api(key, method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`${method} ${url} → HTTP ${res.status}: ${text.slice(0, 300)}`); }
  if (!res.ok || (json.code && json.code !== 200)) {
    throw new Error(`${method} ${url} → ${json.code || res.status}: ${json.msg || json.message || text.slice(0, 300)}`);
  }
  return json.data;
}

async function uploadImage(key, rel, cache) {
  const abs = path.join(ROOT, rel);
  const stamp = fs.statSync(abs).mtimeMs;
  const hit = cache.uploads?.[rel];
  if (hit && hit.stamp === stamp && hit.until > Date.now()) return hit.url;
  log("upload", rel);
  const data = await api(key, "POST", UPLOAD_API, {
    base64Data: `data:image/jpeg;base64,${fs.readFileSync(abs).toString("base64")}`,
    uploadPath: "scroll-tour",
    fileName: path.basename(rel),
  });
  const url = data.downloadUrl || data.fileUrl || data.url;
  if (!url) throw new Error(`upload sem URL na resposta: ${JSON.stringify(data)}`);
  // arquivos enviados ao kie.ai expiram; reaproveita por no máximo 2 dias
  cache.uploads = { ...cache.uploads, [rel]: { url, stamp, until: Date.now() + 2 * 864e5 } };
  saveCache(cache);
  return url;
}

async function waitTask(key, taskId, label) {
  const started = Date.now();
  for (;;) {
    const d = await api(key, "GET", `${API}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`);
    const state = d.state || d.status;
    if (state === "success") {
      const result = typeof d.resultJson === "string" ? JSON.parse(d.resultJson) : d.resultJson || {};
      const url = result.resultUrls?.[0] || result.videoUrl || result.url;
      if (!url) throw new Error(`${label}: tarefa concluída sem URL: ${JSON.stringify(d)}`);
      return url;
    }
    if (state === "fail" || state === "failed") throw new Error(`${label}: falhou no kie.ai: ${d.failMsg || d.failCode || "sem detalhe"}`);
    const secs = Math.round((Date.now() - started) / 1000);
    process.stdout.write(`\r› ${label}: ${state || "aguardando"} (${secs}s)   `);
    if (secs > 30 * 60) throw new Error(`${label}: passou de 30 min; rode de novo para continuar esperando`);
    await sleep(10000);
  }
}

async function download(url, file) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${url} → HTTP ${res.status}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

async function generateClips(key) {
  const cache = loadCache();
  fs.mkdirSync(CLIPS_DIR, { recursive: true });
  const urls = [];
  for (const rel of IMAGES) urls.push(await uploadImage(key, rel, cache));

  // dispara as 4 tarefas em paralelo (as que já existem no cache são reaproveitadas)
  cache.tasks ||= {};
  for (let i = 0; i < TRANSITIONS.length; i++) {
    const id = `clip${i + 1}`;
    const prompt = `${TRANSITIONS[i]} ${STYLE}`;
    const t = cache.tasks[id];
    if (t && t.prompt === prompt && !t.failed) continue;
    log(`criando ${id}: ${path.basename(IMAGES[i])} → ${path.basename(IMAGES[i + 1])}`);
    const data = await api(key, "POST", `${API}/jobs/createTask`, {
      model: MODEL,
      input: {
        prompt,
        image_url: urls[i],
        tail_image_url: urls[i + 1],
        duration: "5",
        negative_prompt: NEGATIVE,
        cfg_scale: 0.5,
      },
    });
    cache.tasks[id] = { taskId: data.taskId, prompt };
    saveCache(cache);
  }

  for (let i = 0; i < TRANSITIONS.length; i++) {
    const id = `clip${i + 1}`;
    const file = path.join(CLIPS_DIR, `${i + 1}.mp4`);
    if (fs.existsSync(file) && cache.tasks[id].done) continue;
    try {
      const url = await waitTask(key, cache.tasks[id].taskId, id);
      process.stdout.write("\n");
      await download(url, file);
      cache.tasks[id].done = true;
      saveCache(cache);
      log(`${id} baixado`);
    } catch (err) {
      cache.tasks[id].failed = true; // próxima execução cria a tarefa de novo
      saveCache(cache);
      throw err;
    }
  }
  return CLIPS_DIR;
}

function ffmpeg(...a) {
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...a], { stdio: "inherit" });
}

function probeSize(file) {
  return execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
    "-of", "csv=p=0", file]).toString().trim().split(",").map(Number);
}

function buildOutputs(clipsDir) {
  const clips = [1, 2, 3, 4].map((n) => path.join(clipsDir, `${n}.mp4`));
  for (const c of clips) if (!fs.existsSync(c)) throw new Error(`clipe não encontrado: ${c}`);

  // normaliza (mesmo tamanho/fps, pela proporção do 1º clipe) e concatena; o 1º quadro
  // de cada clipe seguinte repete o último do anterior, então ele é descartado
  fs.mkdirSync(path.dirname(VIDEO_OUT), { recursive: true });
  const [cw, ch] = probeSize(clips[0]);
  const w = FRAME_WIDTH, h = Math.round((FRAME_WIDTH * ch) / cw / 2) * 2;
  const inputs = clips.flatMap((c) => ["-i", c]);
  const norm = clips.map((_, i) =>
    `[${i}:v]fps=24,scale=${w}:${h}:force_original_aspect_ratio=increase:flags=lanczos,crop=${w}:${h},setsar=1` +
    `${i > 0 ? ",trim=start_frame=1,setpts=PTS-STARTPTS" : ""}[v${i}]`
  ).join(";");
  const filter = `${norm};${clips.map((_, i) => `[v${i}]`).join("")}concat=n=${clips.length}:v=1:a=0[out]`;
  log("montando", path.relative(ROOT, VIDEO_OUT));
  ffmpeg(...inputs, "-filter_complex", filter, "-map", "[out]", "-an",
    "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p",
    "-g", "12", "-movflags", "+faststart", VIDEO_OUT);

  log("extraindo quadros para o scroll");
  fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
  fs.mkdirSync(FRAMES_DIR, { recursive: true });
  ffmpeg("-i", VIDEO_OUT, "-vf", `fps=${FRAME_FPS}`, "-c:v", "libwebp", "-quality", "78",
    path.join(FRAMES_DIR, "f%04d.webp"));
  const frames = fs.readdirSync(FRAMES_DIR).filter((f) => f.endsWith(".webp")).sort();
  const probe = probeSize(VIDEO_OUT);
  // .js (e não .json) para funcionar também abrindo o index.html direto do disco
  const manifest = { count: frames.length, pattern: "f{n}.webp", pad: 4, fps: FRAME_FPS, width: probe[0], height: probe[1] };
  fs.writeFileSync(path.join(FRAMES_DIR, "manifest.js"), `window.TOUR_FRAMES = ${JSON.stringify(manifest)};\n`);
  const mb = (p) => (fs.statSync(p).size / 1048576).toFixed(1);
  const framesMb = frames.reduce((s, f) => s + fs.statSync(path.join(FRAMES_DIR, f)).size, 0) / 1048576;
  log(`pronto: ${path.relative(ROOT, VIDEO_OUT)} (${mb(VIDEO_OUT)} MB) + ${frames.length} quadros (${framesMb.toFixed(1)} MB)`);
}

async function main() {
  if (DRY) {
    log(`modelo: ${MODEL}, ${TRANSITIONS.length} clipes de 5s`);
    TRANSITIONS.forEach((t, i) => log(`clip${i + 1}: ${IMAGES[i]} → ${IMAGES[i + 1]}\n   ${t}`));
    return;
  }
  let clipsDir = FROM_CLIPS;
  if (!clipsDir) {
    const key = readKey();
    if (!key) {
      console.error("KIE_AI_API_KEY não encontrada. Defina a variável de ambiente ou crie um .env com KIE_AI_API_KEY=...");
      process.exit(1);
    }
    clipsDir = await generateClips(key);
  }
  buildOutputs(clipsDir);
}

main().catch((err) => { console.error("\n✗", err.message); process.exit(1); });
