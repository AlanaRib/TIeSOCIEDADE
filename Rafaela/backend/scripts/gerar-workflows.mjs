import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const raiz = new URL("../", import.meta.url);
const regras = (await readFile(new URL("src/regras.mjs", raiz), "utf8"))
    .replace(/^export /gm, "");
const origem = "https://alanarib.github.io";
const fonte = "https://raw.githubusercontent.com/AlanaRib/TIeSOCIEDADE/main/docs/DADOS/eventos.geojson";
function id(nome) {
    const hex = createHash("sha256").update(nome).digest("hex");
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
const node = (name, type, typeVersion, parameters, position) => ({
    id: id(name), name, type: `n8n-nodes-base.${type}`, typeVersion, parameters, position,
});
const code = (name, body, position) => node(name, "code", 2, { mode: "runOnceForAllItems", jsCode: `${regras}\n${body}` }, position);
const responder = () => node("RESPONDE API", "respondToWebhook", 1.4, {
    respondWith: "json", responseBody: "={{ $json.response }}", options: {
        responseCode: "={{ $json.httpCode }}", responseHeaders: { entries: [
            { name: "Cache-Control", value: "no-store" },
            { name: "X-Content-Type-Options", value: "nosniff" },
        ] },
    },
}, [1100, 0]);
function link(connections, de, para, index = 0) {
    connections[de] ??= { main: [] };
    connections[de].main[index] = [{ node: para, type: "main", index: 0 }];
}
function criar({ nome, arquivo, metodo, caminho, privado = false, validar, http, normalizar, nota }) {
    const webhook = node("RECEBE REQUISICAO", "webhook", 2, {
        httpMethod: metodo, path: `umura/${caminho}`, responseMode: "responseNode",
        authentication: privado ? "headerAuth" : "none", options: { allowedOrigins: origem },
    }, [0, 0]);
    webhook.webhookId = id(caminho);
    const nodes = [webhook, code("VALIDA ENTRADA", validar, [240, 0])];
    const connections = {};
    link(connections, webhook.name, "VALIDA ENTRADA");
    if (http) {
        nodes.push(node("ENTRADA VALIDA?", "if", 2.2, { conditions: {
            options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
            conditions: [{ id: id(`if-${caminho}`), leftValue: "={{ $json.consultar }}", rightValue: true,
                operator: { type: "boolean", operation: "true", singleValue: true } }], combinator: "and",
        }, options: {} }, [460, 0]));
        const consulta = node("CONSULTA FONTE", "httpRequest", 4.2, {
            url: http.url, ...(http.params ? { sendQuery: true, queryParameters: { parameters: http.params } } : {}),
            sendHeaders: true, headerParameters: { parameters: [
                { name: "Accept", value: "application/json" },
                { name: "User-Agent", value: "UMURA-Prototipo/1.0 (https://github.com/AlanaRib/TIeSOCIEDADE)" },
            ] },
            options: { timeout: 10000, redirect: { redirect: { followRedirects: false } },
                response: { response: { responseFormat: "json", fullResponse: true, neverError: true } } },
        }, [680, -100]);
        consulta.onError = "continueRegularOutput";
        nodes.push(consulta, code("NORMALIZA RESPOSTA", `
const recebido = $input.first().json;
try {
    if (recebido.statusCode === 429) throw new ErroAPI(429, 'LIMITE_DO_PROVEDOR', 'O serviço está ocupado. Aguarde antes de tentar novamente.');
    if (recebido.error || recebido.statusCode !== 200) throw new ErroAPI(503, 'FONTE_INDISPONIVEL', 'Não foi possível consultar o serviço agora.');
    const dados = recebido.body;
    ${normalizar}
} catch (erro) { return [{json: erroResposta(erro)}]; }
`, [900, -100]));
        link(connections, "VALIDA ENTRADA", "ENTRADA VALIDA?");
        link(connections, "ENTRADA VALIDA?", "CONSULTA FONTE", 0);
        link(connections, "ENTRADA VALIDA?", "RESPONDE API", 1);
        link(connections, "CONSULTA FONTE", "NORMALIZA RESPOSTA");
        link(connections, "NORMALIZA RESPOSTA", "RESPONDE API");
    } else {
        link(connections, "VALIDA ENTRADA", "RESPONDE API");
    }
    nodes.push(responder(), node("LEIA ANTES DE ATIVAR", "stickyNote", 1, {
        height: 300, width: 650, content: nota,
    }, [0, -400]));
    return { arquivo, workflow: { name: nome, nodes, connections, active: false, pinData: {},
        settings: { executionOrder: "v1", timezone: "America/Sao_Paulo", executionTimeout: 30,
            saveDataErrorExecution: "none", saveDataSuccessExecution: "none",
            saveManualExecutions: false, saveExecutionProgress: false },
    } };
}

const comum = "## Configuração\nCORS: https://alanarib.github.io (origem, sem caminho do repositório). Para Live Server ajuste ao endereço local durante os testes. Não use o domínio de um n8n de outro projeto por suposição.\nAs execuções não são salvas por este workflow; revise também logs de infraestrutura. Teste a importação e o preflight OPTIONS na sua instância.\n";
const eventos = (proximidade) => criar({
    nome: `UMURA - ${proximidade ? "CONSULTA EVENTOS 3 KM" : "LISTA EVENTOS"}`,
    arquivo: proximidade ? "02_CONSULTA_EVENTOS_3KM.json" : "01_LISTA_EVENTOS.json",
    metodo: proximidade ? "POST" : "GET", caminho: proximidade ? "eventos/consultar" : "eventos",
    validar: `try {
        const filtros = normalizarFiltro($input.first().json.${proximidade ? "body" : "query"} ?? {}, ${proximidade});
        return [{json: {consultar: true, filtros}}];
    } catch (erro) { return [{json: {consultar: false, ...erroResposta(erro)}}]; }`,
    http: { url: fonte },
    normalizar: "const filtro = $('VALIDA ENTRADA').first().json.filtros;\nreturn [{json:{httpCode:200, response:filtrarColecao(dados, filtro)}}];",
    nota: comum + "## Fonte atual\nLê o GeoJSON público do repositório. Não consulta PostgreSQL e não altera tabelas. Preserva a ordem da fonte. Exclui eventos sem local liberado e eventos encerrados (6 h de duração quando fim estiver ausente, seguindo o protótipo). O raio é sempre 3000 m em linha reta. data filtra o dia de início em São Paulo, sem limitar automaticamente a eventos acontecendo agora.",
});
const workflows = [eventos(false), eventos(true), criar({
    nome: "UMURA - CONSULTA ENDERECOS PHOTON", arquivo: "03_CONSULTA_ENDERECOS_PHOTON.json",
    metodo: "POST", caminho: "localizacoes/consultar",
    validar: `try {
        const endereco = validarEndereco($input.first().json.body);
        return [{json:{consultar:true, endereco}}];
    } catch (erro) { return [{json:{consultar:false, ...erroResposta(erro)}}]; }`,
    http: { url: "https://photon.komoot.io/api/", params: [
        { name: "q", value: "={{ $json.endereco }}" }, { name: "limit", value: "5" },
        { name: "lat", value: "-25.4284" }, { name: "lon", value: "-49.2733" },
    ] },
    normalizar: "const resultados = normalizarPhoton(dados);\nreturn [{json:{httpCode:200,response:{resultados,quantidade:resultados.length}}}];",
    nota: comum + "## Photon\nBusca explícita por ação do usuário. Retorna até cinco opções no formato {rotulo, coordenadas}. lat/lon priorizam Curitiba, mas não restringem ao município. Mantém o comportamento do módulo atual. Sem Nominatim e sem cache de endereços pessoais. Uso leve no servidor de demonstração, sem garantia de disponibilidade. Limite abuso no proxy antes de disponibilizar a muitos usuários.",
}), criar({
    nome: "UMURA - CADASTRO PENDENTE DE PERSISTENCIA", arquivo: "04_CADASTRO_PENDENTE_BANCO.json",
    metodo: "POST", caminho: "eventos", privado: true,
    validar: `try {
        const evento = validarCadastro($input.first().json.body);
        // Ponto de integração: inserir a persistência real depois da validação.
        // Nenhum INSERT ou sucesso fictício enquanto o esquema não for fornecido.
        return [{json:{eventoValidado:evento,httpCode:503,response:{erro:{codigo:'PERSISTENCIA_NAO_CONFIGURADA',mensagem:'O cadastro ainda não está integrado ao banco. Nenhum evento foi salvo.'}}}}];
    } catch (erro) { return [{json:erroResposta(erro)}]; }`,
    nota: comum + "## INCOMPLETO: não grava eventos\nSelecione uma credencial Header Auth no Webhook antes de testar. Uso administrativo via Postman/curl: não coloque um segredo fixo no GitHub Pages. Entrada inválida: HTTP 400. Entrada válida: HTTP 503 PERSISTENCIA_NAO_CONFIGURADA. Nunca retorna 201 enquanto não houver gravação confirmada.\nO esquema SQL não está neste repositório. A próxima etapa é ligar o evento validado aos campos existentes e identificar o produtor pela autenticação do servidor. Este workflow não substitui autenticação de usuários/produtores nem autorização por evento.",
})];

await mkdir(new URL("workflows/", raiz), { recursive: true });
for (const {arquivo, workflow} of workflows) {
    await writeFile(new URL(`workflows/${arquivo}`, raiz), JSON.stringify(workflow, null, 2) + "\n");
}
console.log(`Gerados ${workflows.length} workflows em ${fileURLToPath(new URL("workflows/", raiz))}`);
