// set-staff-status v2 (Balay Tablea v5) — deployed to Supabase project mmbdewpfmybfkczczdhn.
// DOWNLINE ONLY: caller may change status only for a target ranked strictly below them; never their own.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RANK: Record<string, number> = { staff: 1, manager: 2, admin: 3, owner: 4 };
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
    const { data: { user: caller }, error: callerErr } = await callerClient.auth.getUser();
    if (callerErr || !caller) return json({ error: "Not authenticated" }, 401);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: me } = await admin.from("staff").select("role,status").eq("auth_user_id", caller.id).maybeSingle();
    if (!me || me.status === "suspended" || !(me.role in RANK)) return json({ error: "Not allowed" }, 403);

    const { staff_id, status } = (await req.json().catch(() => ({}))) as { staff_id?: string; status?: string };
    if (!staff_id || !["active", "suspended"].includes(status || "")) return json({ error: "staff_id and a valid status are required" }, 400);

    const { data: target, error: tErr } = await admin.from("staff").select("auth_user_id,role").eq("id", staff_id).maybeSingle();
    if (tErr || !target) return json({ error: "Staff member not found" }, 404);
    if (target.auth_user_id === caller.id) return json({ error: "You cannot change your own status" }, 403);
    if (!(target.role in RANK) || RANK[target.role] >= RANK[me.role]) return json({ error: "You can only manage roles below your own" }, 403);

    if (target.auth_user_id) {
      const { error: banErr } = await admin.auth.admin.updateUserById(target.auth_user_id, { ban_duration: status === "suspended" ? "876000h" : "none" });
      if (banErr) return json({ error: banErr.message }, 400);
    }
    const { error: updateErr } = await admin.from("staff").update({ status }).eq("id", staff_id);
    if (updateErr) return json({ error: updateErr.message }, 400);
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
