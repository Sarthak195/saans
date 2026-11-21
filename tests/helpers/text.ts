// Built from code points so this file does not itself contain the characters it forbids.
export const DASHES = new RegExp(
  `[${String.fromCodePoint(0x2013)}${String.fromCodePoint(0x2014)}]`,
);

/** A raw brace means a placeholder in the data was never filled. */
export const UNFILLED = /[{}]/;

/** Advice must never call something advised against safe. */
export const CLAIMS_SAFE = /\bsafe(r|ly)?\b/i;
