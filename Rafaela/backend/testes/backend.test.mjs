import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import {
    coordenadasValidas, distanciaMetros, filtrarColecao, normalizarFiltro,
    validarCadastro, validarEndereco, normalizarPhoton, instante,
} from "../src/regras.mjs";

const raiz = new URL("../", import.meta.url);
const agora = Date.parse("2026-11-10T15:00:00Z");
const origem = [-49.2745, -25.4295];
const evento = (overrides = {}) => ({
    type: "Feature", id: "teste-1", geometry: { type: "Point", coordinates: [...origem] },
    properties: { titulo: "Evento de teste", inicio: "2026-11-20T21:00:00-03:00", nome_local: "Local público",
        local_liberado: true, ...overrides },
});
const colecao = (...features) => ({ type: "FeatureCollection", features });
const cadastro = () => { const { id, ...dados } = evento(); return dados; };

test("mantém GeoJSON real do repositório compatível e não modifica a fonte", async () => {
    const dados = JSON.parse(await readFile(new URL("../../docs/DADOS/eventos.geojson", raiz), "utf8"));
    const antes = JSON.stringify(dados);
    const resposta = filtrarColecao(dados, {}, agora);
    assert.equal(resposta.features.length, 4);
    assert.equal(resposta.features[0].id, "demo-01");
    assert.equal(JSON.stringify(dados), antes);
});

for (const [nome, coordenadas, valido] of [
    ["Curitiba", origem, true], ["zero", [0, 0], true], ["limites", [180, 90], true],
    ["longitude", [181, 0], false], ["latitude", [0, 91], false], ["texto", ["-49", -25], false],
    ["nulo", [null, null], false], ["NaN", [NaN, 0], false], ["altura", [-49, -25, 1], false],
]) test(`coordenadas: ${nome}`, () => assert.equal(coordenadasValidas(coordenadas), valido));

test("proximidade inclui 3 km e exclui acima do limite em linha reta", () => {
    const deslocar = metros => [origem[0], origem[1] + metros / 6371008.8 * 180 / Math.PI];
    const dentro = evento(); dentro.geometry.coordinates = deslocar(2999.99);
    const fora = evento(); fora.geometry.coordinates = deslocar(3000.01);
    assert.ok(Math.abs(distanciaMetros(origem, deslocar(3000)) - 3000) < 1e-6);
    const resposta = filtrarColecao(colecao(dentro, fora), { origem }, agora);
    assert.equal(resposta.features.length, 1);
    assert.equal(resposta.meta.raio_metros, 3000);
    assert.equal(resposta.features[0].properties.distancia_metros, 3000);
});

test("coordenadas na origem e no antimeridiano não geram distâncias inválidas", () => {
    assert.equal(distanciaMetros(origem, origem), 0);
    assert.ok(distanciaMetros([179.999, 0], [-179.999, 0]) < 300);
});

test("ocultos, encerrados, geometria inválida e datas inválidas são excluídos", () => {
    const semGeometria = evento(); semGeometria.geometry = null;
    const resposta = filtrarColecao(colecao(
        evento({ local_liberado: false }), evento({ inicio: "2026-01-01T10:00:00Z" }),
        evento({ fim: "inválido" }), evento({ inicio: "2026-02-30T10:00:00Z" }), semGeometria,
    ), {}, agora);
    assert.deepEqual(resposta.features, []);
});

test("término ausente usa seis horas; não altera o comportamento para só agora", () => {
    const atual = evento({ inicio: "2026-11-10T10:00:00-03:00" });
    const anterior = evento({ inicio: "2026-11-10T01:00:00-03:00" });
    assert.equal(filtrarColecao(colecao(atual, anterior, evento()), {}, agora).features.length, 2);
});

test("resposta pública usa allowlist, sem dados privados e sem origem", () => {
    const r = filtrarColecao(colecao(evento({ email_produtor: "privado", senha: "oculta", endereco_secreto: "privado" })), { origem }, agora);
    const serial = JSON.stringify(r);
    assert.ok(!serial.includes("privado") && !serial.includes("oculta") && !serial.includes('"origem"'));
});

