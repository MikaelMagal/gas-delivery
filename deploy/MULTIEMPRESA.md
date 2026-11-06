# Empresas, administrador global e recuperação

## Checkpoint antes da mudança

- Commit: `60a01c1` — checkpoint crítico da versão de empresa única.
- Tag: `checkpoint-pre-multiempresa-2026-11-06`.
- O checkpoint e a implementação são locais até você enviá-los ao GitHub. Nenhuma alteração foi aplicada ao banco de produção por esta implementação.
- A tag protege o código. Ela não contém cópia dos dados do banco.

## Modelo de acesso

No painel global, **Salvar e-mail** altera o login de um administrador de loja, mantendo a senha e a empresa. O endereço é normalizado para minúsculas e deve ser exclusivo em toda a plataforma, inclusive entre contas desativadas. Avise o administrador sobre o novo login.

**Remover empresa definitivamente** aparece para empresas desativadas. Exige digitar exatamente o nome e apaga contas, entregas, turnos, localizações e histórico daquela empresa em uma transação. Essa ação não pode ser desfeita sem backup. As outras empresas e a conta global são preservadas. Para apenas suspender o acesso, use a desativação.

- **PLATFORM_ADMIN**: conta global dedicada, criada explicitamente por script. Cadastra empresas e seus administradores, ativa/desativa empresas e administradores e redefine senha de administradores. Para operar entregas e motoboys, escolhe uma empresa no painel global.
- **ADMIN**: pertence a uma única empresa. Opera apenas seus motoboys, entregas, mapas e histórico. Não cria empresas ou outros administradores e não escolhe outra empresa.
- **DRIVER**: pertence a uma única empresa e acessa apenas suas entregas. Seu e-mail é exclusivo na plataforma inteira, inclusive entre papéis. Para trabalhar em outra empresa nesta versão, precisa de uma conta com outro e-mail.

A senha pertence à conta, não ao nome da pessoa. Redefinir a senha de um motoboy não altera outras contas. Administradores de loja não têm endpoints para promover usuários ou mudar a empresa de uma conta.

O administrador global não é identificado por um e-mail fixo no código. O papel vem do banco e é conferido a cada requisição. A migração não promove nenhum usuário existente a global.

## O que acontece com os dados atuais

A migration `20261106090000_companies` cria a **Empresa inicial** e vincula todos os registros existentes a ela. IDs, hashes de senha, atribuições, comprovantes e histórico são preservados. Não usa reset, não apaga tabelas e não muda senhas.

Consultas e escritas operacionais usam um cliente Prisma com escopo obrigatório da empresa, inclusive em transações. O vínculo vem da autenticação verificada no servidor; não de `companyId` enviado pelo navegador. Chaves estrangeiras compostas também impedem vincular um motoboy de outra empresa a uma entrega, turno ou localização. Eventos administrativos usam salas de empresa; eventos de motoboy usam sua conta exclusiva.

O cliente Prisma global é restrito ao código de autenticação, administração da plataforma e verificações de inicialização. Não o use em novas rotas operacionais. Novos endpoints devem usar o cliente com escopo e manter a autorização por papel e por atribuição.

Desativar uma empresa impede o login e as requisições seguintes de seus usuários, além de desconectar suas sessões em tempo real. Desativar ou redefinir senha de um administrador também encerra sua conexão; o acesso é revalidado no servidor.

## Preparação e publicação

1. Antes de publicar, faça backup do banco atual e valide recuperação em banco separado conforme [VALIDACAO.md](VALIDACAO.md). Guarde a versão/commit e o horário do backup. Nenhum backup de produção foi criado automaticamente.
2. Teste esta versão em um serviço e banco separados de produção. Nunca use o banco operacional para testar migrações ou restauração.
3. No fluxo Docker atual, o preparo de inicialização executa `prisma migrate deploy` e o seed. A migration vincula os dados; o seed mantém o administrador existente sem trocar sua senha. `ADMIN_EMAIL`/`ADMIN_PASSWORD` continuam sendo as variáveis do administrador da Empresa inicial, não da conta global.
4. Publique em uma janela de manutenção. Depois de aplicar a migration, confirme login e listagem da Empresa inicial antes de cadastrar outra loja. Confira IDs, entregas abertas, histórico e contagens com o estado anterior.
5. Crie sua conta global pelo procedimento abaixo. Seu e-mail global precisa ser diferente do e-mail do administrador atual da loja.

### Criar a conta global uma única vez

O script não roda automaticamente no deploy e não promove uma conta existente. Use o terminal na raiz do projeto, depois de aplicar as migrations no banco escolhido.

No `.env` local, que deve permanecer fora do Git, configure temporariamente:

```dotenv
PLATFORM_ADMIN_EMAIL="seu-email-global-exclusivo"
PLATFORM_ADMIN_PASSWORD="sua-senha-unica-gerada-com-pelo-menos-12-caracteres"
```

Use valores reais próprios, não os exemplos. Confira que `DATABASE_URL` aponta para o banco que você deseja administrar; o comando a seguir cria uma conta nesse banco:

