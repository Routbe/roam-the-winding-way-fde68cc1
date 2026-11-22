import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/lib/i18n";
import {
  attestWorkspaceRegister, confirmWorkEmailCheck, getDomainChallenge, getWorkspaceTrust,
  revokeWorkspaceRegister, startWorkEmailCheck, submitTrustEvidence, verifyWorkspaceDomain, withdrawTrustEvidence,
  startMandateDeclaration, declareWorkspaceMandate,
} from "@/lib/org-attestation/attestation.functions";
import { withSudo, SudoCancelledError } from "@/lib/auth/sudo-client";

const card = "space-y-4 rounded-2xl border border-border bg-card p-5";
const sub = "space-y-3 rounded-xl border border-border/70 bg-background p-4";
type Overview = {
  domain: string | null;
  domainSeal: { kind: string; verifiedAt: string; failingSince: string | null } | null;
  entity: { kind: string; country: string; publicName: string | null; expiresAt: string } | null;
  workEmail: { status: string; expiresAt: string | null } | null;
  legalIdentity: boolean;
  mandates: Array<{ id: string; level: string; status: string; mine: boolean; expiresAt: string }>;
  reviews: Array<{ id: string; subject: string; kind: string; purgeDueAt: string }>;
  lastDecision: { subject: string; status: string; code: string | null } | null;
  evidenceConfigured: boolean;
};

