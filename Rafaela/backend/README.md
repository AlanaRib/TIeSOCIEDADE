# Backend UMURA — n8n

Implementação inicial das entregas de Rafaela, compatível com o protótipo de
`docs/`. Usa JavaScript, GeoJSON e Photon. Não exige instalar framework no
frontend nem altera o esquema PostgreSQL/PostGIS.

**Estado: consulta e validação implementadas; persistência e implantação pendentes.**
Os JSON são workflows importáveis, ainda não executados em uma instância n8n.
O código dos nodes foi verificado por testes locais com HTTP simulado.

## O que funciona nesta versão

| Método e caminho após `/webhook` | Workflow | Resultado |
| --- | --- | --- |
| `GET /umura/eventos` | `01_LISTA_EVENTOS.json` | Lê o GeoJSON público do repositório, filtra e devolve `FeatureCollection`. |
| `POST /umura/eventos/consultar` | `02_CONSULTA_EVENTOS_3KM.json` | Filtra em até 3000 metros em linha reta a partir da origem recebida. |
| `POST /umura/localizacoes/consultar` | `03_CONSULTA_ENDERECOS_PHOTON.json` | Consulta Photon e retorna até cinco opções de endereço. |
| `POST /umura/eventos` | `04_CADASTRO_PENDENTE_BANCO.json` | **Parcial**: valida a entrada e responde `503 PERSISTENCIA_NAO_CONFIGURADA`. Não grava. |

A fonte atual é
`https://raw.githubusercontent.com/AlanaRib/TIeSOCIEDADE/main/docs/DADOS/eventos.geojson`.
O workflow consulta a versão publicada na `main`, não o arquivo local e nem a
branch deste trabalho. Para testar alterações dos dados em outra branch,
edite somente a URL do node `CONSULTA FONTE`.

O frontend continua funcionando em modo estático enquanto `API_BASE_URL` estiver
vazio. Depois de configurado, a listagem e a busca de endereços usam a API. Uma
falha da API aparece como erro, sem troca silenciosa para os dados locais.
O filtro visual de 3 km e o botão de explorar continuam no navegador; o helper
`consultarEventosNoBackend` oferece a consulta por proximidade para integração
posterior, sem mudar agora a tela ou passar a enviar o GPS automaticamente.

## Configurar no n8n

1. Importe os JSON da pasta `workflows/` como workflows separados. Todos chegam
   inativos. Não ative versões antigas com os mesmos métodos e caminhos.
2. Nos Webhooks, confira `Allowed Origins (CORS)`. O valor fornecido é
   `https://alanarib.github.io`, que é a origem do GitHub Pages, **sem**
   `/TIeSOCIEDADE`. Para Live Server, ajuste temporariamente para sua origem
   local, por exemplo `http://127.0.0.1:5500`. `localhost` é outra origem.
3. No workflow 04, selecione uma credencial Header Auth, por exemplo cabeçalho
   `X-UMURA-Admin`. Ela é apenas para testes administrativos de validação. Não
   coloque o token no frontend ou no repositório. O fluxo não implementa login,
   permissões de produtores nem gravação.
4. Use `Listen for test event` e a URL de teste exibida para validar cada um.
   Com a coleção Postman, ajuste `baseUrl` para
   `https://SEU-N8N/webhook-test/umura` e execute um endpoint por vez enquanto
   o respectivo gatilho estiver escutando.
5. Publique os workflows testados para utilizar
   `https://SEU-N8N/webhook/umura`. Confira HTTPS, timeout e preflight `OPTIONS`
   pelo navegador; CORS não é autenticação nem controle de abuso.
6. Só então preencha `docs/JS/configuracao.js`:

   ```js
   export const API_BASE_URL = "https://SEU-N8N/webhook/umura";
   ```

Não foi presumida nenhuma instância n8n de outro projeto. GitHub Pages continua
hospedando os arquivos estáticos; os workflows executam na instância n8n.

## Contratos

### Eventos

Sem filtros, retorna eventos disponíveis, incluindo futuros, como o protótipo.
Para filtrar, use `?categoria=musica&data=2026-11-20&q=subsolo`. Os três filtros
são opcionais e combinados com AND:

