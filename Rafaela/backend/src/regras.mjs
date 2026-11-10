// Compartilhado pelos testes e pelo código incorporado aos workflows n8n.
export const RAIO_METROS = 3000;
const DURACAO_PADRAO_MS = 6 * 60 * 60 * 1000;

export class ErroAPI extends Error {
    constructor(httpCode, codigo, message) {
        super(message);
        this.httpCode = httpCode;
        this.codigo = codigo;
    }
}

export function falhar(message) {
    throw new ErroAPI(400, "ENTRADA_INVALIDA", message);
}

export function objeto(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function texto(value, campo, min = 1, max = 250) {
    if (typeof value !== "string" || /[\u0000-\u001f\u007f]/.test(value)) {
        falhar(`O campo ${campo} deve ser um texto válido.`);
    }
    const normalizado = value.normalize("NFC").trim().replace(/\s+/g, " ");
    if (normalizado.length < min || normalizado.length > max) {
        falhar(`O campo ${campo} deve ter entre ${min} e ${max} caracteres.`);
    }
    return normalizado;
}

export function coordenadasValidas(value) {
    return Array.isArray(value) && value.length === 2
        && value.every(Number.isFinite)
        && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90;
}

export function diaValido(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const data = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(data.getTime()) && data.toISOString().slice(0, 10) === value;
}

export function instante(value) {
    if (typeof value !== "string") return NaN;
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
    if (!m || !diaValido(m[1]) || +m[2] > 23 || +m[3] > 59 || +m[4] > 59) return NaN;
    return Date.parse(value);
}

export function normalizarFiltro(entrada = {}, proximidade = false) {
    if (!objeto(entrada)) falhar("Envie um objeto com os filtros.");
    const permitidos = ["categoria", "data", "q", ...(proximidade ? ["origem"] : [])];
    if (Object.keys(entrada).some(k => !permitidos.includes(k))) {
        falhar("Filtro desconhecido. Use categoria, data, q e, na consulta por proximidade, origem.");
    }
    const filtro = {};
    for (const campo of ["categoria", "q"]) {
        if (entrada[campo] !== undefined) filtro[campo] = texto(entrada[campo], campo).toLocaleLowerCase("pt-BR");
    }
    if (entrada.data !== undefined) {
        if (!diaValido(entrada.data)) falhar("Use uma data válida no formato AAAA-MM-DD.");
        filtro.data = entrada.data;
    }
    if (proximidade) {
        if (!coordenadasValidas(entrada.origem)) falhar("Informe origem como [longitude, latitude], com números válidos.");
        filtro.origem = entrada.origem;
    }
    return filtro;
}

export function distanciaMetros(origem, destino) {
    const rad = Math.PI / 180;
    const a = Math.sin((destino[1] - origem[1]) * rad / 2) ** 2
        + Math.cos(origem[1] * rad) * Math.cos(destino[1] * rad)
        * Math.sin((destino[0] - origem[0]) * rad / 2) ** 2;
    return 2 * 6371008.8 * Math.asin(Math.sqrt(Math.min(1, a)));
}

export function eventoPublico(evento, agora) {
    const p = evento?.properties;
    if (evento?.type !== "Feature" || !objeto(p) || p.local_liberado !== true
        || evento.geometry?.type !== "Point" || !coordenadasValidas(evento.geometry.coordinates)) return null;
    const inicio = instante(p.inicio);
    const fim = p.fim == null ? inicio + DURACAO_PADRAO_MS : instante(p.fim);
    if (!Number.isFinite(inicio) || !Number.isFinite(fim) || fim < inicio || fim < agora) return null;
    if (typeof p.titulo !== "string" || !p.titulo.trim()) return null;
    const properties = { titulo: p.titulo, inicio: p.inicio, local_liberado: true };
    for (const campo of ["fim", "nome_local", "endereco", "descricao", "categoria"]) {
        if (typeof p[campo] === "string") properties[campo] = p[campo];
    }
    if (Array.isArray(p.categorias)) properties.categorias = p.categorias.filter(c => typeof c === "string");
    const saida = { type: "Feature", geometry: { type: "Point", coordinates: [...evento.geometry.coordinates] }, properties };
    if (["string", "number"].includes(typeof evento.id)) saida.id = evento.id;
    return saida;
}

const formatoDia = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
});

