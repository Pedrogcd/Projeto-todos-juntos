// Único arquivo que você precisa editar para personalizar o site.

export const CONFIG = {
  // Nome que aparece no cabeçalho e na página inicial.
  projectName: "Novo RPG",

  // Frase curta abaixo do nome.
  tagline: "Um sistema de RPG de mesa construído a muitas mãos.",

  // Parágrafos da seção "Sobre o projeto" na página inicial.
  about: [
    "Este é o espaço dos fundadores para reunir ideias, organizar o que ainda falta fazer e registrar o que já está decidido.",
    "Qualquer fundador pode propor uma ideia, comentar nas dos outros e votar com um 👍. Quando a equipe concorda, a ideia vira pendência, depois entra em andamento e, por fim, fica consolidada.",
  ],

  // Quem aparece na seção "Fundadores". O campo "github" é o nome de usuário
  // (usado para buscar a foto de perfil). Deixe vazio se a pessoa não tiver conta.
  founders: [
    { nome: "Pedro", papel: "Fundador", github: "Pedrogcd" },
    // { nome: "Nome", papel: "Fundador", github: "usuario-github" },
  ],

  // Normalmente você NÃO precisa preencher isto: quando o site está no GitHub
  // Pages, ele descobre sozinho o dono e o nome do repositório pela URL.
  // Só preencha se usar um domínio próprio.
  repo: { owner: "", name: "" },

  // Por quantos minutos o navegador guarda a última leitura do GitHub
  // (evita estourar o limite de consultas da API pública).
  cacheMinutes: 5,
};
