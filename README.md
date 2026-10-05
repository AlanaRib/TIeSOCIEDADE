# TIeSOCIEDADE
Repositório criado para compartilhamento de arquivos referentes ao projeto de TI e Sociedade, da Universidade Positivo.
Aqui está o plano de produção das tarefas do projeto, estruturado com foco na arquitetura técnica, backend e conformidade do sistema de geolocalização de eventos locais.

# PANEJAMENTO DE ATIVIDADES

O planejamento conta com duas tarefas completas por integrante (sendo uma de execução técnica/estratégica e uma de validação direta com o parceiro), garantindo que cada tarefa tenha um entregável claro, uso exclusivo de verbos no infinitivo e atribuição individual.

## Tarefa 1.1 — Escolha da Biblioteca de Rendilhar Mapas Frontend

* **Titulo:** Mapear e selecionar a biblioteca de mapas interativos de custo zero.
* **Descrição:** Pesquisar e comparar o desempenho das bibliotecas de código aberto *Leaflet.js* e *MapLibre GL*, analisando suporte a marcadores estilizados, rendimento em dispositivos móveis e ausência de cobranças por consumo de requisições, com o intuito de definir a tecnologia ideal para a interface do mapa interativo.
* **Entregável:** Relatório técnico comparativo com a indicação da biblioteca frontend escolhida.
* **Responsável:** Alana Ribeiro
* **Prazo de conclusão:** 2ª sem/outubro

## Tarefa 1.2 — Validação de Interface do Mapa com o Parceiro Henrich

* **Titulo:** Validar a camada de renderização do mapa e marcadores com o parceiro Henrich.
* **Descrição:** Apresentar em reunião de alinhamento os protótipos de marcadores gráficos e o comportamento do mapa interativo utilizando a biblioteca selecionada, coletando o feedback do parceiro Henrich sobre a fluidez visual e usabilidade para assegurar alinhamento com a identidade do aplicativo.
* **Entregável:** Ata de validação visual e lista de ajustes aprovada por Henrich.
* **Responsável:** Alana Ribeiro
* **Prazo de conclusão:** 1ª sem/novembro

## Tarefa 2.1 — Modelagem do Banco de Dados Relacional Espacial

* **Titulo:** Estruturar o modelo relacional do banco de dados no PostgreSQL com extensão PostGIS.
* **Descrição:** Modelar e implementar as tabelas do banco de dados relacional para armazenar eventos, produtores locais e usuários, incorporando campos de coordenadas geográficas (latitude e longitude) via PostGIS, com o intuito de viabilizar consultas espaciais de alta performance e sem custos de hospedagem.
* **Entregável:** Script SQL de criação do banco e Diagrama Entidade-Relacionamento (DER).
* **Responsável:** Maria Carolina
* **Prazo de conclusão:** 2ª sem/outubro

## Tarefa 2.2 — Validação do Fluxo de Cadastro de Produtores com Henrich

* **Titulo:** Validar os campos e o fluxo do cadastro de produtores de eventos com o parceiro Henrich.
* **Descrição:** Apresentar a estrutura de dados e os campos solicitados no cadastro de produtores independentes ao parceiro Henrich, verificando se as informações mapeadas cobrem as necessidades dos organizadores de eventos *underground* sem gerar burocracia ou fricção no preenchimento.
* **Entregável:** Documento de especificação de campos de cadastro validado e assinado por Henrich.
* **Responsável:** Maria Carolina
* **Prazo de conclusão:** 1ª sem/novembro

## Tarefa 3.1 — Integração de Serviços de Geocodificação e Rotas

* **Titulo:** Configurar e testar a API de geocodificação e cálculo de rotas gratuitas.
* **Descrição:** Integrar e testar os serviços *Nominatim* (para conversão de endereços em coordenadas) e *OSRM / OpenRouteService* (para cálculo de distância e rotas até o evento), com o intuito de disponibilizar a funcionalidade de estimativa de percurso aos usuários dentro do limite de requisições gratuitas.
* **Entregável:** Módulo de código backend para consulta de coordenadas e cálculo de rotas testado.
* **Responsável:** Rafaela Joaquim
* **Prazo de conclusão:** 2ª sem/outubro

## Tarefa 3.2 — Validação das Regras de Busca por Proximidade com Henrich

* **Titulo:** Validar as regras de raio de busca e proximidade geográfica com o parceiro Henrich.
* **Descrição:** Demonstrar em reunião com o parceiro Henrich a lógica de filtragem de eventos por raio de distância (ex: 2 km, 5 km, 10 km) e a listagem em torno de locais favoritados (como faculdade ou trabalho), alinhando se a relevância dos eventos exibidos corresponde ao objetivo de descoberta local do aplicativo.
* **Entregável:** Relatório de testes de filtragem por raio validado e aprovado em reunião por Henrich.
* **Responsável:** Rafaela Joaquim
* **Prazo de conclusão:** 1ª sem/novembro

## Tarefa 4.1 — Elaboração de Diretrizes de Privacidade e LGPD

* **Titulo:** Elaborar a política de privacidade e os termos de consentimento para geolocalização segundo a LGPD.
* **Descrição:** Desenvolver as diretrizes de proteção de dados pessoais e de localização em tempo real, estabelecendo o processamento temporário de coordenadas em memória (sem armazenamento contínuo de histórico de navegação), com o intuito de mitigar riscos jurídicos e garantir conformidade com a LGPD.
* **Entregável:** Minuta da Política de Privacidade e Termos de Consentimento de Geolocalização.
* **Responsável:** Gustavo de Souza
* **Prazo de conclusão:** 2ª sem/outubro

## Tarefa 4.2 — Validação de Conformidade Jurídica com Henrich

* **Titulo:** Validar os termos de consentimento e avisos de privacidade com o parceiro Henrich.
* **Descrição:** Revisar a minuta do termo de consentimento de geolocalização e os avisos de privacidade com o parceiro Henrich, simplificando a linguagem jurídica para torná-la transparente e amigável aos usuários, garantindo que o aplicativo passe segurança no tratamento de dados sensíveis.
* **Entregável:** Termo de Privacidade final homologado por Henrich para integração no sistema.
* **Responsável:** Gustavo de Souza
* **Prazo de conclusão:** 1ª sem/novembro