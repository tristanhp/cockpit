import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bearerOk, classifyRoute, enrollmentAllowed } from "./access";
import { hashToken, newToken, sign, unsign } from "./crypto";
import { SESSION_DAYS, decodeChallenge, decodeSessionCookie, encodeChallenge, encodeSessionCookie, shouldSlide, slideExpiry } from "./session";

const SECRET = "x".repeat(40);
const NOW = Date.parse("2026-11-01T10:00:00Z");
const DAY = 86_400_000;

describe("sign / unsign", () => {
  it("round-trips", () => assert.equal(unsign(sign("hello", SECRET), SECRET), "hello"));
  it("rejects a tampered value", () => assert.equal(unsign(sign("hello", SECRET).replace("hello", "hellp"), SECRET), null));
  it("rejects another secret", () => assert.equal(unsign(sign("hello", SECRET), "y".repeat(40)), null));
  it("rejects garbage", () => {
    assert.equal(unsign("nodot", SECRET), null);
    assert.equal(unsign(".sig", SECRET), null);
  });
  it("tokens are unique and hash deterministically", () => {
    assert.notEqual(newToken(), newToken());
    assert.equal(hashToken("a"), hashToken("a"));
    assert.notEqual(hashToken("a"), hashToken("b"));
  });
});

describe("session cookie", () => {
  const exp = NOW + 5 * DAY;
  it("decodes a valid cookie", () => assert.deepEqual(decodeSessionCookie(encodeSessionCookie({ token: "tok", exp }, SECRET), SECRET, NOW), { token: "tok", exp }));
  it("rejects an expired cookie", () => assert.equal(decodeSessionCookie(encodeSessionCookie({ token: "tok", exp }, SECRET), SECRET, exp + 1), null));
  it("rejects a forged expiry", () => {
    const forged = encodeSessionCookie({ token: "tok", exp }, SECRET).replace(`:${exp}`, `:${exp + 99 * DAY}`);
    assert.equal(decodeSessionCookie(forged, SECRET, NOW), null);
  });
  it("rejects a missing cookie", () => assert.equal(decodeSessionCookie(undefined, SECRET, NOW), null));
  it("slides to 30 days", () => assert.equal(slideExpiry(NOW), NOW + SESSION_DAYS * DAY));
  it("slides at most once a day", () => {
    assert.equal(shouldSlide(slideExpiry(NOW - 1000), NOW), false);
    assert.equal(shouldSlide(slideExpiry(NOW - 2 * DAY), NOW), true);
  });
});

describe("challenge cookie", () => {
  const c = encodeChallenge("login", "abc.def", NOW + 60_000, SECRET);
  it("returns the challenge for its purpose", () => assert.equal(decodeChallenge(c, "login", SECRET, NOW), "abc.def"));
  it("refuses another purpose", () => assert.equal(decodeChallenge(c, "register", SECRET, NOW), null));
  it("refuses an expired challenge", () => assert.equal(decodeChallenge(c, "login", SECRET, NOW + 61_000), null));
});

describe("bearerOk", () => {
  it("accepts the right token", () => assert.equal(bearerOk("Bearer s3cret", "s3cret"), true));
  it("rejects a wrong token", () => assert.equal(bearerOk("Bearer nope", "s3cret"), false));
  it("rejects a missing header", () => assert.equal(bearerOk(null, "s3cret"), false));
  it("rejects everything when no secret is configured", () => assert.equal(bearerOk("Bearer ", undefined), false));
  it("rejects a non-bearer scheme", () => assert.equal(bearerOk("Basic s3cret", "s3cret"), false));
});

describe("enrollmentAllowed", () => {
  const base = { credentialCount: 0, expectedSetupToken: "setup", providedSetupToken: "setup", hasSession: false };
  it("allows the first passkey with the setup token", () => assert.equal(enrollmentAllowed(base), true));
  it("refuses a wrong setup token", () => assert.equal(enrollmentAllowed({ ...base, providedSetupToken: "other" }), false));
  it("refuses without a setup token", () => assert.equal(enrollmentAllowed({ ...base, providedSetupToken: undefined }), false));
  it("refuses when no setup token is configured", () => assert.equal(enrollmentAllowed({ ...base, expectedSetupToken: undefined }), false));
  it("refuses the setup token once a credential exists", () => assert.equal(enrollmentAllowed({ ...base, credentialCount: 1 }), false));
  it("allows a second device from a session", () => assert.equal(enrollmentAllowed({ ...base, credentialCount: 1, providedSetupToken: undefined, hasSession: true }), true));
});

describe("classifyRoute", () => {
  it("lets the login and PWA files through", () => {
    for (const p of ["/connexion", "/api/auth/login/options", "/manifest.webmanifest", "/sw.js", "/icons/icon-192.png", "/offline.html"]) assert.equal(classifyRoute(p), "public", p);
  });
  it("leaves machine endpoints to their bearer token", () => {
    for (const p of ["/api/cron/tick", "/api/capture", "/api/sync"]) assert.equal(classifyRoute(p), "machine", p);
  });
  it("protects everything else", () => {
    for (const p of ["/", "/taches", "/reglages", "/api/google/auth", "/api/google/callback", "/inbox", "/api/authx"]) assert.equal(classifyRoute(p), "private", p);
  });
});