test("categoria, data de início em São Paulo e busca por texto combinam", () => {
    const e = evento({ inicio: "2026-11-21T01:00:00Z", categorias: ["Música"], titulo: "Subsolo" });
    const f = normalizarFiltro({ categoria: "MÚSICA", data: "2026-11-20", q: "sub" });
    assert.equal(filtrarColecao(colecao(e), f, agora).features.length, 1);
    assert.equal(filtrarColecao(colecao(e), { categoria: "teatro" }, agora).features.length, 0);
});

test("filtros rejeitam data inexistente, raio extra, query array e origem inválida", () => {
    for (const filtro of [{ data: "2026-02-30" }, { raio: 5000 }, { q: ["x"] }]) {
        assert.throws(() => normalizarFiltro(filtro));
    }
    assert.throws(() => normalizarFiltro({ origem: ["-49", -25] }, true));
    assert.throws(() => normalizarFiltro({}, true));
});

test("não aceita data sem fuso, 24h ou dia inexistente", () => {
    for (const data of ["2026-11-10T10:00:00", "2026-11-10T24:00:00Z", "2026-02-30T10:00:00Z"]) {
        assert.ok(Number.isNaN(instante(data)));
    }
});

test("cadastro válido normaliza título, remove duplicação de categorias e não atribui id", () => {
    const e = cadastro(); e.properties.titulo = "  Um  evento  "; e.properties.categorias = ["Música", "Música"];
    const r = validarCadastro(e);
    assert.equal(r.properties.titulo, "Um evento");
    assert.deepEqual(r.properties.categorias, ["Música"]);
    assert.equal(r.id, undefined);
    delete e.properties.local_liberado;
    assert.equal(validarCadastro(e).properties.local_liberado, false);
});

for (const [nome, mudar] of [
    ["id fornecido", e => { e.id = "injetado"; }],
    ["título curto", e => { e.properties.titulo = "a"; }],
    ["fim anterior", e => { e.properties.fim = "2025-01-01T00:00:00Z"; }],
    ["coordenadas texto", e => { e.geometry.coordinates = ["-49", "-25"]; }],
    ["visibilidade texto", e => { e.properties.local_liberado = "true"; }],
    ["campo interno", e => { e.properties.produtor_id = "outro"; }],
    ["categoria inválida", e => { e.properties.categorias = [null]; }],
]) test(`cadastro rejeita ${nome}`, () => { const e = cadastro(); mudar(e); assert.throws(() => validarCadastro(e)); });

test("Photon normaliza rótulos, limita resultados e rejeita resposta inválida", () => {
    assert.equal(validarEndereco({ endereco: " Rua XV de Novembro " }), "Rua XV de Novembro");
    assert.throws(() => validarEndereco({ endereco: " " }));
    const item = { geometry: { type: "Point", coordinates: origem }, properties: {
        name: "Praça", street: "Rua XV", housenumber: "1", city: "Curitiba", state: "Paraná",
    } };
    const resultados = normalizarPhoton(colecao(...Array(7).fill(item)));
    assert.equal(resultados.length, 5);
    assert.deepEqual(resultados[0].coordenadas, origem);
    assert.match(resultados[0].rotulo, /Curitiba/);
    assert.deepEqual(normalizarPhoton(colecao({ geometry: null })), []);
    assert.throws(() => normalizarPhoton({ error: "falha" }));
});

// Executa os mesmos Code nodes exportados e percorre suas conexões reais.
// HTTP é simulado; não equivale a importar os arquivos na instância do n8n.
async function executar(arquivo, entrada, respostaHTTP) {
    const wf = JSON.parse(await readFile(new URL(`workflows/${arquivo}`, raiz), "utf8"));
    let atual = wf.nodes.find(n => n.type.endsWith(".webhook"));
    let dados = entrada; let chamadas = 0;
    const saidas = new Map();
    for (let passos = 0; passos < 20; passos++) {
        let saida = 0;
        if (atual.type.endsWith(".code")) {
            const fn = new Function("$input", "$", atual.parameters.jsCode);
            dados = fn({ first: () => ({ json: dados }) }, nome => ({ first: () => ({ json: saidas.get(nome) }) }))[0].json;
        } else if (atual.type.endsWith(".httpRequest")) {
            chamadas++;
            dados = respostaHTTP;
        } else if (atual.type.endsWith(".if")) {
            saida = dados.consultar === true ? 0 : 1;
        } else if (atual.type.endsWith(".respondToWebhook")) {
            return { ...dados, chamadas };
        }
        saidas.set(atual.name, dados);
        const proximo = wf.connections[atual.name]?.main[saida]?.[0]?.node;
        atual = wf.nodes.find(n => n.name === proximo);
        assert.ok(atual, `Conexão ausente depois de ${proximo}`);
    }
    throw new Error("Workflow não respondeu");
}

