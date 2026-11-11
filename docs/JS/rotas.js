const URL_OSRM = "https://routing.openstreetmap.de";
const TEMPO_LIMITE_MS = 10000;
const INTERVALO_MINIMO_MS = 1000;

const SERVICOS = {
    "a-pe": "routed-foot",
    "de-carro": "routed-car",
};

let ultimaConsulta = -Infinity;

function coordenadasValidas(coordenadas) {
    if (!Array.isArray(coordenadas) || coordenadas.length < 2) {
        return false;
    }

    const [longitude, latitude] = coordenadas;

    return (
        Number.isFinite(longitude) &&
        Number.isFinite(latitude) &&
        Math.abs(longitude) <= 180 &&
        Math.abs(latitude) <= 90
    );
}

export async function calcularRota({ origem, destino, modo, signal }) {
    if (!Object.hasOwn(SERVICOS, modo)) {
        throw new TypeError("Selecione uma rota a pé ou de carro.");
    }

    if (!coordenadasValidas(origem) || !coordenadasValidas(destino)) {
        throw new TypeError("Informe a origem e o destino como [longitude, latitude].");
    }

    signal?.throwIfAborted();

    const agora = performance.now();

    if (agora - ultimaConsulta < INTERVALO_MINIMO_MS) {
        throw new Error("Aguarde um instante antes de calcular outra rota.");
    }

    const pontoOrigem = origem.slice(0, 2).join(",");
    const pontoDestino = destino.slice(0, 2).join(",");
    const servico = SERVICOS[modo];

    // No servidor de demonstração, routed-foot e routed-car definem o modo.
    const url = new URL(
        `${URL_OSRM}/${servico}/route/v1/driving/${pontoOrigem};${pontoDestino}`
    );

    url.searchParams.set("overview", "full");
    url.searchParams.set("geometries", "geojson");
    url.searchParams.set("generate_hints", "false");

    const tempoLimite = AbortSignal.timeout(TEMPO_LIMITE_MS);
    const sinalConsulta = signal
        ? AbortSignal.any([signal, tempoLimite])
        : tempoLimite;

    let resposta;
    let dados;

    try {
        ultimaConsulta = agora;
        resposta = await fetch(url, { signal: sinalConsulta });
        dados = await resposta.json();
    } catch (erro) {
        if (signal?.aborted) {
            throw erro;
        }

        if (tempoLimite.aborted) {
            throw new Error("O cálculo da rota demorou demais. Tente novamente.");
        }

        throw new Error("Não foi possível consultar o serviço de rotas.", {
            cause: erro,
        });
    }

    if (dados?.code === "NoRoute" || dados?.code === "NoSegment") {
        throw new Error("Não foi encontrada uma rota para esse modo de deslocamento.");
    }

    if (!resposta.ok || dados?.code !== "Ok") {
        throw new Error("O serviço de rotas não conseguiu calcular o trajeto.");
    }

    const rota = dados.routes?.[0];
    const geometria = rota?.geometry;

    if (
        geometria?.type !== "LineString" ||
        !Array.isArray(geometria.coordinates) ||
        geometria.coordinates.length < 2 ||
        !geometria.coordinates.every(coordenadasValidas) ||
        !Number.isFinite(rota.distance) ||
        rota.distance < 0 ||
        !Number.isFinite(rota.duration) ||
        rota.duration < 0
    ) {
        throw new Error("O serviço retornou um trajeto inválido.");
    }

    return {
        trajeto: {
            type: "Feature",
            properties: { modo },
            geometry: geometria,
        },
        distanciaMetros: rota.distance,
        duracaoSegundos: rota.duration,
    };
}