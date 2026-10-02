// Lógica pura do site (sem DOM nem rede), para poder ser testada com `npm test`.

export const STAGE_ORDER = ["ideia", "pendente", "andamento", "consolidado", "arquivada"];

export const STAGES = {
  ideia: { label: "Ideia", color: "var(--purple-light)" },
  pendente: { label: "A fazer", color: "var(--brass)" },
  andamento: { label: "Em andamento", color: "var(--mp)" },
  consolidado: { label: "Consolidado", color: "var(--sp)" },
  arquivada: { label: "Arquivada", color: "var(--muted)" },
};

export const CATEGORIES = {
  mecanica: "Mecânicas",
  mundo: "Mundo e lore",
  narrativa: "Narrativa",
  arte: "Arte e visual",
  outro: "Outro",
};

export const LIMITS = { title: 140, body: 6000, author: 40, comment: 2000 };

export function isConfigured(sb) {
  return Boolean(sb && /^https:\/\/.+/.test(sb.url || "") && (sb.anonKey || "").length > 20);
}

/** Converte uma linha do banco no formato usado pela interface. */
export function normalizeItem(row, myVotes = new Set()) {
  return {
    id: row.id,
    stage: STAGES[row.stage] ? row.stage : "ideia",
    title: row.title,
    body: row.body || "",
    category: CATEGORIES[row.category] ? row.category : null,
    author: row.author,
    lastEditor: row.last_editor || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    votes: row.rpg_votes?.[0]?.count ?? 0,
    comments: row.rpg_comments?.[0]?.count ?? 0,
    voted: myVotes.has(row.id),
  };
}

const byUpdated = (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt);
const byVotes = (a, b) => b.votes - a.votes || new Date(b.createdAt) - new Date(a.createdAt);

export function groupItems(list) {
  const g = Object.fromEntries(STAGE_ORDER.map((k) => [k, []]));
  for (const i of list) g[i.stage].push(i);
  g.ideia.sort(byVotes);
  for (const k of STAGE_ORDER) if (k !== "ideia") g[k].sort(byUpdated);
  return g;
}

/** Retorna uma mensagem de erro em português, ou null se estiver tudo certo. */
export function validateDraft(d) {
  const title = (d.title ?? "").trim();
  if (!title) return "Escreva um título.";
  if (title.length > LIMITS.title) return `O título pode ter no máximo ${LIMITS.title} caracteres.`;
  if ((d.body ?? "").length > LIMITS.body) return `A descrição pode ter no máximo ${LIMITS.body} caracteres.`;
  if ("author" in d) {
    const a = (d.author ?? "").trim();
    if (!a) return "Escreva o seu nome.";
    if (a.length > LIMITS.author) return `O nome pode ter no máximo ${LIMITS.author} caracteres.`;
  }
  return null;
}

export function validateComment(d) {
  const body = (d.body ?? "").trim();
  if (!body) return "Escreva o comentário.";
  if (body.length > LIMITS.comment) return `O comentário pode ter no máximo ${LIMITS.comment} caracteres.`;
  return null;
}

export function validateName(d) {
  const a = (d.author ?? "").trim();
  if (!a) return "Escreva o seu nome.";
  if (a.length > LIMITS.author) return `O nome pode ter no máximo ${LIMITS.author} caracteres.`;
  return null;
}

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** Texto simples → HTML seguro: escapa tudo, deixa links http(s) clicáveis e preserva quebras de linha. */
export function textToHtml(text) {
  return escapeHtml(text)
    .replace(
      /(https?:\/\/[^\s<]+?)([.,;:!?)]*)(?=\s|$)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>$2'
    )
    .replace(/\r?\n/g, "<br>");
}

export function formatDate(iso) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatTime(date) {
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Identificador anônimo deste navegador, usado para impedir votar duas vezes. */
export function newVoterId(c = globalThis.crypto) {
  if (c?.randomUUID) return c.randomUUID();
  return "v" + Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}
