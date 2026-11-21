// A reply shaped like Open-Meteo's, small enough to read in a test.
export interface BodyOptions {
  start?: string;
  hours?: number;
  pm25?: (index: number) => number | null;
}

export interface AirBodyShape {
  latitude: number;
  longitude: number;
  hourly: {
    time: string[];
    pm2_5: (number | null)[];
    pm10: (number | null)[];
    nitrogen_dioxide: (number | null)[];
    ozone: (number | null)[];
    carbon_monoxide: (number | null)[];
    sulphur_dioxide: (number | null)[];
  };
}

export function airBody(options: BodyOptions = {}): AirBodyShape {
  const { start = '2026-11-20T00:00', hours = 120, pm25 = (i) => 100 + i } = options;
  const first = Date.parse(`${start}:00Z`);
  const time = Array.from({ length: hours }, (_, i) =>
    new Date(first + i * 3_600_000).toISOString().slice(0, 16),
  );
  const column = (value: (i: number) => number | null): (number | null)[] =>
    time.map((_, i) => value(i));
  return {
    latitude: 28.599998,
    longitude: 77.20001,
    hourly: {
      time,
      pm2_5: column(pm25),
      pm10: column((i) => 200 + i),
      nitrogen_dioxide: column(() => 30),
      ozone: column(() => 20),
      carbon_monoxide: column(() => 500),
      sulphur_dioxide: column(() => 10),
    },
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}
