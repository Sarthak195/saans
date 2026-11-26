// The public face of the alternatives module: trip alternatives, the city lookup and the GRAP note.
// Layer: core (pure). It only re-exports; the work is in the files next to it.
export { buildAlternatives } from '@/core/alternatives/build';
export { cityOf, transitOptionsFor } from '@/core/alternatives/cities';
export type { City, TransitOption } from '@/core/alternatives/cities';
export { grapNote } from '@/core/alternatives/grap';
