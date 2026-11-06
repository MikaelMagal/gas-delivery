# Como testar dois motoboys

Não precisa de dois funcionários nem de dois celulares. Você pode representar as duas contas no computador; use o celular para os testes reais de localização.

## Preparação

1. Prefira um ambiente de teste. Se testar no sistema publicado, use apenas registros fictícios com prefixo **TESTE**, fora da operação real. As ações gravam dados e histórico de verdade.
2. Entre como administrador no seu navegador normal.
3. Crie **TESTE Motoboy A** e **TESTE Motoboy B**, com e-mails diferentes e senhas diferentes. Guarde as senhas fora da planilha.
4. Abra A em outro perfil de navegador ou outro navegador. Abra B em um terceiro perfil/navegador. Exemplo: administrador no Chrome, A no Edge e B no Firefox. Duas abas comuns compartilham login; várias janelas anônimas do mesmo navegador também podem compartilhar a mesma sessão.
5. Confira o nome exibido em cada janela. Não continue se as contas estiverem misturadas.
6. Crie **TESTE A1**, **TESTE A2** e **TESTE B1**. Atribua A1/A2 a A e B1 a B. Use destinos conhecidos. Para concluir pelo celular, cadastre o local real onde você fará o teste, sem adulterar GPS nem aumentar o raio permitido.

## Isolamento visual e sincronização

1. A deve ver somente A1/A2; B deve ver somente B1. Confira também mapa, paradas, telefone e observações.
2. Como administrador, troque A2 de A para B enquanto ela está pendente.
3. Sem atualizar manualmente, A deve perder A2 e B deve recebê-la. Se precisar de atualização manual, registre o problema de sincronização separadamente do acesso aos dados.
4. Em A, inicie o turno e A1. Em B, inicie seu turno e B1. Um turno não deve controlar o outro.
5. Devolva A2 a A enquanto pendente. Conclua A1 no celular, no destino. A2 deve entrar em rota automaticamente; B1 deve permanecer inalterada. Se trocar a conta do celular para B, saia antes e confira o nome ao entrar.

## Conferência pela API no navegador

Esta parte exige computador com ferramentas de desenvolvedor. Execute somente no seu sistema e nas contas/entregas fictícias. Não cole scripts recebidos de desconhecidos nem desative avisos de segurança do navegador. Se não se sentir confortável, deixe os testes técnicos como pendentes para revisão.

1. Na janela de B, abra **F12 → Network/Rede → Fetch/XHR** e atualize os dados. Abra a resposta de `/api/deliveries/mine`. Anote o `id` de **TESTE B1**. Esse identificador não é uma senha.
2. Na janela de A, abra o **Console**. Rode a consulta abaixo. A resposta deve conter só as entregas de A:

```js
fetch('/api/deliveries/mine').then(async r => console.log(r.status, await r.json()))
```

3. Para testar acesso administrativo, rode, ainda em A:

```js
fetch('/api/deliveries').then(async r => console.log(r.status, await r.json()))
```

O esperado é **403**, sem lista de clientes. Repita com `/api/drivers` e `/api/deliveries/report`.

4. Substitua `ID_DA_TESTE_B1` pelo identificador obtido em B e execute em A. B1 deve estar pendente e A com turno aberto, para conferir a autorização com os demais requisitos atendidos:

```js
fetch('/api/deliveries/ID_DA_TESTE_B1/start', { method: 'POST' })
  .then(async r => console.log(r.status, await r.json()))
```

O esperado é **403 ou 404**, sem dados de B e sem alterar B1. Se retornar sucesso, marque falha crítica, confira o registro no administrador e interrompa o piloto até corrigir. Não teste isso com entregas reais.

5. Ainda em A, consulte o histórico de B1:

```js
fetch('/api/deliveries/ID_DA_TESTE_B1/history')
  .then(async r => console.log(r.status, await r.json()))
```

O esperado é **403**, sem histórico ou dados do cliente.

6. Em um navegador sem login, abra `/api/deliveries/mine` no domínio do sistema. Deve retornar **401**, sem dados.

Não considere um erro 400, 500 ou uma falha de rede como aprovação de autorização. Registre o resultado e revise a causa. Esses testes complementam a validação visual; não substituem uma auditoria de segurança.

## Encerramento

Registre os resultados em [CHECKLIST_MVP.xlsx](CHECKLIST_MVP.xlsx), com data, responsável e observações. Reatribua ou resolva as entregas fictícias abertas e encerre os dois turnos antes de remover as contas de teste. A remoção preserva os registros históricos; não apaga os testes do banco. Não exclua registros diretamente do banco operacional para limpar a validação.
