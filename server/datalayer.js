// server/datalayer.js — fachada da camada de dados.
//
// A UI conversa só com este módulo (via /api). Ele combina as fontes gratuitas:
//   - Notícias Agrícolas (primária): indicadores CEPEA de etanol e açúcar,
//     futuros de Nova York / B3 / Chicago, preço do ATR (CONSECANA) e cana básica;
//   - widget do CEPEA: reforço dos indicadores e fonte única dos regionais;
//   - Banco Central (câmbio USD/EUR, com histórico);
//   - Yahoo (histórico do açúcar de Nova York e do petróleo Brent).
//
// Normalizações: etanol -> R$/litro (e R$/m³); açúcar -> R$/kg (e R$/saca de
// 50 kg); e, para todo mundo que der, a régua comum do setor: R$ por kg de ATR.

import { CATEGORIAS, porSlug, SO_WIDGET, LIMITE_DIAS_UTEIS } from "./catalogo.js";
import { lerNoticiasAgricolas } from "./providers/noticiasagricolas.js";
import { usdbrl as getUsdbrl, getCambio as getCambioBCB, serieUSD } from "./providers/bcb.js";
import { historicoIndicador, historicoAuxiliar, SIMBOLOS } from "./providers/yahoo.js";
import { widgetCepea } from "./providers/cepea.js";
import { getClima as getClimaOM } from "./providers/openmeteo.js";
import { registrar, serieSnapshots } from "./store.js";
import {
  paraReaisPorLitro,
  paraReaisPorKg,
  paraReaisPorKgATR,
  reaisPorToneladaCana,
  arred,
  hojeISO,
  isoDeBR,
  diasUteisEntre,
  slugify,
  ATR_PADRAO,
  ATR_POR_KG_ACUCAR,
  ATR_POR_L_ANIDRO,
  ATR_POR_L_HIDRATADO,
} from "./util.js";

const AVISO =
  "Dados de fontes públicas (CEPEA/ESALQ, CONSECANA, ICE/NYBOT, B3, CME e Banco Central, " +
  "via Notícias Agrícolas e widget do CEPEA), possivelmente com atraso. " +
  "Uso informativo — não é recomendação de investimento.";

// Anota o item com data ISO + estado de atualização. O limite depende da
// periodicidade: um indicador semanal do etanol não está "atrasado" por ter
// 3 dias, e o preço do ATR é mensal.
function anotarData(item, dataTxt, periodicidade = "diaria") {
  const dataISO =
    isoDeBR(dataTxt) ||
    (typeof dataTxt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dataTxt) ? dataTxt : null);
  const dias = dataISO ? diasUteisEntre(dataISO, hojeISO()) : null;
  const limite = LIMITE_DIAS_UTEIS[periodicidade] ?? LIMITE_DIAS_UTEIS.diaria;
  item.data = dataISO;
  item.periodicidade = periodicidade;
  item.diasSemAtualizar = dias;
  item.desatualizado = dias == null ? true : dias > limite;
  return item;
}

// Preenche as conversões que fazem sentido para cada tipo de produto.
function derivados({ valor, unidade, produto, usd }) {
  const out = {};
  const ehEtanol =
    produto === "hidratado" ||
    produto === "anidro" ||
    unidade === "BRL_LITRO" ||
    unidade === "BRL_M3" ||
    unidade === "USD_GALAO";
  if (ehEtanol) {
    const litro = paraReaisPorLitro({ valor, unidade, usdbrl: usd });
    if (litro != null) {
      out.valorBRLlitro = arred(litro, 4);
      out.valorBRLm3 = arred(litro * 1000, 2);
    }
  }
  if (produto === "acucar") {
    const kg = paraReaisPorKg({ valor, unidade, usdbrl: usd });
    if (kg != null) {
      out.valorBRLkg = arred(kg, 4);
      out.valorBRLsaca50 = arred(kg * 50, 2);
    }
  }
  const atr = paraReaisPorKgATR({ valor, unidade, produto, usdbrl: usd });
  if (atr != null) out.valorATR = arred(atr, 4);
  return out;
}

const casasDaUnidade = (unidade) =>
  unidade === "BRL_LITRO" || unidade === "USD_GALAO" || unidade === "BRL_KG_ATR" || unidade === "BRL_KG"
    ? 4
    : 2;

