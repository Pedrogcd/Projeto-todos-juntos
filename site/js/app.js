import { CONFIG } from "./config.js";
import { createApi } from "./api.js";
import {
  STAGES,
  STAGE_ORDER,
  CATEGORIES,
  LIMITS,
  isConfigured,
  normalizeItem,
  groupItems,
  validateDraft,
  validateComment,
  validateName,
  escapeHtml as esc,
  textToHtml,
  formatDate,
  formatTime,
  newVoterId,
} from "./lib.js";

const $app = document.getElementById("app");
const $dlg = document.getElementById("dlg");
const $toast = document.getElementById("toast");
const $export = document.getElementById("export");

const configured = isConfigured(CONFIG.supabase);
const api = configured ? createApi({ url: CONFIG.supabase.url, key: CONFIG.supabase.anonKey }) : null;

const store = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* navegador bloqueou o armazenamento: segue sem lembrar */
    }
  },
};

const voterId = (() => {
  let v = store.get("rpg-voter");
  if (!v) {
    v = newVoterId();
    store.set("rpg-voter", v);
  }
  return v;
})();

const state = {
  grouped: null,
  error: null,
  loadedAt: null,
  sig: null,
  category: "todas",
  showArchived: false,
  comments: {}, // id -> { open, loading, list }
};

/* ---------- Dados ---------- */

