# Validação final e operação

## Atualização automática

Abra ADMIN e DRIVER em navegadores/perfis diferentes. As telas mostram o estado da conexão. Teste sem clicar em Atualizar:

1. Criar uma entrega atribuída: aparece para o motoboy e no painel administrativo.
2. Editar endereço/observações: o motoboy recebe os dados novos, sem perder formulários abertos. Um formulário baseado em versão antiga deve recusar salvar e pedir atualização.
3. Trocar de motoboy: o antigo deixa de ver a entrega, o novo passa a vê-la. Os avisos de entrega contêm somente id; cada cliente busca sua visão autorizada.
4. Iniciar turno e parada: ADMIN vê os novos estados; outras abas da mesma conta sincronizam o turno.
5. Concluir: ADMIN vê a conclusão; DRIVER vê a próxima parada automaticamente.
6. Reabrir: aparece como pendente e o comprovante anterior permanece no histórico.
7. Desligar a internet: estado Sem internet; ao voltar, reconectar e consultar dados atuais, inclusive eventos perdidos durante a queda.
8. Colocar a aba em segundo plano: a conexão é pausada. Ao retornar, conecta e atualiza. Não há ping para manter o Render acordado em segundo plano.
9. Redefinir senha/desativar uma conta: a conexão antiga é encerrada e as requisições seguintes pedem novo login. Sessões expiradas também são recusadas.

Se Socket.IO falhar, a tela visível faz uma consulta de recuperação a cada 60 segundos enquanto houver internet e tenta reconectar; Atualizar continua disponível. As mensagens são agrupadas em 250 ms para evitar excesso de GETs. Não há reenvio automático de POST/PATCH de entrega: confirmar/editar não é repetido pelo mecanismo de sincronização.

Produção usa /socket.io no mesmo domínio HTTPS. Desenvolvimento tem proxy /socket.io com suporte a WebSocket no Vite; reinicie o Vite após atualizar a configuração. CSP permite apenas a própria origem e os endereços WebSocket correspondentes às origens explicitamente autorizadas. Os cookies permanecem HttpOnly; nenhum token precisa ser acessado pelo JavaScript.

## Resultado técnico

Build/typecheck do backend, build/lint do frontend e testes automatizados aprovados. A integração Socket.IO usa servidor de rede real local com contas/persistência simuladas e cobre cookie de autenticação, origem, salas, reatribuição, revogação e expiração. Não alterou contas/pedidos reais. O dia operacional agora começa à meia-noite de Brasília (UTC-03), independentemente do fuso do servidor. A distância Haversine limita arredondamentos de ponto flutuante para evitar NaN em coordenadas extremas.

A revisão do código não encontrou consultas SQL brutas interpoladas nem HTML de cliente renderizado como código. Confirmação, acesso a dados e ações administrativas continuam com autorização no servidor, validação e testes. Auditorias npm de backend/frontend sem vulnerabilidades conhecidas na data da revisão. Isso não é certificação ou garantia de ausência de falhas.

## Antes do uso operacional

- Faça o roteiro de duas sessões acima e a revisão visual no celular no domínio público. Esses testes visuais não foram executados automaticamente.
- Confira contas administrativas, variáveis exclusivamente no Render, credenciais diferentes das locais e banco Neon correto. Não envie segredos no chat/GitHub.
- Defina backup periódico externo ao banco e teste a restauração em uma base SEPARADA de teste. Não restaure por cima da base operacional para validar. Não foram criados backups nem verificada restauração dos dados reais durante esta implementação.
- Para o teste de restauração, crie registros fictícios em uma base separada, exporte com pg_dump, restaure com pg_restore em outra base vazia e compare entregas/usuários/histórico. Confirme também que a aplicação conecta na base restaurada. Use arquivos de backup protegidos: contêm dados pessoais e hashes de senha.
- Documente quem acessa backups, prazo de retenção de dados, processo de suporte e recuperação. Monitore espaço/consumo e erros na hospedagem gratuita; não há disponibilidade garantida.

Limitações: sem MFA administrativo, sem lista persistente de revogação individual de tokens roubados no logout, rate limits/cache locais para uma réplica, sem modo offline ou prova antifraude de GPS. Troca de senha e desativação são verificadas em cada requisição e desconectam o motoboy. Para várias instâncias, implementar adapter de eventos e armazenamento compartilhado antes de escalar.

Esta etapa não contrata serviços, não publica automaticamente, não muda senhas, não aplica migrations e não extrai dados de produção. Não há nova migration neste conjunto de alterações.
