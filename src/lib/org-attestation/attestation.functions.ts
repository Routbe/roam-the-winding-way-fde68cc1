import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth, requireSudo } from "@/lib/auth/middleware";

const ws = z.string().uuid();

/** Studio overview for owners/admins (null for everyone else, decided in the database). */
export const getWorkspaceTrust = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({ workspaceId: ws }).parse(d))
  .handler(async ({ data }) => (await import("./attestation.server")).trustOverview(data.workspaceId));

/** Public badge data for /w/$slug: per layer only, never managers, numbers or e-mail. */
export const getPublicWorkspaceTrust = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/i) }).parse(d))
  .handler(async ({ data }) => (await import("./attestation.server")).publicTrust(data.slug));

export const getDomainChallenge = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({ workspaceId: ws }).parse(d))
  .handler(async ({ data }) => (await import("./attestation.server")).domainChallenge(data.workspaceId));

export const verifyWorkspaceDomain = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({ workspaceId: ws, kind: z.enum(["dns_txt", "well_known_email"]) }).parse(d))
  .handler(async ({ data }) => (await import("./attestation.server")).verifyDomain(data.workspaceId, data.kind));

export const startWorkEmailCheck = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({ workspaceId: ws, email: z.string().email().max(254), language: z.enum(["nl", "en", "fr", "de"]) }).parse(d))
  .handler(async ({ data }) => (await import("./attestation.server")).startWorkEmail(data.workspaceId, data.email, data.language));

export const confirmWorkEmailCheck = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({ workspaceId: ws, code: z.string().regex(/^\d{6}$/) }).parse(d))
  .handler(async ({ data }) => (await import("./attestation.server")).confirmWorkEmail(data.workspaceId, data.code));

export const attestWorkspaceRegister = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({ workspaceId: ws, kind: z.enum(["vat_vies", "lei_gleif"]), number: z.string().min(4).max(40), publishName: z.boolean() }).parse(d))
  .handler(async ({ data }) => (await import("./attestation.server")).attestRegister(data.workspaceId, data.kind, data.number, data.publishName));

export const revokeWorkspaceRegister = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({ workspaceId: ws }).parse(d))
  .handler(async ({ data }) => (await import("./attestation.server")).revokeRegister(data.workspaceId));

const MAX_B64 = Math.ceil((5 * 1024 * 1024) / 3) * 4;

/** Uploads one review document (≤ 5 MB, PDF/PNG/JPEG); sealed server-side, purged within 7 days. */
export const submitTrustEvidence = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) =>
    z.object({
      workspaceId: ws,
      subject: z.enum(["public_body", "mandate_proven"]),
      kind: z.enum(["kbo_extract", "staatsblad", "appointment_decision", "qes_mandate"]),
      mime: z.enum(["application/pdf", "image/png", "image/jpeg"]),
      fileBase64: z.string().min(4).max(MAX_B64),
      publicBodyId: z.string().min(2).max(40).optional(),
      country: z.string().regex(/^[A-Z]{2}$/).optional(),
      publicName: z.string().min(1).max(200).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { submitEvidence } = await import("./attestation.server");
    const { fileBase64, ...rest } = data;
    return submitEvidence({ ...rest, bytes: Uint8Array.from(Buffer.from(fileBase64, "base64")) });
  });

export const withdrawTrustEvidence = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => (await import("./attestation.server")).withdrawEvidence(data.id));

/** Admin queue; the database returns null unless the caller is a full admin with 2FA. */
export const adminListTrustReviews = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async () => (await import("./attestation.server")).adminReviews());

export const adminOpenTrustEvidence = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireSudo("trust_evidence_review")])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await import("./attestation.server")).adminOpenEvidence(data.id, context.sudoJti));

export const adminDecideTrustEvidence = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireSudo("trust_evidence_review")])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), approve: z.boolean(), code: z.enum(["insufficient", "mismatch", "unreadable"]).nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => (await import("./attestation.server")).adminDecide(data.id, data.approve, data.code, context.sudoJti));

/** Layer 3 "declared", step 1: a 300 s single-use ticket bound to this member and workspace. */
export const startMandateDeclaration = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({ workspaceId: ws }).parse(d))
  .handler(async ({ data, context }) => (await import("./attestation.server")).startMandateDeclaration(data.workspaceId, context.userId));

/** Step 2: only after a fresh passkey assertion (Sudo Mode); the server signs and stores the statement. */
export const declareWorkspaceMandate = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireSudo("mandate_declaration")])
  .inputValidator((d) => z.object({ workspaceId: ws, ticket: z.string().min(10).max(200) }).parse(d))
  .handler(async ({ data, context }) => (await import("./attestation.server")).declareMandate(data.workspaceId, context.userId, data.ticket));
