// Reproduz a chamada do route /api/assistant fora do Next para isolar a causa.
// Uso: node scripts/tmp-sdk-test.mjs [variaÃ§Ã£o: full | noretry | nomax]
import { readFileSync } from "node:fs";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText } from "ai";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].replace(/\s+#.*$/, "").trim();
}

const variation = process.argv[2] || "full";
const MODEL = process.argv[3] || env.NVIDIA_MODEL;
const MAXTOK = Number(process.argv[4] || 700);
const REASONING = process.argv[5] || null;

const provider = createOpenAICompatible({
  name: "nvidia",
  baseURL: env.NVIDIA_BASE_URL,
  apiKey: env.NVIDIA_API_KEY,
});
const model = provider.languageModel(MODEL);

const instructions = [
  "VocÃª Ã© o assistente financeiro pessoal do org-finance.",
  "Responda SEMPRE em portuguÃªs do Brasil, tom prÃ¡tico e sem julgamento.",
  "Use APENAS os nÃºmeros do bloco DADOS AGREGADOS abaixo. Nunca invente valores.",
  "Respostas curtas (mÃ¡ximo 150 palavras).",
  "Termine toda resposta com exatamente UMA aÃ§Ã£o concreta.",
  "## DADOS AGREGADOS",
  "- outubro de 2026: receita R$ 3.950,00, despesa R$ 1.760,00, saldo R$ 2.190,00",
  "- AlimentaÃ§Ã£o: R$ 612,00; SaÃºde: R$ 132,00; Moradia: R$ 1.500,00",
  "- Maior crescimento: SaÃºde: R$ 0,00 -> R$ 132,00 (R$ 132,00, sem base anterior)",
].join("\n");

const messages = [
  { role: "user", content: "OlÃ¡! Em 1 frase, o que vocÃª faz?" },
  { role: "assistant", content: "Sou o assistente financeiro do org-finance." },
  { role: "user", content: "Qual categoria de despesa mais cresceu?" },
];

const options = {
  model,
  instructions,
  messages,
  temperature: 0.4,
  maxOutputTokens: MAXTOK,
  onLanguageModelCallEnd: (event) => {
    console.log(
      "  [callEnd] finishReason:", event.finishReason,
      "| usage:", JSON.stringify(event.usage),
      "| warnings:", JSON.stringify(event.warnings ?? []),
    );
  },
  onError: ({ error }) => {
    console.log("  [onError]", String(error).slice(0, 300));
  },
  onEnd: ({ text, finishReason }) => {
    console.log(
      `  [onEnd] finishReason=${finishReason} textLen=${text.length} texto=${JSON.stringify(text.slice(0, 160))}`,
    );
  },
};

if (variation !== "nomax") options.maxRetries = variation === "full" ? 2 : 0;

if (REASONING) options.reasoning = REASONING;
console.log(`variação: ${variation} | modelo: ${MODEL} | maxOut: ${MAXTOK} | reasoning: ${REASONING ?? "default"}`);
const t0 = performance.now();
const result = streamText(options);

const reader = result.textStream.getReader();
const dec = new TextDecoder();
let text = "";
let firstAt = null;
let chunks = 0;
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  const piece = typeof value === "string" ? value : dec.decode(value, { stream: true });
  if (piece && firstAt === null) firstAt = performance.now() - t0;
  if (piece) chunks += 1;
  text += piece;
}
console.log(
  `  [stream] chunks=${chunks} firstToken=${firstAt === null ? "-" : Math.round(firstAt)} ms total=${Math.round(performance.now() - t0)} ms textLen=${text.length}`,
);
console.log(`  [stream] texto=${JSON.stringify(text.slice(0, 200))}`);


