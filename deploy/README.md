# Publicação com HTTPS e acesso pelo celular

O motoboy usa o navegador do próprio celular (Chrome/Safari atualizados), no endereço HTTPS público, com sua conta individual. Não há instalação de app nativo. O computador local e o Vite não são a hospedagem de produção. Para acesso fora da rede é necessário um servidor online, domínio apontando para ele e HTTPS. A aplicação ainda não foi publicada.

## Arquitetura preparada

Celular → HTTPS/Caddy (portas públicas 80/443) → API Express em 127.0.0.1:3333 → PostgreSQL privado.

Em NODE_ENV=production, o Express serve o frontend compilado e `/api` no mesmo domínio. O proxy `/api` do Vite só é usado no desenvolvimento. O Caddyfile deste diretório provisiona HTTPS quando domínio, DNS e portas estiverem corretos. A configuração presume Caddy e Node no mesmo host; não copie TRUST_PROXY=loopback para outra topologia sem revisar os proxies confiáveis. Mantenha 3333 e o banco inacessíveis da internet.

## Preparação no servidor

1. Instale Node 24 LTS, PostgreSQL e Caddy. Configure o domínio com DNS apontando para o servidor. Certificados do Caddy exigem domínio resolvendo e portas 80/443 disponíveis. Hospedagem/domínio podem ter custo.
2. Instale dependências com `npm ci` na raiz e no frontend. Copie `env.production.example` para `.env.production` na raiz (arquivo não versionado), substitua TODOS os valores e configure credenciais reais para o PostgreSQL. Não copie o `.env` ou as credenciais do ambiente de teste para o servidor público.
3. Gere JWT_SECRET aleatório de pelo menos 32 caracteres. Uma opção é `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"`. APP_ORIGINS deve ser a origem exata HTTPS, sem barra final. O mesmo domínio deve ser usado para frontend e API.
4. Antes de apontar para dados reais, faça backup. Aplique somente migrations existentes com `npx prisma migrate deploy` e DATABASE_URL fornecida pelo ambiente do servidor. Nunca use migrate reset. Esta implementação não adiciona migrations.
5. Para uma base nova, execute o seed com NODE_ENV=production, ADMIN_EMAIL e ADMIN_PASSWORD fortes no ambiente. Em produção ele não cria o motoboy de teste e exige senha administrativa de pelo menos 12 caracteres. O seed não altera a senha de contas já existentes.
6. Para mudar a senha de um administrador já existente, configure ADMIN_EMAIL e ADMIN_PASSWORD fortes em `.env.production` e execute explicitamente `node --env-file=.env.production scripts/set-admin-password.cjs`. Esse comando altera somente o hash do administrador ativo correspondente. Não foi executado durante o desenvolvimento. Não passe senhas na linha de comando ou em mensagens.
7. Desative a conta de teste pelo painel administrativo (resolva turno/entregas antes). O início em produção é bloqueado se contas padrão conhecidas estiverem ativas. Não há desativação nem rotação automática de credenciais reais.
8. Compile: `npm run build` na raiz e `npm run build` dentro de frontend. Valide com `npm run typecheck`, lint/testes e `npx prisma validate`.
9. Execute `node --env-file=.env.production dist/server.js` em um gerenciador de serviços com reinício automático. Não use Vite dev/preview como servidor público.
10. Defina APP_DOMAIN no ambiente do processo Caddy (por exemplo, entregas.suaempresa.com.br) e use `caddy run --config deploy/Caddyfile --adapter caddyfile`, preferencialmente como serviço. O APP_DOMAIN é uma configuração do Caddy; o Node não o repassa automaticamente.
11. Configure firewall, backup agendado do PostgreSQL, monitoramento e atualização de dependências. O compose de desenvolvimento agora publica o banco apenas em 127.0.0.1:5433; não é uma configuração completa de PostgreSQL para produção. Mudanças no binding só entram em vigor ao recriar o serviço, sem remover volumes.

