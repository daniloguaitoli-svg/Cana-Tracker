// server/providers/cepea.js — widget público do CEPEA (cepea.org.br).
//
// Cumpre dois papéis aqui:
//   1. reforço (fallback) dos indicadores que a Notícias Agrícolas publica;
//   2. FONTE ÚNICA dos indicadores regionais que não estão naquela página
//      (etanol de GO/MT/PE/AL/PB e açúcar de Santos/AL/PE/PB).
//
// O widget devolve um document.write com uma tabela: Data | Produto | Valor.
// A coluna "Produto" traz a unidade no fim do texto ("Etanol Hidratado - SP litro",
// "Açúcar - SP sc de 50kg", "Etanol Hidratado - MT m3"), então a unidade é lida
// dali — assim uma mudança de unidade na fonte não passa despercebida.

import { createRequire } from "node:module";
import { parseNumBR } from "../util.js";

const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" };
const TTL_MS = 30 * 60 * 1000;
const cache = new Map(); // id -> { ts, dado }

// "Etanol Hidratado - SP litro" -> BRL_LITRO
function unidadeDoProduto(produto) {
  const p = String(produto || "").toLowerCase();
  if (/\bm3\b|\bm³\b/.test(p)) return "BRL_M3";
  if (/\blitro\b/.test(p)) return "BRL_LITRO";
  if (/sc de 50\s*kg/.test(p)) return "BRL_SACA50";
  if (/\bt\b|tonelada/.test(p)) return "BRL_TON";
  if (/\bkg\b/.test(p)) return "BRL_KG";
  return null;
}

export async function widgetCepea(id, fonte = "acucar") {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.dado;
  const url = `https://www.cepea.org.br/br/widgetproduto.js.php?fonte=${encodeURIComponent(
    fonte
  )}&id_indicador%5B%5D=${id}`;
  const r = await fetch(url, { headers: UA, redirect: "follow" });
  if (!r.ok) throw new Error(`CEPEA indisponível (HTTP ${r.status})`);
  const txt = await r.text();
  const tbody = txt.match(/<tbody>([\s\S]*?)<\/tbody>/i)?.[1] || txt;
  const linha = tbody.match(/<tr>([\s\S]*?)<\/tr>/i)?.[1] || "";
  const cels = [...linha.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) =>
    c[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
  );
  const data = cels[0] || null; // "30/07/2026" (diário/semanal) ou "07/2026" (mensal)
  const produto = cels[1] || null;
  const valor = parseNumBR(cels[2]);
  if (valor == null) throw new Error("CEPEA: valor não encontrado");
  const dado = { valor, data, produto, unidade: unidadeDoProduto(produto), variacaoPct: null };
  cache.set(id, { ts: Date.now(), dado });
  return dado;
}

// ---------------------------------------------------------------------------
// Cache versionado (server/cepea-cache.json), alimentado pelo GitHub Actions.
//
// O cepea.org.br fica atrás de um desafio anti-bot da Cloudflare que barra as
// funções da Vercel (403 em qualquer região), mas responde normalmente a partir
// dos runners do GitHub. Por isso um job agendado coleta os indicadores e
// versiona o resultado no repositório: em desenvolvimento o app lê a fonte ao
// vivo, e em produção cai neste arquivo.
// `require` estático (não fs) para que o rastreador de arquivos da Vercel
// inclua o JSON no pacote da função.
const require = createRequire(import.meta.url);
let versionado = null;

function lerVersionado() {
  if (versionado) return versionado;
  try {
    versionado = require("../cepea-cache.json");
  } catch {
    versionado = { atualizadoEm: null, indicadores: {}, historico: {} };
  }
  versionado.indicadores ??= {};
  versionado.historico ??= {};
  return versionado;
}

// Indicador ao vivo, com queda para o cache versionado.
export async function widgetOuCache(slug, id, fonte = "acucar") {
  try {
    return { ...(await widgetCepea(id, fonte)), viaCache: false };
  } catch (e) {
    const guardado = lerVersionado().indicadores[slug];
    if (!guardado) throw e;
    return { ...guardado, variacaoPct: null, viaCache: true };
  }
}

// Série [{date, close}] acumulada pelo job — o único histórico desses
// indicadores que sobrevive a um cold start da Vercel.
export function historicoVersionado(slug) {
  const h = lerVersionado().historico[slug] || {};
  return Object.entries(h)
    .map(([date, close]) => ({ date, close }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function cacheAtualizadoEm() {
  return lerVersionado().atualizadoEm;
}