export function filtrarColecao(colecao, filtro, agora = Date.now()) {
    if (colecao?.type !== "FeatureCollection" || !Array.isArray(colecao.features)) {
        throw new ErroAPI(502, "FONTE_INVALIDA", "A fonte de eventos retornou um GeoJSON inválido.");
    }
    const features = [];
    for (const bruto of colecao.features) {
        const evento = eventoPublico(bruto, agora);
        if (!evento) continue;
        const p = evento.properties;
        if (filtro.categoria && ![p.categoria, ...(p.categorias || [])]
            .some(c => typeof c === "string" && c.toLocaleLowerCase("pt-BR") === filtro.categoria)) continue;
        if (filtro.data && formatoDia.format(new Date(p.inicio)) !== filtro.data) continue;
        if (filtro.q && ![p.titulo, p.nome_local].some(s => typeof s === "string"
            && s.toLocaleLowerCase("pt-BR").includes(filtro.q))) continue;
        if (filtro.origem) {
            const distancia = distanciaMetros(filtro.origem, evento.geometry.coordinates);
            if (distancia > RAIO_METROS) continue;
            evento.properties.distancia_metros = Math.round(distancia);
        }
        features.push(evento);
    }
    // Preserva a ordem da fonte. O ranking pertence à outra entrega.
    return { type: "FeatureCollection", features, meta: {
        quantidade: features.length, fonte: "geojson-prototipo",
        ...(filtro.origem ? { raio_metros: RAIO_METROS, medida: "linha-reta" } : {}),
    } };
}

export function validarCadastro(entrada) {
    if (!objeto(entrada) || entrada.type !== "Feature" || !objeto(entrada.properties)) {
        falhar("Envie um evento GeoJSON do tipo Feature.");
    }
    if (Object.keys(entrada).some(k => !["type", "geometry", "properties"].includes(k))) {
        falhar("Use somente type, geometry e properties; o identificador será atribuído pelo backend.");
    }
    if (entrada.geometry?.type !== "Point" || !coordenadasValidas(entrada.geometry.coordinates)) {
        falhar("A geometria deve ser Point, com coordinates [longitude, latitude].");
    }
    const p = entrada.properties;
    const permitidos = ["titulo", "inicio", "fim", "nome_local", "endereco", "descricao", "categoria", "categorias", "local_liberado"];
    if (Object.keys(p).some(k => !permitidos.includes(k))) falhar("Há campos de evento ainda não previstos no contrato.");
    const titulo = texto(p.titulo, "titulo", 3, 160);
    if (!Number.isFinite(instante(p.inicio))) falhar("Informe inicio em ISO 8601, incluindo o fuso horário.");
    if (p.fim != null && (!Number.isFinite(instante(p.fim)) || instante(p.fim) < instante(p.inicio))) {
        falhar("O fim deve ser uma data válida e igual ou posterior ao início.");
    }
    if (p.local_liberado !== undefined && typeof p.local_liberado !== "boolean") falhar("local_liberado deve ser booleano.");
    const properties = { titulo, inicio: p.inicio, local_liberado: p.local_liberado ?? false };
    if (p.fim != null) properties.fim = p.fim;
    for (const campo of ["nome_local", "endereco", "descricao", "categoria"]) {
        if (p[campo] !== undefined) properties[campo] = texto(p[campo], campo, 1, campo === "descricao" ? 4000 : 250);
    }
    if (p.categorias !== undefined) {
        if (!Array.isArray(p.categorias) || p.categorias.length > 10) falhar("Envie até dez categorias.");
        properties.categorias = [...new Set(p.categorias.map(c => texto(c, "categorias", 1, 80)))];
    }
    return { type: "Feature", geometry: { type: "Point", coordinates: [...entrada.geometry.coordinates] }, properties };
}

export function validarEndereco(body) {
    if (!objeto(body)) falhar("Envie um objeto JSON com endereco.");
    return texto(body.endereco, "endereco", 3, 250);
}

export function normalizarPhoton(dados) {
    if (dados?.type !== "FeatureCollection" || !Array.isArray(dados.features)) {
        throw new ErroAPI(502, "PROVEDOR_INVALIDO", "O serviço retornou uma resposta de endereço inválida.");
    }
    return dados.features.slice(0, 5).flatMap(item => {
        if (item?.geometry?.type !== "Point" || !coordenadasValidas(item.geometry.coordinates)) return [];
        const p = item.properties ?? {};
        const rua = p.street || p.name;
        const logradouro = rua && p.housenumber ? `${rua}, ${p.housenumber}` : rua;
        const partes = [p.name, logradouro, p.district || p.locality, p.city || p.county, p.state]
            .filter(s => typeof s === "string" && s.trim());
        const rotulo = [...new Set(partes)].join(" · ");
        return rotulo ? [{ rotulo, coordenadas: [...item.geometry.coordinates] }] : [];
    });
}

export function erroResposta(erro) {
    return { httpCode: erro instanceof ErroAPI ? erro.httpCode : 503, response: {
        erro: { codigo: erro instanceof ErroAPI ? erro.codigo : "SERVICO_INDISPONIVEL",
            mensagem: erro instanceof ErroAPI ? erro.message : "O serviço está temporariamente indisponível." },
    } };
}
