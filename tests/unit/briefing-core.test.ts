import { beforeAll, describe, expect, it } from 'vitest';

import {
  checkWritten,
  noticeFacts,
  reassuresAnywhere,
  substituteNames,
  templateBriefing,
  templateNotice,
  tidyText,
} from '@/core/briefing';
import { planFacts } from '@/core/plan/facts';
import { checkNumbers } from '@/core/text';

import { familyCase, schoolCase, type FamilyCase } from '../helpers/genai';
import { CLAIMS_SAFE, DASHES, UNFILLED } from '../helpers/text';

let family: FamilyCase;
let school: Awaited<ReturnType<typeof schoolCase>>;

beforeAll(async () => {
  family = await familyCase();
  school = await schoolCase();
});

describe('the template wording', () => {
  it('uses only numbers the plan computed, and names routines in the family words', () => {
    const text = templateBriefing(family.plan);
    const allowed = planFacts(family.plan, {
      home: family.home,
      alternatives: family.alternatives,
    });
    expect(checkNumbers(text, allowed)).toEqual({ ok: true, unknown: [] });
    expect(text).toContain("Grandmother's walk at 06:30: stay indoors");
    expect(text).toContain("Son's outdoor play at 17:00: stay indoors");
    expect(text).not.toMatch(DASHES);
    expect(text).not.toMatch(UNFILLED);
    expect(text).not.toMatch(CLAIMS_SAFE);
  });

  it('says nothing needs to change only when nothing does', () => {
    const calm = {
      ...family.plan,
      routines: family.plan.routines.map((r) => ({ ...r, decision: 'keep' as const })),
    };
    expect(templateBriefing(calm)).toContain('No routine needs to change for this day.');
    expect(templateBriefing(family.plan)).not.toContain('No routine needs to change');
  });

  it('names a move with its window and the saving', () => {
    const [first] = family.plan.routines;
    if (!first) throw new Error('No routine');
    const moved = {
      ...family.plan,
      routines: [
        {
          ...first,
          decision: 'move' as const,
          window: { start: '12:00', end: '13:00', pm25: 75, level: 'moderate' as const },
          impact: { ...first.impact, percentLess: 40 },
        },
      ],
    };
    expect(templateBriefing(moved)).toContain(
      'move it to 12:00 to 13:00 (PM2.5 around 135), about 40% less PM2.5',
    );
  });

  it('writes a notice from the community plan with only its own numbers', () => {
    const text = templateNotice(school.plan, school.community);
    expect(text).toMatch(/^Air notice for our school, Sat 21 Nov\./);
    expect(checkNumbers(text, planFacts(school.plan, { community: school.community })).ok).toBe(
      true,
    );
    expect(text).not.toMatch(CLAIMS_SAFE);
  });

  it('keeps the notice facts free of anything that names a family', () => {
    expect(JSON.stringify(noticeFacts(school))).not.toMatch(/Coordinator/);
  });
});

describe('checking written text', () => {
  const allowed = [302, 21, 6, 30, 17, 0, 1, 2, 3];
  const refs = [
    { ref: 'routine_1', decision: 'indoors' as const },
    { ref: 'routine_2', decision: 'keep' as const },
  ];
  const good =
    'The AQI is 302 today. Do routine_1 indoors at 06:30. Routine_2 stays as it is at 17:00.';

  it('accepts a text that passes every check', () => {
    expect(checkWritten(good, { lang: 'en', allowedNumbers: allowed, refs })).toEqual({
      ok: true,
      reasons: [],
    });
  });

  it('says why a text fails', () => {
    const why = (text: string, lang: 'en' | 'hi' = 'en') =>
      checkWritten(text, { lang, allowedNumbers: allowed, refs }).reasons.join(' | ');
    expect(why('The AQI is 999. Do routine_1 indoors.')).toContain('unknown numbers 999');
    expect(why('Stay in today. Be careful out there.')).toContain('missing routine_1');
    expect(why('Routine_1 is safe to do. It is fine.')).toContain('reassurance about a change');
    expect(why('Do routine_1 indoors. Also routine_5 is fine.')).toContain('invented routine_5');
    expect(why('Do routine_1 indoors. Stay in `now`.')).toContain('markup');
    expect(why('Do routine_1 indoors. Stay in.', 'hi')).toContain('wrong language');
  });

  it('refuses a Hindi text with an English sentence in the middle', () => {
    const mixed =
      'हवा बहुत खराब है। routine_1 को 06:30 पर घर के अंदर करें। Keep hard exercise and outdoor play indoors today. सबसे साफ समय 12:00 है।';
    const result = checkWritten(mixed, { lang: 'hi', allowedNumbers: [6, 30, 12, 0, 1], refs });
    expect(result.reasons).toContain('English sentence');
  });

  it('can refuse any reassurance in a notice, but lets a warning through', () => {
    expect(reassuresAnywhere('Outdoor sports are safe at 12:00.')).toBe(true);
    expect(reassuresAnywhere('It is fine to go out.')).toBe(true);
    expect(reassuresAnywhere('Outdoor sports are not safe today.')).toBe(false);
    expect(reassuresAnywhere('Keep windows shut.')).toBe(false);
  });
});

describe('tidying and naming', () => {
  it('turns ranges and pauses with dashes into words', () => {
    const en = String.fromCodePoint(0x2013);
    const em = String.fromCodePoint(0x2014);
    expect(tidyText(`12:00${en}15:00`)).toBe('12:00 to 15:00');
    expect(tidyText(`Stay in ${em} it is smoggy`)).toBe('Stay in, it is smoggy');
    expect(tidyText('**Stay** in # today')).toBe('Stay in today');
  });

  it('puts labels in for placeholders, in any case, and gives up on a stray one', () => {
    expect(substituteNames('Do routine_2 indoors. Member_1 should rest.', family.plan)).toBe(
      "Do Son's outdoor play indoors. Grandmother should rest.",
    );
    expect(substituteNames('Do routine_9 indoors.', family.plan)).toBeUndefined();
  });

  it('does not mistake routine_1 for routine_10', () => {
    expect(substituteNames('routine_1 and routine_10', family.plan)).toBeUndefined();
  });
});
