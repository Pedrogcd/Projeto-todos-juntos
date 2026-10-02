import { CONFIG } from "./config.js";
import {
  STAGES,
  CATEGORIES,
  detectRepo,
  fetchIssues,
  groupIssues,
  newIssueUrl,
  repoUrl,
  formatDate,
} from "./lib.js";

const $app = document.getElementById("app");
const repo = detectRepo(window.location, CONFIG.repo);

const state = {
  grouped: null,
  info: null, // { source, stale, error }
  error: null,
  category: "todas",
  showArchived: false,
};

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- Dados ---------- */

async function load(force = false) {
  if (!repo) return;
  state.error = null;
  try {
    const res = await fetchIssues({
      repo,
      storage: window.localStorage,
      ttlMs: CONFIG.cacheMinutes * 60 * 1000,
      force,
    });
    state.grouped = groupIssues(res.issues);
    state.info = res;
  } catch (e) {
    state.error = e;
  }
  updateCounts();
  render();
}

function updateCounts() {
  const g = state.grouped;
  const set = (k, n) => {
    const el = document.querySelector(`[data-count="${k}"]`);
    if (el) el.textContent = g ? String(n) : "";
  };
  set("ideias", g?.ideia.length);
  set("pendencias", (g?.pendente.length || 0) + (g?.andamento.length || 0));
  set("consolidado", g?.consolidado.length);
}

/* ---------- Peças ---------- */

function card(i, { dim = false } = {}) {
  const st = STAGES[i.stage];
  return `<article class="card${dim ? " card--dim" : ""}" style="--accent:${st.color}">
    <div class="card__chips">
      <span class="chip chip--stage">${st.label}</span>
      ${i.category ? `<span class="chip">${esc(CATEGORIES[i.category])}</span>` : ""}
    </div>
    <h3 class="card__title">${esc(i.title)}</h3>
    <div class="card__meta">
      ${i.avatar ? `<img class="avatar" src="${esc(i.avatar)}" alt="" width="20" height="20" loading="lazy" />` : ""}
      <span>${esc(i.author)}</span><span>·</span><time datetime="${esc(i.createdAt)}">${formatDate(i.createdAt)}</time>
    </div>
    ${i.bodyHtml ? `<details class="card__body"><summary>Ler detalhes</summary><div class="md">${i.bodyHtml}</div></details>` : ""}
    <footer class="card__foot">
      <span title="Votos (👍 no GitHub)">👍 ${i.votes}</span>
      <span title="Comentários">💬 ${i.comments}</span>
      <a href="${esc(i.url)}" target="_blank" rel="noopener">Discutir no GitHub ↗</a>
    </footer>
  </article>`;
}

function emptyPanel(text, template, cta) {
  return `<div class="panel empty">${text}${
    repo && template ? `<div class="btn-row" style="justify-content:center"><a class="btn" href="${newIssueUrl(repo, template)}" target="_blank" rel="noopener">${cta}</a></div>` : ""
  }</div>`;
}

function statusBar() {
  if (!state.info) return "";
  const stale = state.info.stale
    ? `Mostrando a última versão salva (o GitHub recusou a consulta${state.info.error?.status === 403 ? ": limite de consultas, tente de novo em alguns minutos" : ""}). `
    : "";
  return `<div class="status-bar"><span>${stale}Os dados vêm das Issues do repositório.</span>
    <button class="linklike" data-action="refresh">Atualizar agora</button></div>`;
}

function setupNotice() {
  return `<div class="panel panel--notice">
    <h2 class="section-title">Falta ligar o site ao repositório</h2>
    <p>Quando o site estiver publicado no GitHub Pages ele descobre o repositório sozinho. Para testar fora dele, abra a página com
    <code>?repo=dono/nome-do-repositorio</code> no final do endereço, ou preencha <code>repo</code> em <code>site/js/config.js</code>.</p>
  </div>`;
}

