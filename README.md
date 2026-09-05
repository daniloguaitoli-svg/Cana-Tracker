# 🎋 Cana & Etanol Tracker — Preços do setor sucroenergético

App web (PWA) para acompanhar o preço da **cana-de-açúcar** e do **etanol** no
Brasil, todo em português. Espelha a arquitetura do Soja Tracker / Café Tracker /
ETF Tracker.

A cana não tem "cotação" própria de bolsa: ela é paga pelo **ATR** (Açúcar Total
Recuperável), e o preço do ATR vem do que o **etanol** e o **açúcar** valem no
mercado. Por isso o app cobre a cadeia inteira — e traz, no fim, a conta que
interessa: **quanto vale a tonelada de cana** e **qual destino paga mais por kg
de ATR**.

Reúne, a partir de **fontes públicas e gratuitas**:

- **Cana (CONSECANA)** — preço do ATR por estado (SP, PR, AL/SE, PE), valor mensal
  e acumulado da safra, e a cana básica do Paraná (campo e esteira, R$/t)
- **Etanol** — indicadores semanais CEPEA/ESALQ de São Paulo (hidratado combustível,
  hidratado outros fins e anidro), futuro da **B3** (R$/m³), futuro de Chicago
  (US$/galão) e indicadores regionais (GO, MT, PE, AL, PB)
- **Açúcar** — cristal, empacotado e refinado do CEPEA (SP), exportação Santos,
  regionais do Nordeste e o futuro de **Nova York nº 11** (¢US$/lb)
- **Paridade açúcar × etanol** — quanto cada destino remunera por **kg de ATR**,
  usando os coeficientes do CONSECANA
- **Câmbio oficial** — USD/BRL e EUR/BRL (PTAX, Banco Central)
- **Mercado** — clima (chuva 30d vs. média histórica nas regiões canavieiras: SP,
  Triângulo Mineiro, GO, PR e Zona da Mata), o mix açúcar × etanol, tabela de
  índices (1D/30D/12M) e gráficos comparativos (Dólar×NY, Brent×NY, Açúcar×Etanol)
- **Conversor** — etanol (R$/L ↔ R$/m³ ↔ US$/galão), açúcar (R$/saca 50 kg ↔ R$/kg
  ↔ ¢US$/lb ↔ US$/t) e a **calculadora da tonelada de cana** (preço do ATR × ATR
  da cana × toneladas entregues)
- **Alertas** de preço (salvos no próprio aparelho)

## Fontes de dados (todas gratuitas)