// Futuro de bolsa: usa o contrato de primeiro vencimento (front month).
function itemFuturo(slug, dado, usd) {
  const cat = porSlug[slug];
  if (!dado || !dado.curva?.length) return null;
  const front = dado.curva[0];
  return anotarData(
    {
      slug,
      nome: cat.nome,
      categoria: cat.categoria,
      produto: cat.produto,
      moeda: cat.moeda,
      unidade: cat.unidade,
      valor: arred(front.valor, casasDaUnidade(cat.unidade)),
      variacaoPct: arred(front.variacaoPct),
      contrato: front.contrato,
      curva: dado.curva.map((c) => ({
        contrato: c.contrato,
        valor: arred(c.valor, casasDaUnidade(cat.unidade)),
        variacaoPct: arred(c.variacaoPct),
      })),
      fonte: cat.fonte,
      bloomberg: cat.bloomberg,
      descricao: cat.descricao,
      ...derivados({ valor: front.valor, unidade: cat.unidade, produto: cat.produto, usd }),
    },
    dado.data,
    cat.periodicidade
  );
}

// Indicador CEPEA (da página ou do widget). `unidade` pode vir do widget.
function itemIndicador(slug, dado, usd) {
  const cat = porSlug[slug];
  if (!dado || dado.valor == null) return null;
  const unidade = dado.unidade || cat.unidade;
  return anotarData(
    {
      slug,
      nome: cat.nome,
      categoria: cat.categoria,
      produto: cat.produto,
      moeda: unidade === cat.unidade ? cat.moeda : rotuloUnidade(unidade),
      unidade,
      valor: arred(dado.valor, casasDaUnidade(unidade)),
      variacaoPct: arred(dado.variacaoPct),
      fonte: cat.fonte,
      bloomberg: cat.bloomberg,
      descricao: cat.descricao,
      ...derivados({ valor: dado.valor, unidade, produto: cat.produto, usd }),
    },
    dado.data,
    cat.periodicidade
  );
}

function rotuloUnidade(unidade) {
  return (
    {
      BRL_LITRO: "R$/litro",
      BRL_M3: "R$/m³",
      USD_GALAO: "US$/galão",
      BRL_SACA50: "R$/saca 50 kg",
      BRL_5KG: "R$/5 kg",
      BRL_KG: "R$/kg",
      BRL_TON: "R$/t",
      USD_CENT_LB: "¢US$/lb",
      BRL_KG_ATR: "R$/kg de ATR",
    }[unidade] || ""
  );
}

// Item derivado da paridade: quanto cada destino paga por kg de ATR.
function itemParidade({ slug, nome, base, descricao }) {
  if (!base || base.valorATR == null) return null;
  return anotarData(
    {
      slug,
      nome,
      categoria: CATEGORIAS.PARIDADE,
      produto: base.produto,
      moeda: "R$/kg de ATR",
      unidade: "BRL_KG_ATR",
      valor: base.valorATR,
      valorATR: base.valorATR,
      variacaoPct: base.variacaoPct,
      fonte: `Derivado de ${base.nome} (coeficientes CONSECANA)`,
      descricao,
      baseSlug: base.slug,
    },
    base.data,
    base.periodicidade
  );
}