async function load({ quiet = false } = {}) {
  if (!api) return;
  try {
    const [rows, mine] = await Promise.all([api.listItems(), api.myVotes(voterId)]);
    const sig = JSON.stringify([rows, mine]);
    if (quiet && sig === state.sig && !state.error) return;
    const voted = new Set(mine.map((v) => v.item_id));
    state.grouped = groupItems(rows.map((r) => normalizeItem(r, voted)));
    state.sig = sig;
    state.error = null;
    state.loadedAt = new Date();
  } catch (e) {
    state.error = e;
    if (quiet && state.grouped) return; // falha silenciosa na atualização automática
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

function findItem(id) {
  if (!state.grouped) return null;
  for (const k of STAGE_ORDER) {
    const hit = state.grouped[k].find((i) => i.id === id);
    if (hit) return hit;
  }
  return null;
}

function friendlyError(e) {
  if (e?.status === 401 || e?.status === 403) return "O banco recusou a ação. Confira se o esquema (schema.sql) foi executado.";
  if (e?.status === 404) return "Tabelas não encontradas. Rode o schema.sql no Supabase.";
  if (e?.status === 429) return "Muitas ações seguidas. Espere um instante e tente de novo.";
  if (e instanceof TypeError) return "Sem conexão com o banco. Verifique a internet.";
  return e?.message || "Algo deu errado.";
}

let toastTimer;
function toast(msg, isError = false) {
  $toast.textContent = msg;
  $toast.classList.toggle("toast--error", isError);
  $toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($toast.hidden = true), isError ? 6000 : 3000);
}

/** Executa uma ação no banco, recarrega a lista e avisa o resultado. */
async function run(action, okMsg) {
  try {
    await action();
    await load();
    if (okMsg) toast(okMsg);
  } catch (e) {
    toast(friendlyError(e), true);
  }
}

/* ---------- Diálogos ---------- */

function fieldHtml(f, val = "") {
  const id = `f-${f.name}`;
  const common = `id="${id}" name="${f.name}"${f.maxlength ? ` maxlength="${f.maxlength}"` : ""}`;
  let input;
  if (f.type === "textarea") {
    input = `<textarea ${common} rows="${f.rows || 5}">${esc(val)}</textarea>`;
  } else if (f.type === "select") {
    input = `<select ${common}>${f.options
      .map(([v, l]) => `<option value="${esc(v)}"${v === val ? " selected" : ""}>${esc(l)}</option>`)
      .join("")}</select>`;
  } else {
    input = `<input ${common} type="text" value="${esc(val)}" autocomplete="off" />`;
  }
  return `<label class="field" for="${id}"><span>${esc(f.label)}</span>${input}${f.hint ? `<small>${esc(f.hint)}</small>` : ""}</label>`;
}

/** Abre um formulário em diálogo. Resolve com os valores (texto) ou null se cancelado. */
function openForm({ title, intro = "", fields, values = {}, submit = "Salvar", validate }) {
  return new Promise((resolve) => {
    let result = null;
    $dlg.innerHTML = `<form method="dialog" class="form" novalidate>
      <h2 class="form__title" id="dlg-title">${esc(title)}</h2>
      ${intro ? `<p class="lead">${esc(intro)}</p>` : ""}
      ${fields.map((f) => fieldHtml(f, values[f.name])).join("")}
      <p class="form__error" role="alert" hidden></p>
      <div class="btn-row">
        <button class="btn" value="ok">${esc(submit)}</button>
        <button class="btn btn--ghost" value="cancel" formnovalidate>Cancelar</button>
      </div>
    </form>`;
    const form = $dlg.querySelector("form");
    const errBox = form.querySelector(".form__error");
    form.addEventListener("submit", (e) => {
      if (e.submitter?.value !== "ok") return;
      const data = Object.fromEntries(new FormData(form));
      const msg = validate ? validate(data) : null;
      if (msg) {
        e.preventDefault();
        errBox.textContent = msg;
        errBox.hidden = false;
        return;
      }
      result = data;
    });
    $dlg.addEventListener("close", () => resolve(result), { once: true });
    $dlg.showModal();
    form.querySelector("input, textarea, select")?.focus();
  });
}

async function ensureName() {
  const saved = store.get("rpg-author");
  if (saved) return saved;
  const v = await openForm({
    title: "Qual é o seu nome?",
    intro: "Ele aparece nas ideias e comentários que você fizer. Fica salvo só neste navegador.",
    fields: [{ name: "author", label: "Seu nome", maxlength: LIMITS.author }],
    submit: "Continuar",
    validate: validateName,
  });
  if (!v) return null;
  const name = v.author.trim();
  store.set("rpg-author", name);
  return name;
}

const NEW_TITLES = { ideia: "Propor uma ideia", pendente: "Nova pendência", consolidado: "Registrar decisão" };

async function itemForm(stage, item = null) {
  const savedName = store.get("rpg-author") || "";
  const fields = [
    { name: "title", label: "Título", maxlength: LIMITS.title },
    { name: "category", label: "Categoria", type: "select", options: [["", "Sem categoria"], ...Object.entries(CATEGORIES)] },
    { name: "body", label: "Descrição", type: "textarea", rows: 6, maxlength: LIMITS.body, hint: "Pode usar várias linhas. Links viram clicáveis." },
  ];
  if (!item) fields.push({ name: "author", label: "Seu nome", maxlength: LIMITS.author });
  const v = await openForm({
    title: item ? "Editar" : NEW_TITLES[stage] || "Novo item",
    fields,
    values: item ? { title: item.title, category: item.category || "", body: item.body } : { author: savedName },
    submit: item ? "Salvar" : "Publicar",
    validate: validateDraft,
  });
  if (!v) return;
  if (item) {
    const who = store.get("rpg-author") || (await ensureName());
    if (!who) return;
    await run(
      () => api.updateItem(item.id, { title: v.title.trim(), body: v.body, category: v.category || null, last_editor: who }),
      "Alterações salvas."
    );
  } else {
    const author = v.author.trim();
    store.set("rpg-author", author);
    await run(() => api.createItem({ stage, title: v.title, body: v.body, category: v.category, author }), "Publicado!");
  }
}

/* ---------- Ações dos cartões ---------- */

async function moveItem(item, stage) {
  if (stage === item.stage || !STAGES[stage]) return;
  const who = await ensureName();
  if (!who) return render();
  await run(() => api.updateItem(item.id, { stage, last_editor: who }), `Movido para "${STAGES[stage].label}".`);
}

async function deleteItem(item) {
  if (!confirm(`Excluir "${item.title}"?\n\nO item some do site, mas fica guardado no histórico do banco.`)) return;
  const who = await ensureName();
  if (!who) return;
  await run(() => api.softDelete(item.id, who), "Item excluído.");
}

async function toggleVote(item) {
  const name = store.get("rpg-author");
  await run(() => (item.voted ? api.unvote(item.id, voterId) : api.vote(item.id, voterId, name)));
}

async function toggleComments(item) {
  const c = (state.comments[item.id] ||= { open: false, loading: false, list: null });
  c.open = !c.open;
  render();
  if (c.open && !c.list && !c.loading) await fetchComments(item.id);
}

async function fetchComments(id) {
  const c = state.comments[id];
  c.loading = true;
  render();
  try {
    c.list = await api.listComments(id);
  } catch (e) {
    toast(friendlyError(e), true);
    c.open = false;
  }
  c.loading = false;
  render();
}

async function addComment(item) {
  const who = await ensureName();
  if (!who) return;
  const v = await openForm({
    title: `Comentar: ${item.title}`,
    fields: [{ name: "body", label: "Comentário", type: "textarea", rows: 4, maxlength: LIMITS.comment }],
    submit: "Comentar",
    validate: validateComment,
  });
  if (!v) return;
  try {
    await api.addComment({ item_id: item.id, author: who, body: v.body });
    state.comments[item.id] = { open: true, loading: false, list: null };
    await load();
    await fetchComments(item.id);
    toast("Comentário enviado.");
  } catch (e) {
    toast(friendlyError(e), true);
  }
}

/* ---------- Peças ---------- */

function card(i) {
  const st = STAGES[i.stage];
  const c = state.comments[i.id];
  const edited = i.lastEditor && new Date(i.updatedAt) - new Date(i.createdAt) > 2000;
  return `<article class="card" data-id="${esc(i.id)}" style="--accent:${st.color}">
    <div class="card__chips">
      <span class="chip chip--stage">${st.label}</span>
      ${i.category ? `<span class="chip">${esc(CATEGORIES[i.category])}</span>` : ""}
    </div>
    <h3 class="card__title">${esc(i.title)}</h3>
    <div class="card__meta">
      <span>${esc(i.author)}</span><span>·</span><time datetime="${esc(i.createdAt)}">${formatDate(i.createdAt)}</time>
      ${edited ? `<span>· editado por ${esc(i.lastEditor)}</span>` : ""}
    </div>
    ${i.body ? `<div class="card__text">${textToHtml(i.body)}</div>` : ""}
    <div class="card__actions">
      <button type="button" class="act act--vote" data-act="vote" aria-pressed="${i.voted}" title="${i.voted ? "Tirar meu voto" : "Votar"}">👍 ${i.votes}</button>
      <button type="button" class="act" data-act="comments" aria-expanded="${Boolean(c?.open)}" title="Comentários">💬 ${i.comments}</button>
      <label class="move"><span class="sr">Mover para</span>
        <select data-act="move">
          <option value="">Mover para…</option>
          ${STAGE_ORDER.filter((s) => s !== i.stage).map((s) => `<option value="${s}">${STAGES[s].label}</option>`).join("")}
        </select>
      </label>
      <button type="button" class="act" data-act="edit">Editar</button>
      <button type="button" class="act act--danger" data-act="delete">Excluir</button>
    </div>
    ${c?.open ? commentsBlock(c) : ""}
  </article>`;
}

function commentsBlock(c) {
  const list = c.loading && !c.list
    ? `<p class="empty">Carregando…</p>`
    : (c.list || []).length
    ? `<ul class="comments">${c.list
        .map(
          (m) => `<li><b>${esc(m.author)}</b> <small>${formatDate(m.created_at)}</small><div>${textToHtml(m.body)}</div></li>`
        )
        .join("")}</ul>`
    : `<p class="empty">Ainda não há comentários.</p>`;
  return `<div class="card__comments">${list}<button type="button" class="act" data-act="comment">Escrever comentário</button></div>`;
}

function emptyPanel(text, stage, cta) {
  return `<div class="panel empty">${text}<div class="btn-row" style="justify-content:center">
    <button type="button" class="btn" data-act="new" data-stage="${stage}">${cta}</button></div></div>`;
}

function statusBar() {
  return `<div class="status-bar"><span>${state.loadedAt ? `Atualizado às ${formatTime(state.loadedAt)}.` : ""}</span>
    <button type="button" class="linklike" data-act="refresh">Atualizar agora</button></div>`;
}

function setupNotice() {
  return `<div class="panel panel--notice">
    <h2 class="section-title">Falta ligar o site ao banco de dados</h2>
    <p>No Supabase, abra <b>Project Settings → API</b>, copie a <b>Project URL</b> e a chave <b>anon / publishable</b> e cole em
    <code>site/js/config.js</code> (campo <code>supabase</code>). Depois rode o arquivo <code>supabase/schema.sql</code> no <b>SQL Editor</b>.
    O passo a passo completo está no README.</p>
  </div>`;
}

function errorNotice() {
  return `<div class="panel panel--notice"><h2 class="section-title">Não foi possível carregar</h2>
    <p>${esc(friendlyError(state.error))}</p>
    <div class="btn-row"><button type="button" class="btn" data-act="refresh">Tentar de novo</button></div></div>`;
}

function gate(content) {
  if (!configured) return setupNotice();
  if (state.error && !state.grouped) return errorNotice();
  if (!state.grouped) return `<div class="panel empty">Carregando os pergaminhos…</div>`;
  return content();
}

/* ---------- Visões ---------- */

function viewInicio() {
  const g = state.grouped;
  const n = (k) => (g ? g[k].length : "–");
  const steps = [
    { id: "ideias", stage: "ideia", n: n("ideia"), t: "Ideias", d: "Propostas abertas para a equipe votar e comentar." },
    { id: "pendencias", stage: "pendente", n: n("pendente"), t: "A fazer", d: "Aprovado, esperando alguém pegar." },
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
        configured
          ? `<div class="btn-row">
              <button type="button" class="btn" data-act="new" data-stage="ideia">Propor uma ideia</button>
              <a class="btn btn--ghost" href="#pendencias">Ver pendências</a>
              <a class="btn btn--ghost" href="#consolidado">O que já está decidido</a>
            </div>`
          : ""
      }
    </section>
    ${!configured ? setupNotice() : ""}
    ${configured && state.error ? errorNotice() : ""}
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

function viewIdeias() {
  return gate(() => {
    const g = state.grouped;
    let list = [...g.ideia];
    if (state.showArchived) list = list.concat(g.arquivada);
    const shown = state.category === "todas" ? list : list.filter((i) => i.category === state.category);
    return `<div class="stack">
      <section class="panel">
        <div class="view-head"><h2>Ideias</h2>
          <button type="button" class="btn" data-act="new" data-stage="ideia">Propor uma ideia</button></div>
        <p class="lead">As mais votadas aparecem primeiro. Vote com 👍, comente e, quando a equipe concordar, mova para "A fazer".</p>
        <div class="filters" role="group" aria-label="Filtrar por categoria">
          <button type="button" class="chip" data-cat="todas" aria-pressed="${state.category === "todas"}">Todas</button>
          ${Object.entries(CATEGORIES)
            .map(([k, v]) => `<button type="button" class="chip" data-cat="${k}" aria-pressed="${state.category === k}">${esc(v)}</button>`)
            .join("")}
          <label class="check"><input type="checkbox" data-act="archived" ${state.showArchived ? "checked" : ""} /> mostrar arquivadas</label>
        </div>
      </section>
      ${
        shown.length
          ? `<div class="grid">${shown.map(card).join("")}</div>`
          : emptyPanel("Nenhuma ideia por aqui ainda.", "ideia", "Seja o primeiro a propor")
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
      ${items.length ? items.map(card).join("") : `<div class="panel empty">Nada aqui.</div>`}</div>`;
    return `<div class="stack">
      <section class="panel">
        <div class="view-head"><h2>Pendências</h2>
          <button type="button" class="btn" data-act="new" data-stage="pendente">Nova pendência</button></div>
        <p class="lead">O que ainda precisa ser feito para o jogo ficar de pé. Ao terminar, mova para "Consolidado".</p>
      </section>
      <div class="board">
        ${col("pendente", "A fazer", g.pendente)}
        ${col("andamento", "Em andamento", g.andamento)}
      </div>
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
          <button type="button" class="btn" data-act="new" data-stage="consolidado">Registrar decisão</button></div>
        <p class="lead">Regras e decisões que a equipe já fechou, da mais recente para a mais antiga.</p>
      </section>
      ${items.length ? `<div class="grid">${items.map(card).join("")}</div>` : emptyPanel("Ainda não há nada consolidado.", "consolidado", "Registrar a primeira decisão")}
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
    return render();
  }
  const btn = e.target.closest("button[data-act]");
  if (!btn || !api) return;
  const act = btn.dataset.act;
  if (act === "refresh") return load();
  if (act === "new") return itemForm(btn.dataset.stage);
  const item = findItem(btn.closest("[data-id]")?.dataset.id);
  if (!item) return;
  if (act === "vote") return toggleVote(item);
  if (act === "comments") return toggleComments(item);
  if (act === "comment") return addComment(item);
  if (act === "edit") return itemForm(item.stage, item);
  if (act === "delete") return deleteItem(item);
});

$app.addEventListener("change", (e) => {
  const t = e.target;
  if (t.matches('input[data-act="archived"]')) {
    state.showArchived = t.checked;
    return render();
  }
  if (t.matches('select[data-act="move"]') && t.value) {
    const item = findItem(t.closest("[data-id]")?.dataset.id);
    if (item) moveItem(item, t.value);
  }
});

$export.addEventListener("click", async () => {
  try {
    const data = await api.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch (e) {
    toast(friendlyError(e), true);
  }
});

/* ---------- Início ---------- */

document.getElementById("brand").textContent = CONFIG.projectName;
$export.hidden = !configured;
render();
load();
if (configured) {
  setInterval(() => {
    if (!document.hidden && !$dlg.open) load({ quiet: true });
  }, CONFIG.refreshSeconds * 1000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !$dlg.open) load({ quiet: true });
  });
}
