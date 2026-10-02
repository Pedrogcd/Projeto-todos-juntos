# Novo RPG — espaço dos fundadores

Site (GitHub Pages) para os fundadores do novo sistema de RPG compartilharem **ideias**, acompanharem as **pendências** e consultarem o que já está **consolidado**. O visual segue o do Point (pergaminho, roxo, latão).

Não tem servidor nem banco de dados: o site lê as **Issues** do próprio repositório. Cada ideia, pendência ou decisão é uma Issue, e a **etiqueta** define em que aba ela aparece.

## Como o fluxo funciona

```
ideia  →  pendente  →  em-andamento  →  consolidado
```

| Etiqueta | Aparece em | Significado |
| --- | --- | --- |
| `ideia` | aba Ideias | Proposta aberta; a equipe vota com 👍 e comenta |
| `pendente` | Pendências → A fazer | Aprovada, esperando alguém pegar |
| `em-andamento` | Pendências → Em andamento | Alguém está trabalhando nisso |
| `consolidado` | aba Consolidado | Decidido e valendo para o jogo |

Para **mover** algo de etapa, basta trocar a etiqueta na Issue (no GitHub). Prevalece a etapa mais avançada: se uma Issue tem `ideia` e `pendente`, ela aparece como pendência.

- Fechar uma **ideia** sem outra etiqueta a arquiva (some, a menos que "mostrar arquivadas" esteja marcado).
- Fechar uma **pendência** a move para "Concluídas".
- `consolidado` vale aberta ou fechada.

A categoria (Mecânicas, Mundo e lore, Narrativa, Arte e visual, Outro) vem do formulário, ou das etiquetas `mecanica`, `mundo`, `narrativa`, `arte`, `outro`.

## Publicar (uma vez só)

1. Crie um repositório **público** no GitHub (o site só consegue ler Issues de repositórios públicos) e envie estes arquivos para a branch `main`.
2. Em **Settings → Pages → Source**, escolha **GitHub Actions**.
3. Em **Actions → Criar etiquetas → Run workflow**, para criar as etiquetas do fluxo.
4. Em **Settings → Collaborators**, convide os outros fundadores.
5. Abra o endereço `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.

O site descobre o dono e o nome do repositório pela própria URL; não precisa configurar nada.

## Personalizar

Edite `site/js/config.js`: nome do projeto, frase de apresentação, texto "Sobre o projeto" e a lista de fundadores (o `github` é o usuário, usado para a foto).

As cores ficam no começo de `site/css/style.css`.

## Rodar localmente

```
npm run dev
```

Abra `http://localhost:8080/?repo=SEU-USUARIO/NOME-DO-REPOSITORIO`. O `?repo=` só é necessário fora do GitHub Pages.

```
npm test
```

Roda os testes da lógica (Node 22 ou mais novo, sem dependências).

## Limites conhecidos

- **Votar e comentar exige conta no GitHub.** O site mostra os votos e comentários, mas quem vota ou comenta faz isso na página da Issue (o botão "Discutir no GitHub" leva até lá).
- **Limite de consultas.** A API pública do GitHub permite cerca de 60 consultas por hora por endereço de internet. O site guarda a última leitura por 5 minutos e, se o limite estourar, mostra a última versão salva.
- **Qualquer pessoa com conta no GitHub pode abrir uma Issue** em um repositório público. Se isso virar problema, dá para limitar os comentários em Settings, ou trocar a leitura por um banco como o Supabase (como o Point faz).
- O site lê até 300 Issues.
