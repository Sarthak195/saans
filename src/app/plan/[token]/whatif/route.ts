import { keepFromForm, modeOf, planPath, withRoutineChange } from '@/server/edits';
import { field, handleForm, readGuardedForm, seeOther } from '@/server/http';
import { openHousehold, sealHousehold } from '@/server/seal';

interface Context {
  params: Promise<{ token: string }>;
}

/** Moves one routine to another time or mode and opens the plan again, showing before and after. */
export function POST(request: Request, { params }: Context): Promise<Response> {
  return handleForm(async () => {
    const form = await readGuardedForm(request, new Date());
    const { token } = await params;
    const household = openHousehold(token);
    const keep = keepFromForm(form);

    const routineId = field(form, 'routineId', 32);
    const wantsMode = field(form, 'change', 8) === 'mode';
    const edited = withRoutineChange(household, {
      routineId,
      newStart: wantsMode ? undefined : field(form, 'newStart', 5),
      newMode: wantsMode ? modeOf(field(form, 'newMode', 16)) : undefined,
    });
    // An unknown routine, an unusable value or the value it already had leaves the plan as it was.
    if (edited === undefined || JSON.stringify(edited) === JSON.stringify(household))
      return seeOther(planPath(token, keep, 'timeline'));

    return seeOther(
      planPath(
        sealHousehold(edited),
        { ...keep, status: 'changed', from: token, r: routineId },
        `routine-${routineId}`,
      ),
    );
  });
}
