// Único arquivo que você precisa editar para personalizar o site.

export const CONFIG = {
  // Nome que aparece no cabeçalho e na página inicial.
  projectName: "Novo RPG",

  // Frase curta abaixo do nome.
  tagline: "Um sistema de RPG de mesa construído a muitas mãos.",

  // Parágrafos da seção "Sobre o projeto" na página inicial.
  about: [
    "Este é o espaço dos fundadores para reunir ideias, organizar o que ainda falta fazer e registrar o que já está decidido.",
    "Quem tem o link pode propor uma ideia, comentar, votar com 👍 e mover os itens pelas etapas: ideia, a fazer, em andamento e consolidado.",
  ],

  // Quem aparece na seção "Fundadores". O campo "github" é opcional
  // (usado só para buscar a foto de perfil).
  founders: [
    { nome: "Pedro", papel: "Fundador", github: "Pedrogcd" },
    // { nome: "Nome", papel: "Fundador", github: "usuario-github" },
  ],

  // Dados do projeto no Supabase (Project Settings → API).
  // A "anon key" / "publishable key" é pública por natureza: quem protege os dados
  // são as regras do banco (supabase/schema.sql). NUNCA coloque aqui a "service_role".
  supabase: {
    url: "https://smecdstrxyheyqfwhpbs.supabase.co",
    anonKey: "sb_publishable_kEUagmN1NxEu7Rd8ziSd4g_cfofNalC",
  },

  // De quanto em quanto tempo o site busca novidades enquanto está aberto.
  refreshSeconds: 60,
};
