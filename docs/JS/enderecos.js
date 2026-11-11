const URL_BUSCA = "https://photon.komoot.io/api/";
const TEMPO_LIMITE_MS = 10000;
const LIMITE_RESULTADOS = 5;

// O centro de Curitiba dá preferência aos resultados da região.
const REFERENCIA_BUSCA = {
    latitude: -25.4284,
    longitude: -49.2733,
};

function montarResultado(item) {
    const geometria = item?.geometry;
    const coordenadas = geometria?.coordinates;

    if (geometria?.type !== "Point" || !Array.isArray(coordenadas)) {
        return null;
    }

    const [longitude, latitude] = coordenadas;

    if (
        !Number.isFinite(longitude) ||
        !Number.isFinite(latitude) ||
        Math.abs(longitude) > 180 ||
        Math.abs(latitude) > 90
    ) {
        return null;
    }

    const dados = item.properties ?? {};
    const rua = dados.street || dados.name;
    const logradouro = rua && dados.housenumber
        ? `${rua}, ${dados.housenumber}`
        : rua;

    const partes = [
        dados.name,
        logradouro,
        dados.district || dados.locality,
        dados.city || dados.county,
        dados.state,
    ].filter(Boolean);

    const rotulo = [...new Set(partes)].join(" · ");

    if (!rotulo) {
        return null;
    }

    return {
        rotulo,
        coordenadas: [longitude, latitude],
    };
}

export async function buscarEnderecos(endereco, { signal } = {}) {
    const consulta = typeof endereco === "string" ? endereco.trim() : "";

    if (!consulta) {
        throw new TypeError("Digite um endereço para buscar.");
    }

    signal?.throwIfAborted();

    const url = new URL(URL_BUSCA);
    url.searchParams.set("q", consulta);
    url.searchParams.set("limit", String(LIMITE_RESULTADOS));
    url.searchParams.set("lat", String(REFERENCIA_BUSCA.latitude));
    url.searchParams.set("lon", String(REFERENCIA_BUSCA.longitude));

    const tempoLimite = AbortSignal.timeout(TEMPO_LIMITE_MS);
    const sinalBusca = signal
        ? AbortSignal.any([signal, tempoLimite])
        : tempoLimite;

    let dados;

    try {
        const resposta = await fetch(url, { signal: sinalBusca });

        if (!resposta.ok) {
            throw new Error(`HTTP ${resposta.status}`);
        }

        dados = await resposta.json();
    } catch (erro) {
        if (signal?.aborted) {
            throw erro;
        }

        if (tempoLimite.aborted) {
            throw new Error("A busca demorou demais. Tente novamente.");
        }

        throw new Error("Não foi possível buscar o endereço agora.", {
            cause: erro,
        });
    }

    if (dados?.type !== "FeatureCollection" || !Array.isArray(dados.features)) {
        throw new Error("O serviço retornou uma resposta de endereço inválida.");
    }

    return dados.features.map(montarResultado).filter(Boolean);
}