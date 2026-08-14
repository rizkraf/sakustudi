import { z } from "zod";

/**
 * Upload intent contract. The parent id is never trusted from the form: the
 * route derives it from its own params and passes the parent kind, so a
 * client cannot attach a file to another user's (or another entity's) note
 * or activity. The file field only asserts a File was submitted; the full
 * upload policy runs in files.service.
 */
export const attachmentUploadSchema = z.object({
  intent: z.literal("attach-file"),
  file: z.instanceof(File, { message: "Choose a file to upload." }),
});

export const attachmentDeleteSchema = z.object({
  intent: z.literal("delete-attachment"),
  attachmentId: z.string().min(1, { message: "Attachment id is required." }),
});
