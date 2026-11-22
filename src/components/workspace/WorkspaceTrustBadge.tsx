import { BadgeCheck, Building2, Globe, ShieldCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export type PublicTrust = {
  entityType?: string | null;
  domain?: { name: string; kind: string; verifiedAt: string } | null;
  entity?: { kind: string; country: string; publicName: string | null } | null;
  mandate?: { level: string; expiresAt: string } | null;
  mandateFrozen?: boolean;
} | null;

/** Public LoA badge on /w/$slug: shows exactly which layers hold, nothing about who manages it. */
export function WorkspaceTrustBadge({ trust }: { trust: PublicTrust }) {
  const { t } = useI18n();
  if (!trust || (!trust.domain && !trust.entity && !trust.mandate)) return null;
  const row = "flex items-start gap-2 text-sm";
  return (
    <aside aria-label={t("trust.badge.title")} className="mx-auto mb-8 w-full max-w-md rounded-2xl border border-border bg-card p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-primary" aria-hidden /> {t("trust.badge.title")}</p>
      <ul className="space-y-2">
        <li className={row}><Globe className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{trust.domain ? t("trust.badge.domain", { domain: trust.domain.name }) : <span className="text-muted-foreground">{t("trust.badge.domainNone")}</span>}</span></li>
        <li className={row}><Building2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{trust.entity ? t("trust.badge.entity", { register: t(`trust.kind.${trust.entity.kind}`), country: trust.entity.country }) + (trust.entity.publicName ? ` · ${trust.entity.publicName}` : "") : <span className="text-muted-foreground">{t("trust.badge.entityNone")}</span>}</span></li>
        <li className={row}><BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{trust.mandate ? t(`trust.badge.mandate_${trust.mandate.level}`) : trust.mandateFrozen ? <span className="text-muted-foreground">{t("trust.badge.mandateFrozen")}</span> : <span className="text-muted-foreground">{t("trust.badge.mandateNone")}</span>}</span></li>
      </ul>
    </aside>
  );
}
