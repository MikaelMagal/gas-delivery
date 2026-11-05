# API de entregas de gás

Node + Express 5 + Prisma + PostgreSQL + Socket.IO + JWT.

**Estado atual:** acesso web com cookie HttpOnly, confirmação de entrega por localização e configuração de HTTPS. As seções históricas abaixo descrevem a evolução por etapas; a configuração vigente de sessão/publicação está em [deploy/README.md](deploy/README.md). O sistema ainda não foi publicado.

## Rodando

```bash
cp .env.example .env        # ajuste JWT_SECRET e, se quiser rotas, MAPBOX_TOKEN
docker compose up -d        # sobe o Postgres
npm install
npx prisma migrate dev --name init
npm run seed                # cria admin e um motoboy de teste
npm run dev
```

## Endpoints

| Método | Rota | Quem | O que faz |
|---|---|---|---|
| POST | /auth/login | todos | Login, define cookie HttpOnly e retorna usuário público |
| POST | /drivers | ADMIN | Cadastra motoboy |
| GET | /drivers | ADMIN | Lista motoboys + última posição + turno |
| POST | /deliveries | ADMIN | Cria entrega (pode já atribuir) |
| GET | /deliveries | ADMIN | Lista entregas (?driverId=) |
| PATCH | /deliveries/:id | ADMIN | Edita, reatribui, reordena, cancela |
| GET | /deliveries/mine | DRIVER | Minhas paradas |
| POST | /deliveries/:id/start | DRIVER | "Ir para esta parada" |
| POST | /deliveries/:id/complete | DRIVER | Marca entregue (envia lat/lng) |
| POST | /shifts/start, /shifts/end | DRIVER | Inicia/encerra turno |
| POST | /locations | DRIVER | Envia posição (1 ponto ou lote) |
| GET | /locations/:driverId/trail | ADMIN | Trajeto do dia |
| GET | /route | logado | Rota entre dois pontos (Mapbox) |

## Tempo real (Socket.IO)

No navegador, conectar no mesmo domínio com `io()` e cookie de sessão. Integrações existentes com Bearer/JWT válido continuam aceitas; o login web não retorna o token no JSON.

- Admin recebe: `driver:location`, `delivery:updated`, `driver:shift`
- Motoboy recebe: `delivery:assigned`

## Frontend — etapa 1

Com a API em `http://localhost:3333`, execute em outro terminal:

```bash
cd frontend
npm install
npm run dev
```

Abra `http://localhost:5173`. O Vite encaminha `/api` para a API; nenhuma variável com segredo é necessária no frontend. O build estático exige que o ambiente de publicação também encaminhe `/api` para o backend.

O administrador acessa um dashboard responsivo com visão geral, navegação para entregas, indicadores, busca por cliente/endereço/produto/motoboy, filtro por status, detalhes, atualização manual e logout. Os dados vêm de `GET /deliveries`: entregas criadas hoje e pendências anteriores. O total inclui canceladas; os indicadores não representam todo o histórico. A atualização é manual nesta etapa.

A sessão mantém o token na chave `token` já existente e os dados públicos do usuário em `user`, no localStorage. Sessões antigas contendo apenas o token exigem novo login. Respostas 401 encerram a sessão e pedem novo login; respostas 403 mostram erro de permissão. A autorização efetiva continua no backend. Contas DRIVER recebem uma mensagem de painel pendente e podem sair.

Validações executadas na etapa 1:

- Frontend: `npm run build` e `npm run lint`.
- Backend: `npm run typecheck` e `npm run build`.
- Verificação de integração somente leitura contra a API local: contrato da listagem real, 401 sem token/com token inválido e 403 para perfil DRIVER.

Checklist manual para revisão no navegador:

- Entrar como administrador; conferir indicadores e detalhes com os registros da API.
- Pesquisar cliente, endereço, produto e motoboy; combinar com os quatro status.
- Conferir filtros sem resultados e período sem entregas.
- Com a API indisponível, conferir erro e tentar novamente após restaurá-la.
- Recarregar a página para conferir persistência; sair e confirmar remoção da sessão.
- Conferir navegação por teclado, modal (Escape/Fechar) e largura de 375 px.

