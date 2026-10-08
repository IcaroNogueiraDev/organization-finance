// Benchmark de latÃªncia dos modelos NVIDIA (streaming) â€” Fase 4.
// Uso: node bench-models.mjs
// NÃ£o imprime a chave; sÃ³ mede TTFT e tempo total.
import { readFileSync } from "node:fs";

const ENV_PATH = process.argv[2];
const env = {};
for (const line of readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].replace(/\s+#.*$/, "").trim();
}

const BASE = env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";
const KEY = env.NVIDIA_API_KEY;
const RUNS = 2;
const SKIP = (process.argv[3] || "").split(",").filter(Boolean);

const MODELS = [
  "nvidia/nemotron-3-super-120b-a12b",
  "nvidia/nemotron-3.5-lightning-30b-a3b",
  "nvidia/nemotron-nano-3-30b-a3b",
  "z-ai/glm-5.3-flash",
  "deepseek-ai/deepseek-v4.1-flash",
  "google/gemma-3-12b-it",
  "openai/gpt-oss-20b",
];

async function bench(model) {
  const started = performance.now();
  let ttft = null;
  let chars = 0;
  let text = "";
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(45000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${KEY}`,
      },
      body: JSON.stringify({
        model,
        stream: true,
        temperature: 0.2,
        max_tokens: 120,
        messages: [
          { role: "system", content: "Responda sempre em portuguÃªs do Brasil." },
          { role: "user", content: "Em uma frase curta: qual a importÃ¢ncia de fazer um orÃ§amento pessoal?" },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return { model, error: `HTTP ${res.status}: ${body.slice(0, 160)}` };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const json = JSON.parse(payload);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            if (ttft === null) ttft = performance.now() - started;
            chars += delta.length;
            text += delta;
          }
        } catch {
          // chunk parcial/ignorado
        }
      }
    }

    const total = performance.now() - started;
    return { model, ttft, total, chars, text: text.slice(0, 70) };
  } catch (error) {
    return { model, error: String(error).slice(0, 160) };
  }
}

const fmt = (n) => (n === null || n === undefined ? "-" : `${Math.round(n)} ms`);

console.log(`Base: ${BASE} | runs por modelo: ${RUNS}\n`);
const summary = [];

for (const model of MODELS) {
  if (SKIP.includes(model)) continue;
  const runs = [];
  let error = null;
  for (let i = 0; i < RUNS; i += 1) {
    const r = await bench(model);
    if (r.error) {
      error = r.error;
      break;
    }
    runs.push(r);
  }
  if (error) {
    console.log(`[ERRO] ${model}\n        ${error}\n`);
    summary.push({ model, ttft: null, total: null, error });
    continue;
  }
  const best = runs.reduce((a, b) => (a.total <= b.total ? a : b));
  const avgTtft = runs.reduce((s, r) => s + r.ttft, 0) / runs.length;
  const avgTotal = runs.reduce((s, r) => s + r.total, 0) / runs.length;
  summary.push({ model, ttft: avgTtft, total: avgTotal, best: best.total });
  console.log(
    `[OK] ${model}\n      TTFT mÃ©dio ${fmt(avgTtft)} | total mÃ©dio ${fmt(avgTotal)} | melhor ${fmt(best.total)} | ${best.chars} chars\n      "${best.text}"\n`,
  );
}

summary.sort((a, b) => (a.total ?? 1e9) - (b.total ?? 1e9));
console.log("=== ranking (total mÃ©dio) ===");
for (const s of summary) {
  console.log(
    s.error
      ? `  - ${s.model}: ERRO`
      : `  - ${s.model}: TTFT ${fmt(s.ttft)} | total ${fmt(s.total)}`,
  );
}

