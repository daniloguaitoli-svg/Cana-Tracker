// server/catalogo.js — catálogo dos indicadores fixos do setor sucroenergético.
// O preço do ATR por estado (CONSECANA) e a cana básica do Paraná são dinâmicos
// (vêm de tabelas por linha da Notícias Agrícolas) — ver providers/noticiasagricolas.js.
//
// Cada item define como o indicador é lido e exibido:
//   slug          — identificador estável usado nas rotas /api
//   nome          — rótulo em português
//   categoria     — agrupa na tela de Cotações
//   unidade       — unidade nativa: BRL_LITRO | BRL_M3 | USD_GALAO | BRL_SACA50 |
//                   BRL_5KG | BRL_KG | USD_CENT_LB | BRL_KG_ATR | BRL_TON
//   produto       — "acucar" | "hidratado" | "anidro" (define o coeficiente
//                   CONSECANA usado para converter em R$/kg de ATR); null quando
//                   a conversão não faz sentido
//   periodicidade — "diaria" | "semanal" | "mensal" (define quando o preço é
//                   considerado desatualizado)
//   moeda         — rótulo da unidade nativa
//   fonte         — crédito exibido
//   cepeaId       — id do widget público do CEPEA (fallback ou fonte única)
//   viaWidget     — quando true, o indicador SÓ existe pelo widget do CEPEA
//   principal     — entra no aviso de "cotações desatualizadas" do painel
//   yahoo         — símbolo no Yahoo Finance (quando há histórico gratuito)
//   descricao     — nota explicativa

export const CATEGORIAS = {
  BOLSAS: "Etanol e açúcar nas bolsas",
  ETANOL: "Indicadores CEPEA — etanol (São Paulo)",
  ETANOL_REGIONAL: "Etanol — indicadores regionais (CEPEA)",
  ACUCAR: "Indicadores CEPEA — açúcar",
  CANA: "Cana-de-açúcar (CONSECANA)",
  PARIDADE: "Paridade açúcar × etanol (R$ por kg de ATR)",
};

