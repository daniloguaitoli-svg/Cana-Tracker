// server/util.js — utilidades compartilhadas (conversões e parsing pt-BR).
//
// O setor sucroenergético mistura muitas unidades: o açúcar é cotado em
// R$/saca de 50 kg (CEPEA) ou em centavos de dólar por libra-peso (Nova York);
// o etanol, em R$/litro (CEPEA), R$/m³ (B3) ou US$/galão (Chicago); e a cana é
// paga por ATR — kg de Açúcar Total Recuperável por tonelada (CONSECANA).
// Aqui ficam as constantes e conversões que amarram tudo isso.

export const LITROS_M3 = 1000;
export const GALAO_L = 3.785411784; // galão americano
export const LB_KG = 0.45359237; // libra-peso
export const SACA_ACUCAR_KG = 50; // saca de açúcar (a de café/soja é de 60 kg)

// Coeficientes de conversão do CONSECANA-SP: quantos kg de ATR são necessários
// para produzir uma unidade de cada produto. São eles que permitem comparar,
// numa mesma régua (R$ por kg de ATR), o que o açúcar e o etanol remuneram.
export const ATR_POR_KG_ACUCAR = 1.0495;
export const ATR_POR_L_ANIDRO = 1.7651;
export const ATR_POR_L_HIDRATADO = 1.6913;

// ATR médio de uma tonelada de cana (kg/t). Varia por safra e região
// (tipicamente 125–150); serve de padrão para estimar R$/tonelada de cana.
export const ATR_PADRAO = 140;

