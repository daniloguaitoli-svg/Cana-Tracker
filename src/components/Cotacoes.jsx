// components/Cotacoes.jsx — lista de todos os indicadores, agrupados por categoria,
// com busca e filtro. Toque numa linha abre o Detalhe.
import { useMemo, useState } from "react";
import { num, pct, sinal, reais, dataCurtaBR, dataBR, casasDaUnidade } from "../format.js";

// Segunda linha do preço: a conversão que mais ajuda a comparar aquele item.
function equivalencia(item) {
  if (item.unidade === "BRL_KG_ATR") return null;
  if (item.valorBRLlitro != null && item.unidade !== "BRL_LITRO") return `≈ ${reais(item.valorBRLlitro, 4)}/L`;
  if (item.valorBRLkg != null && item.unidade !== "BRL_KG") return `≈ ${reais(item.valorBRLkg, 4)}/kg`;
  return null;
}

function Linha({ item, onOpen }) {
  const equiv = equivalencia(item);
  return (
    <button className="row" onClick={() => onOpen(item.slug)}>
      <div className="rowmain">
        <div className="rowname">{item.nome}</div>
        <div className="rowsub">
          {item.contrato ? `Contrato ${item.contrato} · ` : ""}
          {item.referencia ? `Ref. ${item.referencia} · ` : ""}
          {item.subgrupo || item.fonte}
        </div>
      </div>
      <div className="rowprice">
        <div className="p">
          {num(item.valor, casasDaUnidade(item.unidade))}{" "}
          <span className="muted" style={{ fontSize: 11 }}>{item.moeda}</span>
        </div>
        {item.variacaoPct != null && <div className={`d ${sinal(item.variacaoPct)}`}>{pct(item.variacaoPct)}</div>}
        {equiv && <div className="brl">{equiv}</div>}
        {item.valorATR != null && item.unidade !== "BRL_KG_ATR" && (
          <div className="brl">≈ {reais(item.valorATR, 4)}/kg ATR</div>
        )}
        {item.desatualizado ? (
          <div title={item.data ? `Último preço em ${dataBR(item.data)}` : "Fonte não informou a data"}>
            <span className="stale">⚠ {item.data ? dataCurtaBR(item.data) : "sem data"}</span>
          </div>
        ) : (
          item.data && <div className="pricedate">{dataCurtaBR(item.data)}</div>
        )}
      </div>
    </button>
  );
}

export function Cotacoes({ dados, onOpen }) {
  const [busca, setBusca] = useState("");
  const [cat, setCat] = useState("Todas");

  const categorias = dados.categorias;
  const nomesCat = ["Todas", ...categorias.map((c) => c.nome)];

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return categorias
      .filter((c) => cat === "Todas" || c.nome === cat)
      .map((c) => ({
        ...c,
        itens: c.itens.filter(
          (i) =>
            !q ||
            i.nome.toLowerCase().includes(q) ||
            (i.subgrupo || "").toLowerCase().includes(q) ||
            (i.fonte || "").toLowerCase().includes(q)
        ),
      }))
      .filter((c) => c.itens.length);
  }, [categorias, busca, cat]);

  return (
    <div>
      <div className="controls">
        <input
          className="input"
          placeholder="Buscar por estado, produto…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>
      <div className="chips" style={{ marginBottom: "var(--s3)" }}>
        {nomesCat.map((n) => (
          <button key={n} className="chip" aria-pressed={cat === n} onClick={() => setCat(n)}>
            {n}
          </button>
        ))}
      </div>

      {filtradas.length === 0 && <p className="muted state">Nenhum indicador encontrado.</p>}

      {filtradas.map((c) => (
        <section key={c.nome}>
          <div className="section-title">{c.nome} · {c.itens.length}</div>
          {c.itens.map((i) => (
            <Linha key={i.slug} item={i} onOpen={onOpen} />
          ))}
        </section>
      ))}
    </div>
  );
}
