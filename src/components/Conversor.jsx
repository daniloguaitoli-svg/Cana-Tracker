// components/Conversor.jsx — as três contas que o setor faz o tempo todo:
//   1. converter etanol entre R$/litro, R$/m³ e US$/galão;
//   2. converter açúcar entre R$/saca de 50 kg, R$/kg, ¢US$/lb e US$/tonelada;
//   3. transformar preço do ATR + ATR da cana em R$ por tonelada de cana.
// Tudo com o câmbio ao vivo, mais a paridade açúcar × etanol por kg de ATR.
import { useMemo, useState } from "react";
import { num, reais, sinal, pct } from "../format.js";

// Constantes espelhadas de server/util.js (o cliente faz as contas na hora,
// enquanto o usuário digita, sem ida ao servidor).
const GALAO_L = 3.785411784;
const LB_KG = 0.45359237;
const SACA_KG = 50;
const ATR_POR_KG_ACUCAR = 1.0495;
const ATR_POR_L_HIDRATADO = 1.6913;
const ATR_POR_L_ANIDRO = 1.7651;

const UN_ETANOL = [
  { id: "BRL_LITRO", nome: "R$/litro (CEPEA)", rotulo: "R$/L", casas: 4 },
  { id: "BRL_M3", nome: "R$/m³ (B3)", rotulo: "R$/m³", casas: 2 },
  { id: "USD_GALAO", nome: "US$/galão (Chicago)", rotulo: "US$/gal", casas: 4 },
];

const UN_ACUCAR = [
  { id: "BRL_SACA50", nome: "R$/saca de 50 kg (CEPEA)", rotulo: "R$/sc", casas: 2 },
  { id: "BRL_KG", nome: "R$/kg", rotulo: "R$/kg", casas: 4 },
  { id: "USD_CENT_LB", nome: "¢US$/libra-peso (Nova York)", rotulo: "¢US$/lb", casas: 2 },
  { id: "USD_TON", nome: "US$/tonelada", rotulo: "US$/t", casas: 2 },
];

function paraLitro(valor, unidade, usd) {
  if (valor == null || !Number.isFinite(valor)) return null;
  switch (unidade) {
    case "BRL_LITRO": return valor;
    case "BRL_M3": return valor / 1000;
    case "USD_GALAO": return usd ? (valor / GALAO_L) * usd : null;
    default: return null;
  }
}
function deLitro(litro, destino, usd) {
  if (litro == null) return null;
  switch (destino) {
    case "BRL_LITRO": return litro;
    case "BRL_M3": return litro * 1000;
    case "USD_GALAO": return usd ? (litro / usd) * GALAO_L : null;
    default: return null;
  }
}
function paraKg(valor, unidade, usd) {
  if (valor == null || !Number.isFinite(valor)) return null;
  switch (unidade) {
    case "BRL_KG": return valor;
    case "BRL_SACA50": return valor / SACA_KG;
    case "USD_CENT_LB": return usd ? ((valor / 100) * usd) / LB_KG : null;
    case "USD_TON": return usd ? (valor * usd) / 1000 : null;
    default: return null;
  }
}
function deKg(kg, destino, usd) {
  if (kg == null) return null;
  switch (destino) {
    case "BRL_KG": return kg;
    case "BRL_SACA50": return kg * SACA_KG;
    case "USD_CENT_LB": return usd ? ((kg * LB_KG) / usd) * 100 : null;
    case "USD_TON": return usd ? (kg * 1000) / usd : null;
    default: return null;
  }
}