// Converte um número no formato brasileiro ("1.712,39", "+32,70", "-1,46",
// "s/ cotação", "***", "-") para Number — ou null quando não há cotação.
export function parseNumBR(txt) {
  if (txt == null) return null;
  const s = String(txt).trim();
  if (!s || /s\/\s*cota|^\*+$|^-+$|^n\/?d$|indispon/i.test(s)) return null;
  // remove tudo que não for dígito, vírgula, ponto ou sinal
  const limpo = s.replace(/[^\d.,+-]/g, "");
  if (!limpo || /^[+-]?$/.test(limpo)) return null;
  // formato pt-BR: ponto = milhar, vírgula = decimal
  const num = Number(limpo.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(num) ? num : null;
}

// ---------- Etanol: tudo normalizado para R$/litro ----------
export function paraReaisPorLitro({ valor, unidade, usdbrl }) {
  if (valor == null) return null;
  switch (unidade) {
    case "BRL_LITRO":
      return valor;
    case "BRL_M3":
      return valor / LITROS_M3;
    case "USD_GALAO":
      return usdbrl ? (valor / GALAO_L) * usdbrl : null;
    case "USD_LITRO":
      return usdbrl ? valor * usdbrl : null;
    default:
      return null;
  }
}

export function deReaisPorLitro({ reaisLitro, unidadeDestino, usdbrl }) {
  if (reaisLitro == null) return null;
  switch (unidadeDestino) {
    case "BRL_LITRO":
      return reaisLitro;
    case "BRL_M3":
      return reaisLitro * LITROS_M3;
    case "USD_GALAO":
      return usdbrl ? (reaisLitro / usdbrl) * GALAO_L : null;
    case "USD_LITRO":
      return usdbrl ? reaisLitro / usdbrl : null;
    default:
      return null;
  }
}

// ---------- Açúcar: tudo normalizado para R$/kg ----------
export function paraReaisPorKg({ valor, unidade, usdbrl }) {
  if (valor == null) return null;
  switch (unidade) {
    case "BRL_KG":
      return valor;
    case "BRL_SACA50":
      return valor / SACA_ACUCAR_KG;
    case "BRL_5KG":
      return valor / 5;
    case "BRL_TON":
      return valor / 1000;
    case "USD_CENT_LB": // centavos de dólar por libra-peso (Nova York)
      return usdbrl ? ((valor / 100) * usdbrl) / LB_KG : null;
    case "USD_TON":
      return usdbrl ? (valor * usdbrl) / 1000 : null;
    default:
      return null;
  }
}

export function deReaisPorKg({ reaisKg, unidadeDestino, usdbrl }) {
  if (reaisKg == null) return null;
  switch (unidadeDestino) {
    case "BRL_KG":
      return reaisKg;
    case "BRL_SACA50":
      return reaisKg * SACA_ACUCAR_KG;
    case "BRL_5KG":
      return reaisKg * 5;
    case "BRL_TON":
      return reaisKg * 1000;
    case "USD_CENT_LB":
      return usdbrl ? ((reaisKg * LB_KG) / usdbrl) * 100 : null;
    case "USD_TON":
      return usdbrl ? (reaisKg * 1000) / usdbrl : null;
    default:
      return null;
  }
}

// ---------- A régua comum: R$ por kg de ATR ----------
// `produto` diz qual coeficiente do CONSECANA aplicar ("acucar", "hidratado",
// "anidro"). Preços que já vêm em R$/kg de ATR passam direto.
export function paraReaisPorKgATR({ valor, unidade, produto, usdbrl }) {
  if (valor == null) return null;
  if (unidade === "BRL_KG_ATR") return valor;
  switch (produto) {
    case "acucar": {
      const kg = paraReaisPorKg({ valor, unidade, usdbrl });
      return kg == null ? null : kg / ATR_POR_KG_ACUCAR;
    }
    case "hidratado": {
      const l = paraReaisPorLitro({ valor, unidade, usdbrl });
      return l == null ? null : l / ATR_POR_L_HIDRATADO;
    }
    case "anidro": {
      const l = paraReaisPorLitro({ valor, unidade, usdbrl });
      return l == null ? null : l / ATR_POR_L_ANIDRO;
    }
    default:
      return null;
  }
}

// Preço da tonelada de cana = preço do ATR (R$/kg) × ATR da cana (kg/t).
export function reaisPorToneladaCana(reaisKgATR, atrPorTon = ATR_PADRAO) {
  if (reaisKgATR == null || !Number.isFinite(atrPorTon)) return null;
  return reaisKgATR * atrPorTon;
}

export function arred(n, casas = 2) {
  if (n == null || !Number.isFinite(n)) return null;
  const f = 10 ** casas;
  return Math.round(n * f) / f;
}

// Data de hoje em ISO (America/Sao_Paulo aproximado por UTC-3).
export function hojeISO() {
  const agora = new Date(Date.now() - 3 * 3600 * 1000);
  return agora.toISOString().slice(0, 10);
}

// Converte as várias formas de data das fontes para ISO:
//   "17/07/2026"        -> "2026-07-17"  (diária)
//   "20 - 24/07/2026"   -> "2026-07-24"  (semana do indicador CEPEA: usa o fim)
//   "07/2026"           -> "2026-07-01"  (indicador mensal)
export function isoDeBR(dataBR) {
  const s = String(dataBR || "").trim();
  const dias = [...s.matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)];
  if (dias.length) {
    const m = dias[dias.length - 1];
    return `${m[3]}-${m[2]}-${m[1]}`;
  }
  const mes = s.match(/^(\d{2})\/(\d{4})$/);
  if (mes) return `${mes[2]}-${mes[1]}-01`;
  return null;
}

// Dias ÚTEIS (seg–sex) decorridos de `deISO` (exclusive) até `ateISO` (inclusive).
// Feriados não são considerados — a folga da regra de "desatualizado" absorve
// os feriados nacionais isolados.
export function diasUteisEntre(deISO, ateISO) {
  if (!deISO || !ateISO || deISO >= ateISO) return 0;
  let n = 0;
  const d = new Date(deISO + "T12:00:00Z");
  const fim = new Date(ateISO + "T12:00:00Z");
  while (d < fim) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) n++;
  }
  return n;
}

// Slug ASCII estável a partir de um texto livre ("Alagoas / Sergipe" -> "alagoas-sergipe").
export function slugify(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos combinantes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
