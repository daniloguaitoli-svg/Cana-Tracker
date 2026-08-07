// scripts/verificar.mjs — a verificação que o `npm run build` não faz.
//
// O `vite build` empacota só o src/, então a metade server/ (datalayer,
// catálogo, util, providers) nem chega a ser lida por ele: um erro de sintaxe
// ou de import ali passa verde e só quebra em produção, na hora do request.
// Este script carrega esses módulos de verdade e confere os invariantes que o
// CLAUDE.md declara — inclusive as constantes que são duplicadas de propósito
// entre server/ e src/ e que nada mais consegue vigiar.
//
// Sem dependências de propósito: o repositório não tem test runner e a regra é
// manter só react + react-dom.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const ler = (rel) => readFile(join(RAIZ, rel), "utf-8");

let falhas = 0;
const ok = (msg) => console.log(`  ok    ${msg}`);
const falhar = (msg) => {
  console.error(`  FALHA ${msg}`);
  falhas++;
};
const conferir = (cond, msg) => (cond ? ok(msg) : falhar(msg));

console.log("\nmódulos do servidor carregam");
const datalayer = await import("../server/datalayer.js");
const util = await import("../server/util.js");
const cat = await import("../server/catalogo.js");
for (const nome of ["getCotacoes", "getDetalhe", "getCambio", "getMercado", "getClima"]) {
  conferir(typeof datalayer[nome] === "function", `datalayer exporta ${nome}()`);
}
for (const rel of ["noticiasagricolas", "cepea", "yahoo", "bcb", "openmeteo"]) {
  await import(`../server/providers/${rel}.js`);
  ok(`provider ${rel} carrega`);
}

console.log("\nintegridade do catálogo");
const { CATALOGO, porSlug, SO_WIDGET, LIMITE_DIAS_UTEIS, ROTULO_PERIODICIDADE } = cat;
conferir(CATALOGO.length > 0, `${CATALOGO.length} indicadores fixos`);
conferir(Object.keys(porSlug).length === CATALOGO.length, "porSlug cobre todo o catálogo (slugs únicos)");

const UNIDADES = ["BRL_LITRO", "BRL_M3", "USD_GALAO", "BRL_SACA50", "BRL_5KG", "BRL_KG", "USD_CENT_LB"];
for (const c of CATALOGO) {
  for (const campo of ["slug", "nome", "categoria", "unidade", "moeda", "fonte", "periodicidade", "descricao"]) {
    if (!c[campo]) falhar(`${c.slug || "(sem slug)"}: falta ${campo}`);
  }
  if (!UNIDADES.includes(c.unidade)) falhar(`${c.slug}: unidade desconhecida ${c.unidade}`);
  if (!(c.periodicidade in LIMITE_DIAS_UTEIS)) falhar(`${c.slug}: periodicidade sem limite definido (${c.periodicidade})`);
  if (c.produto != null && !["acucar", "hidratado", "anidro"].includes(c.produto)) {
    falhar(`${c.slug}: produto inválido ${c.produto}`);
  }
  if (c.viaWidget && !c.cepeaId) falhar(`${c.slug}: viaWidget sem cepeaId`);
}
ok("campos obrigatórios, unidades, periodicidades e produtos válidos");
conferir(SO_WIDGET.every((c) => c.viaWidget), "SO_WIDGET só contém entradas viaWidget");

console.log("\ncache do CEPEA");
const cache = JSON.parse(await ler("server/cepea-cache.json"));
conferir(!!cache.indicadores, "server/cepea-cache.json é JSON válido e tem `indicadores`");
for (const slug of Object.keys(cache.indicadores)) {
  if (!porSlug[slug]) falhar(`cache tem o slug "${slug}", que não existe mais no catálogo`);
}
ok("todo slug do cache ainda existe no catálogo (histórico não órfão)");

// CLAUDE.md, "Constantes duplicadas de propósito": server/ e src/ nunca se
// importam, então estes valores são copiados à mão e só um confronto de
// arquivos percebe quando um lado muda sozinho.
console.log("\nconstantes duplicadas entre server/ e src/");
const conversor = await ler("src/components/Conversor.jsx");
const COEFS = {
  ATR_POR_KG_ACUCAR: util.ATR_POR_KG_ACUCAR,
  ATR_POR_L_HIDRATADO: util.ATR_POR_L_HIDRATADO,
  ATR_POR_L_ANIDRO: util.ATR_POR_L_ANIDRO,
};
for (const [nome, valorServidor] of Object.entries(COEFS)) {
  const m = conversor.match(new RegExp(`${nome}\\s*=\\s*([\\d.]+)`));
  if (!m) falhar(`${nome} não encontrado em Conversor.jsx`);
  else conferir(Number(m[1]) === valorServidor, `${nome}: util.js ${valorServidor} = Conversor.jsx ${m[1]}`);
}

const { PERIODICIDADE } = await import("../src/format.js");
const mesmasChaves =
  Object.keys(ROTULO_PERIODICIDADE).length === Object.keys(PERIODICIDADE).length &&
  Object.entries(ROTULO_PERIODICIDADE).every(([k, v]) => PERIODICIDADE[k] === v);
conferir(mesmasChaves, "ROTULO_PERIODICIDADE (catalogo.js) = PERIODICIDADE (format.js)");

console.log(falhas === 0 ? "\ntudo certo\n" : `\n${falhas} verificação(ões) falharam\n`);
process.exit(falhas === 0 ? 0 : 1);