export async function getCotacoes() {
  // Série do BCB (cacheada) dá o valor E a data real da última PTAX publicada.
  const usdSerie = await serieUSD();
  const usdUltimo = usdSerie[usdSerie.length - 1] || null;
  const usd = usdUltimo?.close ?? (await getUsdbrl());

  let na = null;
  try {
    na = await lerNoticiasAgricolas();
  } catch {
    na = null;
  }

  // ---- Bolsas ----
  const bolsas = [];
  for (const slug of ["ny-acucar", "b3-etanol", "cme-etanol"]) {
    const it = na ? itemFuturo(slug, na.futuros[slug], usd) : null;
    if (it) bolsas.push(it);
  }

  // ---- Indicadores CEPEA da página (etanol SP + açúcar SP) ----
  const etanol = [];
  const acucar = [];
  const slugsPagina = [
    "cepea-hidratado-sp",
    "cepea-hidratado-outros-sp",
    "cepea-anidro-sp",
    "cepea-acucar-sp",
    "cepea-acucar-empacotado",
    "cepea-acucar-refinado",
  ];
  for (const slug of slugsPagina) {
    const cat = porSlug[slug];
    let dado = na?.indicadores?.[slug] || null;
    if (!dado && cat.cepeaId) {
      // Reforço: se a página falhar, o widget do CEPEA salva os números-cabeça.
      try {
        dado = await widgetCepea(cat.cepeaId, "etanol");
      } catch {
        dado = null;
      }
    }
    const it = itemIndicador(slug, dado, usd);
    if (!it) continue;
    (cat.categoria === CATEGORIAS.ACUCAR ? acucar : etanol).push(it);
  }

  // ---- Indicadores que só existem no widget do CEPEA (regionais) ----
  const etanolRegional = [];
  const widgetItens = await Promise.allSettled(
    SO_WIDGET.map(async (cat) => itemIndicador(cat.slug, await widgetCepea(cat.cepeaId, "etanol"), usd))
  );
  for (const r of widgetItens) {
    const it = r.status === "fulfilled" ? r.value : null;
    if (!it) continue;
    if (it.categoria === CATEGORIAS.ACUCAR) acucar.push(it);
    else etanolRegional.push(it);
  }

  // ---- Cana-de-açúcar (CONSECANA) ----
  const cana = [];
  for (const linha of na?.atr || []) {
    const slug = `atr-${slugify(linha.estado)}`;
    const tonEstimada = reaisPorToneladaCana(linha.mensal, ATR_PADRAO);
    cana.push(
      anotarData(
        {
          slug,
          nome: `Preço do ATR — ${linha.estado}`,
          subgrupo: "CONSECANA — preço do quilo de ATR",
          categoria: CATEGORIAS.CANA,
          produto: null,
          moeda: "R$/kg de ATR",
          unidade: "BRL_KG_ATR",
          valor: arred(linha.mensal, 4),
          valorATR: arred(linha.mensal, 4),
          valorAcumulado: arred(linha.acumulado, 4),
          valorBRLtonCana: arred(tonEstimada),
          variacaoPct: null,
          referencia: linha.referencia,
          fonte: "CONSECANA (via Notícias Agrícolas)",
          descricao:
            "Preço do quilo de ATR (Açúcar Total Recuperável) apurado pelo CONSECANA — é assim que o produtor é pago: preço do ATR × ATR da sua cana. O valor mensal é o do mês de referência; o acumulado é a média da safra até aqui.",
        },
        linha.data,
        "mensal"
      )
    );
  }
  if (na?.canaBasica) {
    for (const item of na.canaBasica.itens) {
      cana.push(
        anotarData(
          {
            slug: `cana-basica-pr-${slugify(item.tipo)}`,
            nome: `Cana básica ${item.tipo} — Paraná`,
            subgrupo: "Preço da tonelada de cana (PR)",
            categoria: CATEGORIAS.CANA,
            produto: null,
            moeda: "R$/t",
            unidade: "BRL_TON",
            valor: arred(item.valor),
            variacaoPct: arred(item.variacaoPct),
            referencia: na.canaBasica.referencia,
            fonte: "CONSECANA-PR (via Notícias Agrícolas)",
            descricao:
              "Preço de referência da tonelada de cana no Paraná. “Campo” é a cana posta na lavoura (o transporte fica por conta da usina); “esteira”, a cana entregue na usina.",
          },
          na.canaBasica.data,
          "mensal"
        )
      );
    }
  }

  // ---- Paridade: quanto cada destino paga por kg de ATR ----
  const acharEm = (lista, slug) => lista.find((i) => i.slug === slug);
  const acucarSP = acharEm(acucar, "cepea-acucar-sp");
  const acucarNY = acharEm(bolsas, "ny-acucar");
  const hidratadoSP = acharEm(etanol, "cepea-hidratado-sp");
  const anidroSP = acharEm(etanol, "cepea-anidro-sp");

  const paridade = [
    itemParidade({
      slug: "atr-acucar-interno",
      nome: "Açúcar cristal (mercado interno)",
      base: acucarSP,
      descricao: `Quanto o açúcar cristal do CEPEA remunera cada quilo de ATR: preço em R$/kg dividido por ${ATR_POR_KG_ACUCAR} kg de ATR (coeficiente CONSECANA).`,
    }),
    itemParidade({
      slug: "atr-acucar-ny",
      nome: "Açúcar bruto (Nova York, convertido)",
      base: acucarNY,
      descricao:
        "Cotação de Nova York convertida em R$/kg pelo câmbio e depois em R$/kg de ATR. Aproximação didática: não inclui prêmio de polarização, frete, elevação portuária nem hedge.",
    }),
    itemParidade({
      slug: "atr-hidratado",
      nome: "Etanol hidratado (CEPEA-SP)",
      base: hidratadoSP,
      descricao: `Quanto o hidratado remunera cada quilo de ATR: preço em R$/litro dividido por ${ATR_POR_L_HIDRATADO} kg de ATR por litro (coeficiente CONSECANA).`,
    }),
    itemParidade({
      slug: "atr-anidro",
      nome: "Etanol anidro (CEPEA-SP)",
      base: anidroSP,
      descricao: `Quanto o anidro remunera cada quilo de ATR: preço em R$/litro dividido por ${ATR_POR_L_ANIDRO} kg de ATR por litro (coeficiente CONSECANA).`,
    }),
  ].filter(Boolean);

  // ---- Snapshots (histórico que cresce) ----
  // O açúcar de Nova York já tem série no Yahoo; o resto depende disto.
  const todos = [...bolsas, ...etanol, ...etanolRegional, ...acucar, ...cana, ...paridade];
  for (const it of todos) {
    if (it.slug === "ny-acucar") continue;
    await registrar(it.slug, it.data || hojeISO(), it.valor);
  }

  const categorias = [
    { nome: CATEGORIAS.BOLSAS, itens: bolsas },
    { nome: CATEGORIAS.ETANOL, itens: etanol },
    { nome: CATEGORIAS.ACUCAR, itens: acucar },
    { nome: CATEGORIAS.CANA, itens: cana },
    { nome: CATEGORIAS.PARIDADE, itens: paridade },
    { nome: CATEGORIAS.ETANOL_REGIONAL, itens: etanolRegional },
  ].filter((c) => c.itens.length);

  const cambio = anotarData({ usdbrl: arred(usd, 4) }, usdUltimo?.date || null, "diaria");

  return {
    fetchedAt: na?.fetchedAt || new Date().toISOString(),
    cambio,
    atrPadrao: ATR_PADRAO,
    coeficientes: {
      acucar: ATR_POR_KG_ACUCAR,
      hidratado: ATR_POR_L_HIDRATADO,
      anidro: ATR_POR_L_ANIDRO,
    },
    categorias,
    aviso: AVISO,
  };
}

