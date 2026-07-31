// server/providers/noticiasagricolas.js — fonte primária (gratuita).
//
// A página pública noticiasagricolas.com.br/cotacoes/sucroenergetico é HTML
// renderizado no servidor e traz, em tabelas, o essencial do setor: indicadores
// CEPEA/ESALQ de etanol (hidratado, hidratado outros fins e anidro) e de açúcar
// (cristal, empacotado e refinado), os futuros de açúcar em Nova York, de etanol
// na B3 e em Chicago, o preço do ATR por estado (CONSECANA) e o preço da cana
// básica do Paraná.
//
// A leitura é por REGEX (sem dependências), associando cada <table> ao título
// (<h2>/<h3>) imediatamente anterior. É "melhor esforço": se o HTML mudar, ajustar
// aqui. Os números-chave têm o widget do CEPEA e o Yahoo como reforço.

import { parseNumBR } from "../util.js";

const URL_SUCRO = "https://www.noticiasagricolas.com.br/cotacoes/sucroenergetico";
const UA = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  "Accept-Language": "pt-BR,pt;q=0.9",
};
const TTL_MS = 10 * 60 * 1000;
let cache = null; // { ts, dados }

const strip = (s) => s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

// Extrai [{ heading, header:[...], rows:[[...]], atualizadoEm }] de todo o HTML.
// `atualizadoEm` ("dd/mm/aaaa") vem do rodapé "Atualizado em: ..." que a página
// imprime na última linha de cada tabela — é a data real daquele preço.
function extrairTabelas(html) {
  const tabelas = [];
  const reTable = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let m;
  while ((m = reTable.exec(html)) !== null) {
    const antes = html.slice(0, m.index);
    const hs = [...antes.matchAll(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi)];
    const heading = hs.length ? strip(hs[hs.length - 1][1]) : "";
    const corpo = m[1];
    const header = [...corpo.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((c) => strip(c[1]));
    const rows = [...corpo.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
      .map((r) => [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => strip(c[1])))
      .filter((cells) => cells.length > 0);
    const atualizadoEm = corpo.match(/Atualizado\s+em:?\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1] || null;
    tabelas.push({ heading, header, rows, atualizadoEm });
  }
  return tabelas;
}

// Vários títulos da página se contêm ("Indicador do Açúcar Cristal Cepea/Esalq"
// está quase inteiro dentro de "...Cristal Empacotado Cepea/Esalq"), então o
// casamento é sempre por REGEX ancorada no trecho que os distingue.
const acha = (tabelas, re) => tabelas.find((t) => re.test(t.heading));

// Curva de futuros: [contrato, fechamento, ...variações]. Quando a última coluna
// do cabeçalho não é percentual (o açúcar de Nova York publica a variação em
// PONTOS), a variação % é derivada do próprio fechamento.
function parseCurvaFuturos(tabela, colValor = 1) {
  if (!tabela) return null;
  const ultimoTitulo = tabela.header[tabela.header.length - 1] || "";
  const temPct = /%/.test(ultimoTitulo);
  const curva = tabela.rows
    .map((cells) => {
      const valor = parseNumBR(cells[colValor]);
      if (valor == null) return null;
      const ultima = parseNumBR(cells[cells.length - 1]);
      let variacaoPct = null;
      if (temPct) {
        variacaoPct = ultima;
      } else if (ultima != null && valor - ultima !== 0) {
        // "Variação (pontos)" = diferença absoluta em relação ao fechamento anterior.
        variacaoPct = (ultima / (valor - ultima)) * 100;
      }
      return { contrato: cells[0], valor, variacaoPct };
    })
    .filter(Boolean);
  return curva.length ? { curva, data: tabela.atualizadoEm } : null;
}

// Indicador CEPEA: primeira linha = [data (ou semana), valor, variação %].
function parseIndicador(tabela) {
  if (!tabela || !tabela.rows.length) return null;
  const [data, valorTxt, varTxt] = tabela.rows[0];
  const valor = parseNumBR(valorTxt);
  if (valor == null) return null;
  return { valor, variacaoPct: parseNumBR(varTxt), data: data || tabela.atualizadoEm };
}

// "Açúcar - Preço do ATR": [estado, mês de referência, mensal, acumulado].
function parseATR(tabela) {
  if (!tabela) return [];
  return tabela.rows
    .map((cells) => {
      if (cells.length < 3) return null;
      const estado = cells[0];
      const mensal = parseNumBR(cells[2]);
      if (!estado || mensal == null) return null;
      return {
        estado,
        referencia: cells[1] || null,
        mensal,
        acumulado: parseNumBR(cells[3]),
        data: tabela.atualizadoEm,
      };
    })
    .filter(Boolean);
}

// "Preço da Cana Básica - PR": [tipo, R$/ton, variação/mês %] + linha "Referência: ...".
function parseCanaBasica(tabela) {
  if (!tabela) return null;
  let referencia = null;
  const itens = [];
  for (const cells of tabela.rows) {
    const ref = cells[0]?.match(/refer[êe]ncia:?\s*(.+)$/i);
    if (ref) {
      referencia = ref[1].trim();
      continue;
    }
    const valor = parseNumBR(cells[1]);
    if (!cells[0] || valor == null) continue;
    itens.push({ tipo: cells[0], valor, variacaoPct: parseNumBR(cells[2]) });
  }
  return itens.length ? { referencia, data: tabela.atualizadoEm, itens } : null;
}

export async function lerNoticiasAgricolas() {
  if (cache && Date.now() - cache.ts < TTL_MS) return cache.dados;

  const r = await fetch(URL_SUCRO, { headers: UA });
  if (!r.ok) throw new Error(`Notícias Agrícolas indisponível (HTTP ${r.status})`);
  const html = await r.text();
  const tabelas = extrairTabelas(html);

  // ---- Bolsas ----
  const nyAcucar = parseCurvaFuturos(acha(tabelas, /a[çc][úu]car\s*[-–]\s*bolsa de nova iorque/i));
  const cmeEtanol = parseCurvaFuturos(acha(tabelas, /etanol\s*[-–]\s*bolsa de chicago/i));
  const b3Etanol = parseCurvaFuturos(acha(tabelas, /etanol\s*[-–]\s*b3/i));

  // ---- Indicadores CEPEA ----
  // Atenção aos títulos que se contêm: "Cristal Cepea" só casa com o cristal a
  // granel (o empacotado é "Cristal Empacotado Cepea"); "Hidratado Cepea" só casa
  // com o combustível (o outro é "Hidratado Outros Fins Cepea").
  const indicadores = {
    "cepea-acucar-sp": parseIndicador(acha(tabelas, /cristal\s+cepea/i)),
    "cepea-acucar-empacotado": parseIndicador(acha(tabelas, /cristal\s+empacotado/i)),
    "cepea-acucar-refinado": parseIndicador(acha(tabelas, /refinado\s+amorfo/i)),
    "cepea-hidratado-sp": parseIndicador(acha(tabelas, /hidratado\s+cepea/i)),
    "cepea-hidratado-outros-sp": parseIndicador(acha(tabelas, /hidratado\s+outros\s+fins/i)),
    "cepea-anidro-sp": parseIndicador(acha(tabelas, /anidro\s+cepea/i)),
  };

  // ---- Cana ----
  const atr = parseATR(acha(tabelas, /pre[çc]o do atr/i));
  const canaBasica = parseCanaBasica(acha(tabelas, /cana b[áa]sica/i));

  const dados = {
    fetchedAt: new Date().toISOString(),
    futuros: {
      "ny-acucar": nyAcucar,
      "cme-etanol": cmeEtanol,
      "b3-etanol": b3Etanol,
    },
    indicadores,
    atr,
    canaBasica,
  };
  cache = { ts: Date.now(), dados };
  return dados;
}
