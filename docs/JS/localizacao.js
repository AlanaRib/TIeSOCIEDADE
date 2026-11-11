const PRECISAO_ALVO_METROS = 50;
const TEMPO_PRIMEIRA_LEITURA_MS = 10000;
const TEMPO_REFINAMENTO_MS = 8000;

export function obterMelhorLocalizacao({ signal } = {}) {
    return new Promise((resolve, reject) => {
        signal?.throwIfAborted();

        const geolocalizacao = navigator.geolocation;
        let melhorLeitura = null;
        let observacao;
        let temporizador;

        function finalizar(erro) {
            clearTimeout(temporizador);
            geolocalizacao.clearWatch(observacao);
            signal?.removeEventListener("abort", cancelar);

            if (erro) {
                reject(erro);
                return;
            }

            resolve([melhorLeitura.longitude, melhorLeitura.latitude]);
        }

        function cancelar() {
            finalizar(signal.reason);
        }

        observacao = geolocalizacao.watchPosition(
            ({ coords }) => {
                if (!melhorLeitura) {
                    temporizador = setTimeout(finalizar, TEMPO_REFINAMENTO_MS);
                }

                if (!melhorLeitura || coords.accuracy < melhorLeitura.accuracy) {
                    melhorLeitura = coords;
                }

                if (melhorLeitura.accuracy <= PRECISAO_ALVO_METROS) {
                    finalizar();
                }
            },
            (erro) => {
                if (!melhorLeitura || erro.code === 1) {
                    finalizar(erro);
                }
            },
            { enableHighAccuracy: true, timeout: TEMPO_PRIMEIRA_LEITURA_MS, maximumAge: 0 },
        );

        signal?.addEventListener("abort", cancelar, { once: true });
    });
}