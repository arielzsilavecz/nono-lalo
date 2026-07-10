// @ts-nocheck — Deno runtime; los tipos de WebCrypto (HKDF/ECDH deriveBits)
// no resuelven bien contra el lsp de Node del editor.
//
// Envío de Web Push (VAPID + cifrado RFC 8291, body RFC 8188 aes128gcm),
// portado del proyecto de gastos de Ariel con el fix del byte delimitador
// de RFC 8188 ya aplicado. Solo se usa server-side, importado por las Edge
// Functions que necesiten avisar al admin (hoy: place-order).

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com';

export interface PushSubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth_key: string;
}

// ─── VAPID signing ────────────────────────────────────────────────────────────

function base64urlToBytes(b64url: string): Uint8Array {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
  const b64 = (b64url + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  return Uint8Array.from([...bin].map((c) => c.charCodeAt(0)));
}

function bytesToBase64url(bytes: Uint8Array): string {
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function makeVapidJwt(audience: string): Promise<string> {
  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: VAPID_SUBJECT,
  };

  const enc = new TextEncoder();
  const headerB64 = bytesToBase64url(enc.encode(JSON.stringify(header)));
  const payloadB64 = bytesToBase64url(enc.encode(JSON.stringify(payload)));
  const sigInput = enc.encode(`${headerB64}.${payloadB64}`);

  // WebCrypto exige x,y válidos al importar la clave EC como JWK (aunque solo firmemos).
  // La clave pública VAPID es un punto sin comprimir: 0x04 || X(32 bytes) || Y(32 bytes).
  const pub = base64urlToBytes(VAPID_PUBLIC_KEY);
  const x = bytesToBase64url(pub.slice(1, 33));
  const y = bytesToBase64url(pub.slice(33, 65));

  const privKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC', crv: 'P-256', d: VAPID_PRIVATE_KEY,
      x, y,
      key_ops: ['sign'],
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const sigRaw = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privKey, sigInput);
  return `${headerB64}.${payloadB64}.${bytesToBase64url(new Uint8Array(sigRaw))}`;
}

// ─── Web Push encryption (RFC 8291) ──────────────────────────────────────────

async function encryptPayload(
  subscription: PushSubscriptionRow,
  payload: string
): Promise<{ ciphertext: Uint8Array; salt: Uint8Array; serverPublicKey: Uint8Array }> {
  const enc = new TextEncoder();
  const plaintext = enc.encode(payload);

  // Client public key + auth secret
  const clientPublicKey = base64urlToBytes(subscription.p256dh);
  const authSecret = base64urlToBytes(subscription.auth_key);

  // Ephemeral server key pair
  const serverKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );
  const serverPublicKey = new Uint8Array(
    await crypto.subtle.exportKey('raw', serverKeyPair.publicKey)
  );

  // Import client key
  const clientKey = await crypto.subtle.importKey(
    'raw', clientPublicKey, { name: 'ECDH', namedCurve: 'P-256' }, true, []
  );

  // ECDH shared secret
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: clientKey }, serverKeyPair.privateKey, 256)
  );

  // Salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // HKDF auth key
  const ikm = await crypto.subtle.importKey('raw', sharedSecret, 'HKDF', false, ['deriveKey', 'deriveBits']);

  const prk = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: authSecret, info: concatBytes(enc.encode('WebPush: info\0'), clientPublicKey, serverPublicKey) },
    ikm, 256
  ));

  const prkKey = await crypto.subtle.importKey('raw', prk, 'HKDF', false, ['deriveBits']);

  const cek = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('Content-Encoding: aes128gcm\0') },
    prkKey, 128
  ));

  const nonce = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('Content-Encoding: nonce\0') },
    prkKey, 96
  ));

  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);

  // RFC 8188: record = content || delimiter (0x02 = last record) || padding
  const record = new Uint8Array([...plaintext, 0x02]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, record)
  );

  return { ciphertext, salt, serverPublicKey };
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

function buildAes128gcmBody(ciphertext: Uint8Array, salt: Uint8Array, serverPublicKey: Uint8Array): Uint8Array {
  // Header: salt(16) + rs(4, big-endian) + keyid_len(1) + keyid(65)
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false);
  const header = concatBytes(salt, rs, new Uint8Array([serverPublicKey.length]), serverPublicKey);
  return concatBytes(header, ciphertext);
}

// ─── Send a single push ───────────────────────────────────────────────────────

export async function sendWebPush(
  sub: PushSubscriptionRow,
  payload: string
): Promise<{ ok: boolean; status: number }> {
  try {
    const url = new URL(sub.endpoint);
    const audience = `${url.protocol}//${url.host}`;
    const jwt = await makeVapidJwt(audience);
    const vapidAuth = `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`;

    const { ciphertext, salt, serverPublicKey } = await encryptPayload(sub, payload);
    const body = buildAes128gcmBody(ciphertext, salt, serverPublicKey);

    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        Authorization: vapidAuth,
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        TTL: '86400',
      },
      body,
    });

    return { ok: res.ok || res.status === 201, status: res.status };
  } catch (err) {
    // status 0 = fallo local (firma/cifrado/red). NO se borra la suscripción por esto.
    console.error('sendWebPush error', { endpoint: sub.endpoint.slice(0, 60), err: String(err) });
    return { ok: false, status: 0 };
  }
}
