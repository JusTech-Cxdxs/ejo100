/**
 * Supabase public-API exposure check (CI Postgres, or any throw-away Postgres).
 *
 * Supabase exposes every table in `public` through PostgREST to the `anon`
 * role (key in every browser) and to `authenticated`. CI creates those roles
 * with Supabase's default grants BEFORE the schema is pushed
 * (rls-supabase-roles.sql), then runs the real deploy SQL; this proves,
 * AS those roles, that nothing is reachable:
 *
 *  RLS-01 row-level security is ON for every table in public
 *  RLS-02 no policies exist (default deny) — or none for anon/authenticated
 *  RLS-03 anon / authenticated hold no table privilege of any kind
 *  RLS-04 … and no sequence privilege
 *  RLS-05 default privileges for future tables grant them nothing
 *  RLS-06 live attempts (SET ROLE anon / authenticated): SELECT / INSERT /
 *         UPDATE / DELETE on every table and nextval on every sequence fail
 *  RLS-07 functions in public executable by anon (PostgREST RPC surface)
 *  RLS-08 a table created AFTER the deploy SQL (next migration): grants? RLS?
 */
import { Pool } from 'pg';
import { report, type Check } from './lib';

const url = process.env.RLS_DATABASE_URL ?? process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const pool = new Pool({ connectionString: url, max: 2 });
const q = async <T = Record<string, unknown>>(t: string, p: unknown[] = []) => (await pool.query(t, p)).rows as T[];
const ROLES = ['anon', 'authenticated'];

