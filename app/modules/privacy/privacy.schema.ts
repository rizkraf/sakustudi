import { z } from "zod";

/** No user input beyond the action intent; schema exists for symmetry. */
export const requestExportSchema = z.object({
  intent: z.literal("request-export"),
});

export const deleteAccountSchema = z.object({
  intent: z.literal("delete-account"),
  confirmation: z
    .string()
    .min(1, "Type DELETE to confirm")
    .refine((v) => v === "DELETE", {
      message: "Type DELETE to confirm",
    }),
});
