// components/Painel.jsx — visão geral: os números-cabeça do setor sucroenergético.
import { num, pct, reais, sinal, dataBR, PERIODICIDADE } from "../format.js";

function Card({ label, valor, unidade, delta, sub, data, desatualizado, periodicidade }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="big">
        {valor} <span className="unit">{unidade}</span>
      </div>
      {delta != null && <div className={`delta ${sinal(delta)}`}>{pct(delta)}{periodicidade === "semanal" ? " na semana" : " no dia"}</div>}
      {sub && <div className="delta muted">{sub}</div>}
      {desatualizado ? (
        <div style={{ marginTop: 6 }}>
          <span className="stale">⚠ sem atualização desde {data ? dataBR(data) : "data desconhecida"}</span>
        </div>
      ) : (
        data && (
          <div className="pricedate" style={{ marginTop: 6 }}>
            Preço de {dataBR(data)}
            {periodicidade && periodicidade !== "diaria" ? ` · ${PERIODICIDADE[periodicidade]}` : ""}
          </div>
        )
      )}
    </div>
  );
}

// Só os indicadores marcados como principais entram no aviso — vários
// indicadores regionais do CEPEA são publicados de forma irregular (o Nordeste
// para fora do período de moagem, por exemplo) e virariam ruído aqui.
function AvisoDesatualizados({ itens }) {
  const parados = itens.filter((i) => i.desatualizado && PRINCIPAIS.includes(i.slug));
  if (!parados.length) return null;
  const nomes = parados.slice(0, 3).map((i) => i.nome.split("—")[0].trim());
  return (
    <div className="stale-banner" role="alert">
      <span aria-hidden="true">⚠️</span>
      <span>
        <b>{parados.length === 1 ? "1 cotação principal está" : `${parados.length} cotações principais estão`} sem atualização</b>{" "}
        além do prazo normal de publicação: {nomes.join(", ")}{parados.length > 3 ? "…" : "."}{" "}
        Veja as datas em “Cotações” — cada preço mostra quando foi publicado.
      </span>
    </div>
  );
}

const PRINCIPAIS = [
  "ny-acucar",
  "b3-etanol",
  "cepea-hidratado-sp",
  "cepea-anidro-sp",
  "cepea-acucar-sp",
];

export function Painel({ dados }) {
  const itens = dados.categorias.flatMap((c) => c.itens);
  const get = (slug) => itens.find((i) => i.slug === slug);

  const hidratado = get("cepea-hidratado-sp");
  const anidro = get("cepea-anidro-sp");
  const acucarSP = get("cepea-acucar-sp");
  const ny = get("ny-acucar");
  const b3 = get("b3-etanol");
  const atrSP = get("atr-sao-paulo");
  const usd = dados.cambio.usdbrl;

  return (
    <div>
      <AvisoDesatualizados itens={itens} />
      <div className="grid grid-2">
        {hidratado && (
          <Card
            label="Etanol hidratado — CEPEA (SP)"
            valor={num(hidratado.valor, 4)}
            unidade="R$/litro"
            delta={hidratado.variacaoPct}
            sub={hidratado.valorBRLm3 != null ? `≈ ${reais(hidratado.valorBRLm3)}/m³` : null}
            data={hidratado.data}
            desatualizado={hidratado.desatualizado}
            periodicidade={hidratado.periodicidade}
          />
        )}
        {anidro && (
          <Card
            label="Etanol anidro — CEPEA (SP)"
            valor={num(anidro.valor, 4)}
            unidade="R$/litro"
            delta={anidro.variacaoPct}
            sub={
              hidratado?.valor
                ? `${pct(((anidro.valor - hidratado.valor) / hidratado.valor) * 100)} sobre o hidratado`
                : null
            }
            data={anidro.data}
            desatualizado={anidro.desatualizado}
            periodicidade={anidro.periodicidade}
          />
        )}
        {atrSP && (
          <Card
            label="Preço do ATR — São Paulo (CONSECANA)"
            valor={num(atrSP.valor, 4)}
            unidade="R$/kg de ATR"
            sub={
              atrSP.valorBRLtonCana != null
                ? `≈ ${reais(atrSP.valorBRLtonCana)}/t de cana (a ${dados.atrPadrao} kg de ATR/t)`
                : null
            }
            data={atrSP.data}
            desatualizado={atrSP.desatualizado}
            periodicidade={atrSP.periodicidade}
          />
        )}
        {acucarSP && (
          <Card
            label="Açúcar cristal — CEPEA (SP)"
            valor={num(acucarSP.valor)}
            unidade="R$/saca 50 kg"
            delta={acucarSP.variacaoPct}
            sub={acucarSP.valorBRLkg != null ? `≈ ${reais(acucarSP.valorBRLkg, 4)}/kg` : null}
            data={acucarSP.data}
            desatualizado={acucarSP.desatualizado}
            periodicidade={acucarSP.periodicidade}
          />
        )}
        {ny && (
          <Card
            label="Açúcar bruto — Nova York (nº 11)"
            valor={num(ny.valor)}
            unidade="¢US$/lb"
            delta={ny.variacaoPct}
            sub={ny.valorBRLkg != null ? `≈ ${reais(ny.valorBRLkg, 4)}/kg` : null}
            data={ny.data}
            desatualizado={ny.desatualizado}
            periodicidade={ny.periodicidade}
          />
        )}
        {b3 && (
          <Card
            label="Etanol hidratado — futuro B3"
            valor={num(b3.valor)}
            unidade="R$/m³"
            delta={b3.variacaoPct}
            sub={`Contrato ${b3.contrato} · ≈ ${reais(b3.valorBRLlitro, 4)}/litro`}
            data={b3.data}
            desatualizado={b3.desatualizado}
            periodicidade={b3.periodicidade}
          />
        )}
      </div>

      <div className="card" style={{ marginTop: "var(--s4)" }}>
        <div className="label">Dólar comercial (PTAX)</div>
        <div className="big">
          {usd != null ? `R$ ${num(usd, 4)}` : "—"} <span className="unit">por US$ 1</span>
        </div>
        <div className="delta muted">Base para converter o açúcar de Nova York e o etanol de Chicago em reais.</div>
        {dados.cambio.desatualizado ? (
          <div style={{ marginTop: 6 }}>
            <span className="stale">⚠ sem atualização desde {dados.cambio.data ? dataBR(dados.cambio.data) : "data desconhecida"}</span>
          </div>
        ) : (
          dados.cambio.data && <div className="pricedate" style={{ marginTop: 6 }}>PTAX de {dataBR(dados.cambio.data)}</div>
        )}
      </div>

      <p className="muted" style={{ fontSize: 12, marginTop: "var(--s4)" }}>
        Atualizado em {dataBR(dados.fetchedAt)}. Toque em “Cotações” para ver os {itens.length} indicadores,
        veja o mix açúcar × etanol em “Mercado” ou calcule a tonelada de cana no “Conversor”.
      </p>
    </div>
  );
}