A revisão visual no navegador permanece pendente. Não há suíte automatizada de interface configurada no projeto. Nenhum PDF de referência foi encontrado no workspace; a identidade laranja do login foi preservada. Backend, migrations, seed e dados não foram alterados nesta etapa.

Na conclusão da etapa 1, as etapas 2 a 8 estavam pendentes: cadastro, gestão de motoboys, painel do motoboy, mapas, confirmação de entrega e revisão completa de segurança/finalização. Cada etapa depende da confirmação do usuário antes de começar.


## Frontend — etapa 2: cadastro de entregas

O botão **Nova entrega**, disponível na visão geral e na listagem, abre um formulário integrado ao `POST /deliveries` existente, exclusivo de ADMIN. Campos obrigatórios: cliente, endereço (mínimo de 5 caracteres), produto, quantidade inteira positiva, latitude (-90 a 90) e longitude (-180 a 180). Telefone e observações são opcionais. O formulário remove espaços nas extremidades e aceita ponto ou vírgula nas coordenadas.

As coordenadas devem ser do endereço de destino; não há geocodificação automática configurada. A função tipada `parseDeliveryDraft`, em `frontend/src/deliveryForm.ts`, centraliza a preparação e validação do payload para uma futura integração. Atribuição de motoboy permanece para a etapa 3.

Após resposta de sucesso da API, o formulário fecha, mostra confirmação, limpa os filtros e consulta novamente a listagem, atualizando também os indicadores. Se essa consulta falhar, use **Tentar novamente**; o cadastro já foi confirmado. Falhas no cadastro preservam os campos. Em falha de conexão, confira a listagem antes de reenviar, pois a API ainda não oferece chave de idempotência para criação.

Validação executada: build e lint do frontend e quatro testes automatizados da preparação do formulário (campos obrigatórios, opcionais, quantidade e coordenadas). Para executar os testes, use Node com suporte nativo a TypeScript (Node 22.18+ ou 24+) e rode `npm test` na pasta `frontend`.

Revisão manual pendente: abrir **Nova entrega**, conferir validações, cadastrar uma entrega real e verificar persistência após recarregar a página, indicadores, detalhes, tratamento de indisponibilidade e layout no celular. O fluxo completo no navegador ainda não foi validado. Não foram criados pedidos de teste no banco nem alterados backend, schema ou migrations. As etapas 3 a 8 aguardam autorização.

## Busca por endereço — melhoria da etapa 2

O formulário agora permite informar o endereço, clicar em **Buscar endereço** e selecionar um resultado. A seleção preenche as coordenadas internamente, preservando o endereço original digitado (inclusive número e complemento). Editar o endereço invalida a seleção anterior. O link **Conferir no mapa** abre a localização no OpenStreetMap. Não há mapa embutido ou ajuste por arraste nesta melhoria; a opção de coordenadas manuais continua disponível.

Ativação:

1. Crie uma conta gratuita em https://myprojects.geoapify.com/ e obtenha a API key de um projeto.
2. Adicione `GEOAPIFY_API_KEY="sua-chave"` ao `.env` do backend. Não use prefixo VITE e não coloque a chave no frontend.
3. Reinicie a API e use **Buscar endereço** no formulário.

Segundo https://www.geoapify.com/pricing/ (consultado em 05/11/2026), o plano Free oferece 3.000 créditos/dia, sem cartão, e permite uso comercial com atribuição. Buscas simples de geocodificação custam um crédito. A aplicação exibe os créditos de Geoapify/OpenStreetMap exigidos. Mantenha a conta no plano gratuito e acompanhe o consumo no provedor: as cotas são compartilhadas com os demais serviços da mesma conta, e os limites do provedor são soft. Não foi contratado plano pago nem criada conta automaticamente.

