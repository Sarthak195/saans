import { z } from 'zod';

import samplesData from '@/data/samples.json';
import type { QuestionTarget } from '@/core/plan/types';
import { householdSchema } from '@/core/profile/schema';
import type { SourceRef } from '@/core/source';
import type { Household } from '@/core/types';

export interface Sample {
  id: 's1' | 's2' | 's3' | 's4' | 's5' | 's6';
  /** Card heading, written the way a family would put the question. */
  title: string;
  /** One line under the heading. */
  summary: string;
  /** What a family typed, for the samples that show the reader. Absent for form and community samples. */
  text?: string;
  household: Household;
  question?: QuestionTarget;
  /** Which recorded air snapshot the sample's own place maps to. */
  recordedId: string;
  /** Samples are made up, so every row says so. */
  source: SourceRef;
}

const sampleSchema = z.strictObject({
  id: z.enum(['s1', 's2', 's3', 's4', 's5', 's6']),
  title: z.string().min(1),
  summary: z.string().min(1),
  text: z.string().min(1).exactOptional(),
  household: householdSchema,
  question: z
    .strictObject({
      routineId: z.string().exactOptional(),
      memberId: z.string().exactOptional(),
      hour: z.number().int().min(0).max(23).exactOptional(),
      aboutToday: z.boolean().exactOptional(),
    })
    .exactOptional(),
  recordedId: z.string().min(1),
  source: z.strictObject({
    id: z.string().min(1),
    title: z.string().min(1),
    url: z.string(),
    quote: z.string().exactOptional(),
    status: z.enum(['P-READ', 'P-FETCH', 'APP']),
  }),
});

const samplesSchema = z.array(sampleSchema).superRefine((samples, ctx) => {
  if (new Set(samples.map((s) => s.id)).size !== samples.length) {
    ctx.addIssue({ code: 'custom', message: 'Sample ids must be unique' });
  }
});

// Parsed once at load: a sample that breaks the household schema fails the build, not a family's page.
export const SAMPLES: readonly Sample[] = samplesSchema.parse(samplesData);

export function sampleById(id: string): Sample | undefined {
  return SAMPLES.find((sample) => sample.id === id);
}
