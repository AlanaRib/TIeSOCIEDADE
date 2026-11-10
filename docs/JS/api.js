import { API_BASE_URL } from "./configuracao.js";

export function backendConfigurado() {
    return typeof API_BASE_URL === "string" && API_BASE_URL.trim().length > 0;
}

export async function consultarAPI(caminho, { method = "GET", body, signal } = {}) {
    if (!backendConfigurado()) throw new Error("O backend da UMURA não foi configurado.");
    const base = API_BASE_URL.trim().replace(/\/+$/, "");
    const limite = AbortSignal.timeout(15000);
    const sinal = signal ? AbortSignal.any([signal, limite]) : limite;
    let resposta;
    try {
        resposta = await fetch(`${base}/${caminho}`, {
            method, signal: sinal, cache: "no-store", credentials: "omit",
            ...(body === undefined ? {} : {
                headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
            }),
        });
    } catch (erro) {
        if (signal?.aborted) throw erro;
        throw new Error(limite.aborted ? "A consulta demorou demais. Tente novamente."
            : "Não foi possível conectar ao backend da UMURA.", { cause: erro });
    }
    let dados;
    try { dados = await resposta.json(); }
    catch { throw new Error("O backend retornou uma resposta inválida."); }
    if (!resposta.ok) throw new Error(dados?.erro?.mensagem || `Falha na consulta (HTTP ${resposta.status}).`);
    return dados;
}