`GET /geocoding?address=...` exige ADMIN e retorna até cinco resultados no Brasil. A chave fica somente no servidor. A consulta envia apenas o texto do endereço ao Geoapify; não envia nome, telefone, observações ou JWT. Há timeout de 10 segundos, cache em memória de até 500 buscas por 24 horas e limite de uma consulta externa por segundo por processo. Cache e limite não são distribuídos: se escalar para vários servidores, centralize-os. A busca ocorre por clique, sem chamadas a cada tecla. Ausência de chave, indisponibilidade, limite de uso e nenhum resultado têm mensagens próprias; coordenadas manuais continuam funcionando.

Validações: build/typecheck do backend, build/lint do frontend, quatro testes de validação de formulário e teste do endpoint com provedor simulado (autenticação, ADMIN/DRIVER, entrada inválida, chave ausente, resposta, cache, limite e falha externa). Execute `npm run build` e `node --test tests/geocoding.test.cjs` na raiz para repetir o teste de backend. A consulta real ao Geoapify e a revisão no navegador dependem de configurar a chave e permanecem pendentes. Nenhum dado de entrega foi alterado. Etapa 3 ainda não iniciada.

## Etapa 3 — motoboys e atribuição

A navegação **Motoboys** lista os usuários DRIVER ativos, seu turno aberto e a última localização registrada (com data/hora; não representa necessariamente a posição atual). O formulário cadastra nome, e-mail e senha inicial de 6 a 72 caracteres usando `POST /drivers`. Nome/e-mail são normalizados e o backend continua armazenando apenas o hash bcrypt e retornando dados públicos. E-mail duplicado retorna 409. Senhas não são persistidas no navegador e o formulário é limpo após sucesso.

Na lista de entregas, use **Atribuir motoboy** ou **Trocar motoboy**. O modal consulta os motoboys ativos e persiste a escolha com `PATCH /deliveries/:id`. A listagem é consultada novamente após sucesso. Apenas ADMIN pode listar/cadastrar motoboys e atribuir entregas. O backend agora valida que o destinatário é DRIVER ativo tanto ao criar uma entrega já atribuída quanto ao reatribuir. Atribuição/troca é permitida somente com status PENDING: entregas EN_ROUTE, DELIVERED e CANCELED retornam 409. A atualização verifica PENDING no momento da gravação. Não é necessário turno aberto para atribuir, pois o backend existente permite preparar entregas antes de iniciar o turno. Remoção de atribuição, edição/desativação de motoboys e atribuição dentro do formulário de nova entrega não fazem parte desta etapa; use as ações da listagem depois de cadastrar o pedido.

Arquivos da etapa: `frontend/src/DriversPanel.tsx`, `frontend/src/Dashboard.tsx`, `frontend/src/types.ts`, `frontend/src/App.css`, `src/routes/drivers.ts`, `src/routes/deliveries.ts`, `tests/drivers.test.cjs` e este README. Não houve alteração em schema/migrations, instalação de dependências ou modificação de dados reais.

Validações executadas: build/typecheck do backend; build/lint do frontend sem avisos; seis testes aprovados (incluindo os testes anteriores). O teste de motoboys usa persistência simulada para verificar autenticação/autorização, validação do cadastro, hash da senha e ausência de hash na resposta, conflito de e-mail, contrato da listagem, motorista inválido na criação/atribuição, atribuição pendente, bloqueio em outros status e entrega inexistente.

Para repetir:

```bash
npm run build
npm run typecheck
node --test tests/drivers.test.cjs tests/geocoding.test.cjs frontend/tests/deliveryForm.test.mjs
cd frontend
npm run build
npm run lint
```

Revisão manual pendente: entrar como administrador, abrir **Motoboys**, cadastrar um motoboy real, testar e-mail duplicado e atribuir/trocar motoboy em uma entrega pendente; recarregar e conferir persistência. Conferir também estados vazio/erro e apresentação no celular. Os testes automatizados não substituem essa revisão no navegador. Se a API não estiver em modo watch, reinicie-a para carregar as validações novas. A etapa 4 (painel do motoboy) aguarda confirmação.

