import { buscarEnderecos } from "./enderecos.js";
import { carregarEventos, filtrarEventosProximos } from "./eventos.js";
import { obterMelhorLocalizacao } from "./localizacao.js";
import { calcularRota } from "./rotas.js";

const URL_MAPLIBRE =
    "https://unpkg.com/maplibre-gl@6.17.0/dist/maplibre-gl.mjs";

const containerMapa = document.querySelector("#mapa");
const statusMapa = document.querySelector("#status-mapa");
const botaoExplorar = document.querySelector("#explorar-mapa");
const dialogLocalizacao = document.querySelector("#permissao-localizacao");
const botaoUsarLocalizacao = document.querySelector("#usar-localizacao");
const botaoContinuar = document.querySelector("#continuar-sem-localizacao");
const cartaoEvento = document.querySelector("#cartao-evento");
const tituloEvento = document.querySelector("#titulo-evento");
const dataEvento = document.querySelector("#data-evento");
const localEvento = document.querySelector("#local-evento");
const botaoFecharEvento = document.querySelector("#fechar-evento");
const botaoVerRota = document.querySelector("#ver-rota");
const opcoesRota = document.querySelector("#opcoes-rota");
const origemRota = document.querySelector("#origem-rota");
const statusRota = document.querySelector("#status-rota");
const botaoAPe = document.querySelector("#rota-a-pe");
const botaoDeCarro = document.querySelector("#rota-de-carro");
let consultaLocalizacao = null;

const formatoData = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
});

const formatoQuilometros = new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 1,
});

function ajustarVisaoAoCartao(mapa, popup) {
    const limitesMapa = containerMapa.getBoundingClientRect();
    const limitesCartao = popup.getElement().getBoundingClientRect();
    const margem = 12;
    const deslocamentoX =
        Math.min(0, limitesCartao.left - limitesMapa.left - margem) +
        Math.max(0, limitesCartao.right - limitesMapa.right + margem);
    const deslocamentoY =
        Math.min(0, limitesCartao.top - limitesMapa.top - margem) +
        Math.max(0, limitesCartao.bottom - limitesMapa.bottom + margem);

    if (deslocamentoX || deslocamentoY) {
        mapa.panBy([deslocamentoX, deslocamentoY], { duration: 0 });
    }
}

function criarBuscaEndereco() {
    const formulario = document.createElement("form");
    formulario.innerHTML = `
        <p><label for="endereco-origem">De onde você vai sair?</label></p>
        <input id="endereco-origem" name="endereco" type="text"
            placeholder="Rua, número e cidade" aria-describedby="aviso-busca-endereco" required>
        <button type="submit">Buscar endereço</button>
        <p id="aviso-busca-endereco">
            <small>O endereço digitado será enviado ao serviço de busca Photon.</small>
        </p>
        <p role="status" data-status-busca></p>
        <div data-resultados-busca></div>
    `;

    return {
        formulario,
        campo: formulario.querySelector("input"),
        botaoBuscar: formulario.querySelector("button"),
        status: formulario.querySelector("[data-status-busca]"),
        resultados: formulario.querySelector("[data-resultados-busca]"),
    };
}

