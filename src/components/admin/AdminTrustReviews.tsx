import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { adminDecideTrustEvidence, adminListTrustReviews, adminOpenTrustEvidence } from "@/lib/org-attestation/attestation.functions";

type Review = { id: string; workspaceSlug: string; workspaceName: string; domain: string | null; subject: string; evidenceKind: string; byteSize: number; sha256: string; requesterLegalIdentity: boolean; ownRequest: boolean; submittedAt: string; purgeDueAt: string };

/** /admin/mandates: 2FA admins review KBO extracts etc. Opening and deciding need Sudo Mode; documents never persist outside the sealed row. */
export function AdminTrustReviews() {
  const { t, locale: lang } = useI18n();
  const qc = useQueryClient();
  const list = useServerFn(adminListTrustReviews);
  const open = useServerFn(adminOpenTrustEvidence);
  const decide = useServerFn(adminDecideTrustEvidence);
  const q = useQuery({ queryKey: ["admin-trust-reviews"], queryFn: () => list(), retry: false });
  const [viewing, setViewing] = useState<{ id: string; url: string; mime: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => { if (viewing) URL.revokeObjectURL(viewing.url); setViewing(null); };
  const sudoHint = (e: unknown) => toast.error(e instanceof Error && /SUDO/.test(e.message) ? t("trust.admin.sudo") : t("trust.reason.failed"));

  async function view(id: string) {
    setBusy(true);
    try {
      const r = await open({ data: { id } });
      if (!r) { toast.error(t("trust.reason.failed")); return; }
      const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
      close();
      setViewing({ id, mime: r.mime, url: URL.createObjectURL(new Blob([bytes], { type: r.mime })) });
      bytes.fill(0);
    } catch (e) { sudoHint(e); } finally { setBusy(false); }
  }

  async function act(id: string, approve: boolean, code: "insufficient" | "mismatch" | "unreadable" | null) {
    setBusy(true);
    try {
      const r = await decide({ data: { id, approve, code } });
      toast.message(t(`trust.admin.result.${r.result}`) === `trust.admin.result.${r.result}` ? r.result : t(`trust.admin.result.${r.result}`));
      if (viewing?.id === id) close();
      void qc.invalidateQueries({ queryKey: ["admin-trust-reviews"] });
    } catch (e) { sudoHint(e); } finally { setBusy(false); }
  }

  const rows = (q.data ?? null) as Review[] | null;
  return (
    <main className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold">{t("trust.admin.title")}</h1>
      <p className="text-sm text-muted-foreground">{t("trust.admin.intro")}</p>
      {q.isLoading ? <p className="text-sm text-muted-foreground">{t("trust.loading")}</p>
        : q.isError ? <p role="status" className="text-sm text-muted-foreground">{t("trust.unavailable")}</p>
        : rows === null ? <p role="status" className="text-sm text-muted-foreground">{t("trust.admin.forbidden")}</p>
        : rows.length === 0 ? <p className="text-sm text-muted-foreground">{t("trust.admin.empty")}</p>
        : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.id} className="space-y-2 rounded-2xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">{r.workspaceName} <span className="text-sm text-muted-foreground">/w/{r.workspaceSlug}{r.domain ? ` · ${r.domain}` : ""}</span></p>
                  <p className="text-xs text-muted-foreground">{t("trust.admin.purge", { date: new Date(r.purgeDueAt).toLocaleString(lang) })}</p>
                </div>
                <p className="text-sm">{t(`trust.subject.${r.subject}`)} · {t(`trust.evidence.${r.evidenceKind}`)} · {Math.ceil(r.byteSize / 1024)} kB</p>
                <p className="break-all font-mono text-xs text-muted-foreground">SHA-256 {r.sha256}</p>
                {!r.requesterLegalIdentity && <p className="text-xs text-destructive">{t("trust.admin.noIdentity")}</p>}
                {r.ownRequest ? <p className="text-xs text-muted-foreground">{t("trust.admin.own")}</p> : (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => view(r.id)}>{t("trust.admin.open")}</Button>
                    <Button size="sm" disabled={busy || viewing?.id !== r.id} onClick={() => act(r.id, true, null)}>{t("trust.admin.approve")}</Button>
                    {(["insufficient", "mismatch", "unreadable"] as const).map((c) => (
                      <Button key={c} size="sm" variant="outline" disabled={busy} onClick={() => act(r.id, false, c)}>{t(`trust.code.${c}`)}</Button>
                    ))}
                  </div>
                )}
                {viewing?.id === r.id && (
                  viewing.mime === "application/pdf"
                    ? <iframe title={t("trust.admin.open")} src={viewing.url} sandbox="" className="h-[70vh] w-full rounded-lg border border-border" />
                    : <img src={viewing.url} alt={t("trust.admin.open")} className="max-h-[70vh] w-full rounded-lg border border-border object-contain" />
                )}
              </li>
            ))}
          </ul>
        )}
    </main>
  );
}
