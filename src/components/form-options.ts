// Choices for the household form: the code stored, then the words a family reads.
// UI layer: plain data lists, with no logic. The codes match the household schema in src/core.

/** A list of [code, label] pairs: the code is what is stored, the label is what a family reads. */
export type Choices = readonly (readonly [string, string])[];

/** Age group choices for a person on the form, youngest first. */
export const AGE: Choices = [
  ['infant', 'Under 1 year'],
  ['under5', '1 to 4 years'],
  ['child', '5 to 12 years'],
  ['teen', '13 to 17 years'],
  ['adult', '18 to 59 years'],
  ['older', '60 years or older'],
];
/** Health conditions a person can tick. */
export const CONDITIONS: Choices = [
  ['asthma_copd', 'Asthma or COPD'],
  ['heart', 'Heart condition'],
  ['pregnancy', 'Pregnancy'],
];
/** How hard a routine is, from easy to sport. */
export const INTENSITY: Choices = [
  ['light', 'Light, like an easy walk'],
  ['moderate', 'Moderate, breathing harder'],
  ['vigorous', 'Vigorous, like sport or running'],
];
/** The days of the week a routine happens, Monday first. */
export const DAYS: Choices = [
  ['mon', 'Mon'],
  ['tue', 'Tue'],
  ['wed', 'Wed'],
  ['thu', 'Thu'],
  ['fri', 'Fri'],
  ['sat', 'Sat'],
  ['sun', 'Sun'],
];
/** How the home cooks. */
export const COOKING: Choices = [
  ['lpg_png', 'LPG or piped gas'],
  ['electric', 'Electric or induction'],
  ['biomass', 'Wood, dung or crop waste'],
  ['kerosene', 'Kerosene'],
];
/** How the home is heated. */
export const HEATING: Choices = [
  ['none', 'No heating'],
  ['electric', 'Electric heater'],
  ['angithi_coal', 'Angithi or coal'],
  ['gas', 'Gas heater'],
];
/** The units a purifier's clean air delivery rate may be given in. */
export const PURIFIER_UNITS: Choices = [
  ['cfm', 'cfm (cubic feet per minute)'],
  ['m3h', 'm3/h (cubic metres per hour)'],
];
/** Indoor smoke sources a family can tick. */
export const HABITS: Choices = [
  ['incense', 'Incense or dhoop'],
  ['mosquito_coil', 'Mosquito coils'],
  ['smoking', 'Smoking indoors'],
  ['candles', 'Candles'],
];
