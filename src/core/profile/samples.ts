// The made-up sample households, loaded from src/data/samples.json and checked against the same
// household schema as a family's own profile. Layer: core (pure). Every row carries a source.
import { z } from 'zod';

import samplesData from '@/data/samples.json';
import type { QuestionTarget } from '@/core/plan/types';
import { householdSchema } from '@/core/profile/schema';
import { sourceRefSchema } from '@/core/source';
import type { SourceRef } from '@/core/source';
import type { Household } from '@/core/types';

/** A made-up household the home page offers as a starting point, with an optional question. */
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

// The shape of one row of samples.json; unknown keys are refused. `exactOptional` means a key may
// be left out but not set to undefined.
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
  source: sourceRefSchema,
});

// The whole list: every row valid and every id different.
const samplesSchema = z.array(sampleSchema).superRefine((samples, ctx) => {
  if (new Set(samples.map((s) => s.id)).size !== samples.length) {
    ctx.addIssue({ code: 'custom', message: 'Sample ids must be unique' });
  }
});

// Parsed once at load: a sample that breaks the household schema fails the build, not a family's page.
/** The sample households, in the order they appear in samples.json. */
export const SAMPLES: readonly Sample[] = samplesSchema.parse(samplesData);

/** The sample with this id, or undefined when there is none. */
export function sampleById(id: string): Sample | undefined {
  return SAMPLES.find((sample) => sample.id === id);
}
