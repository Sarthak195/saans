import type { Metadata } from 'next';
import type { ReactElement } from 'react';

export const metadata: Metadata = { title: 'Home' };

export default function HomePage(): ReactElement {
  return <h1>Plan your day around the air</h1>;
}
