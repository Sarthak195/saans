// Records the model replies the Gemini tests replay. It makes REAL calls (about seven) with the
// GEMINI_API_KEY from a .env file, so run it by hand and review the diff before committing:
//
//   npx tsx --conditions=react-server scripts/record-genai.ts [--only <case>] [--env <dir>] [--dry]
//
// The key is read from .env.local or .env in the given directory, the current one, or the
// checkout this worktree was made from. It is never printed. Each reply is saved minified with
// its provenance in tests/fixtures/genai/. Nothing is edited by hand: to change a recording,
// change the prompt and run this again.
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { AppError } from '@/server/errors';
import { sampleById } from '@/core/profile/samples';
import { makeGeminiCall } from '@/server/genai/client';
import { noCache } from '@/server/genai/cache';
import type { GenaiDeps, ModelCall, ModelRequest } from '@/server/genai/model';
import { BRIEFING_PROMPT_VERSION } from '@/server/genai/prompts/briefing';
import { NOTICE_PROMPT_VERSION } from '@/server/genai/prompts/notice';
import { QUESTION_PROMPT_VERSION } from '@/server/genai/prompts/question';
import { READER_PROMPT_VERSION } from '@/server/genai/prompts/reader';
import { questionWithDeps } from '@/server/genai/question';
import { readWithDeps } from '@/server/genai/reader';
import { briefingWithDeps, noticeWithDeps } from '@/server/genai/writer';

import {
  FIXTURE_DIR,
  INJECTION_TEXT,
  QUESTION_TEXT,
  RECORDED_NOW,
  familyCase,
  sampleText,
  schoolCase,
} from '../tests/helpers/genai';

const KEY_NAME = 'GEMINI_API_KEY';

