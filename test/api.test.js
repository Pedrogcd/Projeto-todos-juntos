import { test } from "node:test";
import assert from "node:assert/strict";
import { createApi } from "../site/js/api.js";

const ID = "11111111-1111-4111-8111-111111111111";

function mock(responses = []) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const r = responses.shift() ?? { status: 200, body: [] };
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      text: async () => (r.body === undefined ? "" : JSON.stringify(r.body)),
    };
  };
  return { calls, fetchImpl };
}

const KEY_JWT = "eyJ" + "a".repeat(40);
const KEY_NEW = "sb_publishable_" + "a".repeat(20);

test("cabeçalhos: chave antiga vai em Authorization, chave nova só em apikey", async () => {
  const a = mock();
  await createApi({ url: "https://x.supabase.co/", key: KEY_JWT, fetchImpl: a.fetchImpl }).listItems();
  assert.equal(a.calls[0].init.headers.apikey, KEY_JWT);
  assert.equal(a.calls[0].init.headers.Authorization, `Bearer ${KEY_JWT}`);
  assert.ok(a.calls[0].url.startsWith("https://x.supabase.co/rest/v1/rpg_items?"));

  const b = mock();
  await createApi({ url: "https://x.supabase.co", key: KEY_NEW, fetchImpl: b.fetchImpl }).listItems();
  assert.equal(b.calls[0].init.headers.apikey, KEY_NEW);
  assert.equal(b.calls[0].init.headers.Authorization, undefined);
});

test("listItems pede só itens não excluídos, com contagens", async () => {
  const m = mock([{ status: 200, body: [{ id: ID }] }]);
  const rows = await createApi({ url: "https://x.co", key: KEY_NEW, fetchImpl: m.fetchImpl }).listItems();
  assert.deepEqual(rows, [{ id: ID }]);
  assert.match(m.calls[0].url, /deleted_at=is\.null/);
  assert.match(m.calls[0].url, /rpg_votes\(count\)/);
  assert.match(m.calls[0].url, /rpg_comments\(count\)/);
});

test("createItem envia dados limpos e devolve a linha criada", async () => {
  const m = mock([{ status: 201, body: [{ id: ID, title: "T" }] }]);
  const api = createApi({ url: "https://x.co", key: KEY_NEW, fetchImpl: m.fetchImpl });
  const item = await api.createItem({ stage: "ideia", title: "  T ", body: "b", category: "", author: " Ana " });
  assert.equal(item.id, ID);
  const sent = JSON.parse(m.calls[0].init.body);
  assert.deepEqual(sent, { stage: "ideia", title: "T", body: "b", category: null, author: "Ana" });
  assert.equal(m.calls[0].init.method, "POST");
  assert.equal(m.calls[0].init.headers.Prefer, "return=representation");
});

test("updateItem e softDelete usam PATCH no id certo", async () => {
  const m = mock([
    { status: 200, body: [{ id: ID }] },
    { status: 200, body: [{ id: ID }] },
  ]);
  const api = createApi({ url: "https://x.co", key: KEY_NEW, fetchImpl: m.fetchImpl });
  await api.updateItem(ID, { stage: "pendente", last_editor: "Ana" });
  assert.equal(m.calls[0].init.method, "PATCH");
  assert.ok(m.calls[0].url.endsWith(`/rpg_items?id=eq.${ID}`));
  await api.softDelete(ID, "Ana");
  const body = JSON.parse(m.calls[1].init.body);
  assert.equal(body.last_editor, "Ana");
  assert.ok(!Number.isNaN(Date.parse(body.deleted_at)));
});

test("ids que não são UUID são recusados antes de ir para a URL", async () => {
  const m = mock();
  const api = createApi({ url: "https://x.co", key: KEY_NEW, fetchImpl: m.fetchImpl });
  await assert.rejects(api.updateItem("1;drop table", {}), /inválido/);
  await assert.rejects(api.listComments("abc&x=1"), /inválido/);
  await assert.rejects(api.unvote("../x", "voter-123456"), /inválido/);
  assert.equal(m.calls.length, 0);
});

test("votos: inserir ignora duplicado; remover filtra por item e votante", async () => {
  const m = mock([{ status: 201 }, { status: 204 }]);
  const api = createApi({ url: "https://x.co", key: KEY_NEW, fetchImpl: m.fetchImpl });
  assert.equal(await api.vote(ID, "voter-123456", "Ana"), null);
  assert.match(m.calls[0].url, /on_conflict=item_id,voter_id/);
  assert.match(m.calls[0].init.headers.Prefer, /ignore-duplicates/);
  await api.unvote(ID, "voter 12&3");
  assert.equal(m.calls[1].init.method, "DELETE");
  assert.match(m.calls[1].url, /voter_id=eq\.voter%2012%263$/);
});

test("comentários: lista por item e envia texto limpo", async () => {
  const m = mock([{ status: 200, body: [{ body: "oi" }] }, { status: 201 }]);
  const api = createApi({ url: "https://x.co", key: KEY_NEW, fetchImpl: m.fetchImpl });
  assert.deepEqual(await api.listComments(ID), [{ body: "oi" }]);
  await api.addComment({ item_id: ID, author: " Ana ", body: " oi " });
  assert.deepEqual(JSON.parse(m.calls[1].init.body), { item_id: ID, author: "Ana", body: "oi" });
});

test("erros do banco viram Error com status e mensagem", async () => {
  const m = mock([
    { status: 403, body: { message: "permission denied" } },
    { status: 500, body: undefined },
  ]);
  const api = createApi({ url: "https://x.co", key: KEY_NEW, fetchImpl: m.fetchImpl });
  await assert.rejects(api.listItems(), (e) => e.status === 403 && /permission denied/.test(e.message));
  await assert.rejects(api.listItems(), (e) => e.status === 500 && /Erro 500/.test(e.message));
});

test("exportAll junta itens, comentários e histórico", async () => {
  const m = mock([
    { status: 200, body: [{ id: 1 }] },
    { status: 200, body: [{ id: 2 }] },
    { status: 200, body: [{ id: 3 }] },
  ]);
  const out = await createApi({ url: "https://x.co", key: KEY_NEW, fetchImpl: m.fetchImpl }).exportAll();
  assert.deepEqual([out.items, out.comments, out.history], [[{ id: 1 }], [{ id: 2 }], [{ id: 3 }]]);
  assert.ok(out.exportedAt);
});