```powershell
node --env-file=.env scripts/create-platform-admin.cjs
```

A senha deve ter de 12 caracteres a 72 bytes. Ao terminar, remova `PLATFORM_ADMIN_PASSWORD` do arquivo. Não envie essas variáveis ao GitHub, chat ou planilha. Se o e-mail já existir, o script recusa a operação sem alterar a conta existente.

Entre no site com a conta global. Em **Administração da plataforma**, cadastre uma empresa e o primeiro administrador, ou selecione uma empresa existente para adicionar outro administrador. **Acessar operação** abre o painel da empresa escolhida; **Voltar às empresas** retorna ao painel global. Alterar senha, desativar empresa e desativar administrador são ações do painel global.

## Validação com duas empresas

Em ambiente de teste, crie empresas A e B, um administrador e um motoboy em cada. Use perfis de navegador separados.

- Cada administrador deve listar somente seus motoboys e entregas, inclusive relatórios, mapa e histórico.
- Cada motoboy deve listar somente suas entregas. Tentar iniciar/concluir uma entrega da outra empresa deve retornar 404, sem mudar o registro.
- Tentar editar/cancelar/reabrir ou consultar o histórico/rota da entrega de outra empresa como administrador deve retornar 404.
- Tentar remover/redefinir senha do motoboy da outra empresa deve retornar 404.
- Atribuir motoboy da outra empresa deve ser recusado.
- Alterar `companyId` no corpo, query ou token de teste não deve mudar a empresa de uma conta de loja; o vínculo do banco prevalece.
- Atualização em tempo real de A não deve chegar a B.
- `/api/platform/companies` e `/api/platform/access` devem retornar 403 para administradores de loja e motoboys; sem login, endpoints de dados retornam 401.
- Desativar B pelo perfil global deve bloquear B, mantendo A funcionando. Reativar deve permitir novo login.

## Testes técnicos locais

Foram usados PostgreSQL descartável e registros fictícios, sem conexão ao banco de produção. As suítes de integração têm nomes separados para não executar escrita em banco na suíte unitária comum.

```powershell
npm run build
node --test tests/*.test.cjs frontend/tests/*.test.mjs
npm --prefix frontend run build
npm --prefix frontend run lint
```

Para repetir a integração, inicie o container descartável `gas-tenant-validation-20261106`, PostgreSQL 16, banco `tenant_test`, porta **127.0.0.1:55439**, e configure `DATABASE_URL` somente para essa base na sessão do terminal. Aplique as migrations ali e execute:

```powershell
node --test tests/companyMigration.integration.cjs
node --test tests/multiCompany.integration.cjs
```

A primeira suíte cria e remove um banco temporário dentro desse container para simular o upgrade. A segunda recusa qualquer URL fora do banco local designado e remove os registros que ela própria cria. Não use essas suítes como procedimento para migrar produção.

## Recuperação

### Começar do zero por decisão do responsável

Com o serviço sem operações, confira o banco em `DATABASE_URL`, salve o `.env` com `PLATFORM_ADMIN_EMAIL` válido e senha de 12 caracteres a 72 bytes. Execute `node --env-file=.env scripts/check-platform-setup.cjs` para diagnóstico sem valores secretos. Corrija a conexão e aplique as migrations no banco escolhido antes da limpeza.

`node --env-file=.env scripts/reset-platform.cjs` somente mostra contagens. Com `--confirm-delete-all`, apaga todas as empresas, contas, entregas, turnos, localizações e alterações e cria somente a conta global configurada. A operação é transacional, preserva schema/migrations e exige credenciais válidas antes de excluir. Não há recuperação dos dados removidos sem backup. Reinicie o serviço depois para desconectar sessões antigas. O seed atualizado não recria contas iniciais quando já existe conta global; publique essa versão para manter esse comportamento nos próximos deploys.

Antes da migration, é possível voltar ao código da tag em um branch separado. Não use `git reset --hard` para recuperar, pois ele pode descartar trabalho local.

```powershell
git switch -c recuperacao-empresa-unica checkpoint-pre-multiempresa-2026-11-06
```

Depois da migration, voltar somente o código antigo não é um rollback completo. Novas colunas obrigatórias impedem escritas do código antigo, e contas globais não existiam naquela versão. Não remova colunas ou rode migrations reversas improvisadas no banco operacional.

Suspenda escritas, preserve uma cópia do estado atual e restaure o backup anterior em **outro banco**. Publique o código do checkpoint apontando para essa base restaurada. Antes de liberar acesso, confira os dados. Alterações feitas depois do backup precisam ser conciliadas; não são recuperadas pelo Git. Se preferir corrigir a nova versão, mantenha o banco atual e aplique uma correção validada em ambiente separado.

Esta entrega inclui controles e testes de isolamento, não uma certificação de ausência de falhas. A validação visual com duas empresas e o backup/restore reais continuam sendo etapas de liberação do ambiente de produção.
