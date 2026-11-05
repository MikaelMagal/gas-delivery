# Railway — primeiro deploy

Use este roteiro para Railway. Não instale Caddy: o HTTPS é fornecido pela plataforma. A aplicação ainda não foi publicada.

1. Crie um repositório privado no GitHub contendo o conteúdo de `gas-delivery-api` na raiz: Dockerfile, railway.json, package.json, src, prisma, frontend e scripts. Não inclua .env, .env.production, senhas, node_modules ou dist. O .gitignore já exclui esses arquivos. Se usar um repositório maior, configure Root Directory para /gas-delivery-api na Railway.
2. Entre em https://railway.com com sua conta. Confira plano/cobrança antes de contratar. Crie um projeto vazio e adicione um serviço PostgreSQL. Comece com uma base nova de teste; não é preciso enviar o banco local.
3. Adicione um serviço de aplicação conectado ao repositório GitHub. A Railway detectará Dockerfile e railway.json. A primeira tentativa pode falhar por falta de variáveis; configure-as antes de tentar novamente.
4. No serviço da aplicação, em Settings → Networking → Public Networking, clique Generate Domain. Use o PORT injetado pela Railway como porta de destino, ou defina PORT=3333 explicitamente e escolha 3333. Não compre domínio nesta etapa. A Railway fornece o endereço HTTPS.
5. Na aba Variables da aplicação configure:

| Variável | Valor |
|---|---|
| NODE_ENV | production |
| HOST | 0.0.0.0 |
| TRUST_PROXY | 1 |
| DATABASE_URL | Referência à DATABASE_URL privada do serviço PostgreSQL (use o seletor de referência da Railway) |
| JWT_SECRET | Valor aleatório forte, exclusivo deste ambiente |
| ADMIN_EMAIL | E-mail que você usará para o primeiro administrador |
| ADMIN_PASSWORD | Senha nova forte, pelo menos 12 caracteres e no máximo 72 bytes |
| GEOAPIFY_API_KEY | Sua chave Geoapify, se quiser busca por endereço |
| DELIVERY_RADIUS_M | 150 (ou o raio que fizer sentido para a operação) |
| APP_ORIGINS | URL HTTPS gerada, sem barra final; ex.: https://seu-servico.up.railway.app |

Não coloque valores em variáveis VITE e não envie segredos no chat ou no GitHub. Gere JWT_SECRET localmente com `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"` e cole somente no painel Variables. Se APP_ORIGINS não estiver definida, o backend usa automaticamente https://RAILWAY_PUBLIC_DOMAIN, quando essa variável existir. Ao mudar domínio, atualize APP_ORIGINS.

6. Faça Deploy/Redeploy. O build compila backend e frontend no mesmo container, sem copiar arquivos .env. A imagem roda como usuário não-root. O pre-deploy `node scripts/railway-prepare.cjs` aplica as migrations existentes e executa o seed de produção, criando o administrador caso não exista. Isso altera somente o banco apontado por DATABASE_URL; confirme que é a base nova de teste antes do deploy. Não há reset ou importação automática de dados locais. Seed não redefine a senha de conta existente.
7. Aguarde o healthcheck `/api/health` e o status Active. O endpoint de readiness retorna apenas `{ok:true}` via HTTP interno para a plataforma; endpoints da aplicação continuam exigindo HTTPS em produção. Não exponha banco com domínio/TCP público. Prefira a referência privada DATABASE_URL.
8. Abra o endereço HTTPS e faça login com ADMIN_EMAIL/ADMIN_PASSWORD. Cadastre um motoboy real de teste e atribua uma entrega. No celular, abra o mesmo endereço, faça login com a conta de motoboy e confira GPS, turno e confirmação. Usar 4G/5G permite confirmar que o acesso não depende do computador.
9. Antes de uso operacional, ative e confira backups do PostgreSQL, monitore consumo e mantenha uma única réplica da aplicação enquanto rate limits/cache forem locais. No teste de GPS, o destino precisa estar correto e dentro do raio configurado. Não marque pedidos reais apenas para testar.

TRUST_PROXY=1 presume acesso público somente pelo edge HTTP/HTTPS da Railway, sem outros proxies na frente. Não publique a porta da aplicação por TCP e não reutilize essa configuração em servidor diretamente exposto. Configuração e cookies devem ser validados no domínio gerado; isso não foi possível sem uma conta/projeto Railway.

Arquivos adicionados: Dockerfile, .dockerignore, railway.json e scripts/railway-prepare.cjs. O build Docker não usa banco. Migrations e seed só ocorrem no pre-deploy quando você publicar. Para validar a imagem localmente: `docker build -t gas-delivery-api:railway-check .`. Não execute o comando de pre-deploy apontando para seu banco local existente por engano.

O pre-deploy precisa das ferramentas Prisma/tsx, por isso a imagem inclui essas dependências. Uma futura imagem menor pode separar as ferramentas de migração. Atualizações do seed não criam motoboys de exemplo em produção. Contas padrão ativas bloqueiam o início; não use o banco local de demonstração como banco público sem revisar as contas.