// Estatísticas simples de uma série [{date, close}].
function estatisticas(pontos) {
  if (!pontos || pontos.length < 2) return null;
  const closes = pontos.map((p) => p.close);
  const ult = closes[closes.length - 1];
  const prim = closes[0];
  return {
    min: arred(Math.min(...closes), 4),
    max: arred(Math.max(...closes), 4),
    variacaoPeriodoPct: prim ? arred(((ult - prim) / prim) * 100) : null,
  };
}

export async function getDetalhe(slug, tf = "3M") {
  // Precisa das cotações atuais (snapshot) para o cabeçalho de qualquer slug.
  const cot = await getCotacoes();
  const item = cot.categorias.flatMap((c) => c.itens).find((i) => i.slug === slug) || null;

  let pontos = [];
  let unidadeSerie = item?.moeda || "";
  let notaHistorico = null;

  if (SIMBOLOS[slug]) {
    try {
      pontos = await historicoIndicador(slug, tf);
    } catch {
      pontos = await serieSnapshots(slug);
      notaHistorico = "Histórico do Yahoo indisponível; usando snapshots locais.";
    }
  } else {
    pontos = await serieSnapshots(slug);
    if (pontos.length < 2) {
      notaHistorico =
        "Não existe série histórica gratuita para este indicador — o gráfico é construído a partir dos snapshots diários e cresce com o uso do app.";
    }
  }

  return {
    slug,
    item,
    tf,
    unidadeSerie,
    pontos,
    estatisticas: estatisticas(pontos),
    notaHistorico,
    aviso: cot.aviso,
  };
}

export async function getCambio() {
  return getCambioBCB();
}

// Variação % entre o último ponto e o ponto mais próximo de ~diasAtras dias antes.
// Retorna null se a série não alcança essa janela (evita "30D" falso quando só há
// poucos dias de histórico, como nos snapshots recém-iniciados).
function varDias(pontos, diasAtras) {
  if (!pontos || pontos.length < 2) return null;
  const ult = pontos[pontos.length - 1];
  const alvoMs = new Date(ult.date).getTime() - diasAtras * 864e5;
  const tol = Math.max(7, diasAtras * 0.2) * 864e5; // tolerância proporcional
  let ref = null;
  let melhor = Infinity;
  for (const p of pontos) {
    const gap = Math.abs(new Date(p.date).getTime() - alvoMs);
    if (gap < melhor) {
      melhor = gap;
      ref = p;
    }
  }
  if (!ref || !ref.close || melhor > tol) return null;
  return arred(((ult.close - ref.close) / ref.close) * 100);
}

