import { z } from "zod";

export const LEGAL_CONSENT_TYPES = ["terms_of_service", "privacy_policy"] as const;
export type LegalConsentType = (typeof LEGAL_CONSENT_TYPES)[number];

export const LEGAL_DOCUMENT_VERSIONS: Record<LegalConsentType, string> = {
  terms_of_service: "2026-08-01",
  privacy_policy: "2026-08-01",
};

export const signUpConsentInputSchema = z.object({
  acceptTerms: z.boolean().refine((value) => value, {
    message: "You must accept the Terms of Service.",
  }),
  acceptPrivacy: z.boolean().refine((value) => value, {
    message: "You must accept the Privacy Policy.",
  }),
});

export type SignUpConsentInput = z.infer<typeof signUpConsentInputSchema>;