function errorNotice() {
  const e = state.error;
  const limit = e?.status === 403 || e?.status === 429;
  const missing = e?.status === 404;
  const msg = limit
    ? "O GitHub limitou as consultas deste endereço. Tente de novo em alguns minutos."
    : missing
    ? "Não encontrei o repositório. Ele precisa ser público para o site conseguir ler as Issues."
    : "Não consegui ler as Issues agora. Verifique a conexão e tente de novo.";
  return `<div class="panel panel--notice"><h2 class="section-title">Não foi possível carregar</h2>
    <p>${msg}</p>
    <div class="btn-row"><button class="btn" data-action="refresh">Tentar de novo</button>
    ${repo ? `<a class="btn btn--ghost" href="${repoUrl(repo)}/issues" target="_blank" rel="noopener">Ver Issues no GitHub ↗</a>` : ""}</div></div>`;
}

/* ---------- Visões ---------- */

function viewInicio() {
  const g = state.grouped;
  const n = (k) => (g ? g[k].length : "–");
  const steps = [
    { id: "ideias", stage: "ideia", n: n("ideia"), t: "Ideias", d: "Propostas abertas para a equipe votar e comentar." },
    { id: "pendencias", stage: "pendente", n: g ? g.pendente.length : "–", t: "A fazer", d: "Aprovado, esperando alguém pegar." },
    { id: "pendencias", stage: "andamento", n: n("andamento"), t: "Em andamento", d: "Alguém está trabalhando nisso agora." },
    { id: "consolidado", stage: "consolidado", n: n("consolidado"), t: "Consolidado", d: "Decidido e valendo para o jogo." },
  ];
  const founders = CONFIG.founders
    .map((f) => {
      const img = f.github
        ? `<img src="https://github.com/${encodeURIComponent(f.github)}.png?size=96" alt="" width="48" height="48" loading="lazy" />`
        : `<div class="founder__ph" aria-hidden="true">${esc(f.nome.slice(0, 1))}</div>`;
      return `<div class="founder">${img}<div><b>${esc(f.nome)}</b><span>${esc(f.papel || "")}</span></div></div>`;
    })
    .join("");

  return `<div class="stack">
    <section class="panel hero">
      <h1>${esc(CONFIG.projectName)}</h1>
      <p>${esc(CONFIG.tagline)}</p>
      ${
        repo
          ? `<div class="btn-row">
              <a class="btn" href="${newIssueUrl(repo, "ideia.yml")}" target="_blank" rel="noopener">Propor uma ideia</a>
              <a class="btn btn--ghost" href="#pendencias">Ver pendências</a>
              <a class="btn btn--ghost" href="#consolidado">O que já está decidido</a>
            </div>`
          : ""
      }
    </section>
    ${!repo ? setupNotice() : ""}
    ${state.error ? errorNotice() : ""}
    <section class="panel">
      <h2 class="section-title">Como o projeto anda</h2>
      <div class="pipeline">
        ${steps
          .map(
            (s) => `<a class="step" href="#${s.id}" style="--accent:${STAGES[s.stage].color}">
              <div class="step__n">${s.n}</div><div class="step__t">${s.t}</div><div class="step__d">${s.d}</div></a>`
          )
          .join("")}
      </div>
    </section>
    <section class="panel">
      <h2 class="section-title">Sobre o projeto</h2>
      ${CONFIG.about.map((p) => `<p>${esc(p)}</p>`).join("")}
    </section>
    ${founders ? `<section class="panel"><h2 class="section-title">Fundadores</h2><div class="founders">${founders}</div></section>` : ""}
  </div>`;
}

function gate(content) {
  if (!repo) return setupNotice();
  if (state.error && !state.grouped) return errorNotice();
  if (!state.grouped) return `<div class="panel empty">Carregando os pergaminhos…</div>`;
  return content();
}

function viewIdeias() {
  return gate(() => {
    const g = state.grouped;
    let list = [...g.ideia];
    if (state.showArchived) list = list.concat(g.arquivada);
    const cats = Object.entries(CATEGORIES);
    const shown = state.category === "todas" ? list : list.filter((i) => i.category === state.category);
    return `<div class="stack">
      <section class="panel">
        <div class="view-head"><h2>Ideias</h2>
          <a class="btn" href="${newIssueUrl(repo, "ideia.yml")}" target="_blank" rel="noopener">Propor uma ideia</a></div>
        <p class="lead">As mais votadas aparecem primeiro. Vote com 👍 e comente direto no GitHub.</p>
        <div class="filters" role="group" aria-label="Filtrar por categoria">
          <button class="chip" data-cat="todas" aria-pressed="${state.category === "todas"}">Todas</button>
          ${cats.map(([k, v]) => `<button class="chip" data-cat="${k}" aria-pressed="${state.category === k}">${esc(v)}</button>`).join("")}
          <label style="margin-left:auto;font-size:.9rem"><input type="checkbox" data-action="archived" ${state.showArchived ? "checked" : ""} /> mostrar arquivadas</label>
        </div>
      </section>
      ${
        shown.length
          ? `<div class="grid">${shown.map((i) => card(i, { dim: i.stage === "arquivada" })).join("")}</div>`
          : emptyPanel("Nenhuma ideia por aqui ainda.", "ideia.yml", "Seja o primeiro a propor")
      }
      ${statusBar()}
    </div>`;
  });
}

