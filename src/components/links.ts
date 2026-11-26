// The context a plan page hands to its parts: where it sits and how its forms reach back to it.
// UI layer: a type only.

/** Where a plan page sits and how its forms and links reach back to it. */
export interface PlanContext {
  /** The page's own path, such as '/plan/sample/s1' or '/plan/<token>'. */
  base: string;
  /** Where forms post: '/plan/<token>', the sealed household, also for a sample. */
  actionBase: string;
  /** The token each form on the page posts back with. */
  formToken: string;
  /** Query values that stay when the day or language changes. */
  keep: { air?: string | undefined; lang?: string | undefined };
}
