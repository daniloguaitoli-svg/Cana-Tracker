// api/diag.js — ROTA TEMPORÁRIA DE DIAGNÓSTICO.
//
// Em produção (Vercel) os indicadores que dependem do widget do CEPEA somem,
// enquanto Notícias Agrícolas, Yahoo e BCB funcionam. Esta rota mostra o que
// exatamente acontece na chamada ao cepea.org.br a partir do servidor: status
// HTTP, mensagem de erro, tempo e o começo do corpo da resposta.
//
// Não expõe segredo nenhum (todas as fontes são públicas). REMOVER depois do
// diagnóstico.

const UA_PADRAO = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" };
const UA_NAVEGADOR = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  "Accept": "text/javascript, */*; q=0.01",
  "Accept-Language": "pt-BR,pt;q=0.9",
  "Referer": "https://www.cepea.org.br/",
};

async function tentar(nome, url, headers) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const r = await fetch(url, { headers, redirect: "follow", signal: ctrl.signal });
    const corpo = await r.text();
    return {
      nome,
      ok: r.ok,
      status: r.status,
      ms: Date.now() - t0,
      tamanho: corpo.length,
      servidor: r.headers.get("server"),
      tipo: r.headers.get("content-type"),
      inicio: corpo.slice(0, 160).replace(/\s+/g, " "),
    };
  } catch (e) {
    return {
      nome,
      ok: false,
      ms: Date.now() - t0,
      erro: `${e.name}: ${e.message}`,
      causa: e.cause ? String(e.cause.code || e.cause.message || e.cause) : null,
    };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  const widget =
    "https://www.cepea.org.br/br/widgetproduto.js.php?fonte=etanol&id_indicador%5B%5D=103";
  const testes = await Promise.all([
    tentar("cepea-widget-ua-simples", widget, UA_PADRAO),
    tentar("cepea-widget-ua-navegador", widget, UA_NAVEGADOR),
    tentar("cepea-home", "https://www.cepea.org.br/br", UA_NAVEGADOR),
    tentar("cepea-sem-www", "https://cepea.org.br/br", UA_NAVEGADOR),
    tentar("noticiasagricolas (controle)", "https://www.noticiasagricolas.com.br/cotacoes/sucroenergetico", UA_NAVEGADOR),
  ]);

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    regiao: process.env.VERCEL_REGION || null,
    ambiente: process.env.VERCEL_ENV || null,
    node: process.version,
    agora: new Date().toISOString(),
    testes,
  });
}
