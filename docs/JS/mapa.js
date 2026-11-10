import {
    LngLatBounds,
    Map,
    NavigationControl,
} from "https://unpkg.com/maplibre-gl@6.17.0/dist/maplibre-gl.mjs";

const ESTILO_MAPA = "https://tiles.openfreemap.org/styles/bright";
const CENTRO_INICIAL = [-49.2733, -25.4284];
const ZOOM_INICIAL = 13;
const FONTE_ROTA = "rota-evento";
const ROTA_VAZIA = { type: "FeatureCollection", features: [] };

export function criarMapa(container) {
    const mapa = new Map({
        container,
        style: ESTILO_MAPA,
        center: CENTRO_INICIAL,
        zoom: ZOOM_INICIAL,
    });

    mapa.addControl(new NavigationControl(), "top-right");
    mapa.once("load", () => {
        mapa.addSource(FONTE_ROTA, { type: "geojson", data: ROTA_VAZIA });
        mapa.addLayer({
            id: "linha-rota-evento",
            type: "line",
            source: FONTE_ROTA,
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": "#0b3c3f", "line-width": 5 },
        });
    });

    return mapa;
}

export function desenharRota(mapa, trajeto) {
    const fonte = mapa.getSource(FONTE_ROTA);
    if (!fonte) {
        throw new Error("Aguarde o mapa carregar antes de desenhar a rota.");
    }

    const limites = new LngLatBounds();
    for (const coordenada of trajeto.geometry.coordinates) {
        limites.extend(coordenada);
    }

    fonte.setData(trajeto);
    mapa.fitBounds(limites, { padding: 48, maxZoom: 17, duration: 0 });
}

export function limparRota(mapa) {
    mapa.getSource(FONTE_ROTA)?.setData(ROTA_VAZIA);
}