function criarCartao(mapa, Popup, coordenadas, desenharRota, limparRota) {
    const popup = new Popup({
        anchor: "bottom",
        offset: 20,
        closeButton: false,
        closeOnClick: false,
        focusAfterOpen: false,
        maxWidth: "min(19rem, calc(100vw - 3rem))",
        className: "popup-evento",
    }).setDOMContent(cartaoEvento);

    const busca = criarBuscaEndereco();
    const botaoAlterarOrigem = document.createElement("button");
    botaoAlterarOrigem.type = "button";
    botaoAlterarOrigem.textContent = "Alterar endereço";

    const rodapeMapa = document.createElement("p");
    const creditos = document.createElement("small");
    const fonteRota = document.createElement("a");
    const corrigirMapa = document.createElement("a");
    fonteRota.href = "https://routing.openstreetmap.de/about.html";
    fonteRota.textContent = "OSRM / OpenStreetMap";
    corrigirMapa.href = "https://www.openstreetmap.org/fixthemap";
    corrigirMapa.textContent = "Corrigir o mapa";
    creditos.append("Roteamento por ", fonteRota, " · ", corrigirMapa);
    rodapeMapa.append(creditos);
    containerMapa.parentElement.after(rodapeMapa);

    botaoVerRota.hidden = true;
    tituloEvento.after(busca.formulario, opcoesRota, botaoAlterarOrigem, statusRota);

    let origem = coordenadas ? { coordenadas, rotulo: "sua localização" } : null;
    let editandoOrigem = !origem;
    let eventoSelecionado = null;
    let marcadorSelecionado = null;
    let buscaAtiva = null;
    let rotaAtiva = null;

    function atualizarOrigem() {
        busca.formulario.hidden = !editandoOrigem;
        opcoesRota.hidden = editandoOrigem || !origem;
        botaoAlterarOrigem.hidden = Boolean(coordenadas) || editandoOrigem || !origem;

        if (origem) {
            origemRota.textContent =
                `Saindo de ${origem.rotulo}. Ao escolher um modo, ` +
                "a origem será enviada ao serviço de rotas.";
        }
    }

    function cancelarBusca() {
        buscaAtiva?.abort();
        buscaAtiva = null;
        busca.botaoBuscar.disabled = false;
        busca.status.textContent = "";
        busca.resultados.replaceChildren();
    }

    function definirRotaEmAndamento(emAndamento) {
        botaoAPe.disabled = emAndamento;
        botaoDeCarro.disabled = emAndamento;
    }

    function cancelarRota() {
        rotaAtiva?.abort();
        rotaAtiva = null;
        definirRotaEmAndamento(false);
        statusRota.textContent = "";
        limparRota(mapa);
    }

    busca.formulario.addEventListener("submit", async (evento) => {
        evento.preventDefault();
        if (!eventoSelecionado || buscaAtiva) {
            return;
        }

        const consulta = new AbortController();
        buscaAtiva = consulta;
        busca.botaoBuscar.disabled = true;
        busca.resultados.replaceChildren();
        busca.status.textContent = "Buscando endereço…";

        try {
            const resultados = await buscarEnderecos(busca.campo.value, { signal: consulta.signal });
            if (buscaAtiva !== consulta) {
                return;
            }

            busca.status.textContent = resultados.length
                ? "Selecione o endereço de saída."
                : "Nenhum endereço encontrado. Confira a rua, o número e a cidade.";

            for (const resultado of resultados) {
                const item = document.createElement("p");
                const botao = document.createElement("button");
                botao.type = "button";
                botao.textContent = resultado.rotulo;
                botao.addEventListener("click", () => {
                    origem = resultado;
                    editandoOrigem = false;
                    busca.campo.value = resultado.rotulo;
                    cancelarBusca();
                    atualizarOrigem();
                    ajustarVisaoAoCartao(mapa, popup);
                    botaoAPe.focus();
                });
                item.append(botao);
                busca.resultados.append(item);
            }

            ajustarVisaoAoCartao(mapa, popup);
            busca.resultados.querySelector("button")?.focus();
        } catch (erro) {
            if (buscaAtiva === consulta) {
                busca.status.textContent = erro.message;
            }
        } finally {
            if (buscaAtiva === consulta) {
                buscaAtiva = null;
                busca.botaoBuscar.disabled = false;
            }
        }
    });

    botaoAlterarOrigem.addEventListener("click", () => {
        cancelarRota();
        editandoOrigem = true;
        atualizarOrigem();
        ajustarVisaoAoCartao(mapa, popup);
        busca.campo.focus();
    });

    async function solicitarRota(modo) {
        if (!eventoSelecionado || !origem || editandoOrigem || rotaAtiva) {
            return;
        }

        const consulta = new AbortController();
        rotaAtiva = consulta;
        definirRotaEmAndamento(true);
        limparRota(mapa);
        statusRota.textContent = "Calculando rota…";

        try {
            const resultado = await calcularRota({
                origem: origem.coordenadas,
                destino: eventoSelecionado.geometry.coordinates,
                modo,
                signal: consulta.signal,
            });
            if (rotaAtiva !== consulta) {
                return;
            }

            desenharRota(mapa, resultado.trajeto);

            const metros = resultado.distanciaMetros;
            const distancia = metros < 1000
                ? `${Math.round(metros)} m`
                : `${formatoQuilometros.format(metros / 1000)} km`;
            const segundos = resultado.duracaoSegundos;
            const tempo = segundos < 60
                ? "menos de 1 min"
                : `cerca de ${Math.round(segundos / 60)} min`;
            const transporte = modo === "a-pe" ? "A pé" : "De carro";
            statusRota.textContent = `${transporte} · ${distancia} · ${tempo}`;
        } catch (erro) {
            if (rotaAtiva === consulta) {
                statusRota.textContent = erro.message;
            }
        } finally {
            if (rotaAtiva === consulta) {
                rotaAtiva = null;
                definirRotaEmAndamento(false);
            }
        }
    }

    botaoAPe.addEventListener("click", () => void solicitarRota("a-pe"));
    botaoDeCarro.addEventListener("click", () => void solicitarRota("de-carro"));
    botaoFecharEvento.addEventListener("click", () => popup.remove());
    cartaoEvento.addEventListener("keydown", (tecla) => {
        if (tecla.key === "Escape") {
            popup.remove();
        }
    });

    popup.on("close", () => {
        cancelarBusca();
        cancelarRota();
        cartaoEvento.hidden = true;
        eventoSelecionado = null;
        marcadorSelecionado?.setAttribute("aria-expanded", "false");
        marcadorSelecionado?.focus({ preventScroll: true });
        marcadorSelecionado = null;
    });

    return function abrirCartao(evento, marcador) {
        cancelarBusca();
        cancelarRota();

        const { titulo, inicio, nome_local, endereco } = evento.properties;
        const [longitude, latitude] = evento.geometry.coordinates;
        eventoSelecionado = evento;
        editandoOrigem = !origem;
        tituloEvento.textContent = titulo || "Evento";
        dataEvento.dateTime = inicio;
        dataEvento.textContent = formatoData.format(new Date(inicio));
        localEvento.textContent = [nome_local, endereco].filter(Boolean).join(" · ")
            || "Local sem nome informado";
        corrigirMapa.href = `https://www.openstreetmap.org/edit#map=17/${latitude}/${longitude}`;
        atualizarOrigem();

        marcadorSelecionado?.setAttribute("aria-expanded", "false");
        marcadorSelecionado = marcador;
        marcadorSelecionado.setAttribute("aria-expanded", "true");
        cartaoEvento.hidden = false;
        cartaoEvento.scrollTop = 0;
        popup.setLngLat([longitude, latitude]);

        if (!popup.isOpen()) {
            popup.addTo(mapa);
        }

        ajustarVisaoAoCartao(mapa, popup);
        botaoFecharEvento.focus({ preventScroll: true });
    };
}