## Etapa 4 — painel do motoboy e gestão de contas

O login DRIVER agora abre uma interface pensada primeiro para celular com turno atual, progresso, parada em rota e lista ordenada das próprias entregas (cliente, endereço, produto, quantidade, telefone e observações). Os dados incluem entregas criadas hoje e pendências anteriores, conforme a API. Não há dados demonstrativos nem otimização de rotas. Use **Atualizar dados** para receber novas atribuições.

O motoboy pode iniciar turno, iniciar rota, escolher uma parada ou ir para a próxima pendente e encerrar o turno com confirmação. Turno e parada atual persistem no banco e são recuperados após recarregar a página. `GET /shifts/current` retorna o turno aberto ou `null`. Iniciar turno é idempotente; iniciar uma parada exige turno aberto e propriedade da entrega. Ao trocar parada, a anterior volta para PENDING; ao encerrar o turno, as entregas EN_ROUTE voltam para PENDING. Trocar parada não significa entregar. Confirmação de entrega e geolocalização continuam reservadas à etapa 6; mapas e navegação, à etapa 5.

Na seção administrativa **Motoboys**, cada conta tem as ações **Remover** e **Alterar senha**:

- `DELETE /drivers/:id` desativa somente uma conta DRIVER ativa, preservando todo o histórico. Bloqueia com 409 se houver turno aberto ou entregas PENDING/EN_ROUTE. Resolva esses vínculos antes da remoção. A conta desativada sai da listagem e não pode mais fazer login. O e-mail continua reservado pelo histórico; não há reativação nesta interface.
- `PATCH /drivers/:id/password` define nova senha de 6 a 72 caracteres, respeitando também o limite de 72 bytes do bcrypt. O formulário exige confirmação e nunca mostra a senha antiga. O backend retorna 204 sem dados sensíveis. Ambas as ações exigem ADMIN e confirmação explícita no formulário/modal.

A autenticação REST e o handshake Socket.IO agora consultam a conta ativa e validam uma assinatura da credencial no JWT. Alterar senha invalida tokens anteriores e desconecta os sockets do motoboy; remover bloqueia acesso e também desconecta sockets. Nenhum hash de senha é enviado no JWT. **Após atualizar/reiniciar a API, contas já conectadas devem entrar novamente**, pois tokens do formato anterior deixam de ser aceitos. A verificação de conta/credencial usa o banco a cada requisição. Operações de atribuição, remoção e início de parada usam transações e respondem com conflito quando necessário, pedindo nova tentativa.

Não houve alteração do schema, migration, reset do banco ou modificação de contas/entregas reais durante a implementação. Para carregar as mudanças, reinicie a API caso não use watch.

Arquivos criados/alterados nesta etapa: `frontend/src/DriverDashboard.tsx`, `frontend/src/DriverAccountAction.tsx`, `frontend/src/DriversPanel.tsx`, `frontend/src/App.tsx`, `frontend/src/App.css`, `src/auth.ts`, `src/realtime.ts`, `src/routes/auth.ts`, `src/routes/drivers.ts`, `src/routes/shifts.ts`, `src/routes/deliveries.ts`, `src/server.ts`, testes de backend e este README.

Validação: build/typecheck do backend, build/lint do frontend e sete testes aprovados usando banco/serviços simulados. O teste de ciclo do motoboy cobre turno recuperável, início idempotente, propriedade de entrega, troca de parada, encerramento de turno, bloqueio de remoção com vínculos, troca de senha, invalidação de token, login com nova senha e bloqueio após desativação. Com o backend compilado, execute:

```bash
node --test tests/drivers.test.cjs tests/geocoding.test.cjs tests/driverLifecycle.test.cjs frontend/tests/deliveryForm.test.mjs
```

Pendente de revisão manual no navegador: login ADMIN/DRIVER, visualização no celular, persistência de turno/parada ao recarregar, mensagens de erro, redefinição de senha e remoção de uma conta real sem entregas/turno aberto. Nenhum PDF de referência foi encontrado; foi mantida a identidade visual existente. A etapa 5 aguarda autorização.

