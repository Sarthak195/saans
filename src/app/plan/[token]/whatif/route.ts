// Form handler for the "what if" step: move one routine to another time or mode.
// Layer: route (src/app). The household lives in the token, so the change makes a new sealed
// household and redirects to its plan; nothing is stored on the server.
import { keepFromForm, modeOf, planPath, withRoutineChange } from '@/server/edits';
import { field, handleForm, readGuardedForm, seeOther } from '@/server/http';
import { openHousehold, sealHousehold } from '@/server/seal';

/** The sealed household token from the address. */
interface Context {
  params: Promise<{ token: string }>;
}

/** Moves one routine to another time or mode and opens the plan again, showing before and after. */
export function POST(request: Request, { params }: Context): Promise<Response> {
  return handleForm(async () => {
    // The guard checks the origin, the body size and the form token before anything else runs.
    const form = await readGuardedForm(request, new Date());
    const { token } = await params;
    const household = openHousehold(token);
    // The day and air mode the visitor was looking at, so the next page shows the same view.
    const keep = keepFromForm(form);

    const routineId = field(form, 'routineId', 32);
    // The form changes either the start time or the mode, never both at once.
    const wantsMode = field(form, 'change', 8) === 'mode';
    const edited = withRoutineChange(household, {
      routineId,
      newStart: wantsMode ? undefined : field(form, 'newStart', 5),
      newMode: wantsMode ? modeOf(field(form, 'newMode', 16)) : undefined,
    });
    // An unknown routine, an unusable value or the value it already had leaves the plan as it was.
    if (edited === undefined || JSON.stringify(edited) === JSON.stringify(household))
      return seeOther(planPath(token, keep, 'timeline'));

    // The new plan is at the edited household's own link. `from` names the old link and `r` the
    // routine, so the page can show the routine as it was before.
    return seeOther(
      planPath(
        sealHousehold(edited),
        { ...keep, status: 'changed', from: token, r: routineId },
        `routine-${routineId}`,
      ),
    );
  });
}
