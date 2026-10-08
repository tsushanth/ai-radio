// The radio's status API, as the browser calls it (now playing, the queue, which languages are on air).
//
// radio.audexa.app sits behind Cloudflare, which answers browser requests that carry Sec-Fetch headers, such as a fetch from
// audexa.app, with a 520 error. The same call works straight against the radio's own Fly address, which sends CORS headers
// (access-control-allow-origin: *), so the web app calls that. Switch back to radio.audexa.app (NEXT_PUBLIC_RADIO_STATUS_URL) once
// the Cloudflare side is fixed. The audio stream does not use this: it is played through this site's /api/stream route.
export const RADIO_STATUS_URL = process.env.NEXT_PUBLIC_RADIO_STATUS_URL || 'https://audexa-radio-fly.fly.dev/api/status';
