import { writeFile } from "node:fs/promises";

const evento = {
    type: "Feature", geometry: { type: "Point", coordinates: [-49.2745, -25.4295] },
    properties: { titulo: "Evento de teste", inicio: "2026-11-20T21:00:00-03:00", local_liberado: false },
};
const item = (name, method, path, status, body, admin = false) => ({
    name, request: { method, header: [
        ...(body === undefined ? [] : [{ key: "Content-Type", value: "application/json" }]),
        ...(admin ? [{ key: "X-UMURA-Admin", value: "{{admin_token}}", type: "text" }] : []),
    ], url: `{{baseUrl}}/${path}`,
    ...(body === undefined ? {} : { body: { mode: "raw", raw: JSON.stringify(body, null, 2), options: { raw: { language: "json" } } } }),
    }, event: [{ listen: "test", script: { type: "text/javascript", exec: [
        `pm.test('HTTP ${status}', () => pm.response.to.have.status(${status}));`,
        "pm.test('Resposta JSON', () => pm.response.json());",
    ] } }],
});
const colecao = {
    info: { name: "UMURA — Backend n8n (persistência pendente)",
        description: "Ajuste baseUrl para sua instância. Antes de executar, importe os workflows. Cadastro válido deve retornar 503 e não grava nada. admin_token é só para teste administrativo, não para frontend.",
        schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
    variable: [{ key: "baseUrl", value: "https://SEU-N8N/webhook/umura" }, { key: "admin_token", value: "" }],
    item: [
        item("Listagem pública (resultado pode estar vazio)", "GET", "eventos", 200),
        item("Busca por nome e data", "GET", "eventos?q=Subsolo&data=2026-11-20", 200),
        item("Consulta em até 3 km", "POST", "eventos/consultar", 200, { origem: [-49.2745, -25.4295] }),
        item("Origem inválida", "POST", "eventos/consultar", 400, { origem: ["-49", "-25"] }),
        item("Filtro de data inválido", "GET", "eventos?data=2026-02-30", 400),
        item("Consulta explícita Photon", "POST", "localizacoes/consultar", 200, { endereco: "Praça Tiradentes, Curitiba" }),
        item("Endereço vazio", "POST", "localizacoes/consultar", 400, { endereco: " " }),
        item("Cadastro válido — NÃO SALVA, persistência pendente", "POST", "eventos", 503, evento, true),
        item("Cadastro inválido", "POST", "eventos", 400, { ...evento, geometry: null }, true),
    ],
};
await writeFile(new URL("../UMURA.postman_collection.json", import.meta.url), JSON.stringify(colecao, null, 2) + "\n");
