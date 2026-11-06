# Guia de uso — GásExpress

## Acesso e preparação

Acesse o endereço HTTPS do sistema pelo navegador do computador ou celular. Cada pessoa deve usar sua própria conta. Não compartilhe a conta administrativa. Use uma senha única, preferencialmente gerada por um gerenciador de senhas, e entregue as credenciais ao motoboy em particular.

O sistema precisa de internet. Não há modo offline, cadastro público de pedidos ou mensagens automáticas de WhatsApp nesta versão.

## Administrador

1. Entre com sua conta administrativa.
2. Em **Motoboys**, preencha nome, e-mail e senha inicial e clique em **Cadastrar motoboy**.
3. Clique em **Nova entrega**. Informe cliente, telefone quando disponível, endereço completo com número, bairro, cidade e estado, produto, quantidade e observações.
4. Clique em **Buscar endereço**, selecione o resultado correto e use **Conferir no mapa** para conferir o destino. A localização encontrada pode ser aproximada. Ao mudar o endereço, selecione uma nova localização. Coordenadas manuais são uma alternativa para um ponto conhecido, não uma etapa obrigatória do cadastro comum.
5. Clique em **Cadastrar entrega**. Em **Entregas**, use **Atribuir motoboy**, selecione o profissional e confirme. É possível atribuir antes de ele abrir o turno.
6. Acompanhe os estados **Pendente**, **Em rota** e **Concluída**. Em **Mapa e paradas**, confira os destinos e filtre o motoboy. Isso não representa rastreamento contínuo do celular.
7. Em **Histórico de entregas**, escolha período, data de criação ou conclusão, motoboy e status. A lista inicial mostra primeiro as entregas em rota, depois as pendentes e as concluídas hoje, mesmo que tenham sido criadas antes. Pendentes e em rota permanecem independentemente da data. Concluídas em dias anteriores ficam no histórico. O dia segue o horário de Brasília; canceladas criadas hoje aparecem por último.

### Correções

- **Editar entrega**: corrige os dados. Se outra alteração ocorrer enquanto o formulário está aberto, feche, atualize e abra novamente antes de salvar.
- **Trocar motoboy**: disponível para entrega pendente. Se estiver em rota, combine com o motoboy uma troca de parada ou encerramento do turno, que devolve a parada atual a pendente. Depois confira a situação antes de reatribuir.
- **Reabrir entrega**: para uma entrega concluída ou cancelada que precisa voltar a pendente. Informe o motivo real. Se o motoboy ainda estiver ativo, sua atribuição é mantida. A parada que já está em rota não é interrompida.
- Para corrigir endereço/localização de uma entrega concluída, reabra primeiro. Não crie outra entrega para substituir a mesma sem conferir o registro existente.
- **Histórico** mostra alterações administrativas, autor, horário e motivo quando houver. Na reabertura, a tela simplifica os dados exibidos; a confirmação anterior permanece preservada internamente.

### Contas dos motoboys

Em **Motoboys**, use **Alterar senha** quando necessário. A sessão antiga é invalidada e o motoboy deve entrar novamente com a nova senha. A alteração não é feita editando o arquivo `.env`.

**Remover** desativa a conta e preserva o histórico. Antes, o motoboy deve encerrar o turno e as entregas abertas devem ser resolvidas ou reatribuídas. Se houver bloqueio, leia a mensagem e resolva a pendência.

## Motoboy — uso pelo celular

1. Abra o endereço HTTPS do sistema no navegador e entre com sua conta.
2. Confira seu nome e **Minhas entregas**. Se faltar um pedido, avise o administrador para conferir a atribuição.
3. Toque em **Iniciar turno** e depois em **Iniciar rota** ou **Ir para esta parada**.
4. Confira cliente, endereço, quantidade e observações. Abra o link do Google Maps ou Waze para navegar. Faça isso com o veículo parado.
5. Somente após entregar, toque em **Marcar como entregue**, confirme e permita o acesso à localização. O GPS do celular deve estar ativo e o ponto deve estar dentro da distância permitida pelo sistema.
6. Aguarde a mensagem de sucesso. Havendo outra entrega pendente, ela entra em rota automaticamente. Ao terminar a última, o turno continua aberto.
7. Ao terminar o trabalho, toque em **Encerrar turno** e confirme. Uma parada ainda em rota volta a pendente; ela não é marcada como entregue.
8. Use **Sair**, principalmente em aparelho compartilhado.

**Ir para próxima parada pendente** ou **Ir para esta parada** troca o destino atual sem concluir o anterior. A entrega anterior continua pendente.

## Quando algo falhar

| Situação | O que fazer |
| --- | --- |
| Localização negada | Nas permissões do navegador para este site, permita localização; ative o GPS e tente novamente no endereço HTTPS. |
| Fora da distância permitida | Confira se está no destino e se o ponto cadastrado está correto. Aguarde uma leitura melhor do GPS. Se persistir, avise o administrador; não confirme em outro local para contornar o bloqueio. |
| Sem internet ou conexão pausada | Volte ao navegador com internet e aguarde a atualização. Se necessário, toque em **Atualizar dados**. Não há envio offline de confirmações. |
| Erro após cadastrar ou confirmar | Atualize e confira a lista antes de repetir: o servidor pode ter recebido a operação mesmo sem a resposta chegar. |
| Sessão encerrada | Entre novamente. Se a senha foi alterada, solicite a nova ao administrador. |
| Mapa/rota indisponível | Confira o endereço e tente os links de navegação. Informe o responsável se a indisponibilidade persistir. |
| Primeira abertura demorada | Aguarde e tente novamente; confira a hospedagem se persistir. Não recrie pedidos por causa da demora. |

## Rotina do responsável

- No início do dia, confira acesso, motoboys e pendências anteriores.
- No fechamento, confira entregas abertas, correções e turnos ainda ativos.
- Defina um responsável pelo suporte e compartilhe seu contato com os motoboys.
- Mantenha um procedimento de backup e teste a restauração em banco separado, conforme [VALIDACAO.md](VALIDACAO.md). Não restaure testes sobre o banco operacional.
- Use [CHECKLIST_MVP.xlsx](CHECKLIST_MVP.xlsx) para registrar a validação. Nunca anote senhas, tokens ou conexões do banco na planilha.
