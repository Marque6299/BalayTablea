// create-staff-account v3 (Balay Tablea v5) — deployed to Supabase project mmbdewpfmybfkczczdhn.
// Caller must be an active owner or manager. DOWNLINE ONLY: new role must rank strictly below the caller
// (owner -> admin|manager|staff, manager -> staff). Never overwrites an existing row (409). Crypto temp password.
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

function genTempPassword(len = 16) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  const limit = Math.floor(0x100000000 / chars.length) * chars.length;
  let out = ""; const buf = new Uint32Array(1);
  while (out.length < len) { crypto.getRandomValues(buf); if (buf[0] < limit) out += chars[buf[0] % chars.length]; }
  return out;
}
const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
    const { data: { user: caller }, error: callerErr } = await callerClient.auth.getUser();
    if (callerErr || !caller) return json({ error: "Not authenticated" }, 401);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: me } = await admin.from("staff").select("role,status").eq("auth_user_id", caller.id).maybeSingle();
    if (!me || me.status === "suspended") return json({ error: "Not allowed" }, 403);
    if (me.role !== "owner" && me.role !== "manager") return json({ error: "Only owners and managers can register staff" }, 403);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    let first = clean(body.first_name), last = clean(body.last_name);
    if ((!first || !last) && clean(body.full_name)) {
      const parts = clean(body.full_name).split(/\s+/);
      last = parts.length > 1 ? parts.pop()! : ""; first = parts.join(" ");
    }
    if (first.length < 1 || first.length > 60 || last.length < 1 || last.length > 60) return json({ error: "First and last name are required (max 60 characters each)" }, 400);
    const email = clean(body.email).toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) return json({ error: "A valid email is required" }, 400);
    const phone = clean(body.phone).replace(/[\s-]/g, "");
    if (!/^(\+63|0)9\d{9}$/.test(phone)) return json({ error: "A valid PH mobile number is required" }, 400);
    const dob = clean(body.date_of_birth);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || Number.isNaN(Date.parse(dob))) return json({ error: "A valid date of birth is required" }, 400);
    const cutoff = new Date(); cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 18);
    if (dob < "1900-01-01" || new Date(dob) > cutoff) return json({ error: "Staff must be at least 18 years old" }, 400);

    const role = clean(body.role) || "staff";
    if (!(role in RANK)) return json({ error: "Unknown role" }, 400);
    if (RANK[role] >= RANK[me.role]) return json({ error: "You can only create roles below your own" }, 403);

    const { data: existing } = await admin.from("staff").select("id").eq("email", email).maybeSingle();
    if (existing) return json({ error: "This email is already registered" }, 409);

    const fullName = `${first} ${last}`;
    const tempPassword = genTempPassword();
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password: tempPassword, email_confirm: true, user_metadata: { full_name: fullName, role },
    });
    if (createErr) {
      const dup = /already|registered|exists/i.test(createErr.message);
      return json({ error: dup ? "This email is already registered" : createErr.message }, dup ? 409 : 400);
    }
    const newUserId = created.user!.id;
    const { data: staffRow, error: staffErr } = await admin.from("staff").insert({
      auth_user_id: newUserId, first_name: first, last_name: last, full_name: fullName, email, phone,
      date_of_birth: dob, role, status: "active", invited_by: caller.id,
    }).select("id,full_name,email,phone,role,status").single();
    if (staffErr) {
      await admin.auth.admin.deleteUser(newUserId);
      return json({ error: staffErr.code === "23505" ? "This email is already registered" : staffErr.message }, staffErr.code === "23505" ? 409 : 400);
    }
    return json({ staff: staffRow, temp_password: tempPassword });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