// Aba "Mercado": tabela de índices (1D/30D/12M), o mix açúcar × etanol
// (remuneração por kg de ATR) e séries para os gráficos comparativos.
export async function getMercado() {
  const [cot, nyHist, brentHist, usdHist] = await Promise.all([
    getCotacoes(),
    historicoIndicador("ny-acucar", "1A").catch(() => []),
    historicoAuxiliar("brent", "1A").catch(() => []),
    serieUSD().catch(() => []),
  ]);
  const itens = cot.categorias.flatMap((c) => c.itens);
  const get = (slug) => itens.find((i) => i.slug === slug);

  const [acucarHist, hidratadoHist, anidroHist, b3Hist, atrHist] = await Promise.all([
    serieSnapshots("cepea-acucar-sp").catch(() => []),
    serieSnapshots("cepea-hidratado-sp").catch(() => []),
    serieSnapshots("cepea-anidro-sp").catch(() => []),
    serieSnapshots("b3-etanol").catch(() => []),
    serieSnapshots("atr-sao-paulo").catch(() => []),
  ]);

  const ny = get("ny-acucar");
  const acucarSP = get("cepea-acucar-sp");
  const hidratado = get("cepea-hidratado-sp");
  const anidro = get("cepea-anidro-sp");
  const b3 = get("b3-etanol");
  const atrSP = get("atr-sao-paulo");
  const usd = cot.cambio.usdbrl;
  const brent = brentHist.length ? brentHist[brentHist.length - 1] : null;

  const linha = (item, nome, unidade, hist) =>
    item && {
      nome,
      unidade,
      valor: item.valor,
      var1d: item.variacaoPct,
      var30d: varDias(hist, 30),
      var12m: varDias(hist, 365),
      data: item.data,
      desatualizado: item.desatualizado,
    };

  const indices = [
    linha(ny, "Açúcar NY nº 11", "¢US$/lb", nyHist),
    linha(acucarSP, "Açúcar cristal CEPEA (SP)", "R$/saca 50 kg", acucarHist),
    linha(hidratado, "Etanol hidratado CEPEA (SP)", "R$/litro", hidratadoHist),
    linha(anidro, "Etanol anidro CEPEA (SP)", "R$/litro", anidroHist),
    linha(b3, "Etanol hidratado — futuro B3", "R$/m³", b3Hist),
    atrSP && {
      nome: "Preço do ATR (SP)",
      unidade: "R$/kg de ATR",
      valor: atrSP.valor,
      var1d: null,
      var30d: varDias(atrHist, 30),
      var12m: varDias(atrHist, 365),
      data: atrSP.data,
      desatualizado: atrSP.desatualizado,
    },
    brent && {
      nome: "Petróleo Brent",
      unidade: "US$/barril",
      valor: brent.close,
      var1d: null,
      var30d: varDias(brentHist, 30),
      var12m: varDias(brentHist, 365),
      data: brent.date,
      desatualizado: false,
    },
    usd != null && {
      nome: "Dólar comercial",
      unidade: "R$/US$",
      valor: usd,
      var1d: null,
      var30d: varDias(usdHist, 30),
      var12m: varDias(usdHist, 365),
      data: cot.cambio.data,
      desatualizado: cot.cambio.desatualizado,
    },
  ].filter(Boolean);

  // ---- Mix: o que remunera mais por kg de ATR ----
  // É a decisão central da usina em cada safra: mandar o caldo para açúcar
  // (interno ou exportação) ou para etanol (anidro ou hidratado).
  const destinos = itens
    .filter((i) => i.categoria === CATEGORIAS.PARIDADE && i.valorATR != null)
    .map((i) => ({ slug: i.slug, nome: i.nome, valorATR: i.valorATR, data: i.data, desatualizado: i.desatualizado }));
  let mix = null;
  if (destinos.length) {
    const ordenados = [...destinos].sort((a, b) => b.valorATR - a.valorATR);
    const melhor = ordenados[0];
    const custoATR = atrSP?.valor ?? null;
    mix = {
      destinos: ordenados,
      melhor,
      custoATR,
      custoData: atrSP?.data || null,
      custoReferencia: atrSP?.referencia || null,
      margem: custoATR != null ? arred(melhor.valorATR - custoATR, 4) : null,
    };
  }

  return {
    fetchedAt: cot.fetchedAt,
    cambio: cot.cambio,
    atrPadrao: cot.atrPadrao,
    indices,
    mix,
    charts: {
      ny: nyHist.map((p) => ({ date: p.date, close: p.close })),
      usd: usdHist.map((p) => ({ date: p.date, close: p.close })),
      brent: brentHist.map((p) => ({ date: p.date, close: p.close })),
      hidratado: hidratadoHist,
      acucarCepea: acucarHist,
    },
    aviso: cot.aviso,
  };
}

export async function getClima() {
  return getClimaOM();
}