test("workflow de proximidade rejeita entrada sem chamar provedor", async () => {
    const r = await executar("02_CONSULTA_EVENTOS_3KM.json", { body: { origem: null } });
    assert.equal(r.httpCode, 400); assert.equal(r.chamadas, 0);
});

test("workflow GET devolve coleção e remove ocultos antes da resposta pública", async () => {
    const futuro = evento({ inicio: "2099-11-20T21:00:00-03:00" });
    const r = await executar("01_LISTA_EVENTOS.json", { query: {} }, { statusCode: 200,
        body: colecao(futuro, evento({ local_liberado: false })) });
    assert.equal(r.httpCode, 200); assert.equal(r.response.features.length, 1); assert.equal(r.chamadas, 1);
});

for (const [nome, http, esperado] of [
    ["limite", { statusCode: 429 }, 429], ["indisponível", { statusCode: 500 }, 503],
    ["timeout", { error: { message: "timeout" } }, 503],
    ["payload inválido", { statusCode: 200, body: {} }, 502],
]) test(`workflow trata ${nome}`, async () => {
    const r = await executar("03_CONSULTA_ENDERECOS_PHOTON.json", { body: { endereco: "Praça Tiradentes" } }, http);
    assert.equal(r.httpCode, esperado); assert.ok(r.response.erro.mensagem);
});

test("workflow Photon distingue lista vazia de falha", async () => {
    const r = await executar("03_CONSULTA_ENDERECOS_PHOTON.json", { body: { endereco: "inexistente" } }, { statusCode: 200, body: colecao() });
    assert.equal(r.httpCode, 200); assert.deepEqual(r.response.resultados, []);
});

test("cadastro jamais responde sucesso sem persistir", async () => {
    const r = await executar("04_CADASTRO_PENDENTE_BANCO.json", { body: cadastro() });
    assert.equal(r.httpCode, 503); assert.equal(r.response.erro.codigo, "PERSISTENCIA_NAO_CONFIGURADA");
    assert.equal(r.chamadas, 0);
});

test("workflows têm caminhos únicos, conexões existentes e gravação de execuções desativada", async () => {
    const caminhos = new Set();
    for (const arquivo of await readdir(new URL("workflows/", raiz))) {
        const wf = JSON.parse(await readFile(new URL(`workflows/${arquivo}`, raiz), "utf8"));
        assert.equal(wf.active, false);
        assert.equal(wf.settings.saveDataErrorExecution, "none");
        assert.equal(wf.settings.saveDataSuccessExecution, "none");
        assert.equal(wf.settings.saveManualExecutions, false);
        const nomes = new Set(wf.nodes.map(n => n.name));
        for (const [de, conexao] of Object.entries(wf.connections)) {
            assert.ok(nomes.has(de));
            for (const ramo of conexao.main) for (const n of ramo || []) assert.ok(nomes.has(n.node));
        }
        const w = wf.nodes.find(n => n.type.endsWith(".webhook"));
        const chave = `${w.parameters.httpMethod} ${w.parameters.path}`;
        assert.ok(!caminhos.has(chave)); caminhos.add(chave);
        assert.equal(w.parameters.responseMode, "responseNode");
        assert.equal(w.parameters.options.allowedOrigins, "https://alanarib.github.io");
        if (arquivo.startsWith("04")) assert.equal(w.parameters.authentication, "headerAuth");
    }
});