const date = (s: string | null | undefined, lang: string) => (s ? new Date(s).toLocaleDateString(lang) : "—");

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** Studio tab "Verification & trust": the three assurance layers of db/0300. Every rule is enforced server-side. */
export function WorkspaceTrustPanel({ workspaceId }: { workspaceId: string }) {
  const { t, locale: lang } = useI18n();
  const qc = useQueryClient();
  const load = useServerFn(getWorkspaceTrust);
  const q = useQuery({ queryKey: ["workspace-trust", workspaceId], queryFn: () => load({ data: { workspaceId } }), retry: false });
  const refresh = () => qc.invalidateQueries({ queryKey: ["workspace-trust", workspaceId] });

  if (q.isLoading) return <section className={card}><p className="text-sm text-muted-foreground">{t("trust.loading")}</p></section>;
  if (q.isError) return <section className={card}><h2 className="font-semibold">{t("trust.title")}</h2><p role="status" className="text-sm text-muted-foreground">{t("trust.unavailable")}</p></section>;
  const o = q.data as Overview | null;
  if (!o) return null;

  return (
    <section className={card} aria-labelledby="trust-title">
      <div>
        <h2 id="trust-title" className="font-semibold">{t("trust.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("trust.intro")}</p>
      </div>
      <DomainLayer workspaceId={workspaceId} o={o} lang={lang} onDone={refresh} />
      <EntityLayer workspaceId={workspaceId} o={o} lang={lang} onDone={refresh} />
      <MandateLayer workspaceId={workspaceId} o={o} lang={lang} onDone={refresh} />
    </section>
  );
}

function useReason() {
  const { t } = useI18n();
  return (reason: string | undefined) => {
    const key = `trust.reason.${reason ?? "failed"}`;
    const text = t(key);
    return text === key ? t("trust.reason.failed") : text;
  };
}

function DomainLayer({ workspaceId, o, lang, onDone }: { workspaceId: string; o: Overview; lang: string; onDone: () => void }) {
  const { t } = useI18n();
  const reason = useReason();
  const challengeFn = useServerFn(getDomainChallenge);
  const verifyFn = useServerFn(verifyWorkspaceDomain);
  const startFn = useServerFn(startWorkEmailCheck);
  const confirmFn = useServerFn(confirmWorkEmailCheck);
  const [ch, setCh] = useState<{ txtName: string; txtValue: string; wellKnownUrl: string; wellKnownBody: string } | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function run<T extends { ok: boolean; reason?: string }>(p: Promise<T>, okText: string) {
    setBusy(true);
    try { const r = await p; if (r.ok) { toast.success(okText); onDone(); } else toast.error(reason(r.reason)); return r; }
    catch { toast.error(reason(undefined)); return null; }
    finally { setBusy(false); }
  }

  return (
    <div className={sub}>
      <h3 className="text-sm font-semibold">{t("trust.l1.title")}</h3>
      {!o.domain ? <p className="text-sm text-muted-foreground">{t("trust.l1.noDomain")}</p> : o.domainSeal ? (
        <p className="text-sm">{t("trust.l1.sealed", { domain: o.domain, date: date(o.domainSeal.verifiedAt, lang) })}
          {o.domainSeal.failingSince && <span className="block text-destructive">{t("trust.l1.failing")}</span>}</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{t("trust.l1.howto", { domain: o.domain })}</p>
          {!ch ? (
            <Button size="sm" disabled={busy} onClick={async () => { setBusy(true); const r = await challengeFn({ data: { workspaceId } }).catch(() => null); setBusy(false); if (r?.ok) setCh(r); else toast.error(reason(r && !r.ok ? r.reason : undefined)); }}>{t("trust.l1.generate")}</Button>
          ) : (
            <div className="space-y-2 text-sm">
              <p className="font-medium">{t("trust.l1.dnsTitle")}</p>
              <code className="block break-all rounded-lg bg-muted p-2 text-xs">{ch.txtName} TXT "{ch.txtValue}"</code>
              <p className="text-xs text-muted-foreground">{t("trust.l1.dnssec")}</p>
              <Button size="sm" disabled={busy} onClick={() => run(verifyFn({ data: { workspaceId, kind: "dns_txt" } }), t("trust.l1.done"))}>{t("trust.l1.checkDns")}</Button>
              <p className="pt-2 font-medium">{t("trust.l1.wkTitle")}</p>
              <code className="block break-all rounded-lg bg-muted p-2 text-xs">{ch.wellKnownUrl} → {ch.wellKnownBody}</code>
              <Button size="sm" variant="outline" disabled={busy || o.workEmail?.status !== "verified"} onClick={() => run(verifyFn({ data: { workspaceId, kind: "well_known_email" } }), t("trust.l1.done"))}>{t("trust.l1.checkWk")}</Button>
            </div>
          )}
        </>
      )}
      {o.domain && (
        <div className="space-y-2 border-t border-border/70 pt-3">
          <p className="text-sm font-medium">{t("trust.l1.emailTitle")}</p>
          {o.workEmail?.status === "verified" ? <p className="text-sm">{t("trust.l1.emailOk", { date: date(o.workEmail.expiresAt, lang) })}</p> : (
            <>
              <div className="flex flex-wrap gap-2">
                <Input className="max-w-xs" type="email" autoComplete="email" placeholder={`naam@${o.domain}`} value={email} onChange={(e) => setEmail(e.target.value)} aria-label={t("trust.l1.emailTitle")} />
                <Button size="sm" variant="outline" disabled={busy || !email} onClick={() => run(startFn({ data: { workspaceId, email, language: (["nl", "en", "fr", "de"].includes(lang) ? lang : "en") as "nl" } }), t("trust.l1.codeSent"))}>{t("trust.l1.sendCode")}</Button>
              </div>
              {o.workEmail?.status === "pending" && (
                <div className="flex flex-wrap gap-2">
                  <Input className="max-w-[10rem]" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} aria-label={t("trust.l1.code")} placeholder="000000" />
                  <Button size="sm" disabled={busy || code.length !== 6} onClick={() => run(confirmFn({ data: { workspaceId, code } }), t("trust.l1.emailConfirmed"))}>{t("trust.l1.confirm")}</Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function EntityLayer({ workspaceId, o, lang, onDone }: { workspaceId: string; o: Overview; lang: string; onDone: () => void }) {
  const { t } = useI18n();
  const reason = useReason();
  const attestFn = useServerFn(attestWorkspaceRegister);
  const revokeFn = useServerFn(revokeWorkspaceRegister);
  const [kind, setKind] = useState<"vat_vies" | "lei_gleif">("vat_vies");
  const [number, setNumber] = useState("");
  const [publish, setPublish] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <div className={sub}>
      <h3 className="text-sm font-semibold">{t("trust.l2.title")}</h3>
      {o.entity ? (
        <div className="space-y-2 text-sm">
          <p>{t("trust.l2.sealed", { register: t(`trust.kind.${o.entity.kind}`), country: o.entity.country, date: date(o.entity.expiresAt, lang) })}</p>
          {o.entity.publicName && <p className="text-muted-foreground">{o.entity.publicName}</p>}
          <Button size="sm" variant="outline" disabled={busy} onClick={async () => { setBusy(true); await revokeFn({ data: { workspaceId } }).catch(() => null); setBusy(false); onDone(); }}>{t("trust.l2.revoke")}</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{t("trust.l2.howto")}</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("trust.l2.title")}>
            {(["vat_vies", "lei_gleif"] as const).map((k) => (
              <Button key={k} size="sm" role="radio" aria-checked={kind === k} variant={kind === k ? "default" : "outline"} onClick={() => setKind(k)}>{t(`trust.kind.${k}`)}</Button>
            ))}
          </div>
          <Input className="max-w-xs" value={number} onChange={(e) => setNumber(e.target.value)} placeholder={kind === "vat_vies" ? "BE0123456789" : "5493001KJTIIGC8Y1R12"} aria-label={t(`trust.kind.${kind}`)} />
          <label className="flex items-center gap-2 text-sm"><Switch checked={publish} onCheckedChange={setPublish} /> {t("trust.l2.publishName")}</label>
          <p className="text-xs text-muted-foreground">{t("trust.l2.privacy")}</p>
          <Button size="sm" disabled={busy || number.length < 4} onClick={async () => {
            setBusy(true);
            const r = await attestFn({ data: { workspaceId, kind, number, publishName: publish } }).catch(() => null);
            setBusy(false);
            if (r?.ok) { toast.success(t("trust.l2.done")); setNumber(""); onDone(); } else toast.error(reason(r && !r.ok ? r.reason : undefined));
          }}>{t("trust.l2.check")}</Button>
        </div>
      )}
    </div>
  );
}

function MandateLayer({ workspaceId, o, lang, onDone }: { workspaceId: string; o: Overview; lang: string; onDone: () => void }) {
  const { t } = useI18n();
  const reason = useReason();
  const submitFn = useServerFn(submitTrustEvidence);
  const withdrawFn = useServerFn(withdrawTrustEvidence);
  const startDeclFn = useServerFn(startMandateDeclaration);
  const declareFn = useServerFn(declareWorkspaceMandate);
  const canDeclare = !!o.entity && o.legalIdentity && o.domainSeal?.kind === "dns_txt" && o.workEmail?.status === "verified";
  const [kind, setKind] = useState<"kbo_extract" | "staatsblad" | "qes_mandate">("kbo_extract");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const mine = o.mandates.find((m) => m.mine);
  const pending = o.reviews.find((r) => r.subject === "mandate_proven");

  return (
    <div className={sub}>
      <h3 className="text-sm font-semibold">{t("trust.l3.title")}</h3>
      <p className="text-sm text-muted-foreground">{t("trust.l3.intro")}</p>
      {mine && <p className="text-sm">{t("trust.l3.active", { level: t(`trust.level.${mine.level}`), date: date(mine.expiresAt, lang) })}</p>}
      {!o.entity ? <p className="text-sm text-muted-foreground">{t("trust.l3.needEntity")}</p>
        : !o.legalIdentity ? <p className="text-sm text-muted-foreground">{t("trust.l3.needIdentity")}</p>
        : pending ? (
          <div className="space-y-2 text-sm">
            <p>{t("trust.l3.pending", { date: date(pending.purgeDueAt, lang) })}</p>
            <Button size="sm" variant="outline" disabled={busy} onClick={async () => { setBusy(true); await withdrawFn({ data: { id: pending.id } }).catch(() => null); setBusy(false); onDone(); }}>{t("trust.l3.withdraw")}</Button>
          </div>
        ) : !o.evidenceConfigured ? <p className="text-sm text-muted-foreground">{t("trust.l3.notConfigured")}</p> : (
          <div className="space-y-3">
            <div className="space-y-2">
              <p className="text-sm font-medium">{t("trust.l3.declareTitle")}</p>
              <p className="text-xs text-muted-foreground">{canDeclare ? t("trust.l3.declareIntro") : t("trust.l3.declareNeeds")}</p>
              <Button size="sm" variant="outline" disabled={busy || !canDeclare} onClick={async () => {
                setBusy(true);
                try {
                  const start = await startDeclFn({ data: { workspaceId } });
                  if (!start.ok) { toast.error(reason(start.reason)); return; }
                  const r = await withSudo(() => declareFn({ data: { workspaceId, ticket: start.ticket } }));
                  if (r.ok) { toast.success(t("trust.l3.declared")); onDone(); } else toast.error(reason(r.reason));
                } catch (e) { if (!(e instanceof SudoCancelledError)) toast.error(reason(undefined)); } finally { setBusy(false); }
              }}>{t("trust.l3.declareButton")}</Button>
            </div>
            <p className="text-sm font-medium">{t("trust.l3.provenTitle")}</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("trust.l3.provenTitle")}>
              {(["kbo_extract", "staatsblad", "qes_mandate"] as const).map((k) => (
                <Button key={k} size="sm" role="radio" aria-checked={kind === k} variant={kind === k ? "default" : "outline"} onClick={() => setKind(k)}>{t(`trust.evidence.${k}`)}</Button>
              ))}
            </div>
            <Input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label={t("trust.l3.file")} />
            <p className="text-xs text-muted-foreground">{t("trust.l3.retention")}</p>
            <Button size="sm" disabled={busy || !file} onClick={async () => {
              if (!file) return;
              if (file.size > 5 * 1024 * 1024) { toast.error(t("trust.reason.too_large")); return; }
              setBusy(true);
              try {
                const r = await submitFn({ data: { workspaceId, subject: "mandate_proven", kind, mime: file.type as "application/pdf", fileBase64: await fileToBase64(file) } });
                if (r.ok) { toast.success(t("trust.l3.submitted")); setFile(null); onDone(); } else toast.error(reason(r.reason));
              } catch { toast.error(reason(undefined)); } finally { setBusy(false); }
            }}>{t("trust.l3.submit")}</Button>
          </div>
        )}
      {o.lastDecision && o.lastDecision.status === "rejected" && <p className="text-xs text-muted-foreground">{t("trust.l3.lastRejected", { code: t(`trust.code.${o.lastDecision.code ?? "insufficient"}`) })}</p>}
    </div>
  );
}