## Proteções implementadas

- Cookie de sessão HttpOnly, SameSite=Strict e, em produção, Secure com prefixo __Host-. O login retorna apenas dados públicos; JWT não é devolvido no JSON e não é salvo no localStorage. A interface recupera a identidade via `/api/auth/me`, validada no servidor. Sessão expira em 12 horas.
- Logout limpa o cookie no servidor. Se a rede falhar, a interface avisa que é necessário reconectar e sair novamente. Logout não é uma lista persistente de revogação de tokens: uma cópia de um token roubado ainda precisa de expiração ou troca de senha para perder validade. Alteração de senha/desativação continuam invalidadas em cada requisição.
- Autorização ADMIN/DRIVER e verificação da propriedade das entregas no backend. Conta desativada é bloqueada; troca de senha invalida credenciais anteriores. Socket.IO restringe origens, valida a sessão e desconecta na expiração ou em desativação/redefinição.
- Rejeição de origens não autorizadas, cookies SameSite e JSON protegem o fluxo web de requisições entre sites. CORS não substitui autenticação. Chamadas de ferramentas sem Origin ainda exigem autenticação onde aplicável.
- HTTPS obrigatório em produção; segredo JWT fraco/placeholder e origens não HTTPS impedem inicialização. Cabeçalhos Helmet (incluindo CSP), HSTS e Permissions-Policy permitem geolocalização somente no próprio site. Fontes externas foram removidas.
- Limite de 20 tentativas de login malsucedidas por IP a cada 15 minutos, e 300 solicitações/minuto por IP na API. Limites usam memória local: com várias instâncias, configure armazenamento compartilhado/regras no proxy antes de escalar. O proxy confiável deve estar corretamente configurado para não permitir falsificação do IP.
- Corpos JSON limitados a 64 KB, respostas da API sem cache e mensagens de erro sem segredos. Bearer ainda é aceito em integrações que possuam token válido; o navegador usa exclusivamente cookie.
- Overrides das dependências transitivas effect/deepmerge-ts corrigem alertas sem migrar o Prisma 6. Reavaliar os overrides ao atualizar o Prisma. Auditoria npm de backend e frontend sem vulnerabilidades conhecidas na data da implementação; isso não é uma garantia de ausência de falhas.

## Entrega no celular

1. O administrador cadastra a conta individual e atribui a entrega.
2. O motoboy abre o endereço HTTPS, faz login, inicia turno e seleciona a parada.
3. No destino, toca **Marcar como entregue**, confirma e permite a localização.
4. O servidor exige entrega em rota, turno ativo, vínculo com o motoboy e localização dentro de DELIVERY_RADIUS_M (padrão 150 metros). Registra horário do servidor, latitude/longitude e distância. Reenvio de entrega já concluída não altera o comprovante.
5. Se GPS for negado, indisponível, expirar ou indicar distância excessiva, a entrega não é marcada. O administrador deve revisar o endereço/coordenadas quando necessário. Não há opção de forçar confirmação fora do raio. Coordenadas informadas pelo navegador não são prova antifraude infalível.
6. A lista e o progresso do motoboy são atualizados após confirmação. O administrador pode usar Atualizar para consultar o resultado. O Socket.IO emite o evento existente; o painel administrativo ainda não assina atualizações automáticas.

HTTP em IP local, como http://192.168.x.x:5173, normalmente não permite geolocalização. A exceção localhost vale no próprio dispositivo, não transforma o computador em localhost do celular. Não abra portas de desenvolvimento/banco para simular publicação. A validação real de GPS e cookies deve ser feita no celular pelo domínio HTTPS após configurar a hospedagem.

Mapas e navegação da etapa 5 permanecem pendentes. A confirmação da etapa 6 e parte da revisão de segurança da etapa 7 foram antecipadas a pedido do usuário. Não há rastreamento contínuo ou funcionamento offline nesta entrega.
