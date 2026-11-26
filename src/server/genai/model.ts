// The types the GenAI layer shares: a request, a call, model names, a cache and the bundle of
// them. Server layer: types only, so tests can swap in recorded replies without the SDK.

/** One request to a model, in our own terms so only client.ts needs to know the SDK. */
export interface ModelRequest {
  model: string;
  /** Fixed instructions, sent before anything that varies so they can be cached. */
  system: string;
  /** What varies: the family's text, or the facts to write from. */
  input: string;
  /** A JSON Schema; when present the model must reply with JSON that fits it. */
  schema?: Record<string, unknown>;
  /** How random the reply may be; 0 is the most repeatable. */
  temperature: number;
  /** How much the model may think before it answers; more thinking uses more of the token cap. */
  thinking: 'minimal' | 'low';
  /** The most tokens the reply may use, thinking included. */
  maxOutputTokens: number;
}

/** Sends a request and returns the model's text. Throws an AppError of a genai kind on any failure. */
export type ModelCall = (request: ModelRequest) => Promise<string>;

/** The model names for the three roles; the fallback is tried when the first choice fails. */
export interface ModelNames {
  /** Reads a family's words and questions. */
  reader: string;
  /** Writes the briefing and the notice. */
  writer: string;
  /** Tried after the reader or writer model when that one fails. */
  fallback: string;
}

/** Remembers written text for a while, keyed by a hash of the facts. Best effort: a miss only costs a call. */
export type TextCache = (key: string, produce: () => Promise<string>) => Promise<string>;

/** Everything the module needs from outside, so tests can replay recorded replies. */
export interface GenaiDeps {
  /** Null when there is no API key: every function then takes its no-AI path. */
  call: ModelCall | null;
  /** The model names for each role. */
  models: ModelNames;
  /** Where written text is remembered; the writer is the only part that uses it. */
  cache: TextCache;
}
