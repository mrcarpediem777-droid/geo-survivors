/**
 * THE SERVER SIDE OF THE LEDGER.
 * ==============================
 * One file, two things it will do: say what is owned around here, and decide
 * whether a claim succeeds. Nothing else. Everything about the world -- nests,
 * prices, streets, buildings -- is worked out on the phone and never travels.
 *
 * IT RUNS ON VERCEL, alongside the game, because the game is already deployed
 * there. Dropping a file in this folder is the whole of "deploying a server".
 *
 * WHY IT EXISTS AT ALL, rather than the phone talking to the database.
 *
 * A phone saying "I have ten thousand coins, sell me the cafe" is a claim, not
 * a fact. As long as one person plays alone, believing it costs nothing. The
 * moment a purchase can take something off somebody else, the decision has to
 * be made somewhere the player cannot edit -- which is here. The database key
 * lives in an environment variable on the server and is never sent to a phone.
 *
 * WHAT IT DELIBERATELY DOES NOT STORE.
 *
 * No positions of people. No times of day anybody was anywhere. No history.
 * A building's own coordinates, the name somebody chose, and what was paid. A
 * building somebody bought is usually near where they live, so a record of who
 * owns what and when is a tool for finding people, and this refuses to be one.
 *
 * IF IT IS NOT CONFIGURED IT SAYS SO POLITELY and the game carries on entirely
 * on the phone. That is the normal state until somebody sets up a database.
 */

interface ClaimBody {
  deviceId?: unknown;
  playerName?: unknown;
  key?: unknown;
  lat?: unknown;
  lng?: unknown;
  offer?: unknown;
}

/*
 * The two settings, read from the environment at run time.
 *
 * Declared by hand rather than pulling in Node's type definitions: this file is
 * two environment variables away from needing a whole extra dependency, and the
 * game's own build does not use Node types for anything else.
 *
 * THE SERVICE KEY MUST NEVER REACH A PHONE. It lives only here, on the server,
 * where a player cannot read it. That is the entire reason this file exists
 * rather than the game talking to the database directly.
 */
declare const process: { env: Record<string, string | undefined> };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

/** Longest a chosen name may be, and it is stripped of anything alarming. */
const MAX_NAME = 24;

function tidyName(value: unknown): string {
  const text = typeof value === 'string' ? value : '';
  // Letters, numbers, spaces and a few marks. No markup, no control characters,
  // nothing that could be mistaken for anything but a name.
  return text.replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, MAX_NAME) || 'someone';
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

async function supabase(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_KEY as string,
      authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    // The ordinary state before anybody sets up a database. Not an error: the
    // game is told plainly and keeps everything on the phone.
    return json({ configured: false }, 200);
  }

  const url = new URL(request.url);

  /* ---- what is owned around here ---------------------------------- */
  if (request.method === 'GET') {
    const lat = Number(url.searchParams.get('lat'));
    const lng = Number(url.searchParams.get('lng'));
    const radius = Math.min(Number(url.searchParams.get('radius') ?? 800), 2000);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return json({ error: 'where?' }, 400);

    // A crude box rather than a circle. It asks for slightly too much and the
    // phone narrows it down, which avoids needing geographic extensions in the
    // database for a game whose radius is under a kilometre.
    const dLat = radius / 111320;
    const dLng = radius / (111320 * Math.cos((lat * Math.PI) / 180) || 1);

    const response = await supabase(
      `buildings?select=key,lat,lng,owner_name,owner_device,paid` +
        `&lat=gte.${lat - dLat}&lat=lte.${lat + dLat}` +
        `&lng=gte.${lng - dLng}&lng=lte.${lng + dLng}&limit=500`
    );
    if (!response.ok) return json({ error: 'the ledger is unwell' }, 502);

    const rows = (await response.json()) as {
      key: string;
      lat: number;
      lng: number;
      owner_name: string;
      owner_device: string;
      paid: number;
    }[];

    const asking = url.searchParams.get('deviceId') ?? '';
    return json({
      configured: true,
      entries: rows.map((row) => ({
        key: row.key,
        lat: row.lat,
        lng: row.lng,
        ownerName: row.owner_name,
        mine: row.owner_device === asking,
        paid: row.paid,
      })),
    });
  }

  /* ---- try to buy -------------------------------------------------- */
  if (request.method === 'POST') {
    let body: ClaimBody;
    try {
      body = (await request.json()) as ClaimBody;
    } catch {
      return json({ ok: false, reason: 'unreadable' }, 400);
    }

    const deviceId = typeof body.deviceId === 'string' ? body.deviceId.slice(0, 64) : '';
    const key = typeof body.key === 'string' ? body.key.slice(0, 64) : '';
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const offer = Math.floor(Number(body.offer));
    if (!deviceId || !key || !Number.isFinite(lat) || !Number.isFinite(lng) || !(offer > 0)) {
      return json({ ok: false, reason: 'that made no sense' }, 400);
    }

    /*
     * The rule, decided here and nowhere else: you may take a building off
     * somebody only by paying MORE than they did.
     *
     * `paid=lt.${offer}` in the update is what makes this safe against two
     * people buying at the same moment -- the database refuses the second one
     * rather than both succeeding. Checking first and writing afterwards would
     * leave a gap between the two, and that gap is where duplicate sales live.
     */
    const update = await supabase(`buildings?key=eq.${encodeURIComponent(key)}&paid=lt.${offer}`, {
      method: 'PATCH',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify({
        owner_device: deviceId,
        owner_name: tidyName(body.playerName),
        paid: offer,
        bought_at: new Date().toISOString(),
      }),
    });

    if (update.ok) {
      const rows = (await update.json()) as unknown[];
      if (rows.length > 0) {
        return json({
          ok: true,
          entry: { key, lat, lng, ownerName: tidyName(body.playerName), mine: true, paid: offer },
        });
      }
    }

    // Nothing updated: either nobody owns it yet, or somebody paid more.
    const insert = await supabase('buildings', {
      method: 'POST',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify({
        key,
        lat,
        lng,
        owner_device: deviceId,
        owner_name: tidyName(body.playerName),
        paid: offer,
      }),
    });

    if (insert.ok) {
      return json({
        ok: true,
        entry: { key, lat, lng, ownerName: tidyName(body.playerName), mine: true, paid: offer },
      });
    }

    // The insert clashed, so it is owned and the offer was not enough.
    const current = await supabase(
      `buildings?select=paid,owner_name&key=eq.${encodeURIComponent(key)}&limit=1`
    );
    const rows = current.ok ? ((await current.json()) as { paid: number; owner_name: string }[]) : [];
    const held = rows[0];
    return json({
      ok: false,
      reason: held
        ? `${held.owner_name} owns this one. You would have to beat ${held.paid}.`
        : 'Somebody got there first.',
    });
  }

  return json({ error: 'no' }, 405);
}
