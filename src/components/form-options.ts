// Choices for the household form: the code stored, then the words a family reads.

export type Choices = readonly (readonly [string, string])[];

export const AGE: Choices = [
  ['infant', 'Under 1 year'],
  ['under5', '1 to 4 years'],
  ['child', '5 to 12 years'],
  ['teen', '13 to 17 years'],
  ['adult', '18 to 59 years'],
  ['older', '60 years or older'],
];
export const CONDITIONS: Choices = [
  ['asthma_copd', 'Asthma or COPD'],
  ['heart', 'Heart condition'],
  ['pregnancy', 'Pregnancy'],
];
export const INTENSITY: Choices = [
  ['light', 'Light, like an easy walk'],
  ['moderate', 'Moderate, breathing harder'],
  ['vigorous', 'Vigorous, like sport or running'],
];
export const DAYS: Choices = [
  ['mon', 'Mon'],
  ['tue', 'Tue'],
  ['wed', 'Wed'],
  ['thu', 'Thu'],
  ['fri', 'Fri'],
  ['sat', 'Sat'],
  ['sun', 'Sun'],
];
export const COOKING: Choices = [
  ['lpg_png', 'LPG or piped gas'],
  ['electric', 'Electric or induction'],
  ['biomass', 'Wood, dung or crop waste'],
  ['kerosene', 'Kerosene'],
];
export const HEATING: Choices = [
  ['none', 'No heating'],
  ['electric', 'Electric heater'],
  ['angithi_coal', 'Angithi or coal'],
  ['gas', 'Gas heater'],
];
export const PURIFIER_UNITS: Choices = [
  ['cfm', 'cfm (cubic feet per minute)'],
  ['m3h', 'm3/h (cubic metres per hour)'],
];
export const HABITS: Choices = [
  ['incense', 'Incense or dhoop'],
  ['mosquito_coil', 'Mosquito coils'],
  ['smoking', 'Smoking indoors'],
  ['candles', 'Candles'],
];