| Dado | Fonte |
|------|-------|
| CEPEA etanol/açúcar, futuros NY/B3/CME, preço do ATR, cana básica PR | [Notícias Agrícolas](https://www.noticiasagricolas.com.br/cotacoes/sucroenergetico) (que republica CEPEA/ESALQ, CONSECANA, ICE, B3 e CME) |
| Indicadores regionais e reforço dos indicadores CEPEA | Widget público do [CEPEA](https://www.cepea.org.br), lido ao vivo no seu computador e por coleta agendada (GitHub Actions) em produção |
| Histórico do açúcar de Nova York e do petróleo Brent | Yahoo Finance (`SB=F`, `BZ=F`) |
| Câmbio USD/BRL e EUR/BRL | [Banco Central do Brasil (PTAX/SGS)](https://dadosabertos.bcb.gov.br) |
| Clima (chuva por região) | [Open-Meteo](https://open-meteo.com) (Archive API, sem chave) |

> **Unidades e coeficientes (CONSECANA-SP):** 1 kg de ATR rende ~0,95 kg de
> açúcar (1,0495 kg de ATR por kg), ~0,59 litro de etanol hidratado (1,6913 kg de
> ATR por litro) ou ~0,57 litro de anidro (1,7651). Saca de açúcar = 50 kg;
> 1 m³ = 1.000 litros; 1 galão = 3,7854 litros; 1 libra-peso = 0,4536 kg.
> ATR padrão usado nas estimativas de R$/tonelada: **140 kg/t** (ajustável no Conversor).

## Como rodar

Requisitos: **Node.js 18+**.

```bash
npm install
```

```bash
npm run dev
```

Abra `http://localhost:5173` (a porta aparece no terminal). O servidor já sobe
com `host` ativo, então você também pode abrir no **celular pela mesma rede
Wi‑Fi**, no endereço `http://SEU_IP_LOCAL:5173` que o Vite mostra em "Network".

Para instalar como app no celular: abra no Chrome/Safari e use
**"Adicionar à tela de início"** (é um PWA).

## Como compartilhar (deploy na Vercel)

O app usa pequenas funções de servidor (pasta `api/`) porque as fontes não
permitem acesso direto do navegador. A [Vercel](https://vercel.com) roda tudo de
graça:

1. Crie uma conta na Vercel e instale a CLI: `npm i -g vercel`
2. Nesta pasta, rode: `vercel` (aceite os padrões — o framework Vite é detectado)
3. Para publicar a versão final: `vercel --prod`
4. Compartilhe o link `https://...vercel.app`. 🎉

## Estrutura

```
api/            funções serverless (cotacoes, detalhe, cambio, mercado, clima)
server/         camada de dados
  catalogo.js       indicadores fixos (bolsas + CEPEA etanol/açúcar)
  datalayer.js      fachada que combina as fontes e normaliza p/ R$/litro,
                    R$/kg e R$/kg de ATR
  providers/        noticiasagricolas, cepea, yahoo, bcb, openmeteo
  store.js          histórico "que cresce" (snapshots diários)
  util.js           conversões de unidade, coeficientes CONSECANA e parsing pt-BR
src/            app React (componentes em português)
public/         manifest e service worker (PWA)
```

## Limitações honestas

- **Histórico real** existe só para o açúcar de Nova York, o Brent (Yahoo) e o
  câmbio (BCB). Para os indicadores CEPEA de etanol e açúcar, o futuro da B3 e o
  preço do ATR **não há API gratuita de série histórica**, então o app guarda um
  **snapshot por dia** e o gráfico desses indicadores **cresce com o tempo**
  (começa curto). Rodando local, esses snapshots ficam em `data/snapshots.json`;
  na Vercel ficam em `/tmp`, que é apagado a cada cold start. A exceção são os
  indicadores do CEPEA, cuja série é acumulada no repositório pelo job de coleta
  (ver abaixo) e por isso **persiste**.
- **O site do CEPEA bloqueia servidores.** O `cepea.org.br` está atrás de um
  desafio anti-bot da Cloudflare que responde **403** às funções da Vercel (testado
  em `iad1` e `gru1`, com qualquer User-Agent), mas responde normalmente a partir
  dos runners do GitHub. Esse acesso **não é garantido**: entre 02/09/2026 e
  04/09/2026 o bloqueio alcançou também os runners, e por isso o job tolera um
  bloqueio curto em vez de falhar — o app seguiu servindo o cache o tempo todo. Por isso o workflow `.github/workflows/coletar-cepea.yml`
  roda duas vezes por dia, coleta os 16 indicadores e versiona o resultado em
  `server/cepea-cache.json`; o app lê a fonte ao vivo em desenvolvimento e cai
  nesse arquivo em produção (a tela do indicador avisa quando o valor veio do
  cache). Cada coleta que muda o arquivo gera um commit do bot, que dispara um
  novo deploy na Vercel. Se o repositório ficar 60 dias sem atividade, o GitHub
  suspende workflows agendados — basta reativar na aba Actions.
- **Periodicidades diferentes**: o etanol do CEPEA é **semanal**, o preço do ATR é
  **mensal** e as bolsas são **diárias**. O app leva isso em conta antes de marcar
  um preço como desatualizado — e mostra a periodicidade na tela do indicador.
- Vários indicadores regionais do Nordeste (PE, AL, PB) só são publicados durante
  a moagem local; fora dela ficam parados e aparecem com o aviso ⚠. Por isso eles
  não entram no alerta de "cotações desatualizadas" do painel.
- A leitura da Notícias Agrícolas é **melhor esforço**: se eles mudarem o HTML,
  o arquivo `server/providers/noticiasagricolas.js` precisa de um ajuste.
- A **paridade açúcar × etanol** e a estimativa de R$/tonelada de cana são
  **aproximações didáticas**: comparam receita bruta por kg de ATR e não
  consideram custo industrial, impostos, frete, elevação portuária nem hedge.
  O açúcar de Nova York é convertido pelo câmbio sem prêmio de polarização.

## Aviso

Dados de fontes públicas, possivelmente com atraso. **Uso informativo — não é
recomendação de investimento.**
