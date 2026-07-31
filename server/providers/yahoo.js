// server/providers/yahoo.js — histórico dos contratos internacionais.
//
// O Yahoo Finance é a única fonte gratuita com histórico diário confiável destes
// contratos. Sem CORS — por isso roda no servidor. Símbolos:
//   SB=F  açúcar bruto nº 11 (ICE NY)  — já em ¢US$/libra-peso
//   BZ=F  petróleo Brent               — US$/barril (referência de energia p/ etanol)
// O etanol da B3 e os indicadores CEPEA NÃO têm série gratuita: o histórico
// deles é construído pelos snapshots diários (ver store.js).

const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" };
const TTL_MS = 10 * 60 * 1000;
const cache = new Map(); // `${symbol}|${range}|${interval}` -> { ts, pontos }

// Timeframe -> range/intervalo do Yahoo.
export const TF = {
  "1M": { range: "1mo", interval: "1d" },
  "3M": { range: "3mo", interval: "1d" },
  "6M": { range: "6mo", interval: "1d" },
  "1A": { range: "1y", interval: "1d" },
  "5A": { range: "5y", interval: "1wk" },
};

// Chaveado pelo slug do catálogo (o detalhe do indicador consulta por slug).
export const SIMBOLOS = {
  "ny-acucar": { symbol: "SB=F", escala: 1, casas: 2 },
};

// Séries auxiliares usadas só na aba "Mercado" (não são indicadores do catálogo).
export const AUXILIARES = {
  brent: { symbol: "BZ=F", escala: 1, casas: 2 },
};

async function baixar(cfg, tf) {
  const { range, interval } = TF[tf] || TF["3M"];
  const key = `${cfg.symbol}|${range}|${interval}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.pontos;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    cfg.symbol
  )}?range=${range}&interval=${interval}`;
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`Yahoo indisponível (HTTP ${r.status})`);
  const result = (await r.json())?.chart?.result?.[0];
  const stamps = result?.timestamp;
  const closes = result?.indicators?.quote?.[0]?.close;
  if (!stamps || !closes) throw new Error(`Sem dados do Yahoo para ${cfg.symbol}`);

  const pontos = [];
  for (let i = 0; i < stamps.length; i++) {
    if (closes[i] == null) continue;
    pontos.push({
      date: new Date(stamps[i] * 1000).toISOString().slice(0, 10),
      close: Number((closes[i] * cfg.escala).toFixed(cfg.casas)),
    });
  }
  if (!pontos.length) throw new Error(`Série vazia do Yahoo para ${cfg.symbol}`);
  cache.set(key, { ts: Date.now(), pontos });
  return pontos;
}

// Histórico de um indicador do catálogo (hoje, só o açúcar de Nova York).
export async function historicoIndicador(slug, tf = "3M") {
  const cfg = SIMBOLOS[slug];
  if (!cfg) throw new Error(`Sem histórico Yahoo para ${slug}`);
  return baixar(cfg, tf);
}

// Histórico de uma série auxiliar (ex.: "brent").
export async function historicoAuxiliar(nome, tf = "1A") {
  const cfg = AUXILIARES[nome];
  if (!cfg) throw new Error(`Série auxiliar desconhecida: ${nome}`);
  return baixar(cfg, tf);
}
