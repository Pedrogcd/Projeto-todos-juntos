// Cliente mínimo da API REST do Supabase (PostgREST), sem dependências.
// Recebe `fetchImpl` para poder ser testado sem rede.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertId(id) {
  if (!UUID_RE.test(String(id))) throw new Error("Identificador inválido.");
  return id;
}

export function createApi({ url, key, fetchImpl = (...a) => fetch(...a) }) {
  const base = String(url).replace(/\/+$/, "") + "/rest/v1";
  const baseHeaders = { apikey: key, "Content-Type": "application/json" };
  // Chaves novas ("sb_publishable_...") não são JWT e não vão em Authorization.
  if (!String(key).startsWith("sb_")) baseHeaders.Authorization = `Bearer ${key}`;

  async function req(path, { method = "GET", body, prefer } = {}) {
    const headers = { ...baseHeaders };
    if (prefer) headers.Prefer = prefer;
    const res = await fetchImpl(base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      let message = "";
      try {
        message = JSON.parse(text).message || "";
      } catch {
        /* resposta sem JSON */
      }
      throw Object.assign(new Error(message || `Erro ${res.status}`), { status: res.status });
    }
    return text ? JSON.parse(text) : null;
  }

  const returning = "return=representation";

  return {
    /** Itens ativos, com contagem de votos e comentários. */
    listItems() {
      return req(
        "/rpg_items?select=*,rpg_votes(count),rpg_comments(count)&deleted_at=is.null&order=created_at.desc&limit=1000"
      );
    },
    /** Ids dos itens em que este navegador já votou. */
    myVotes(voterId) {
      return req(`/rpg_votes?select=item_id&voter_id=eq.${encodeURIComponent(voterId)}&limit=1000`);
    },
    async createItem({ stage, title, body, category, author }) {
      const rows = await req("/rpg_items", {
        method: "POST",
        prefer: returning,
        body: { stage, title: title.trim(), body: body ?? "", category: category || null, author: author.trim() },
      });
      return rows[0];
    },
    async updateItem(id, patch) {
      const rows = await req(`/rpg_items?id=eq.${assertId(id)}`, {
        method: "PATCH",
        prefer: returning,
        body: patch,
      });
      return rows[0];
    },
    /** "Excluir" só esconde; o item continua no banco e no histórico. */
    softDelete(id, editor) {
      return this.updateItem(id, { deleted_at: new Date().toISOString(), last_editor: editor });
    },
    async listComments(itemId) {
      return req(`/rpg_comments?item_id=eq.${assertId(itemId)}&order=created_at.asc&limit=500`);
    },
    async addComment({ item_id, author, body }) {
      return req("/rpg_comments", {
        method: "POST",
        prefer: "return=minimal",
        body: { item_id: assertId(item_id), author: author.trim(), body: body.trim() },
      });
    },
    async vote(itemId, voterId, voterName) {
      return req("/rpg_votes?on_conflict=item_id,voter_id", {
        method: "POST",
        prefer: "resolution=ignore-duplicates,return=minimal",
        body: { item_id: assertId(itemId), voter_id: voterId, voter_name: voterName || null },
      });
    },
    async unvote(itemId, voterId) {
      return req(`/rpg_votes?item_id=eq.${assertId(itemId)}&voter_id=eq.${encodeURIComponent(voterId)}`, {
        method: "DELETE",
        prefer: "return=minimal",
      });
    },
    /** Tudo, inclusive itens excluídos, para backup. */
    async exportAll() {
      const [items, comments, history] = await Promise.all([
        req("/rpg_items?select=*&order=created_at.asc&limit=10000"),
        req("/rpg_comments?select=*&order=created_at.asc&limit=10000"),
        req("/rpg_history?select=*&order=created_at.asc&limit=10000"),
      ]);
      return { exportedAt: new Date().toISOString(), items, comments, history };
    },
  };
}
