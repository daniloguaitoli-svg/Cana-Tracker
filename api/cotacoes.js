// api/cotacoes.js — função serverless da Vercel. Lista categorizada de todos os
// indicadores do setor sucroenergético (bolsas, CEPEA etanol/açúcar, CONSECANA
// e a paridade por kg de ATR).
import { getCotacoes } from "../server/datalayer.js";

export default async function handler(req, res) {
  try {
    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=3600");
    return res.status(200).json(await getCotacoes());
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
