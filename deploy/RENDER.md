# Render + Neon — inicialização

No serviço Docker do Render, configure em **Settings → Docker Command** exatamente:

```text
node scripts/render-start.cjs
```

Não use aspas, `/bin/sh -c` ou `&&` nesse campo. O script prepara o banco usando as migrations/seed existentes e inicia o servidor no mesmo processo Node. Não é necessário mudar o Dockerfile: ele já copia a pasta scripts. A Railway continua usando seu pre-deploy separado.

Envie o novo arquivo scripts/render-start.cjs ao GitHub antes de fazer **Manual Deploy → Deploy latest commit**. O log deve mostrar a preparação do banco e depois a API iniciando. Se a preparação falhar, o servidor não inicia; veja a mensagem anterior no log. A preparação se repete em cada início no Render Free; migrations já aplicadas não são reaplicadas e o seed não redefine contas existentes.

Configure DATABASE_URL com a conexão do Neon, NODE_ENV=production, HOST=0.0.0.0, PORT=10000, TRUST_PROXY=1, APP_ORIGINS com a origem HTTPS real do serviço sem barra final, JWT_SECRET aleatório forte e ADMIN_EMAIL/ADMIN_PASSWORD fortes. GEOAPIFY_API_KEY habilita a busca por endereço. O healthcheck é /api/health. Não envie .env ao GitHub nem compartilhe a conexão ou senhas nos logs.

O erro `/bin/sh: ... node scripts/railway-prepare.cjs && exec node dist/server.js: not found` ocorre quando o campo Docker Command interpreta a expressão composta como um único executável. O comando simples acima elimina essa dependência da interpretação de aspas pelo painel.

Validação local desta correção: sintaxe dos dois scripts verificada e fluxo de preparação/início validado com chamadas simuladas, sem conexão ou mudança no banco. O deploy no Render ainda precisa ser repetido pelo usuário.
