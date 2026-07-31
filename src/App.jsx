// App.jsx — moldura do app. Topo com marca + câmbio, abas, e as telas. Um
// indicador selecionado abre o Detalhe em tela cheia (sobre as abas).
import { useEffect, useState } from "react";
import { getCotacoes } from "./api.js";
import { Tabs } from "./components/Tabs.jsx";
import { Painel } from "./components/Painel.jsx";
import { Cotacoes } from "./components/Cotacoes.jsx";
import { Mercado } from "./components/Mercado.jsx";
import { Conversor } from "./components/Conversor.jsx";
import { Alertas } from "./components/Alertas.jsx";
import { Detalhe } from "./components/Detalhe.jsx";
import { ErroBox, Skeletons } from "./components/States.jsx";
import { num, dataBR } from "./format.js";

const TABS = [
  { id: "painel", label: "Painel" },
  { id: "cotacoes", label: "Cotações" },
  { id: "mercado", label: "Mercado" },
  { id: "conversor", label: "Conversor" },
  { id: "alertas", label: "Alertas" },
];

export default function App() {
  const [tab, setTab] = useState("painel");
  const [slug, setSlug] = useState(null);
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = () => {
    setCarregando(true);
    setErro(null);
    getCotacoes()
      .then(setDados)
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  };
  useEffect(carregar, []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="bean" aria-hidden="true">🎋</span>
          <span>
            Cana &amp; Etanol
            <small>Preços do setor sucroenergético · Brasil</small>
          </span>
        </div>
        {dados?.cambio?.usdbrl != null && (
          <div className="fx">
            USD/BRL<br />
            <b className="mono">R$ {num(dados.cambio.usdbrl, 4)}</b>
          </div>
        )}
      </header>

      {slug ? (
        <Detalhe slug={slug} onBack={() => setSlug(null)} />
      ) : (
        <>
          <Tabs value={tab} onChange={setTab} tabs={TABS} />

          {carregando && !dados && <Skeletons n={5} />}
          {erro && !dados && <ErroBox erro={erro} onRetry={carregar} />}

          {dados && (
            <main>
              {tab === "painel" && <Painel dados={dados} />}
              {tab === "cotacoes" && <Cotacoes dados={dados} onOpen={setSlug} />}
              {tab === "mercado" && <Mercado />}
              {tab === "conversor" && <Conversor dados={dados} />}
              {tab === "alertas" && <Alertas dados={dados} />}
            </main>
          )}
        </>
      )}

      <footer className="footer">
        <strong>Aviso:</strong> {dados?.aviso ||
          "Dados de fontes públicas (CEPEA/ESALQ, CONSECANA, ICE/NYBOT, B3, CME e Banco Central), possivelmente com atraso. Uso informativo — não é recomendação de investimento."}
        <br />
        Feito para acompanhar a cana-de-açúcar (CONSECANA/ATR), o etanol e o açúcar que definem o preço dela.
        {dados?.fetchedAt && <> Última atualização: {dataBR(dados.fetchedAt)}.</>}
      </footer>
    </div>
  );
}