## Confirmação de entrega e acesso web seguro

O botão **Marcar como entregue** está disponível na parada atual do motoboy com turno ativo. Solicita confirmação e autorização de GPS e envia a localização real ao servidor. Horário/posição/distância são persistidos nos campos existentes; erro de permissão, indisponibilidade, timeout, distância ou API não simula sucesso. A confirmação exige EN_ROUTE e propriedade da entrega e é idempotente. O antigo parâmetro `force: true` não é mais aceito, para impedir bypass do raio pelo cliente.

A sessão web agora usa cookie HttpOnly (Secure em produção, SameSite=Strict), sem JWT em localStorage. Todos devem fazer login novamente após atualizar. O backend oferece `/auth/me`, `/auth/logout`, `/api` e frontend compilado no mesmo domínio em produção, com Helmet, restrição de origem e limite de tentativas. Senhas padrão/contas de teste bloqueiam a inicialização em produção. PostgreSQL local fica limitado a loopback no compose; essa alteração requer recriar o serviço sem apagar os volumes para aplicar.

Arquivos principais desta melhoria: `src/app.ts`, `src/session.ts`, `src/production.ts`, `src/config.ts`, autenticação, realtime, confirmação em deliveries, componentes de frontend, `frontend/src/geolocation.ts`, `deploy/`, script de senha administrativa, seed, compose, manifests/lockfile e testes.

Validação: builds/typecheck, lint, schema Prisma válido e dez testes automatizados cobrindo regras de entrega, GPS, cookies Secure/HttpOnly, HTTPS, origem, bloqueios por perfil, limite de login e regressões. As auditorias npm de backend e frontend não apontaram vulnerabilidades conhecidas. Os testes utilizam persistência/serviços simulados; não alteraram contas ou entregas reais.

Acesso público ainda depende de domínio, hospedagem, HTTPS e credenciais de produção. O roteiro completo e as limitações estão em [deploy/README.md](deploy/README.md). A revisão visual, o GPS real e a operação no celular pelo domínio HTTPS permanecem pendentes. Não foram publicados serviços nem executadas migrations, seed ou alteração de senha em contas reais. A etapa 5 ainda está pendente; confirmação e revisão de segurança foram antecipadas conforme solicitado.

```bash
npm run build
npm run typecheck
node --test tests/*.test.cjs frontend/tests/*.test.mjs
cd frontend
npm run build
npm run lint
```

## Publicação na Railway

O caminho recomendado para testar sem comprar domínio está em [deploy/RAILWAY.md](deploy/RAILWAY.md). Foram preparados Dockerfile, railway.json, pré-deploy com migrations/seed de produção e healthcheck. O domínio/HTTPS são fornecidos pela Railway. Backend e frontend ficam no mesmo serviço, PostgreSQL privado em serviço separado. A aplicação agora aceita TRUST_PROXY=1 e pode derivar a origem permitida de RAILWAY_PUBLIC_DOMAIN. Nenhum serviço foi publicado e nenhum banco foi alterado durante essa preparação.

Para Render + Neon, use [deploy/RENDER.md](deploy/RENDER.md). O Docker Command correto é `node scripts/render-start.cjs`, sem aspas ou operadores de shell. Esse script prepara o banco e inicia o servidor; a configuração Railway continua independente.

## Avanço automático após confirmar entrega

Confirmar a parada atual agora conclui a entrega e inicia automaticamente a próxima PENDING do mesmo motoboy, na mesma transação Serializable. A ordem é sortOrder, createdAt e id (também usada em /deliveries/mine); isso define uma sequência estável, sem prometer otimização por distância. O retorno preserva os campos da entrega confirmada e acrescenta nextDelivery (entrega em rota ou null). Ao repetir uma confirmação já salva, o servidor apenas informa a parada em rota existente: não pula nem inicia uma nova parada. A conclusão da última entrega mantém o turno aberto até o motoboy encerrá-lo explicitamente. Eventos administrativos são emitidos para a entrega concluída e a próxima parada.

