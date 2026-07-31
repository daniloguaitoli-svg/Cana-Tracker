// components/Mercado.jsx — mini-painel de mercado: clima nas regiões canavieiras,
// o mix açúcar × etanol (quanto cada destino paga por kg de ATR), tabela de
// principais índices (1D/30D/12M) e gráficos comparativos.
import { useEffect, useState } from "react";
import { getMercado, getClima } from "../api.js";
import { DualChart } from "./DualChart.jsx";
import { Loading, ErroBox } from "./States.jsx";
import { num, pct, reais, sinal, dataCurtaBR, dataBR } from "../format.js";

const CORES_STATUS = { ok: "var(--up)", atencao: "var(--accent)", seca: "var(--down)" };
const ROTULO_STATUS = { ok: "normal/úmido", atencao: "atenção", seca: "seca" };

function Clima() {
  const [clima, setClima] = useState(null);
  const [erro, setErro] = useState(null);
  useEffect(() => {
    let vivo = true;
    getClima().then((c) => vivo && setClima(c)).catch((e) => vivo && setErro(e.message));
    return () => { vivo = false; };
  }, []);

  if (erro) return <div className="note">Clima indisponível: {erro}</div>;
  if (!clima) return <div className="skeleton" style={{ height: 180 }} />;

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <table className="tbl">
        <thead>
          <tr><th>Região</th><th className="rt">Chuva 30d</th><th className="rt">Média</th><th className="rt">Var.</th><th className="ct">Status</th></tr>
        </thead>
        <tbody>
          {clima.regioes.map((r) => (
            <tr key={r.nome}>
              <td>
                <div style={{ fontWeight: 600 }}>{r.nome}</div>
                <div className="muted" style={{ fontSize: 11 }}>{r.cidade}</div>
              </td>
              <td className="rt mono">{r.atual != null ? `${num(r.atual)} mm` : "—"}</td>
              <td className="rt mono muted">{r.media != null ? `${num(r.media)} mm` : "—"}</td>
              <td className={`rt mono ${sinal(r.varPct)}`}>{r.varPct != null ? pct(r.varPct) : "—"}</td>
              <td className="ct">
                <span title={ROTULO_STATUS[r.status]} style={{
                  display: "inline-block", width: 11, height: 11, borderRadius: "50%",
                  background: CORES_STATUS[r.status] || "var(--muted)",
                }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="muted" style={{ fontSize: 11, padding: "8px 12px" }}>
        Chuva acumulada em 30 dias vs. média histórica da mesma janela (~10 anos). Fonte: {clima.fonte}.
        Na cana o sinal tem dupla leitura: seca no desenvolvimento derruba a produtividade, mas seca
        durante a moagem favorece a colheita e concentra o ATR.
      </div>
    </div>
  );
}

// Barras comparando quanto cada destino paga por kg de ATR.
function Mix({ mix, atrPadrao }) {
  if (!mix?.destinos?.length) return null;
  const maximo = Math.max(...mix.destinos.map((d) => d.valorATR));
  return (
    <>
      <div className="section-title">Mix: o que paga mais por kg de ATR</div>
      <div className="card">
        {mix.destinos.map((d) => (
          <div className={`mixrow ${d.slug === mix.melhor.slug ? "melhor" : ""}`} key={d.slug}>
            <div>
              <div className="nome">{d.nome}</div>
              <div className="mixbar"><i style={{ width: `${(d.valorATR / maximo) * 100}%` }} /></div>
            </div>
            <div className="v">{reais(d.valorATR, 4)}</div>
          </div>
        ))}

        {mix.custoATR != null && (
          <div className="conv-row" style={{ borderTop: "1px solid var(--line)", paddingTop: "var(--s3)", marginTop: "var(--s3)" }}>
            <span className="muted">
              Preço do ATR pago pela cana (SP{mix.custoReferencia ? `, ref. ${mix.custoReferencia}` : ""})
            </span>
            <span className="conv-out">{reais(mix.custoATR, 4)}</span>
          </div>
        )}
        {mix.margem != null && (
          <div className="conv-row">
            <span className="muted">Diferença do melhor destino sobre o ATR</span>
            <span className={`conv-out ${sinal(mix.margem)}`}>{reais(mix.margem, 4)}</span>
          </div>
        )}

        <p className="muted" style={{ fontSize: 12, marginTop: "var(--s2)" }}>
          É a decisão central da usina: mandar o caldo para açúcar ou para etanol. Os valores usam os
          coeficientes do CONSECANA (1 kg de ATR rende ~0,95 kg de açúcar, ~0,59 litro de hidratado ou
          ~0,57 litro de anidro). Comparação bruta de receita — não considera custo industrial, impostos,
          frete, hedge nem a capacidade de cada usina de mudar o mix. Uma tonelada de cana a
          {" "}{atrPadrao} kg de ATR renderia {reais((mix.melhor.valorATR || 0) * atrPadrao)} no melhor destino.
        </p>
      </div>
    </>
  );
}

function celVar(v) {
  return <td className={`rt mono ${sinal(v)}`}>{v != null ? pct(v) : "—"}</td>;
}

export function Mercado() {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = () => {
    setCarregando(true); setErro(null);
    getMercado().then(setD).catch((e) => setErro(e.message)).finally(() => setCarregando(false));
  };
  useEffect(carregar, []);

  return (
    <div>
      <div className="section-title">Clima nas regiões canavieiras</div>
      <Clima />

      {carregando && !d && <Loading texto="Carregando mercado…" />}
      {erro && !d && <ErroBox erro={erro} onRetry={carregar} />}

      {d && (
        <>
          <Mix mix={d.mix} atrPadrao={d.atrPadrao} />

          <div className="section-title">Principais índices</div>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table className="tbl">
              <thead>
                <tr><th>Índice</th><th className="rt">Valor</th><th className="rt">1D</th><th className="rt">30D</th><th className="rt">12M</th></tr>
              </thead>
              <tbody>
                {d.indices.map((i) => (
                  <tr key={i.nome}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{i.nome}</div>
                      <div className="muted" style={{ fontSize: 11 }}>
                        {i.unidade}
                        {i.data && (
                          i.desatualizado
                            ? <> · <span className="stale" title={`Sem atualização desde ${dataBR(i.data)}`}>⚠ {dataCurtaBR(i.data)}</span></>
                            : <span className="pricedate"> · {dataCurtaBR(i.data)}</span>
                        )}
                      </div>
                    </td>
                    <td className="rt mono">
                      {num(i.valor, i.unidade === "R$/litro" || i.unidade === "R$/US$" || i.unidade === "R$/kg de ATR" ? 4 : 2)}
                    </td>
                    {celVar(i.var1d)}{celVar(i.var30d)}{celVar(i.var12m)}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="muted" style={{ fontSize: 11, padding: "8px 12px" }}>
              30D e 12M dependem de histórico gratuito — disponíveis para o açúcar de Nova York, o Brent e o
              Dólar; nos indicadores CEPEA e no ATR a série é construída pelos snapshots do próprio app, então
              aparece “—” até acumular dias.
            </div>
          </div>

          <div className="section-title">Dólar × Açúcar Nova York</div>
          <div className="card">
            <DualChart a={d.charts.usd} b={d.charts.ny} colorA="var(--accent)" colorB="var(--up)" />
            <Legenda a="Dólar (R$/US$)" colorA="var(--accent)" b="Açúcar NY (¢US$/lb)" colorB="var(--up)" />
          </div>

          <div className="section-title">Petróleo Brent × Açúcar Nova York</div>
          <div className="card">
            <DualChart a={d.charts.brent} b={d.charts.ny} colorA="var(--down)" colorB="var(--up)" />
            <Legenda a="Brent (US$/barril)" colorA="var(--down)" b="Açúcar NY (¢US$/lb)" colorB="var(--up)" />
            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              O petróleo puxa o etanol (que compete com a gasolina) e, por tabela, o açúcar: quando o
              combustível paga mais, a usina desvia cana do açúcar — e o preço do açúcar sobe.
            </p>
          </div>

          <div className="section-title">Açúcar CEPEA × Etanol hidratado CEPEA</div>
          <div className="card">
            {d.charts.hidratado?.length >= 2 && d.charts.acucarCepea?.length >= 2 ? (
              <>
                <DualChart a={d.charts.acucarCepea} b={d.charts.hidratado} colorA="var(--accent)" colorB="var(--up)" />
                <Legenda a="Açúcar cristal (R$/saca 50 kg)" colorA="var(--accent)" b="Etanol hidratado (R$/litro)" colorB="var(--up)" />
              </>
            ) : (
              <div className="note">
                Estas duas linhas crescem conforme o app roda (snapshots diários) — ainda não há pontos
                suficientes. As séries do açúcar de Nova York, do Brent e do Dólar já têm histórico completo.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Legenda({ a, b, colorA = "var(--accent)", colorB = "var(--up)" }) {
  return (
    <div style={{ display: "flex", gap: 16, marginTop: 6, fontSize: 12, flexWrap: "wrap" }}>
      <span className="muted"><span style={{ color: colorA }}>●</span> {a}</span>
      <span className="muted"><span style={{ color: colorB }}>●</span> {b}</span>
    </div>
  );
}
