# Novo RPG: espaço dos fundadores

Site para os fundadores do novo sistema de RPG compartilharem **ideias**, acompanharem as **pendências** e consultarem o que já está **consolidado**. O visual segue o do Point (pergaminho, roxo, latão).

Tudo é feito direto pelo site, **sem precisar de conta em lugar nenhum**: quem tem o link propõe ideias, comenta, vota com 👍 e move os itens de etapa. Os dados ficam num banco no **Supabase** e o site é publicado no **GitHub Pages**.

## Como funciona

```
Ideia  →  A fazer  →  Em andamento  →  Consolidado
```

- **Ideias**: propostas abertas. A equipe vota e comenta. As mais votadas aparecem primeiro.
- **Pendências**: o que falta fazer (colunas "A fazer" e "Em andamento").
- **Consolidado**: o que já está decidido.
- Em cada cartão, o menu **Mover para…** troca a etapa. Também dá para **Editar** e **Excluir**.
- Na primeira ação o site pergunta o seu nome e guarda só no seu navegador. O nome aparece nas ideias, comentários e no histórico.

## Configurar o banco (uma vez só)

**1. Criar o projeto no Supabase**
- Entre em [supabase.com](https://supabase.com), crie uma conta (pode entrar com o GitHub) e clique em **New project**.
- Escolha um nome, defina uma senha para o banco (guarde-a) e a região **South America (São Paulo)**. O plano gratuito basta.
- Espere uns 2 minutos até o projeto ficar pronto.
- Se você já tem um projeto no Supabase (por exemplo o do Point), pode usá-lo: as tabelas deste site começam com `rpg_` e não se misturam com as outras.

**2. Criar as tabelas**
- No menu da esquerda, abra **SQL Editor → New query**.
- Abra o arquivo `supabase/schema.sql` deste repositório, copie **todo** o conteúdo, cole no editor e clique em **Run**.
- Deve aparecer "Success. No rows returned". É seguro rodar de novo se precisar.

**3. Copiar o endereço e a chave**
- Vá em **Project Settings → API** (em alguns painéis o botão se chama **Connect**).
- Copie a **Project URL** e a chave pública (**anon** ou **publishable**).
- **Nunca** use a chave `service_role` / `secret`: ela dá poder total sobre o banco.

**4. Colar no site**
- No GitHub, abra `site/js/config.js`, clique no lápis e preencha:

```js
supabase: {
  url: "https://SEU-PROJETO.supabase.co",
  anonKey: "a-chave-publica-aqui",
},
```

- Clique em **Commit changes**. Em cerca de 1 minuto o site atualiza sozinho.
- A chave pública pode ficar no código: ela é feita para isso. Quem protege os dados são as regras do banco (`schema.sql`).

Aproveite para trocar `projectName`, `tagline`, `about` e `founders` no mesmo arquivo.

## Segurança: o que "qualquer pessoa com o link" significa

Não há login, então **quem tiver o link consegue alterar as coisas**. Por isso o banco tem salvaguardas:

- Ninguém consegue **apagar** itens ou comentários de vez. "Excluir" só esconde o item.
- O **autor original** e a data de criação não podem ser mudados.
- Toda criação, edição, movimentação e exclusão fica registrada em `rpg_history`, com o nome de quem fez.
- Tamanhos e valores são validados no banco (título até 140 caracteres, descrição até 6000, etc.).

Mesmo assim, o link deve ser compartilhado só com quem é de confiança. Os nomes são digitados pela própria pessoa, então não provam quem fez a ação.

**Recuperar algo excluído ou ver quem mexeu:** no Supabase, **SQL Editor**:

```sql
-- últimas 50 ações
select created_at, action, actor, new_row->>'title' as titulo
from rpg_history order by created_at desc limit 50;

-- trazer de volta um item excluído (troque o id)
update rpg_items set deleted_at = null where id = 'COLE-O-ID-AQUI';
```

**Backup:** o botão **Baixar backup (.json)** no rodapé do site baixa tudo (inclusive itens excluídos e o histórico). Vale baixar de vez em quando.

## Limites do plano gratuito

- O Supabase gratuito **pausa o projeto após cerca de 1 semana sem uso**. Para reativar, entre no painel e clique em **Restore**. Os dados não se perdem.
- Os votos impedem repetição por navegador, não por pessoa: quem limpar os dados do navegador ou usar outro aparelho consegue votar de novo.

## Desenvolvimento

```
npm run dev     # abre o site em http://localhost:8080
npm test        # testes da lógica e do cliente do banco (Node 22+, sem dependências)
```

- `site/js/config.js`: nome, textos, fundadores e dados do Supabase.
- `site/js/api.js`: acesso ao banco. `site/js/lib.js`: regras puras. `site/js/app.js`: telas.
- `supabase/schema.sql`: tabelas, regras de acesso e histórico.
- `.github/workflows/pages.yml`: publica o site a cada alteração em `site/`.
- `.github/workflows/test.yml`: roda os testes a cada envio.
