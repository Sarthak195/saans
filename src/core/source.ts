/**
 * Where a rule, threshold or number comes from. Every data row carries one so the interface can show
 * the reason behind advice. 'APP' marks a choice Saans made itself where no authority gives a number.
 */
export interface SourceRef {
  id: string;
  title: string;
  url: string;
  quote?: string;
  status: 'P-READ' | 'P-FETCH' | 'APP';
}
