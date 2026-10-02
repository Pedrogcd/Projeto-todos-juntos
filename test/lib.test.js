import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isConfigured,
  normalizeItem,
  groupItems,
  validateDraft,
  validateComment,
  validateName,
  escapeHtml,
  textToHtml,
  newVoterId,
  STAGES,
} from "../site/js/lib.js";

const row = (over = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  stage: "ideia",
  title: "Atributos em graus",
  body: "Texto",
  category: "mecanica",
  author: "Pedro",
  last_editor: null,
  created_at: "2026-10-01T10:00:00Z",
  updated_at: "2026-10-01T10:00:00Z",
  rpg_votes: [{ count: 3 }],
  rpg_comments: [{ count: 2 }],
  ...over,
});

test("isConfigured exige URL https e chave", () => {
  assert.equal(isConfigured({ url: "", anonKey: "" }), false);
  assert.equal(isConfigured({ url: "http://x.supabase.co", anonKey: "a".repeat(30) }), false);
  assert.equal(isConfigured({ url: "https://x.supabase.co", anonKey: "curta" }), false);
  assert.equal(isConfigured({ url: "https://x.supabase.co", anonKey: "a".repeat(30) }), true);
  assert.equal(isConfigured(undefined), false);
});

test("normalizeItem traduz contagens, voto próprio e valores desconhecidos", () => {
  const n = normalizeItem(row(), new Set(["11111111-1111-4111-8111-111111111111"]));
  assert.equal(n.votes, 3);
  assert.equal(n.comments, 2);
  assert.equal(n.voted, true);
  assert.equal(n.category, "mecanica");

  const m = normalizeItem(row({ stage: "xyz", category: "abc", rpg_votes: [], rpg_comments: undefined }));
  assert.equal(m.stage, "ideia");
  assert.equal(m.category, null);
  assert.equal(m.votes, 0);
  assert.equal(m.comments, 0);
  assert.equal(m.voted, false);
});

test("groupItems separa por etapa; ideias por votos, resto por atualização", () => {
  const mk = (id, stage, votes, updated) => ({
    id, stage, votes, createdAt: updated, updatedAt: updated,
  });
  const g = groupItems([
    mk("a", "ideia", 1, "2026-01-01"),
    mk("b", "ideia", 5, "2026-01-02"),
    mk("c", "pendente", 0, "2026-01-01"),
    mk("d", "pendente", 0, "2026-02-01"),
    mk("e", "consolidado", 0, "2026-02-01"),
  ]);
  assert.deepEqual(g.ideia.map((i) => i.id), ["b", "a"]);
  assert.deepEqual(g.pendente.map((i) => i.id), ["d", "c"]);
  assert.equal(g.consolidado.length, 1);
  assert.deepEqual(Object.keys(g), Object.keys(STAGES));
});

test("validateDraft, validateComment e validateName", () => {
  assert.match(validateDraft({ title: "  " }), /título/);
  assert.match(validateDraft({ title: "x".repeat(141) }), /140/);
  assert.match(validateDraft({ title: "ok", body: "x".repeat(6001) }), /6000/);
  assert.match(validateDraft({ title: "ok", author: " " }), /nome/);
  assert.equal(validateDraft({ title: "ok", body: "", author: "Ana" }), null);
  assert.equal(validateDraft({ title: "ok" }), null);
  assert.match(validateComment({ body: "" }), /comentário/);
  assert.equal(validateComment({ body: "oi" }), null);
  assert.match(validateName({ author: "" }), /nome/);
  assert.equal(validateName({ author: "Ana" }), null);
});

test("textToHtml escapa HTML, linka http(s) e preserva quebras", () => {
  assert.equal(escapeHtml(`<b>"x"</b> & 'y'`), "&lt;b&gt;&quot;x&quot;&lt;/b&gt; &amp; &#39;y&#39;");
  const html = textToHtml("<script>alert(1)</script>\nveja https://exemplo.com/a?b=1&c=2.");
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("<br>"));
  assert.ok(html.includes('href="https://exemplo.com/a?b=1&amp;c=2"'));
  assert.ok(html.endsWith("</a>."));
  assert.ok(!textToHtml("javascript:alert(1)").includes("<a "));
});

test("newVoterId gera ids longos o bastante, com ou sem crypto", () => {
  assert.ok(newVoterId().length >= 8);
  const fallback = newVoterId({});
  assert.ok(fallback.length >= 8 && fallback.length <= 64);
});