export const CATALOGO = [
  // ---------- Bolsas ----------
  {
    slug: "ny-acucar",
    nome: "Açúcar bruto — Nova York (ICE nº 11)",
    categoria: CATEGORIAS.BOLSAS,
    unidade: "USD_CENT_LB",
    produto: "acucar",
    periodicidade: "diaria",
    principal: true,
    moeda: "¢US$/lb",
    fonte: "ICE Futures US / NYBOT (via Notícias Agrícolas)",
    bloomberg: "SB1 Comdty",
    yahoo: "SB=F",
    descricao:
      "Referência mundial do açúcar bruto (VHP), o mesmo tipo que o Brasil exporta. É ele, junto com o câmbio, que define quanto a usina ganha exportando — e, por tabela, o quanto vale o ATR da cana.",
  },
  {
    slug: "b3-etanol",
    nome: "Etanol Hidratado — futuro na B3",
    categoria: CATEGORIAS.BOLSAS,
    unidade: "BRL_M3",
    produto: "hidratado",
    periodicidade: "diaria",
    principal: true,
    moeda: "R$/m³",
    fonte: "B3 — pregão regular (via Notícias Agrícolas)",
    descricao:
      "Contrato futuro de etanol hidratado combustível na B3, cotado em reais por metro cúbico (1 m³ = 1.000 litros). Mostra a expectativa do mercado para os próximos meses da safra.",
  },
  {
    slug: "cme-etanol",
    nome: "Etanol — Bolsa de Chicago (CME)",
    categoria: CATEGORIAS.BOLSAS,
    unidade: "USD_GALAO",
    produto: null,
    periodicidade: "diaria",
    moeda: "US$/galão",
    fonte: "CME Group (via Notícias Agrícolas)",
    descricao:
      "Etanol de milho americano, em dólares por galão (3,785 litros). Serve de termômetro do mercado internacional de biocombustíveis e concorre com o etanol brasileiro nas exportações.",
  },

  // ---------- CEPEA etanol (São Paulo) ----------
  {
    slug: "cepea-hidratado-sp",
    nome: "Etanol Hidratado Combustível — CEPEA/ESALQ (SP)",
    categoria: CATEGORIAS.ETANOL,
    unidade: "BRL_LITRO",
    produto: "hidratado",
    periodicidade: "semanal",
    principal: true,
    moeda: "R$/litro",
    fonte: "CEPEA-ESALQ/USP (via Notícias Agrícolas)",
    cepeaId: 103,
    descricao:
      "Preço médio semanal do etanol hidratado combustível vendido pelas usinas paulistas (sem impostos, à vista). É a principal referência do etanol no Brasil — o que a usina recebe, não o preço na bomba.",
  },
  {
    slug: "cepea-hidratado-outros-sp",
    nome: "Etanol Hidratado Outros Fins — CEPEA/ESALQ (SP)",
    categoria: CATEGORIAS.ETANOL,
    unidade: "BRL_LITRO",
    produto: "hidratado",
    periodicidade: "semanal",
    moeda: "R$/litro",
    fonte: "CEPEA-ESALQ/USP (via Notícias Agrícolas)",
    descricao:
      "Etanol hidratado destinado à indústria (bebidas, cosméticos, química, limpeza) — normalmente com prêmio sobre o combustível, por exigir mais qualidade.",
  },
  {
    slug: "cepea-anidro-sp",
    nome: "Etanol Anidro — CEPEA/ESALQ (SP)",
    categoria: CATEGORIAS.ETANOL,
    unidade: "BRL_LITRO",
    produto: "anidro",
    periodicidade: "semanal",
    principal: true,
    moeda: "R$/litro",
    fonte: "CEPEA-ESALQ/USP (via Notícias Agrícolas)",
    cepeaId: 104,
    descricao:
      "Etanol anidro (sem água) é o que se mistura à gasolina — hoje 27% a 30% de cada litro vendido. A demanda é obrigatória por lei, o que costuma dar a ele um prêmio sobre o hidratado.",
  },

  // ---------- CEPEA etanol regional (só via widget) ----------
  {
    slug: "cepea-hidratado-go",
    nome: "Etanol Hidratado — Goiás",
    categoria: CATEGORIAS.ETANOL_REGIONAL,
    unidade: "BRL_LITRO",
    produto: "hidratado",
    periodicidade: "semanal",
    moeda: "R$/litro",
    fonte: "CEPEA-ESALQ/USP (widget público)",
    cepeaId: 119,
    viaWidget: true,
    descricao: "Etanol hidratado no segundo maior polo produtor do Centro-Oeste.",
  },
  {
    slug: "cepea-hidratado-mt",
    nome: "Etanol Hidratado — Mato Grosso",
    categoria: CATEGORIAS.ETANOL_REGIONAL,
    unidade: "BRL_M3",
    produto: "hidratado",
    periodicidade: "semanal",
    moeda: "R$/m³",
    fonte: "CEPEA-ESALQ/USP (widget público)",
    cepeaId: 76,
    viaWidget: true,
    descricao: "Mato Grosso concentra o etanol de milho, produzido o ano todo (fora da safra da cana).",
  },
  {
    slug: "cepea-anidro-mt",
    nome: "Etanol Anidro — Mato Grosso",
    categoria: CATEGORIAS.ETANOL_REGIONAL,
    unidade: "BRL_M3",
    produto: "anidro",
    periodicidade: "semanal",
    moeda: "R$/m³",
    fonte: "CEPEA-ESALQ/USP (widget público)",
    cepeaId: 75,
    viaWidget: true,
    descricao: "Anidro do Mato Grosso, em reais por metro cúbico.",
  },
  {
    slug: "cepea-hidratado-pe",
    nome: "Etanol Hidratado — Pernambuco",
    categoria: CATEGORIAS.ETANOL_REGIONAL,
    unidade: "BRL_LITRO",
    produto: "hidratado",
    periodicidade: "semanal",
    moeda: "R$/litro",
    fonte: "CEPEA-ESALQ/USP (widget público)",
    cepeaId: 100,
    viaWidget: true,
    descricao: "Nordeste — safra invertida em relação ao Centro-Sul; publicação irregular fora da moagem.",
  },
  {
    slug: "cepea-anidro-pe",
    nome: "Etanol Anidro — Pernambuco",
    categoria: CATEGORIAS.ETANOL_REGIONAL,
    unidade: "BRL_LITRO",
    produto: "anidro",
    periodicidade: "semanal",
    moeda: "R$/litro",
    fonte: "CEPEA-ESALQ/USP (widget público)",
    cepeaId: 101,
    viaWidget: true,
    descricao: "Anidro do Nordeste; publicação irregular fora do período de moagem.",
  },
  {
    slug: "cepea-hidratado-al",
    nome: "Etanol Hidratado — Alagoas",
    categoria: CATEGORIAS.ETANOL_REGIONAL,
    unidade: "BRL_LITRO",
    produto: "hidratado",
    periodicidade: "semanal",
    moeda: "R$/litro",
    fonte: "CEPEA-ESALQ/USP (widget público)",
    cepeaId: 209,
    viaWidget: true,
    descricao: "Principal estado canavieiro do Nordeste; publicação irregular fora da moagem.",
  },
  {
    slug: "cepea-anidro-al",
    nome: "Etanol Anidro — Alagoas",
    categoria: CATEGORIAS.ETANOL_REGIONAL,
    unidade: "BRL_LITRO",
    produto: "anidro",
    periodicidade: "semanal",
    moeda: "R$/litro",
    fonte: "CEPEA-ESALQ/USP (widget público)",
    cepeaId: 208,
    viaWidget: true,
    descricao: "Anidro de Alagoas; publicação irregular fora do período de moagem.",
  },
  {
    slug: "cepea-hidratado-pb",
    nome: "Etanol Hidratado — Paraíba",
    categoria: CATEGORIAS.ETANOL_REGIONAL,
    unidade: "BRL_LITRO",
    produto: "hidratado",
    periodicidade: "semanal",
    moeda: "R$/litro",
    fonte: "CEPEA-ESALQ/USP (widget público)",
    cepeaId: 210,
    viaWidget: true,
    descricao: "Etanol hidratado da Paraíba.",
  },
  {
    slug: "cepea-anidro-pb",
    nome: "Etanol Anidro — Paraíba",
    categoria: CATEGORIAS.ETANOL_REGIONAL,
    unidade: "BRL_LITRO",
    produto: "anidro",
    periodicidade: "semanal",
    moeda: "R$/litro",
    fonte: "CEPEA-ESALQ/USP (widget público)",
    cepeaId: 211,
    viaWidget: true,
    descricao: "Etanol anidro da Paraíba.",
  },

  // ---------- CEPEA açúcar ----------
  {
    slug: "cepea-acucar-sp",
    nome: "Açúcar Cristal — CEPEA/ESALQ (SP)",
    categoria: CATEGORIAS.ACUCAR,
    unidade: "BRL_SACA50",
    produto: "acucar",
    periodicidade: "diaria",
    principal: true,
    moeda: "R$/saca 50 kg",
    fonte: "CEPEA-ESALQ/USP (via Notícias Agrícolas)",
    cepeaId: 53,
    descricao:
      "Açúcar cristal branco no mercado interno paulista, em sacas de 50 kg. É a referência do açúcar vendido no Brasil — a alternativa da usina a exportar ou fazer etanol.",
  },
  {
    slug: "cepea-acucar-santos",
    nome: "Açúcar — Exportação Santos (CEPEA)",
    categoria: CATEGORIAS.ACUCAR,
    unidade: "BRL_SACA50",
    produto: "acucar",
    periodicidade: "diaria",
    moeda: "R$/saca 50 kg",
    fonte: "CEPEA-ESALQ/USP (widget público)",
    cepeaId: 308,
    viaWidget: true,
    descricao:
      "Indicador do açúcar para exportação no porto de Santos — a ponte entre a cotação de Nova York e o preço recebido pela usina.",
  },
  {
    slug: "cepea-acucar-empacotado",
    nome: "Açúcar Cristal Empacotado — CEPEA/ESALQ (SP)",
    categoria: CATEGORIAS.ACUCAR,
    unidade: "BRL_5KG",
    produto: "acucar",
    periodicidade: "diaria",
    moeda: "R$/5 kg",
    fonte: "CEPEA-ESALQ/USP (via Notícias Agrícolas)",
    descricao: "Açúcar cristal já empacotado para o varejo, em pacotes de 5 kg.",
  },
  {
    slug: "cepea-acucar-refinado",
    nome: "Açúcar Refinado Amorfo — CEPEA/ESALQ (SP)",
    categoria: CATEGORIAS.ACUCAR,
    unidade: "BRL_KG",
    produto: "acucar",
    periodicidade: "diaria",
    moeda: "R$/kg",
    fonte: "CEPEA-ESALQ/USP (via Notícias Agrícolas)",
    descricao: "Açúcar refinado (mais processado, usado na indústria alimentícia e no consumo doméstico).",
  },
  {
    slug: "cepea-acucar-al",
    nome: "Açúcar Cristal — Alagoas",
    categoria: CATEGORIAS.ACUCAR,
    unidade: "BRL_SACA50",
    produto: "acucar",
    periodicidade: "mensal",
    moeda: "R$/saca 50 kg",
    fonte: "CEPEA-ESALQ/USP (widget público)",
    cepeaId: 50,
    viaWidget: true,
    descricao: "Açúcar do Nordeste — indicador mensal.",
  },
  {
    slug: "cepea-acucar-pe",
    nome: "Açúcar Cristal — Pernambuco",
    categoria: CATEGORIAS.ACUCAR,
    unidade: "BRL_SACA50",
    produto: "acucar",
    periodicidade: "mensal",
    moeda: "R$/saca 50 kg",
    fonte: "CEPEA-ESALQ/USP (widget público)",
    cepeaId: 35,
    viaWidget: true,
    descricao: "Açúcar de Pernambuco — indicador mensal.",
  },
  {
    slug: "cepea-acucar-pb",
    nome: "Açúcar Cristal — Paraíba",
    categoria: CATEGORIAS.ACUCAR,
    unidade: "BRL_SACA50",
    produto: "acucar",
    periodicidade: "mensal",
    moeda: "R$/saca 50 kg",
    fonte: "CEPEA-ESALQ/USP (widget público)",
    cepeaId: 149,
    viaWidget: true,
    descricao: "Açúcar da Paraíba — indicador mensal.",
  },
];

export const porSlug = Object.fromEntries(CATALOGO.map((c) => [c.slug, c]));

// Indicadores que dependem só do widget do CEPEA (não estão na Notícias Agrícolas).
export const SO_WIDGET = CATALOGO.filter((c) => c.viaWidget);

// Quantos dias ÚTEIS sem publicação até marcar o preço como desatualizado.
// A folga absorve feriados e o atraso normal de cada periodicidade.
export const LIMITE_DIAS_UTEIS = { diaria: 2, semanal: 7, mensal: 32 };

// Rótulo amigável da periodicidade (usado na interface).
export const ROTULO_PERIODICIDADE = {
  diaria: "diário",
  semanal: "semanal",
  mensal: "mensal",
};
