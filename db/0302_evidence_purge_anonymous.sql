-- 0302: evidence purge leaves no personal data; nl/fr/de/en reserved in the database.
-- Owner GO 2026-11-22.
--
-- 1. When an evidence review closes (approved, rejected, withdrawn, expired), the same
--    transaction now also clears requester_user_id, decided_by, sha256, subject_nullifier,
--    country and public_name. What remains is an anonymous row: id, workspace, subject,
--    evidence kind, mime, size, status, decision code and the timestamps (purged_at included).
--    Existing closed rows are scrubbed the same way below.
-- 2. The evidence_purged audit event carries neither actor nor detail. The decision event
--    before it keeps the reviewing admin (accountability for the decision itself).
--    Events written before 0302 are append-only and stay as they were.
-- 3. The 5-per-24h submit limit now counts evidence_submitted events on the audit chain,
--    because a purged row no longer names its requester.
-- 4. Ciphertexts may be up to 256 bytes longer: REV2 blobs (src/lib/org-attestation/
--    evidence-vault.server.ts) carry a per-file data key wrapped under ROUT_EVIDENCE_KEK,
--    which lives outside Neon. A copy of the row in Neon's point-in-time history stays
--    openable while that KEK exists; it is shredded only by rotating ROUT_EVIDENCE_KEK and
--    destroying the old key, otherwise it ages out with Neon's history retention.
-- 5. Language prefixes nl, fr, de, en join the system_reserved handle namespace.
--
-- Needs db/0300. Rollback: none needed for the scrub (data is intentionally gone).

alter table public.trust_evidence_reviews alter column requester_user_id drop not null;
alter table public.trust_evidence_reviews alter column sha256 drop not null;
alter table public.trust_evidence_reviews drop constraint if exists trust_evidence_subject_shape;
alter table public.trust_evidence_reviews drop constraint if exists trust_evidence_reviews_ciphertext_check;
alter table public.trust_evidence_reviews add constraint trust_evidence_reviews_ciphertext_check
  check (ciphertext is null or octet_length(ciphertext) between 33 and 5243136);
alter table public.trust_evidence_reviews add constraint trust_evidence_open_identified
  check (purged_at is not null or (requester_user_id is not null and sha256 is not null));
alter table public.trust_evidence_reviews add constraint trust_evidence_subject_shape
  check (purged_at is not null or ((subject = 'public_body') = (subject_nullifier is not null and country is not null)));
alter table public.trust_evidence_reviews add constraint trust_evidence_purged_anonymous
  check (purged_at is null or (requester_user_id is null and decided_by is null and sha256 is null
         and subject_nullifier is null and country is null and public_name is null));

update public.trust_evidence_reviews
   set requester_user_id = null, decided_by = null, sha256 = null, subject_nullifier = null, country = null, public_name = null
 where purged_at is not null;

create or replace function public.rout_trust_evidence_close(p_id uuid, p_status text, p_code text, p_actor uuid, p_detail jsonb default '{}'::jsonb)
returns void language plpgsql volatile security definer set search_path = pg_catalog, pg_temp as $$
declare v_ws uuid;
begin
  update public.trust_evidence_reviews r
     set status = p_status, decision_code = p_code, decided_at = now(), ciphertext = null, purged_at = now(),
         requester_user_id = null, decided_by = null, sha256 = null, subject_nullifier = null, country = null, public_name = null
   where r.id = p_id and r.status = 'pending'
  returning r.workspace_id into v_ws;
  if v_ws is null then return; end if;
  perform public.rout_trust_log(v_ws, p_id,
    case p_status when 'approved' then 'evidence_approved' when 'rejected' then 'evidence_rejected'
                  when 'withdrawn' then 'evidence_withdrawn' else 'evidence_expired' end,
    p_actor, pg_catalog.jsonb_build_object('code', p_code) || coalesce(p_detail, '{}'::jsonb));
  perform public.rout_trust_log(v_ws, p_id, 'evidence_purged', null, '{}'::jsonb);
end $$;
revoke all on function public.rout_trust_evidence_close(uuid, text, text, uuid, jsonb) from public, rout_app;

create or replace function public.rout_trust_evidence_submit(p_id uuid, p_ws uuid, p_subject text, p_kind text, p_sha256 bytea,
  p_mime text, p_size integer, p_ciphertext bytea, p_nullifier bytea, p_country text, p_public_name text)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, pg_temp as $$
declare v_user uuid := public.rout_current_user_id();
begin
  if v_user is null or p_ws is null or not public.rout_ws_support_manager(p_ws) then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'not_manager');
  end if;
  if p_id is null or p_subject not in ('public_body', 'mandate_proven')
     or p_kind not in ('kbo_extract', 'staatsblad', 'appointment_decision', 'qes_mandate')
     or (p_subject = 'public_body' and p_kind = 'qes_mandate')
     or p_sha256 is null or octet_length(p_sha256) <> 32 or p_ciphertext is null
     or p_mime not in ('application/pdf', 'image/png', 'image/jpeg') or p_size not between 1 and 5242880
     or (p_subject = 'public_body') <> (p_nullifier is not null and p_country is not null) then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if p_subject = 'mandate_proven' then
    if not public.rout_user_has_legal_identity(v_user) then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'legal_identity_required');
    end if;
    if not exists (select 1 from public.workspace_trust_attestations a
                    where a.workspace_id = p_ws and a.layer = 'entity' and a.status = 'active' and a.expires_at > now()) then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'organization_required');
    end if;
  elsif exists (select 1 from public.workspace_trust_attestations a
                 where a.layer = 'entity' and a.status = 'active' and a.subject_nullifier = p_nullifier and a.workspace_id <> p_ws) then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'organization_bound_elsewhere');
  end if;
  -- Counted on the audit chain: purged review rows no longer name their requester (0302).
  if (select pg_catalog.count(*) from public.workspace_trust_events e
       where e.event = 'evidence_submitted' and e.actor_user_id = v_user and e.occurred_at > now() - interval '24 hours') >= 5 then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;
  begin
    insert into public.trust_evidence_reviews (id, workspace_id, requester_user_id, subject, evidence_kind, sha256, mime, byte_size,
      ciphertext, subject_nullifier, country, public_name, purge_due_at)
    values (p_id, p_ws, v_user, p_subject, p_kind, p_sha256, p_mime, p_size, p_ciphertext, p_nullifier, p_country,
      p_public_name, now() + interval '7 days');
  exception when unique_violation then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'already_pending');
  end;
  perform public.rout_trust_log(p_ws, p_id, 'evidence_submitted', v_user, pg_catalog.jsonb_build_object('subject', p_subject, 'kind', p_kind));
  return pg_catalog.jsonb_build_object('ok', true, 'id', p_id);
end $$;
revoke all on function public.rout_trust_evidence_submit(uuid, uuid, text, text, bytea, text, integer, bytea, bytea, text, text) from public, rout_app;
grant execute on function public.rout_trust_evidence_submit(uuid, uuid, text, text, bytea, text, integer, bytea, bytea, text, text) to rout_app;

insert into public.handle_registry (namespace, handle_normalized, status, user_id, profile_id)
select 'system_reserved', h, 'RESERVED_HOLD', null, pg_catalog.gen_random_uuid()
  from pg_catalog.unnest(array['nl', 'fr', 'de', 'en']::text[]) as h
on conflict do nothing;