function mostrarMarcadores(mapa, Marker, eventos, abrirCartao) {
    for (const evento of eventos) {
        const elemento = document.createElement("div");
        elemento.className = "marcador-evento";
        elemento.setAttribute("role", "button");
        elemento.setAttribute("aria-label", evento.properties.titulo || "Ver evento");
        elemento.setAttribute("aria-controls", "cartao-evento");
        elemento.setAttribute("aria-expanded", "false");
        elemento.tabIndex = 0;

        elemento.addEventListener("click", () => abrirCartao(evento, elemento));
        elemento.addEventListener("keydown", (tecla) => {
            if (tecla.key === "Enter" || tecla.key === " ") {
                tecla.preventDefault();
                abrirCartao(evento, elemento);
            }
        });

        new Marker({ element: elemento, anchor: "center" })
            .setLngLat(evento.geometry.coordinates)
            .addTo(mapa);
    }
}

async function mostrarEventos(mapa, Marker, abrirCartao, coordenadas, visaoInicial, aviso) {
    statusMapa.textContent = "Carregando eventos…";

    try {
        const eventos = await carregarEventos();

        function explorarMapa() {
            mapa.jumpTo(visaoInicial);
            mostrarMarcadores(mapa, Marker, eventos, abrirCartao);
            statusMapa.textContent = eventos.length
                ? `${aviso}Explore o mapa para descobrir eventos.`
                : `${aviso}Nenhum evento disponível no momento.`;
        }

        if (!coordenadas) {
            explorarMapa();
            return;
        }

        const proximos = filtrarEventosProximos(eventos, coordenadas);
        mostrarMarcadores(mapa, Marker, proximos, abrirCartao);

        if (proximos.length === 0) {
            statusMapa.textContent = "Nenhum evento encontrado em até 3 km de você.";
            botaoExplorar.hidden = false;
            botaoExplorar.addEventListener("click", () => {
                explorarMapa();
                botaoExplorar.hidden = true;
                containerMapa.querySelector(".maplibregl-canvas")?.focus();
            }, { once: true });
            return;
        }

        statusMapa.textContent = proximos.length === 1
            ? "1 evento encontrado em até 3 km de você."
            : `${proximos.length} eventos encontrados em até 3 km de você.`;
    } catch (erro) {
        console.error("Erro ao carregar os eventos:", erro);
        statusMapa.textContent = "Não foi possível carregar os eventos.";
    }
}

