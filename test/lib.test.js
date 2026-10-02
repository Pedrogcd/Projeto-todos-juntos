import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectRepo,
  classifyIssue,
  categoryFromBody,
  normalizeIssue,
  groupIssues,
  fetchIssues,
  newIssueUrl,
} from "../site/js/lib.js";

const issue = (over = {}) => ({
  number: 1,
  title: "Ideia",
  html_url: "https://github.com/o/r/issues/1",
  state: "open",
  labels: [{ name: "ideia" }],
  body: "",
  body_html: "<p>oi</p>",
  user: { login: "pedro", avatar_url: "https://x/a.png" },
  created_at: "2026-10-01T10:00:00Z",
  updated_at: "2026-10-01T10:00:00Z",
  comments: 2,
  reactions: { "+1": 3 },
  ...over,
});

const fakeStorage = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
};

test("detectRepo: GitHub Pages de projeto, de usuário, ?repo= e config", () => {
  assert.deepEqual(
    detectRepo({ hostname: "pedrogcd.github.io", pathname: "/rpg-novo/", search: "" }),
    { owner: "pedrogcd", name: "rpg-novo" }
  );
  assert.deepEqual(
    detectRepo({ hostname: "pedrogcd.github.io", pathname: "/index.html", search: "" }),
    { owner: "pedrogcd", name: "pedrogcd.github.io" }
  );
  assert.deepEqual(
    detectRepo({ hostname: "localhost", pathname: "/", search: "?repo=a/b" }),
    { owner: "a", name: "b" }
  );
  assert.deepEqual(
    detectRepo({ hostname: "meusite.com", pathname: "/", search: "" }, { owner: "x", name: "y" }),
    { owner: "x", name: "y" }
  );
  assert.equal(detectRepo({ hostname: "localhost", pathname: "/", search: "" }), null);
});

test("classifyIssue: etapas e prioridade das etiquetas", () => {
  assert.equal(classifyIssue(issue()).stage, "ideia");
  assert.equal(classifyIssue(issue({ state: "closed" })).stage, "arquivada");
  assert.equal(classifyIssue(issue({ labels: [{ name: "ideia" }, { name: "pendente" }] })).stage, "pendente");
  assert.equal(classifyIssue(issue({ labels: ["pendente", "em-andamento"] })).stage, "andamento");
  assert.equal(classifyIssue(issue({ labels: ["pendente"], state: "closed" })).stage, "concluida");
  assert.equal(classifyIssue(issue({ labels: ["ideia", "consolidado"], state: "closed" })).stage, "consolidado");
  assert.equal(classifyIssue(issue({ labels: ["bug"] })), null);
});

test("categoria vem da etiqueta ou do campo do formulário", () => {
  assert.equal(classifyIssue(issue({ labels: ["ideia", "mundo"] })).category, "mundo");
  assert.equal(categoryFromBody("### Resumo\n\nx\n\n### Categoria\n\nArte e visual\n"), "arte");
  assert.equal(categoryFromBody("### Categoria\n\nMecânicas"), "mecanica");
  assert.equal(categoryFromBody("sem campo"), null);
  assert.equal(
    classifyIssue(issue({ body: "### Categoria\n\nNarrativa" })).category,
    "narrativa"
  );
});

test("normalizeIssue ignora pull requests e issues fora do fluxo", () => {
  assert.equal(normalizeIssue(issue({ pull_request: {} })), null);
  assert.equal(normalizeIssue(issue({ labels: [] })), null);
  const n = normalizeIssue(issue());
  assert.equal(n.votes, 3);
  assert.equal(n.author, "pedro");
  assert.equal(n.bodyHtml, "<p>oi</p>");
});

test("groupIssues ordena ideias por votos e o resto por atualização", () => {
  const mk = (id, votes, updated, stage = "ideia") => ({
    id, votes, stage, createdAt: updated, updatedAt: updated,
  });
  const g = groupIssues([
    mk(1, 1, "2026-01-01"),
    mk(2, 5, "2026-01-02"),
    mk(3, 0, "2026-01-01", "pendente"),
    mk(4, 0, "2026-02-01", "pendente"),
  ]);
  assert.deepEqual(g.ideia.map((i) => i.id), [2, 1]);
  assert.deepEqual(g.pendente.map((i) => i.id), [4, 3]);
});

test("fetchIssues: rede, cache, cache antigo em caso de erro e erro sem cache", async () => {
  const repo = { owner: "o", name: "r" };
  const storage = fakeStorage();
  let calls = 0;
  const ok = async () => {
    calls++;
    return { ok: true, json: async () => [issue(), issue({ number: 2, pull_request: {} })] };
  };
  const r1 = await fetchIssues({ repo, fetchImpl: ok, storage, now: 1000 });
  assert.equal(r1.source, "network");
  assert.equal(r1.issues.length, 1);

  const r2 = await fetchIssues({ repo, fetchImpl: ok, storage, now: 2000 });
  assert.equal(r2.source, "cache");
  assert.equal(calls, 1);

  const limited = async () => ({ ok: false, status: 403 });
  const r3 = await fetchIssues({ repo, fetchImpl: limited, storage, now: 10 * 60 * 1000 });
  assert.equal(r3.stale, true);
  assert.equal(r3.issues.length, 1);

  await assert.rejects(
    fetchIssues({ repo: { owner: "x", name: "y" }, fetchImpl: limited, storage: fakeStorage() }),
    /403/
  );
});

test("fetchIssues pagina quando a página vem cheia", async () => {
  const repo = { owner: "o", name: "r" };
  const full = Array.from({ length: 100 }, (_, i) => issue({ number: i + 1 }));
  let page = 0;
  const f = async () => ({ ok: true, json: async () => (++page === 1 ? full : [issue({ number: 999 })]) });
  const r = await fetchIssues({ repo, fetchImpl: f, force: true });
  assert.equal(r.issues.length, 101);
});

test("newIssueUrl", () => {
  assert.equal(
    newIssueUrl({ owner: "o", name: "r" }, "ideia.yml"),
    "https://github.com/o/r/issues/new?template=ideia.yml"
  );
});
