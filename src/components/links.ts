/** A path with a query made of the values that are set; unset ones are left out. */
export function withQuery(
  path: string,
  params: Readonly<Record<string, string | undefined>>,
): string {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(name, value);
  }
  const text = query.toString();
  return text === '' ? path : `${path}?${text}`;
}

/** Where a plan page sits and how its forms and links reach back to it. */
export interface PlanContext {
  /** The page's own path, such as '/plan/sample/s1' or '/plan/<token>'. */
  base: string;
  /** Where forms post: '/plan/<token>', the sealed household, also for a sample. */
  actionBase: string;
  formToken: string;
  /** Query values that stay when the day or language changes. */
  keep: { air?: string | undefined; lang?: string | undefined };
}
