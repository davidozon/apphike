// App Hike — Worker Cloudflare de sauvegarde en ligne.
// À coller dans un Worker Cloudflare. Il faut :
//   - une liaison KV nommée BK (Workers KV, pas de carte bancaire nécessaire) ;
//   - un secret nommé TOKEN (la clé secrète saisie dans App Hike).
// PUT /backup : enregistre la sauvegarde (la dernière + les 10 précédentes).
// GET /backup : renvoie la dernière sauvegarde.
const KEEP = 10;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
  "Access-Control-Allow-Headers": "Authorization,Content-Type",
  "Access-Control-Max-Age": "86400",
};
const json = (o, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);
    if (url.pathname !== "/backup") return json({ error: "not found" }, 404);
    if (!env.BK || !env.TOKEN) return json({ error: "Worker mal configuré : liaison KV « BK » ou secret « TOKEN » manquant" }, 500);
    if (!same(req.headers.get("Authorization") || "", "Bearer " + env.TOKEN)) return json({ error: "unauthorized" }, 401);
    if (req.method === "GET") {
      const v = await env.BK.get("latest");
      return v ? new Response(v, { headers: { ...CORS, "Content-Type": "application/json" } }) : json({ error: "empty" }, 404);
    }
    if (req.method === "PUT") {
      const t = await req.text();
      if (t.length > 20e6) return json({ error: "too large" }, 413);
      let o;
      try { o = JSON.parse(t); } catch { return json({ error: "invalid json" }, 400); }
      if (o.app !== "apphike-history" || !Array.isArray(o.sessions)) return json({ error: "invalid backup" }, 400);
      const at = new Date().toISOString();
      await env.BK.put("latest", t);
      await env.BK.put("b-" + at, t);
      const l = await env.BK.list({ prefix: "b-" });
      const ks = l.keys.map((k) => k.name).sort();
      for (const k of ks.slice(0, Math.max(0, ks.length - KEEP))) await env.BK.delete(k);
      return json({ ok: true, at, sessions: o.sessions.length });
    }
    return json({ error: "method not allowed" }, 405);
  },
};