async function iniciarMapa({ coordenadas = null, aviso = "" } = {}) {
    if (!dialogLocalizacao.open) {
        return;
    }

    dialogLocalizacao.close();
    consultaLocalizacao?.abort();
    statusMapa.textContent = "Preparando o mapa…";

    try {
        const [{ criarMapa, mostrarLocalizacao, desenharRota, limparRota }, { Marker, Popup }] =
            await Promise.all([import("./mapa.js"), import(URL_MAPLIBRE)]);

        const mapa = criarMapa(containerMapa);
        const visaoInicial = {
            center: mapa.getCenter().toArray(),
            zoom: mapa.getZoom(),
        };
        const abrirCartao = criarCartao(mapa, Popup, coordenadas, desenharRota, limparRota);
        let mapaCarregado = false;

        mapa.on("error", ({ error }) => {
            console.error("Erro no mapa:", error);
            if (!mapaCarregado) {
                statusMapa.textContent =
                    "Houve um problema ao carregar o mapa. Tente recarregar a página.";
            }
        });

        mapa.once("load", () => {
            mapaCarregado = true;
            void mostrarEventos(mapa, Marker, abrirCartao, coordenadas, visaoInicial, aviso);
        });

        if (coordenadas) {
            mostrarLocalizacao(mapa, coordenadas);
        }
    } catch (erro) {
        console.error("Erro ao iniciar o mapa:", erro);
        statusMapa.textContent = "Não foi possível iniciar o mapa. Tente recarregar a página.";
    }
}

async function solicitarLocalizacao() {
    if (!window.isSecureContext || !navigator.geolocation) {
        void iniciarMapa({ aviso: "Localização indisponível. " });
        return;
    }

    botaoUsarLocalizacao.disabled = true;
    botaoUsarLocalizacao.textContent = "Buscando sua localização…";

    const consulta = new AbortController();
    consultaLocalizacao = consulta;

    try {
        const coordenadas = await obterMelhorLocalizacao({ signal: consulta.signal });
        void iniciarMapa({ coordenadas });
    } catch {
        if (!consulta.signal.aborted) {
            void iniciarMapa({ aviso: "Não conseguimos obter sua localização. " });
        }
    } finally {
        consultaLocalizacao = null;
    }
}

botaoUsarLocalizacao.addEventListener("click", solicitarLocalizacao);
botaoContinuar.addEventListener("click", () => void iniciarMapa());
dialogLocalizacao.addEventListener("cancel", (evento) => {
    evento.preventDefault();
    void iniciarMapa();
});
dialogLocalizacao.showModal();