const paraNumero = (txt) => {
  const v = parseFloat(String(txt).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(v) ? v : null;
};

// Bloco genérico "valor + unidade -> demais unidades".
function BlocoConversao({ titulo, unidades, valor, setValor, unidade, setUnidade, para, de, usd, rodape }) {
  const base = useMemo(() => para(paraNumero(valor), unidade, usd), [valor, unidade, usd, para]);
  return (
    <div className="card">
      <div className="label">{titulo}</div>
      <div className="controls" style={{ marginTop: "var(--s3)" }}>
        <input
          className="input mono"
          inputMode="decimal"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          aria-label={`Valor — ${titulo}`}
        />
        <select className="select" value={unidade} onChange={(e) => setUnidade(e.target.value)} aria-label="Unidade de origem">
          {unidades.map((u) => (
            <option key={u.id} value={u.id}>{u.nome}</option>
          ))}
        </select>
      </div>
      <div style={{ marginTop: "var(--s4)" }}>
        {unidades.filter((u) => u.id !== unidade).map((u) => {
          const out = de(base, u.id, usd);
          return (
            <div className="conv-row" key={u.id}>
              <span className="muted">{u.nome}</span>
              <span className="conv-out">
                {out == null ? "—" : num(out, u.casas)}{" "}
                <span className="muted" style={{ fontSize: 12 }}>{u.rotulo}</span>
              </span>
            </div>
          );
        })}
      </div>
      {rodape && <div className="muted" style={{ fontSize: 12, marginTop: "var(--s3)" }}>{rodape}</div>}
    </div>
  );
}

export function Conversor({ dados }) {
  const usd = dados.cambio.usdbrl;
  const itens = dados.categorias.flatMap((c) => c.itens);
  const get = (slug) => itens.find((i) => i.slug === slug);

  const hidratado = get("cepea-hidratado-sp");
  const anidro = get("cepea-anidro-sp");
  const acucarSP = get("cepea-acucar-sp");
  const atrSP = get("atr-sao-paulo");
  const paridades = itens.filter((i) => i.unidade === "BRL_KG_ATR" && i.slug.startsWith("atr-") && i.baseSlug);

  const [vEtanol, setVEtanol] = useState(
    hidratado ? String(hidratado.valor).replace(".", ",") : "2,00"
  );
  const [unEtanol, setUnEtanol] = useState("BRL_LITRO");
  const [vAcucar, setVAcucar] = useState(acucarSP ? String(acucarSP.valor).replace(".", ",") : "90,00");
  const [unAcucar, setUnAcucar] = useState("BRL_SACA50");

  // Calculadora da cana: preço do ATR × ATR da cana = R$/tonelada.
  const [precoATR, setPrecoATR] = useState(atrSP ? String(atrSP.valor).replace(".", ",") : "0,85");
  const [atrTon, setAtrTon] = useState(String(dados.atrPadrao));
  const [toneladas, setToneladas] = useState("1000");

  const precoATRnum = paraNumero(precoATR);
  const atrTonNum = paraNumero(atrTon);
  const toneladasNum = paraNumero(toneladas);
  const porTonelada = precoATRnum != null && atrTonNum != null ? precoATRnum * atrTonNum : null;
  const total = porTonelada != null && toneladasNum != null ? porTonelada * toneladasNum : null;

  const melhor = paridades.length
    ? paridades.reduce((a, b) => (b.valor > a.valor ? b : a))
    : null;
  const margem = melhor && atrSP?.valor != null ? melhor.valor - atrSP.valor : null;

  return (
    <div>
      <BlocoConversao
        titulo="Converter um preço de etanol"
        unidades={UN_ETANOL}
        valor={vEtanol}
        setValor={setVEtanol}
        unidade={unEtanol}
        setUnidade={setUnEtanol}
        para={paraLitro}
        de={deLitro}
        usd={usd}
        rodape={`Câmbio usado: US$ 1 = R$ ${usd != null ? num(usd, 4) : "—"} · 1 m³ = 1.000 litros · 1 galão = ${num(GALAO_L, 4)} litros`}
      />

      <div className="section-title">Açúcar</div>
      <BlocoConversao
        titulo="Converter um preço de açúcar"
        unidades={UN_ACUCAR}
        valor={vAcucar}
        setValor={setVAcucar}
        unidade={unAcucar}
        setUnidade={setUnAcucar}
        para={paraKg}
        de={deKg}
        usd={usd}
        rodape={`1 saca = 50 kg · 1 libra-peso = ${num(LB_KG, 4)} kg. A cotação de Nova York é do açúcar bruto (VHP); o cristal do CEPEA é do mercado interno, então os dois não são idênticos.`}
      />

      <div className="section-title">Quanto vale a tonelada de cana</div>
      <div className="card">
        <div className="controls">
          <label className="muted" style={{ flex: "1 1 100%", fontSize: 12 }}>
            Preço do ATR (R$/kg) — CONSECANA
          </label>
          <input className="input mono" inputMode="decimal" value={precoATR} onChange={(e) => setPrecoATR(e.target.value)} aria-label="Preço do ATR em reais por quilo" />
        </div>
        <div className="controls">
          <label className="muted" style={{ flex: "1 1 100%", fontSize: 12 }}>
            ATR da cana (kg por tonelada) — típico entre 125 e 150
          </label>
          <input className="input mono" inputMode="decimal" value={atrTon} onChange={(e) => setAtrTon(e.target.value)} aria-label="ATR em quilos por tonelada" />
        </div>
        <div className="controls">
          <label className="muted" style={{ flex: "1 1 100%", fontSize: 12 }}>
            Toneladas entregues (para o total)
          </label>
          <input className="input mono" inputMode="decimal" value={toneladas} onChange={(e) => setToneladas(e.target.value)} aria-label="Toneladas entregues" />
        </div>

        <div className="conv-row" style={{ borderTop: "1px solid var(--line)", paddingTop: "var(--s3)", marginTop: "var(--s3)" }}>
          <span className="muted">Preço por tonelada de cana</span>
          <span className="conv-out">{porTonelada == null ? "—" : reais(porTonelada)}</span>
        </div>
        <div className="conv-row">
          <span className="muted">Total da entrega</span>
          <span className="conv-out">{total == null ? "—" : reais(total)}</span>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: "var(--s2)" }}>
          É assim que o CONSECANA remunera o produtor: <b>preço do ATR × ATR da cana entregue</b>.
          O ATR sai da análise de laboratório de cada carga (varia com a variedade, a idade do canavial,
          a chuva e o corte). Preço do ATR pré-preenchido com o de São Paulo
          {atrSP?.referencia ? ` (ref. ${atrSP.referencia})` : ""}; ajuste para o seu estado na aba “Cotações”.
        </p>
      </div>

      <div className="section-title">Paridade açúcar × etanol</div>
      <div className="card">
        {paridades.length === 0 ? (
          <div className="note">Sem indicadores suficientes para calcular a paridade agora.</div>
        ) : (
          <>
            {paridades.map((p) => (
              <div className="conv-row" key={p.slug}>
                <span className="muted">{p.nome}</span>
                <span className="conv-out">{reais(p.valor, 4)}<span className="muted" style={{ fontSize: 12 }}> /kg ATR</span></span>
              </div>
            ))}
            {atrSP?.valor != null && (
              <div className="conv-row" style={{ borderTop: "1px solid var(--line)", paddingTop: "var(--s2)" }}>
                <span className="muted">Preço do ATR pago pela cana (SP)</span>
                <span className="conv-out">{reais(atrSP.valor, 4)}</span>
              </div>
            )}
            {margem != null && (
              <div className="conv-row">
                <span className="muted">Melhor destino ({melhor.nome}) menos o ATR</span>
                <span className={`conv-out ${sinal(margem)}`}>
                  {reais(margem, 4)}
                  {atrSP?.valor ? <span className="muted" style={{ fontSize: 12 }}> ({pct((margem / atrSP.valor) * 100)})</span> : null}
                </span>
              </div>
            )}
            <p className="muted" style={{ fontSize: 12, marginTop: "var(--s2)" }}>
              Coeficientes CONSECANA: {num(ATR_POR_KG_ACUCAR, 4)} kg de ATR por kg de açúcar,{" "}
              {num(ATR_POR_L_HIDRATADO, 4)} por litro de hidratado e {num(ATR_POR_L_ANIDRO, 4)} por litro de anidro.
              Comparação bruta de receita — não entram custo industrial, impostos, frete nem hedge.
            </p>
          </>
        )}
      </div>

      {hidratado && anidro && (
        <p className="muted" style={{ fontSize: 12, marginTop: "var(--s4)" }}>
          Prêmio do anidro sobre o hidratado hoje:{" "}
          <b className={sinal(anidro.valor - hidratado.valor)}>
            {pct(((anidro.valor - hidratado.valor) / hidratado.valor) * 100)}
          </b>{" "}
          ({reais(anidro.valor - hidratado.valor, 4)} por litro).
        </p>
      )}
    </div>
  );
}
