const URL_EVENTOS = new URL("../DADOS/eventos.geojson", import.meta.url);
const RAIO_BUSCA_METROS = 3000;
const RAIO_TERRA_METROS = 6371008.8;
const DURACAO_PADRAO_MS = 6 * 60 * 60 * 1000;

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

function eventoVisivel(evento, agora) {
    const dados = evento?.properties;
    const geometria = evento?.geometry;

    if (
        evento?.type !== "Feature" ||
        dados?.local_liberado !== true ||
        geometria?.type !== "Point" ||
        !coordenadasValidas(geometria.coordinates)
    ) {
        return false;
    }

    const inicio = Date.parse(dados.inicio);
    const fim = dados.fim == null
        ? inicio + DURACAO_PADRAO_MS
        : Date.parse(dados.fim);

    return Number.isFinite(inicio) && fim >= inicio && fim >= agora;
}

function distanciaEmMetros(origem, destino) {
    const [longitudeOrigem, latitudeOrigem] = origem;
    const [longitudeDestino, latitudeDestino] = destino;
    const radianosPorGrau = Math.PI / 180;

    const deltaLatitude = (latitudeDestino - latitudeOrigem) * radianosPorGrau;
    const deltaLongitude = (longitudeDestino - longitudeOrigem) * radianosPorGrau;

    // Haversine: distância em linha reta sobre a superfície da Terra.
    const haversine =
        Math.sin(deltaLatitude / 2) ** 2 +
        Math.cos(latitudeOrigem * radianosPorGrau) *
        Math.cos(latitudeDestino * radianosPorGrau) *
        Math.sin(deltaLongitude / 2) ** 2;

    return 2 * RAIO_TERRA_METROS * Math.asin(Math.sqrt(Math.min(1, haversine)));
}

export async function carregarEventos() {
    const resposta = await fetch(URL_EVENTOS);

    if (!resposta.ok) {
        throw new Error(`Não foi possível carregar os eventos (HTTP ${resposta.status}).`);
    }

    const dados = await resposta.json();

    if (dados?.type !== "FeatureCollection" || !Array.isArray(dados.features)) {
        throw new Error("O arquivo de eventos precisa ser um FeatureCollection GeoJSON.");
    }

    const agora = Date.now();

    return dados.features.filter((evento) => eventoVisivel(evento, agora));
}

export function filtrarEventosProximos(eventos, origem) {
    if (!coordenadasValidas(origem)) {
        throw new TypeError("Informe a origem como [longitude, latitude].");
    }

    return eventos.filter((evento) => {
        const distancia = distanciaEmMetros(origem, evento.geometry.coordinates);
        return distancia <= RAIO_BUSCA_METROS;
    });
}