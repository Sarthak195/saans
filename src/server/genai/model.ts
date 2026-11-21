/** One request to a model, in our own terms so only client.ts needs to know the SDK. */
export interface ModelRequest {
  model: string;
  /** Fixed instructions, sent before anything that varies so they can be cached. */
  system: string;
  /** What varies: the family's text, or the facts to write from. */
  input: string;
  /** A JSON Schema; when present the model must reply with JSON that fits it. */
  schema?: Record<string, unknown>;
  temperature: number;
  thinking: 'minimal' | 'low';
  maxOutputTokens: number;
}

/** Sends a request and returns the model's text. Throws an AppError of a genai kind on any failure. */
export type ModelCall = (request: ModelRequest) => Promise<string>;

export interface ModelNames {
  reader: string;
  writer: string;
  fallback: string;
}

/** Remembers written text for a while, keyed by a hash of the facts. Best effort: a miss only costs a call. */
export type TextCache = (key: string, produce: () => Promise<string>) => Promise<string>;

/** Everything the module needs from outside, so tests can replay recorded replies. */
export interface GenaiDeps {
  /** Null when there is no API key: every function then takes its no-AI path. */
  call: ModelCall | null;
  models: ModelNames;
  cache: TextCache;
}