function viewPendencias() {
  return gate(() => {
    const g = state.grouped;
    const col = (stage, title, items) => `<div class="col" style="--accent:${STAGES[stage].color}">
      <h3 class="col__head"><span>${title}</span><span>${items.length}</span></h3>
      ${items.length ? items.map((i) => card(i)).join("") : `<div class="panel empty">Nada aqui.</div>`}</div>`;
    return `<div class="stack">
      <section class="panel">
        <div class="view-head"><h2>Pendências</h2>
          <a class="btn" href="${newIssueUrl(repo, "pendencia.yml")}" target="_blank" rel="noopener">Nova pendência</a></div>
        <p class="lead">O que ainda precisa ser feito para o jogo ficar de pé.</p>
      </section>
      <div class="board">
        ${col("pendente", "A fazer", g.pendente)}
        ${col("andamento", "Em andamento", g.andamento)}
      </div>
      ${
        g.concluida.length
          ? `<section class="panel"><details class="more"><summary>Concluídas (${g.concluida.length})</summary>
              <div class="grid">${g.concluida.map((i) => card(i, { dim: true })).join("")}</div></details></section>`
          : ""
      }
      ${statusBar()}
    </div>`;
  });
}

function viewConsolidado() {
  return gate(() => {
    const items = state.grouped.consolidado;
    return `<div class="stack">
      <section class="panel">
        <div class="view-head"><h2>Consolidado</h2>
          <a class="btn" href="${newIssueUrl(repo, "decisao.yml")}" target="_blank" rel="noopener">Registrar decisão</a></div>
        <p class="lead">Regras e decisões que a equipe já fechou. Ordenadas da mais recente para a mais antiga.</p>
      </section>
      ${items.length ? `<div class="grid">${items.map((i) => card(i)).join("")}</div>` : emptyPanel("Ainda não há nada consolidado.", "decisao.yml", "Registrar a primeira decisão")}
      ${statusBar()}
    </div>`;
  });
}

const VIEWS = { inicio: viewInicio, ideias: viewIdeias, pendencias: viewPendencias, consolidado: viewConsolidado };

/* ---------- Roteamento e eventos ---------- */

function currentView() {
  const id = location.hash.replace("#", "");
  return VIEWS[id] ? id : "inicio";
}

function render() {
  const id = currentView();
  $app.innerHTML = VIEWS[id]();
  $app.querySelectorAll(".md a").forEach((a) => {
    a.target = "_blank";
    a.rel = "noopener";
  });
  document.querySelectorAll(".tab").forEach((t) => {
    if (t.dataset.view === id) t.setAttribute("aria-current", "page");
    else t.removeAttribute("aria-current");
  });
  const titles = { inicio: "", ideias: "Ideias · ", pendencias: "Pendências · ", consolidado: "Consolidado · " };
  document.title = `${titles[id]}${CONFIG.projectName}`;
}

window.addEventListener("hashchange", () => {
  render();
  window.scrollTo({ top: 0 });
});

$app.addEventListener("click", (e) => {
  const cat = e.target.closest("[data-cat]");
  if (cat) {
    state.category = cat.dataset.cat;
    render();
    return;
  }
  if (e.target.closest('[data-action="refresh"]')) load(true);
});
$app.addEventListener("change", (e) => {
  if (e.target.matches('[data-action="archived"]')) {
    state.showArchived = e.target.checked;
    render();
  }
});

/* ---------- Início ---------- */

document.getElementById("brand").textContent = CONFIG.projectName;
const repoLink = document.getElementById("repo-link");
if (repo) {
  repoLink.href = repoUrl(repo);
  repoLink.hidden = false;
}
render();
load();
