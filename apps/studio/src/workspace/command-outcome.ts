export type StudioCommandOutcome =
  | { readonly status: "changed"; readonly revision: number }
  | { readonly status: "unchanged"; readonly revision: number }
  | { readonly status: "rejected"; readonly message: string }
  | { readonly status: "unavailable" };
