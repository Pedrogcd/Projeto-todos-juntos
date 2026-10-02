// Lógica pura do site (sem DOM), para poder ser testada com `npm test`.
// O site lê as Issues do repositório e as organiza pelas etiquetas:
//   ideia → pendente → em-andamento → consolidado

export const STAGES = {
  ideia: { label: "Ideia", color: "var(--purple-light)" },
  pendente: { label: "A fazer", color: "var(--brass)" },
  andamento: { label: "Em andamento", color: "var(--mp)" },
  consolidado: { label: "Consolidado", color: "var(--sp)" },
  concluida: { label: "Concluída", color: "var(--muted)" },
  arquivada: { label: "Arquivada", color: "var(--muted)" },
};

export const CATEGORIES = {
  mecanica: "Mecânicas",
  mundo: "Mundo e lore",
  narrativa: "Narrativa",
  arte: "Arte e visual",
  outro: "Outro",
};

const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Descobre dono/nome do repositório: ?repo=dono/nome, config, ou URL do GitHub Pages. */
export function detectRepo(loc, override = {}) {
  const q = new URLSearchParams(loc.search || "").get("repo");
  if (q && /^[\w.-]+\/[\w.-]+$/.test(q)) {
    const [owner, name] = q.split("/");
    return { owner, name };
  }
  if (override.owner && override.name) {
    return { owner: override.owner, name: override.name };
  }
  const host = loc.hostname || "";
  if (host.endsWith(".github.io")) {
    const owner = host.slice(0, -".github.io".length);
    const seg = (loc.pathname || "/").split("/").filter(Boolean)[0];
    return { owner, name: seg && !seg.includes(".") ? seg : host };
  }
  return null;
}

export function newIssueUrl(repo, template) {
  return `https://github.com/${repo.owner}/${repo.name}/issues/new?template=${template}`;
}

export function repoUrl(repo) {
  return `https://github.com/${repo.owner}/${repo.name}`;
}

/** Lê a categoria do campo "### Categoria" gerado pelos formulários de Issue. */
export function categoryFromBody(body) {
  const m = /###\s*Categoria\s*\n+\s*([^\n]+)/i.exec(body || "");
  if (!m) return null;
  const wanted = norm(m[1]);
  return Object.keys(CATEGORIES).find((k) => norm(CATEGORIES[k]) === wanted) || null;
}

/** Decide em que etapa a Issue está. Retorna null se ela não pertence ao fluxo. */
export function classifyIssue(issue) {
  const labels = new Set(
    (issue.labels || []).map((l) => norm(typeof l === "string" ? l : l.name))
  );
  const closed = issue.state === "closed";
  let stage = null;
  if (labels.has("consolidado")) stage = "consolidado";
  else if (labels.has("em-andamento")) stage = closed ? "concluida" : "andamento";
  else if (labels.has("pendente")) stage = closed ? "concluida" : "pendente";
  else if (labels.has("ideia")) stage = closed ? "arquivada" : "ideia";
  if (!stage) return null;
  const category =
    Object.keys(CATEGORIES).find((k) => labels.has(k)) ||
    categoryFromBody(issue.body) ||
    null;
  return { stage, category };
}

export function normalizeIssue(issue) {
  if (issue.pull_request) return null;
  const c = classifyIssue(issue);
  if (!c) return null;
  return {
    id: issue.number,
    title: issue.title,
    url: issue.html_url,
    bodyHtml: issue.body_html || "",
    author: issue.user?.login || "alguém",
    avatar: issue.user?.avatar_url || "",
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
    comments: issue.comments || 0,
    votes: issue.reactions?.["+1"] || 0,
    stage: c.stage,
    category: c.category,
  };
}

const byUpdated = (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt);
const byVotes = (a, b) =>
  b.votes - a.votes || new Date(b.createdAt) - new Date(a.createdAt);

export function groupIssues(list) {
  const g = Object.fromEntries(Object.keys(STAGES).map((k) => [k, []]));
  for (const i of list) g[i.stage].push(i);
  g.ideia.sort(byVotes);
  for (const k of Object.keys(g)) if (k !== "ideia") g[k].sort(byUpdated);
  return g;
}

export function formatDate(iso) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function readCache(storage, key, now = Date.now()) {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const { t, data } = JSON.parse(raw);
    return { data, age: now - t };
  } catch {
    return null;
  }
}

export function writeCache(storage, key, data, now = Date.now()) {
  try {
    storage.setItem(key, JSON.stringify({ t: now, data }));
  } catch {
    /* armazenamento cheio ou bloqueado: segue sem cache */
  }
}

/**
 * Busca as Issues (até 300) usando a API pública do GitHub.
 * Usa cache local; se o GitHub recusar (limite de consultas), cai no cache antigo.
 */
export async function fetchIssues({
  repo,
  fetchImpl = fetch,
  storage,
  ttlMs = 5 * 60 * 1000,
  force = false,
  now = Date.now(),
}) {
  const key = `rpg-issues:${repo.owner}/${repo.name}`;
  const cached = storage ? readCache(storage, key, now) : null;
  if (!force && cached && cached.age < ttlMs) {
    return { issues: cached.data, source: "cache", stale: false };
  }
  try {
    const all = [];
    for (let page = 1; page <= 3; page++) {
      const res = await fetchImpl(
        `https://api.github.com/repos/${repo.owner}/${repo.name}/issues?state=all&per_page=100&page=${page}`,
        { headers: { Accept: "application/vnd.github.full+json" } }
      );
      if (!res.ok) {
        throw Object.assign(new Error(`GitHub respondeu ${res.status}`), {
          status: res.status,
        });
      }
      const batch = await res.json();
      all.push(...batch);
      if (batch.length < 100) break;
    }
    const issues = all.map(normalizeIssue).filter(Boolean);
    if (storage) writeCache(storage, key, issues, now);
    return { issues, source: "network", stale: false };
  } catch (error) {
    if (cached) {
      return { issues: cached.data, source: "cache", stale: true, error };
    }
    throw error;
  }
}
