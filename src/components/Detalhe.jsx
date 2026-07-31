// components/Detalhe.jsx — tela cheia de um indicador: preço, gráfico, curva de
// vencimentos (quando é futuro) e estatísticas.
import { useEffect, useState } from "react";
import { getDetalhe } from "../api.js";
import { AreaChart } from "./AreaChart.jsx";
import { Loading, ErroBox } from "./States.jsx";
import { num, pct, sinal, reais, dataBR, casasDaUnidade, PERIODICIDADE } from "../format.js";

const TFS = ["1M", "3M", "6M", "1A", "5A"];
// Só o açúcar de Nova York tem histórico gratuito por timeframe (Yahoo).
const COM_TF = ["ny-acucar"];

export function Detalhe({ slug, onBack }) {
  const [tf, setTf] = useState("3M");
  const [dado, setDado] = useState(null);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setErro(null);
    getDetalhe(slug, tf)
      .then((d) => vivo && setDado(d))
      .catch((e) => vivo && setErro(e.message))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [slug, tf]);

  const item = dado?.item;
  const podeTF = COM_TF.includes(slug);
  const casas = item ? casasDaUnidade(item.unidade) : 2;

  return (
    <div>
      <button className="backlink" onClick={onBack}>← Voltar</button>

      {carregando && !dado && <Loading texto="Carregando indicador…" />}
      {erro && <ErroBox erro={erro} onRetry={() => setTf((t) => t)} />}

      {item && (
        <>
          <h2 style={{ fontFamily: "var(--display)", margin: "var(--s2) 0 0" }}>{item.nome}</h2>
          <div className="detail-head">
            <div>
              <div className="price">
                {num(item.valor, casas)} <span className="unit muted" style={{ fontSize: 16 }}>{item.moeda}</span>
              </div>
              {item.variacaoPct != null && (
                <div className={`mono ${sinal(item.variacaoPct)}`}>
                  {pct(item.variacaoPct)} {item.periodicidade === "semanal" ? "na semana" : item.periodicidade === "mensal" ? "no mês" : "no dia"}
                </div>
              )}
              {item.valorBRLlitro != null && item.unidade !== "BRL_LITRO" && (
                <div className="muted mono" style={{ fontSize: 13 }}>≈ {reais(item.valorBRLlitro, 4)}/litro</div>
              )}
              {item.valorBRLm3 != null && item.unidade !== "BRL_M3" && (
                <div className="muted mono" style={{ fontSize: 13 }}>≈ {reais(item.valorBRLm3)}/m³</div>
              )}
              {item.valorBRLkg != null && item.unidade !== "BRL_KG" && (
                <div className="muted mono" style={{ fontSize: 13 }}>≈ {reais(item.valorBRLkg, 4)}/kg</div>
              )}
              {item.valorBRLsaca50 != null && item.unidade !== "BRL_SACA50" && (
                <div className="muted mono" style={{ fontSize: 13 }}>≈ {reais(item.valorBRLsaca50)}/saca 50 kg</div>
              )}
              {item.valorATR != null && item.unidade !== "BRL_KG_ATR" && (
                <div className="muted mono" style={{ fontSize: 13 }}>≈ {reais(item.valorATR, 4)} por kg de ATR</div>
              )}
              {item.valorAcumulado != null && (
                <div className="muted mono" style={{ fontSize: 13 }}>Acumulado da safra: {reais(item.valorAcumulado, 4)}</div>
              )}
              {item.valorBRLtonCana != null && (
                <div className="muted mono" style={{ fontSize: 13 }}>≈ {reais(item.valorBRLtonCana)} por tonelada de cana (a 140 kg de ATR/t)</div>
              )}
              {item.desatualizado ? (
                <div style={{ marginTop: 8 }}>
                  <span className="stale">
                    ⚠ sem atualização desde {item.data ? dataBR(item.data) : "data desconhecida"}
                    {item.diasSemAtualizar != null && ` (${item.diasSemAtualizar} dias úteis)`}
                  </span>
                </div>
              ) : (
                item.data && (
                  <div className="pricedate" style={{ marginTop: 8 }}>
                    Preço publicado em {dataBR(item.data)}
                    {item.periodicidade && item.periodicidade !== "diaria" ? ` · indicador ${PERIODICIDADE[item.periodicidade]}` : ""}
                    {item.referencia ? ` · referência ${item.referencia}` : ""}
                  </div>
                )
              )}
            </div>
          </div>

          {podeTF && (
            <div className="tfrow">
              {TFS.map((t) => (
                <button key={t} className="chip" aria-pressed={tf === t} onClick={() => setTf(t)}>
                  {t}
                </button>
              ))}
            </div>
          )}

          {dado?.pontos?.length >= 2 ? (
            <>
              <AreaChart points={dado.pontos} color={item.variacaoPct >= 0 ? "var(--up)" : "var(--down)"} />
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                Série em {dado.unidadeSerie} · {dado.pontos.length} pontos ·{" "}
                {dataBR(dado.pontos[0].date)} → {dataBR(dado.pontos.at(-1).date)}
              </div>
            </>
          ) : (
            !carregando && <div className="note">{dado?.notaHistorico || "Sem série suficiente para o gráfico ainda."}</div>
          )}

          {dado?.estatisticas && (
            <div className="statgrid">
              <div className="stat"><div className="k">Mínima ({tf})</div><div className="v">{num(dado.estatisticas.min, casas)}</div></div>
              <div className="stat"><div className="k">Máxima ({tf})</div><div className="v">{num(dado.estatisticas.max, casas)}</div></div>
              <div className="stat">
                <div className="k">Variação ({tf})</div>
                <div className={`v ${sinal(dado.estatisticas.variacaoPeriodoPct)}`}>{pct(dado.estatisticas.variacaoPeriodoPct)}</div>
              </div>
            </div>
          )}

          {dado?.notaHistorico && dado?.pontos?.length >= 2 && (
            <div className="note">{dado.notaHistorico}</div>
          )}

          {item.curva?.length > 1 && (
            <>
              <div className="section-title">Curva de vencimentos</div>
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <table className="tbl">
                  <thead>
                    <tr><th>Contrato</th><th className="rt">Fechamento</th><th className="rt">Variação</th></tr>
                  </thead>
                  <tbody>
                    {item.curva.map((c) => (
                      <tr key={c.contrato}>
                        <td>{c.contrato}</td>
                        <td className="rt mono">{num(c.valor, casas)}</td>
                        <td className={`rt mono ${sinal(c.variacaoPct)}`}>{c.variacaoPct != null ? pct(c.variacaoPct) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="card" style={{ marginTop: "var(--s4)" }}>
            <div className="label">Sobre este indicador</div>
            <p style={{ margin: "8px 0 0", fontSize: 14 }}>{item.descricao || "—"}</p>
            {item.bloomberg && <span className="pill">Bloomberg: {item.bloomberg}</span>}
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Fonte: {item.fonte}</div>
          </div>
        </>
      )}
    </div>
  );
}