Validações: confirmação encadeada de três entregas, escolha pela ordem definida, exclusão das entregas de outro motoboy, reenvio idempotente, ausência de pendências e preservação de turno, além das validações existentes de GPS/perfil/propriedade. A regressão de segurança também verifica 401 nos endpoints de dados, incluindo os aliases sem /api, quando não há sessão. Testes usam persistência simulada; confirmar o fluxo com dois pedidos de teste depois de publicar este commit.

## Segurança: estado verificado e limites

Endpoints precisam ser acessíveis para o aplicativo funcionar; suas URLs e chamadas são visíveis no navegador. A proteção consiste em autenticação e autorização no servidor, não em esconder endereços. As rotas de entregas, motoboys, turnos, localização, geocodificação e rotas exigem sessão; as operações administrativas exigem ADMIN. Consultas e confirmação de entregas pelo motoboy são limitadas ao usuário da sessão, ignorando tentativas de se passar por outro motoboy. Healthcheck e login são públicos por necessidade e não retornam listas de clientes ou senhas.

As consultas atuais usam Prisma e entradas validadas; não foi encontrado uso de SQL bruto interpolado neste recorte. Há cookies HttpOnly/Secure em produção, limite de login, validação da conta ativa, invalidação na troca de senha, origens restritas, HTTPS e cabeçalhos de proteção. Isso reduz riscos e foi exercitado nos testes, mas não comprova ausência de vulnerabilidades. Não houve pentest ou auditoria independente, nem verificação das permissões da conta Neon/Render ou dos backups reais. Logout limpa o cookie, sem lista persistente de revogação de token roubado. Coordenadas enviadas pelo navegador podem ser falsificadas; o raio não é uma prova antifraude absoluta. Rate limits são locais e não impedem todas as tentativas distribuídas.

Pendências do MVP: mapas com marcadores reais, destaque da parada e links Google Maps/Waze (etapa 5); atualização automática do painel administrativo (eventos já existem, UI ainda usa Atualizar); revisão final responsiva e de erros; backup com restauração testada e revisão operacional de contas/segredos/retenção. MFA administrativo e registro persistente de auditoria das ações são melhorias de segurança ainda não implementadas. Não foram iniciadas integrações novas de mapas nesta alteração.

## Edição e reabertura administrativa de entregas

A lista administrativa agora oferece **Editar entrega**, **Reabrir entrega** (quando concluída/cancelada) e **Histórico**. A edição reaproveita o formulário com busca por endereço e coordenadas manuais. Permite corrigir cliente, telefone, endereço/localização, produto, quantidade e observações; campos opcionais podem ser apagados. Não aplica valores padrão aos campos omitidos no PATCH. Alterar endereço exige reconfirmar a localização. Em entrega concluída, endereço e coordenadas ficam protegidos até reabrir, para não alterar o destino associado ao comprovante existente.

`POST /deliveries/:id/reopen` exige ADMIN, motivo de 5 a 500 caracteres e estado finalizado. Volta a PENDING, mantendo o motoboy se ainda ativo ou removendo a atribuição se inativo. A parada atual do motoboy e o turno não são alterados. O comprovante anterior (data/hora, GPS e distância) é arquivado no histórico antes de limpar os campos da entrega reaberta; uma nova confirmação gera um novo comprovante.

As edições e reaberturas são registradas na nova tabela **DeliveryChange**, com usuário administrador, data/hora, motivo da reabertura e snapshots anteriores/posteriores. Mudança e histórico ficam na mesma transação Serializable. `GET /deliveries/:id/history` é exclusivo de ADMIN e lista até as 100 alterações mais recentes com o nome do autor. A interface pede atualização se o registro mudou desde a abertura do formulário (expectedUpdatedAt); gravações concorrentes também são verificadas no backend. PATCH genérico não permite contornar a reabertura nem enviar campos de comprovação ou status DELIVERED.