- `categoria`: correspondência integral, ignorando maiúsculas, em `categoria`
  ou no array `categorias`. Eventos sem categoria não passam por esse filtro.
- `data`: dia de **início** do evento em `America/Sao_Paulo`, formato
  `AAAA-MM-DD`. Não significa "qualquer evento em andamento nesse dia".
- `q`: trecho do título ou nome do local, ignorando maiúsculas.

Proximidade usa esses filtros no corpo JSON, com origem obrigatória:

```json
{
  "origem": [-49.2745, -25.4295],
  "data": "2026-11-20"
}
```

A ordem é sempre **longitude, latitude**. O raio não é configurável neste
protótipo: 3000 m com Haversine e raio terrestre 6371008,8 m, seguindo o
módulo atual. A comparação usa a distância sem arredondar; o campo
`distancia_metros` da resposta é arredondado só para exibição. Não representa
distância ou tempo de trajeto OSRM.

```json
{
  "type": "FeatureCollection",
  "features": [],
  "meta": {
    "quantidade": 0,
    "fonte": "geojson-prototipo",
    "raio_metros": 3000,
    "medida": "linha-reta"
  }
}
```

Sem origem, os dois últimos campos de `meta` não são retornados. Resultado
vazio é HTTP 200, não falha. A API preserva a ordem da fonte; não implementa
o ranking atribuído a Maria Carolina.

Eventos sem `local_liberado: true`, sem geometria válida ou encerrados são
excluídos. Quando `fim` está ausente, aplica-se a duração de seis horas já
presente no frontend. Essa regra foi herdada do código e continua sujeita à
validação com Henrich. Não há um filtro automático "acontecendo agora".

A resposta pública é montada com campos permitidos: título, início, fim,
nome do local, endereço divulgado, descrição e categorias. Dados internos
adicionais da fonte não são propagados. Não inclua dados secretos no próprio
arquivo GeoJSON: ele e seu histórico Git são públicos.

### Endereços

```json
{ "endereco": "Praça Tiradentes, Curitiba" }
```

Resposta:

```json
{
  "quantidade": 1,
  "resultados": [
    { "rotulo": "Exemplo de local · Curitiba · Paraná", "coordenadas": [-49.27, -25.43] }
  ]
}
```

As coordenadas acima são ilustrativas, não um resultado certificado do Photon.
A referência lat/lon prioriza Curitiba, mas **não impõe limite municipal**.
Isso mantém o comportamento real de `enderecos.js`; uma restrição municipal
precisa de regra e dados geográficos próprios. Nenhuma opção é selecionada
automaticamente. A busca continua sendo disparada por envio do formulário.

Photon público é um servidor de demonstração, sem garantia de disponibilidade.
Não foi transplantada a regra específica do Nominatim. Evite uso intenso;
configure limite de abuso no proxy antes de abrir o backend a muitos usuários.
O serviço e seus termos estão listados nas referências abaixo.

### Cadastro — contrato provisório, sem gravação

```json
{
  "type": "Feature",
  "geometry": { "type": "Point", "coordinates": [-49.2745, -25.4295] },
  "properties": {
    "titulo": "Novo evento",
    "inicio": "2026-11-20T21:00:00-03:00",
    "nome_local": "Local de teste",
    "local_liberado": false
  }
}
```

Exige título, início com fuso e coordenadas numéricas. Término é opcional,
mas deve ser igual ou posterior ao início. `local_liberado` assume `false`
quando ausente. IDs e campos de produtor fornecidos pelo cliente são
rejeitados; a identidade do produtor deverá vir da autenticação do backend.

**Entrada válida recebe HTTP 503 e `PERSISTENCIA_NAO_CONFIGURADA`. Nenhum
evento foi salvo.** A validação não equivale a criar o evento, aprovar o
produtor ou confirmar que a coordenada está dentro do município de Curitiba.
Este contrato precisa ser mapeado aos campos reais antes de habilitar cadastro.

