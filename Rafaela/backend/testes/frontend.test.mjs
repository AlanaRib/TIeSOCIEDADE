import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

async function modulos(t, base) {
    const pasta = await mkdtemp(join(tmpdir(), "umura-test-"));
    t.after(() => rm(pasta, { recursive: true, force: true }));
    await writeFile(join(pasta, "package.json"), '{"type":"module"}');
    await writeFile(join(pasta, "configuracao.js"), `export const API_BASE_URL = ${JSON.stringify(base)};`);
    for (const nome of ["api.js", "eventos.js", "enderecos.js"]) {
        const fonte = await readFile(new URL(`../../../docs/JS/${nome}`, import.meta.url), "utf8");
        await writeFile(join(pasta, nome), fonte);
    }
    return nome => import(pathToFileURL(join(pasta, nome)));
}

test("configuração vazia mantém carregamento do GeoJSON e Photon diretos", async t => {
    const importar = await modulos(t, "");
    const urls = [];
    t.mock.method(globalThis, "fetch", async url => {
        urls.push(String(url));
        return new Response(JSON.stringify({ type: "FeatureCollection", features: [] }));
    });
    await (await importar("eventos.js")).carregarEventos();
    await (await importar("enderecos.js")).buscarEnderecos("Praça Tiradentes");
    assert.match(urls[0], /DADOS\/eventos\.geojson$/);
    assert.match(urls[1], /^https:\/\/photon.komoot.io\/api\//);
});

test("API configurada recebe eventos e endereços no formato esperado pelo app", async t => {
    const importar = await modulos(t, "https://umura.example/webhook/umura/");
    const chamadas = [];
    t.mock.method(globalThis, "fetch", async (url, opcoes) => {
        chamadas.push({ url, opcoes });
        return new Response(JSON.stringify(url.endsWith("eventos")
            ? { type: "FeatureCollection", features: [] }
            : { resultados: [{ rotulo: "Praça", coordenadas: [-49, -25] }] }));
    });
    assert.deepEqual(await (await importar("eventos.js")).carregarEventos(), []);
    const r = await (await importar("enderecos.js")).buscarEnderecos("Praça");
    assert.equal(r[0].rotulo, "Praça");
    assert.equal(chamadas[0].url, "https://umura.example/webhook/umura/eventos");
    assert.equal(chamadas[1].opcoes.method, "POST");
    assert.deepEqual(JSON.parse(chamadas[1].opcoes.body), { endereco: "Praça" });
});

test("erro do backend é visível e não dispara fallback silencioso", async t => {
    const importar = await modulos(t, "https://umura.example/webhook/umura");
    let chamadas = 0;
    t.mock.method(globalThis, "fetch", async () => {
        chamadas++;
        return new Response(JSON.stringify({ erro: { mensagem: "Serviço indisponível" } }), { status: 503 });
    });
    await assert.rejects((await importar("eventos.js")).carregarEventos(), /Serviço indisponível/);
    assert.equal(chamadas, 1);
});

test("cancelamento do usuário é propagado", async t => {
    const importar = await modulos(t, "https://umura.example/webhook/umura");
    const controle = new AbortController(); controle.abort();
    t.mock.method(globalThis, "fetch", async (_, opcoes) => { opcoes.signal.throwIfAborted(); });
    await assert.rejects((await importar("api.js")).consultarAPI("eventos", { signal: controle.signal }), { name: "AbortError" });
});

test("helper de proximidade envia coordenadas somente quando chamado", async t => {
    const importar = await modulos(t, "https://umura.example/webhook/umura");
    t.mock.method(globalThis, "fetch", async (url, opcoes) => {
        assert.ok(url.endsWith("eventos/consultar"));
        assert.deepEqual(JSON.parse(opcoes.body), { origem: [-49, -25], categoria: "música" });
        return new Response(JSON.stringify({ type: "FeatureCollection", features: [] }));
    });
    const r = await (await importar("eventos.js")).consultarEventosNoBackend({ origem: [-49, -25], categoria: "música" });
    assert.deepEqual(r.features, []);
});