async function main() {
  const checks: Check[] = [];
  const tables = await q<{ t: string; rls: boolean; force: boolean }>(`SELECT c.relname t, c.relrowsecurity rls, c.relforcerowsecurity force FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY 1`);
  const seqs = await q<{ s: string }>(`SELECT c.relname s FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='S' ORDER BY 1`);
  const roles = await q<{ rolname: string }>(`SELECT rolname FROM pg_roles WHERE rolname = ANY($1)`, [ROLES]);
  if (roles.length !== ROLES.length) checks.push({ id: 'RLS-00', title: 'Supabase roles present', pass: false, detail: `missing: ${ROLES.filter((r) => !roles.some((x) => x.rolname === r)).join(',')} — create them first (rls-supabase-roles.sql)` });

  const noRls = tables.filter((t) => !t.rls).map((t) => t.t);
  checks.push({ id: 'RLS-01', title: `row-level security ON for all ${tables.length} public tables`, pass: tables.length > 0 && noRls.length === 0, detail: noRls.length ? `RLS OFF: ${noRls.join(', ')}` : `${tables.length}/${tables.length} enabled` });

  const pol = await q<{ tablename: string; policyname: string; roles: string[] }>(`SELECT tablename, policyname, roles FROM pg_policies WHERE schemaname='public'`);
  const openPol = pol.filter((p) => (p.roles as unknown as string).toString().match(/public|anon|authenticated/));
  checks.push({ id: 'RLS-02', title: 'no policy opens a table to anon / authenticated', pass: openPol.length === 0, detail: `${pol.length} policies in public${openPol.length ? `; OPEN: ${openPol.map((p) => `${p.tablename}.${p.policyname}`).join(', ')}` : ''}` });

  const tablePriv: string[] = [];
  const seqPriv: string[] = [];
  for (const r of roles.map((x) => x.rolname)) {
    for (const t of tables) {
      const got = await q<{ p: string }>(`SELECT unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p`);
      for (const { p } of got) if ((await q<{ h: boolean }>(`SELECT has_table_privilege($1, format('public.%I', $2::text), $3) h`, [r, t.t, p]))[0]!.h) tablePriv.push(`${r}:${p}:${t.t}`);
    }
    for (const s of seqs) for (const p of ['USAGE', 'SELECT', 'UPDATE']) if ((await q<{ h: boolean }>(`SELECT has_sequence_privilege($1, format('public.%I', $2::text), $3) h`, [r, s.s, p]))[0]!.h) seqPriv.push(`${r}:${p}:${s.s}`);
  }
  checks.push({ id: 'RLS-03', title: 'anon / authenticated hold no table privilege', pass: tablePriv.length === 0, detail: tablePriv.length ? `${tablePriv.length} grants, e.g. ${tablePriv.slice(0, 12).join(' ')}` : `0 grants over ${tables.length} tables × 7 privileges × ${roles.length} roles` });
  checks.push({ id: 'RLS-04', title: 'anon / authenticated hold no sequence privilege', pass: seqPriv.length === 0, detail: seqPriv.length ? seqPriv.slice(0, 12).join(' ') : `0 grants over ${seqs.length} sequences` });

  const defacl = await q<{ owner: string; type: string; acl: string }>(`SELECT pg_get_userbyid(defaclrole) owner, defaclobjtype type, defaclacl::text acl FROM pg_default_acl WHERE defaclnamespace = 'public'::regnamespace OR defaclnamespace = 0`);
  const badDef = defacl.filter((d) => /(^|[{,"])(anon|authenticated)=/.test(d.acl) && ['r', 'S'].includes(d.type));
  checks.push({ id: 'RLS-05', title: 'default privileges (future tables/sequences) grant anon / authenticated nothing', pass: badDef.length === 0, detail: badDef.length ? badDef.map((d) => `${d.owner}/${d.type}: ${d.acl}`).join('; ') : `${defacl.length} default-ACL rows, none for anon/authenticated on tables or sequences` });

  // Live attempts, each in its own rolled-back transaction.
  const live: string[] = [];
  let attempts = 0;
  const client = await pool.connect();
  try {
    for (const r of roles.map((x) => x.rolname)) {
      for (const t of tables) {
        const col = (await q<{ c: string }>(`SELECT attname c FROM pg_attribute WHERE attrelid = format('public.%I', $1::text)::regclass AND attnum > 0 AND NOT attisdropped ORDER BY attnum LIMIT 1`, [t.t]))[0]?.c ?? 'id';
        const qcol = `"${col.replace(/"/g, '""')}"`;
        for (const stmt of [`SELECT 1 FROM public.%I LIMIT 1`, `INSERT INTO public.%I DEFAULT VALUES`, `UPDATE public.%I SET ${qcol} = ${qcol} WHERE false`, `DELETE FROM public.%I WHERE false`]) {
          attempts += 1;
          await client.query('BEGIN');
          try {
            await client.query(`SET LOCAL ROLE ${r}`);
            const sqlText = (await client.query(`SELECT format($1, $2::text) s`, [stmt, t.t])).rows[0].s as string;
            await client.query(sqlText);
            live.push(`${r}: ${sqlText}`);
          } catch (e) {
            const msg = String((e as Error).message);
            // "column id does not exist" etc. would mean the privilege check PASSED first.
            if (!/permission denied/.test(msg)) live.push(`${r}: ${stmt.split(' ')[0]} ${t.t} → ${msg.slice(0, 60)}`);
          } finally { await client.query('ROLLBACK'); }
        }
      }
      for (const s of seqs) {
        attempts += 1;
        await client.query('BEGIN');
        try { await client.query(`SET LOCAL ROLE ${r}`); await client.query(`SELECT nextval(format('public.%I', $1::text)::regclass)`, [s.s]); live.push(`${r}: nextval ${s.s}`); }
        catch (e) { if (!/permission denied/.test(String((e as Error).message))) live.push(`${r}: nextval ${s.s} → ${String((e as Error).message).slice(0, 60)}`); }
        finally { await client.query('ROLLBACK'); }
      }
    }
  } finally { client.release(); }
  checks.push({ id: 'RLS-06', title: `live attempts as anon / authenticated (${attempts} statements)`, pass: live.length === 0, detail: live.length ? live.slice(0, 15).join(' | ') : `all ${attempts} refused with "permission denied"` });

  const fns = await q<{ f: string; secdef: boolean }>(`SELECT p.proname f, p.prosecdef secdef FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND has_function_privilege('anon', p.oid, 'EXECUTE')`).catch(() => []);
  checks.push({ id: 'RLS-07', title: 'functions in public executable by anon (RPC surface)', pass: fns.filter((f) => f.secdef).length === 0, severity: fns.length ? 'warning' : undefined, detail: fns.length ? fns.map((f) => `${f.f}${f.secdef ? ' (SECURITY DEFINER!)' : ''}`).join(', ') : 'none' });

  // A table added by a future deploy, before the post-deploy SQL runs again.
  await q(`CREATE TABLE IF NOT EXISTS public.zz_rls_probe (id int)`);
  const probe = await q<{ rls: boolean; sel: boolean; ins: boolean }>(`SELECT c.relrowsecurity rls, has_table_privilege('anon','public.zz_rls_probe','SELECT') sel, has_table_privilege('authenticated','public.zz_rls_probe','INSERT') ins FROM pg_class c WHERE c.oid='public.zz_rls_probe'::regclass`);
  await q(`DROP TABLE public.zz_rls_probe`);
  const pr = probe[0]!;
  checks.push({ id: 'RLS-08', title: 'a table created after the deploy SQL (next migration window)', pass: !pr.sel && !pr.ins, severity: !pr.sel && !pr.ins ? 'warning' : undefined, detail: `RLS on new table=${pr.rls} (on only after post-deploy SQL re-runs), anon SELECT=${pr.sel}, authenticated INSERT=${pr.ins}` });

  const failed = report('Database exposure — Supabase anon / authenticated roles (RLS)', checks);
  await pool.end();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => { console.log(`::error title=rls-check crashed::${String(e?.message ?? e)}`); await pool.end(); process.exit(1); });