O esquema SQL não está no repositório analisado. A próxima etapa requer o
DDL vigente ou a descrição dos campos de eventos/produtores e da visão pública,
sem senhas. Com isso, será possível adicionar consultas parametrizadas,
transação de cadastro e autorização sem redesenhar o banco.

### Erros

```json
{ "erro": { "codigo": "ENTRADA_INVALIDA", "mensagem": "Explicação para o usuário." } }
```

| HTTP | Situação |
| --- | --- |
| 400 | Endereço, filtro ou cadastro inválido. |
| 401 | Header Auth ausente/incorreto no endpoint administrativo, gerado pelo n8n. |
| 429 | Provedor recusou por excesso de solicitações; aguarde antes de tentar de novo. |
| 502 | Provedor respondeu, mas o conteúdo é incompatível. |
| 503 | Fonte indisponível, timeout ou persistência ainda não configurada. |

## Rotas e limites da entrega

`docs/JS/rotas.js` permanece com o OSRM/FOSSGIS e os modos `a-pe` e `de-carro`.
Não houve migração de rotas para o n8n nesta versão. O resultado já tem o
formato usado pelo mapa: `trajeto`, `distanciaMetros` e `duracaoSegundos`.

O intervalo atual de um segundo é por página do navegador, não um controle
global da aplicação. A FOSSGIS exige no máximo uma requisição por segundo;
antes de operar com vários usuários, essa parte precisa de um coordenador
central de consultas. Um Wait isolado em cada execução n8n não garante esse
limite entre execuções concorrentes. Não foi adicionado um controle fictício
com staticData nem criadas tabelas auxiliares para isso.

Os workflows desativam o salvamento de execuções manuais, de sucesso e de erro,
mas essa configuração não controla logs do proxy, infraestrutura ou provedores
externos. As consultas de origem são recebidas via POST; a origem não aparece
na URL da UMURA nem é ecoada na resposta. A integração com as regras finais de
privacidade deve ser revisada com Gustavo. Nada aqui constitui homologação LGPD.

## Testar e manter

Requer Node.js 22 ou mais recente somente para gerar os arquivos e executar
testes. Não há dependências npm nem serviço Node adicional para hospedar.
Na raiz do repositório:

```sh
node Rafaela/backend/scripts/gerar-workflows.mjs
node --test Rafaela/backend/testes/*.test.mjs
```

`src/regras.mjs` é a fonte das regras incorporadas aos Code nodes. Após alterá-la,
gere os JSON novamente e rode os testes. O runner local percorre as conexões
dos workflows e executa os Code nodes com HTTP simulado. Também verifica os
módulos do frontend em modo estático e em modo API.

Use `UMURA.postman_collection.json` para o teste real na sua instância. Preencha
`baseUrl` e, somente para os dois testes de cadastro, `admin_token`. Testes
locais não substituem importação, credenciais, CORS/preflight, conectividade
com Photon/GitHub e publicação no n8n.

Checklist da validação integrada ainda pendente:

- Importar/publicar os workflows e testar as URLs permanentes.
- Confirmar respostas vazias, 400, falha do provedor e Header Auth.
- Configurar a URL no frontend e confirmar listagem e busca de endereços.
- Verificar preflight no GitHub Pages e Live Server.
- Conectar PostgreSQL existente e provar gravação/leitura do mesmo evento.
- Centralizar rotas e seu limite global antes de disponibilizar a muitos usuários.
- Registrar a demonstração e o parecer de Henrich para concluir a tarefa 3.2.

## Referências

- [Webhook n8n](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/)
- [HTTP Request n8n](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/)
- [Respond to Webhook](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.respondtowebhook/)
- [Configurações de execução](https://docs.n8n.io/workflows/settings/)
- [Photon e condições do servidor de demonstração](https://github.com/komoot/photon#demo-server)
- [Contrato Photon](https://github.com/komoot/photon/blob/master/docs/api-v1.md)
- [OSRM/FOSSGIS: uso e privacidade](https://routing.openstreetmap.de/about.html)

Base analisada: commit `2b7bbb467e7a3ab2ac570798f8a5adc34f629c9d`.
