import { z } from "zod";

export const createTermSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Term name is required.")
      .max(100, "Term name must be 100 characters or fewer."),
    startDate: z.coerce.date("Start date is required."),
    endDate: z.coerce.date("End date is required."),
  })
  .refine((value) => value.endDate > value.startDate, {
    message: "End date must be after the start date.",
    path: ["endDate"],
  });

export type CreateTermInput = z.infer<typeof createTermSchema>;
