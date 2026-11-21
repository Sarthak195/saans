// Re-records the fixtures the tests and the sample places rely on. It makes REAL network calls,
// so run it by hand (`npx tsx scripts/record-fixtures.ts`), review the diff, then commit.
// Every file keeps its source URL and retrieval time in a `provenance` object.
import { mkdir, writeFile } from 'node:fs/promises';

import { RECORDING_TARGETS } from '@/server/air/recorded-targets';
import { airBodySchema, airUrl, istIso, type Provenance } from '@/server/air/open-meteo-shape';

const AIR_DIR = 'src/data/recorded';
const GEOCODE_DIR = 'tests/fixtures/geocode';
const TIMEOUT_MS = 15_000;

// A mix that exercises the geocoder rules: one ambiguous across states, one clear,
// non-town results to drop, accent variants of one name, and names that return nothing.
const GEOCODE_QUERIES = [
  'Andheri',
  'Indiranagar',
  'Sector 62',
  'Bidhannagar',
  'Rampur',
  'Mysuru',
  'Chennai',
  'Gurgaon',
];

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HTTP ${String(response.status)} for ${url}`);
  return (await response.json()) as unknown;
}

async function writeMinified(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value)}\n`, 'utf8');
  console.log(`wrote ${path}`);
}

async function recordAir(): Promise<void> {
  await mkdir(AIR_DIR, { recursive: true });
  for (const target of RECORDING_TARGETS) {
    const url = airUrl(target.lat, target.lon, target.window);
    // Parsing before writing means a bad reply never lands as a fixture.
    const body = airBodySchema.parse(await getJson(url));
    const provenance: Provenance = {
      url,
      retrievedAt: istIso(new Date()),
      ...(target.recordedOn === undefined ? {} : { recordedOn: target.recordedOn }),
      ...(target.note === undefined ? {} : { note: target.note }),
    };
    await writeMinified(`${AIR_DIR}/${target.id}.json`, {
      provenance,
      latitude: body.latitude,
      longitude: body.longitude,
      hourly: body.hourly,
    });
    const pm = body.hourly.pm2_5.filter((v): v is number => v !== null);
    console.log(
      `  ${target.label}: ${String(pm.length)} PM2.5 values, max ${String(Math.max(...pm))} ug/m3`,
    );
  }
}

async function recordGeocoder(): Promise<void> {
  await mkdir(GEOCODE_DIR, { recursive: true });
  for (const name of GEOCODE_QUERIES) {
    const url =
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}` +
      '&count=5&language=en&format=json&countryCode=IN';
    const reply = (await getJson(url)) as Record<string, unknown>;
    const body = Object.fromEntries(
      Object.entries(reply).filter(([key]) => key !== 'generationtime_ms'),
    );
    const provenance: Provenance = { url, retrievedAt: istIso(new Date()) };
    const file = name.toLowerCase().replaceAll(' ', '-');
    await writeMinified(`${GEOCODE_DIR}/${file}.json`, { provenance, body });
  }
}

async function main(): Promise<void> {
  await recordAir();
  await recordGeocoder();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