function readKey(dirs: readonly string[]): string {
  for (const dir of dirs) {
    for (const file of ['.env.local', '.env']) {
      const path = resolve(dir, file);
      if (!existsSync(path)) continue;
      for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
        const match = new RegExp(`^${KEY_NAME}=(.*)$`).exec(line.trim());
        const value = match?.[1]?.trim().replace(/^["']|["']$/g, '');
        if (value) return value;
      }
    }
  }
  throw new Error(`No ${KEY_NAME} found in ${dirs.join(', ')}`);
}

function argValue(name: string): string | undefined {
  const at = process.argv.indexOf(name);
  return at === -1 ? undefined : process.argv[at + 1];
}

// The models the app uses by default, so a recording is what a family would get.
const MODELS = {
  reader: 'gemini-3.5-flash-lite',
  writer: 'gemini-3.5-flash-lite',
  fallback: 'gemini-3.1-flash-lite',
};

function deps(call: ModelCall): GenaiDeps {
  return { call, models: MODELS, cache: noCache };
}

interface Captured {
  model: string;
  reply: string;
}

/** Wraps a call so the first reply of a case is kept, whatever the pipeline then does with it. */
function capturing(inner: ModelCall, log: Captured[]): ModelCall {
  return async (request: ModelRequest) => {
    try {
      const reply = await inner(request);
      log.push({ model: request.model, reply });
      return reply;
    } catch (error) {
      console.error(
        `call to ${request.model} failed: ${error instanceof AppError ? error.kind : 'unknown'}`,
      );
      throw error;
    }
  };
}

function minified(reply: string): string {
  try {
    return JSON.stringify(JSON.parse(reply));
  } catch {
    return reply.trim();
  }
}

interface Case {
  name: string;
  prompt: string;
  /** What the case is built from, for the provenance. */
  input: Record<string, unknown>;
  run: (call: ModelCall) => Promise<unknown>;
}

function cases(
  family: Awaited<ReturnType<typeof familyCase>>,
  school: Awaited<ReturnType<typeof schoolCase>>,
): Case[] {
  const s1 = sampleById('s1');
  return [
    {
      name: 'reader-s1',
      prompt: READER_PROMPT_VERSION,
      input: { sample: 's1' },
      run: (call) => readWithDeps({ text: sampleText('s1') }, deps(call)),
    },
    {
      name: 'reader-s2',
      prompt: READER_PROMPT_VERSION,
      input: { sample: 's2' },
      run: (call) => readWithDeps({ text: sampleText('s2') }, deps(call)),
    },
    {
      name: 'reader-injection',
      prompt: READER_PROMPT_VERSION,
      input: { text: 'injection' },
      run: (call) => readWithDeps({ text: INJECTION_TEXT }, deps(call)),
    },
    {
      name: 'briefing-en',
      prompt: BRIEFING_PROMPT_VERSION,
      input: { sample: 's1', series: s1?.recordedId, now: RECORDED_NOW.toISOString(), lang: 'en' },
      run: (call) => briefingWithDeps({ ...family, lang: 'en' }, deps(call)),
    },
    {
      name: 'briefing-hi',
      prompt: BRIEFING_PROMPT_VERSION,
      input: { sample: 's1', series: s1?.recordedId, now: RECORDED_NOW.toISOString(), lang: 'hi' },
      run: (call) => briefingWithDeps({ ...family, lang: 'hi' }, deps(call)),
    },
    {
      name: 'notice-s6',
      prompt: NOTICE_PROMPT_VERSION,
      input: { sample: 's6', now: RECORDED_NOW.toISOString(), lang: 'en' },
      run: (call) => noticeWithDeps({ ...school, lang: 'en' }, deps(call)),
    },
    {
      name: 'question-s1',
      prompt: QUESTION_PROMPT_VERSION,
      input: { sample: 's1', text: QUESTION_TEXT },
      run: (call) =>
        questionWithDeps({ text: QUESTION_TEXT, household: family.household }, deps(call)),
    },
  ];
}

function describe(outcome: unknown): string {
  if (typeof outcome !== 'object' || outcome === null) return 'none';
  const record = outcome as Record<string, unknown>;
  const label = record.kind ?? record.by;
  return typeof label === 'string' ? label : 'none';
}

async function main(): Promise<void> {
  const dry = process.argv.includes('--dry');
  const only = argValue('--only');
  const dirs = [argValue('--env'), process.cwd(), resolve(process.cwd(), '../../..')].filter(
    (d): d is string => d !== undefined,
  );
  const real = dry ? undefined : makeGeminiCall(readKey(dirs));
  const dryReply = '{"members":[],"routines":[],"home":{"habits":[]}}';
  const inner: ModelCall = real ?? (() => Promise.resolve(dryReply));

  const family = await familyCase();
  const school = await schoolCase();
  await mkdir(FIXTURE_DIR, { recursive: true });

  for (const item of cases(family, school)) {
    if (only !== undefined && only !== item.name) continue;
    const log: Captured[] = [];
    const outcome = await item.run(capturing(inner, log));
    const first = log[0];
    if (!first) throw new Error(`${item.name}: the model was never called`);
    const fixture = {
      provenance: {
        case: item.name,
        promptVersion: item.prompt,
        model: first.model,
        recordedOn: new Date().toISOString().slice(0, 10),
        status: 'completed',
        input: item.input,
      },
      reply: minified(first.reply),
    };
    if (dry) {
      console.log(`dry run: ${item.name} ok`);
      continue;
    }
    await writeFile(`${FIXTURE_DIR}/${item.name}.json`, `${JSON.stringify(fixture)}\n`, 'utf8');
    console.log(
      `wrote ${item.name} (${first.model}, ${String(log.length)} call(s), result: ${describe(outcome)})`,
    );
  }
}

main().catch((error: unknown) => {
  // An SDK message can quote the request, so only the app's own errors say more than their kind.
  const own = error instanceof AppError || (error instanceof Error && error.name === 'Error');
  const kind = error instanceof AppError ? error.kind : '';
  console.error(
    error instanceof Error ? error.name : 'Error',
    kind,
    own && error instanceof Error ? error.message.slice(0, 200) : '',
  );
  process.exitCode = 1;
});
