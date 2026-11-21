import axe from 'axe-core';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Renders a fragment inside a landmark with a heading, as a page would, and returns what axe finds.
 * jsdom has no layout engine, so colour contrast is checked by the design tokens, not here.
 */
export async function violationsIn(fragment: ReactElement): Promise<string[]> {
  document.title = 'Test page';
  document.documentElement.lang = 'en';
  const page = renderToStaticMarkup(
    <main>
      <h1>Test page</h1>
      <h2>Section</h2>
      {fragment}
    </main>,
  );
  document.body.innerHTML = page;
  const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } });
  return result.violations.map(
    (v) => `${v.id}: ${v.help} (${v.nodes[0]?.html.slice(0, 120) ?? ''})`,
  );
}
