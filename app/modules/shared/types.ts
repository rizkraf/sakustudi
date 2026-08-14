/**
 * Shared module-level types for repository contracts. Feature-specific
 * repositories (Tasks 6-11) build on these.
 */
export type OwnedResource = {
  /** Owner of the row; every user-scoped row exposes this column. */
  userId?: string | null;
};