A migration `20261105220000_delivery_changes` é aditiva: cria tabela, índice e vínculos sem apagar dados existentes. Os históricos começam a partir desta versão, sem reconstrução retroativa. O bootstrap já configurado no Render aplica migrations antes de iniciar; inclua o schema E a pasta da migration no commit. Não foi aplicada nenhuma migration nem alteração em dados reais durante esta implementação. Para desenvolvimento local em um banco próprio, aplique `npx prisma migrate deploy` com DATABASE_URL correta e depois gere o cliente se necessário. Faça backup antes de migrations no ambiente operacional.

Arquivos: `src/routes/deliveries.ts`, schema/migration, `frontend/src/NewDeliveryForm.tsx`, `frontend/src/DeliveryAdminActions.tsx`, `frontend/src/Dashboard.tsx`, `frontend/src/types.ts`, testes e README. Builds do backend/frontend, lint, validação Prisma e 13 testes passaram. Os testes usam persistência simulada e cobrem edição parcial, limpeza de opcionais, bloqueio DRIVER, conflito de atualização, edição de comprovante, motivo obrigatório, preservação do comprovante anterior, reabertura e motoboy inativo. Revisão visual e teste real de migration/edição no ambiente publicado permanecem pendentes.

A listagem mantém o recorte original (criadas hoje e pendências anteriores): entregas antigas concluídas fora desse recorte ainda não têm uma tela de consulta histórica geral. O histórico de alterações está disponível para os registros acessíveis na listagem. Ao reabrir, filtros de busca/status são limpos para mostrar a entrega pendente. Motoboy e administrador devem atualizar seus painéis para visualizar alterações feitas na outra conta.

## Histórico de entregas por período

A aba administrativa **Histórico de entregas** consulta registros antigos por intervalo de datas, status, motoboy e pesquisa (cliente/endereço/produto). Exibe cliente, endereço, quantidade/produto, motoboy, status, data/hora do cadastro e da conclusão. Permite abrir detalhes, editar, reabrir e consultar alterações de entregas antigas. O filtro inicial mostra conclusões do mês corrente. Motoboys inativos continuam disponíveis no filtro para não perder a consulta ao histórico.

`GET /deliveries/report` exige ADMIN e aceita from/to (YYYY-MM-DD), dateBy (createdAt ou deliveredAt), status, driverId, search, page e pageSize. As datas são interpretadas em UTC-03 (horário de Brasília para a operação atual), incluindo todo o último dia via limite superior exclusivo. A apresentação usa America/Sao_Paulo explicitamente. Períodos de até 366 dias por consulta, com paginação de 25 registros por padrão (máximo 100), ordem decrescente de data/id. A consulta é separada da listagem operacional; a visão geral continua mostrando hoje e pendências anteriores.

O nome exibido vem do motoboy vinculado: nas concluídas é o responsável pela entrega vigente, nas demais é a atribuição atual. O horário vem de deliveredAt, registrado no servidor na confirmação. Ao reabrir, a confirmação vigente deixa de existir e a entrega deixa de aparecer por data de conclusão; consulte pela data de cadastro e use Histórico de alterações para ver o comprovante anterior preservado. Não são inventadas datas de conclusão para pendentes/canceladas. Não é um relatório independente de cada tentativa de entrega: correções anteriores permanecem no histórico individual.

Não há nova migration ou alteração de dados nesta melhoria. Arquivos: src/deliveryReport.ts, src/routes/deliveries.ts, frontend/src/DeliveryReport.tsx, frontend/src/Dashboard.tsx, frontend/src/App.css, tests/deliveryReport.test.cjs e README. Builds do backend/frontend, lint e 15 testes passaram. Os testes cobrem datas inválidas, dias completos em UTC-03, limite de período, paginação, motoboy inativo, pesquisa, filtros e bloqueios de autenticação/perfil. Nenhum banco real foi alterado; revisar o layout e a consulta com registros do ambiente publicado após deploy.
