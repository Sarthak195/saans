// The public entry point of the community core: the builder and the window search. Pure core:
// nothing here touches the clock, network or environment.
/** Builds the community view (actions, best outdoor window and car-km saving) for a plan. */
export { buildCommunity } from '@/core/community/build';
/** Finds the cleanest outdoor time among a community's slots, or null when none has a forecast. */
export { bestOutdoorWindow } from '@/core/community/window';
