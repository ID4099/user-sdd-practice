# Security Notes: CSRF and Cookie Configuration

## Cookie Configuration

All tokens are transported via `HttpOnly; SameSite=Strict` cookies set by `AuthController`:

```typescript
const COOKIE_DEFAULTS = {
  httpOnly: true,           // not accessible from JavaScript — mitigates XSS
  secure: NODE_ENV === 'production', // HTTPS only in production
  sameSite: 'strict',       // browser will not send on cross-site requests
};
```

`accessToken` maxAge: 15 minutes  
`refreshToken` maxAge: 7 days

## CSRF Threat Model

### Same-origin SPA (default deployment)

When the frontend and API share the same origin (e.g., both at `https://app.example.com`), `SameSite=Strict` provides complete CSRF protection:

- The browser will not attach cookies to any request that originates from a different site.
- No additional CSRF token mechanism is needed.
- This is the intended deployment model for this system.

### Cross-origin API consumers

If the API is consumed from a **different origin** (e.g., `https://admin.example.com` calling `https://api.example.com`), `SameSite=Strict` will block the cookies on cross-site requests, which breaks the intended flow.

In that case, implement the **double-submit CSRF token pattern**:

1. On login, the server issues a non-secret CSRF token (a random UUID) in a **readable cookie** (not `HttpOnly`) in addition to the auth cookies.
2. For every state-mutating request (POST, PATCH, DELETE), the client reads the CSRF token from the readable cookie and sends it back in the `X-CSRF-Token` request header.
3. The server validates that the `X-CSRF-Token` header value matches the cookie value.

This works because a cross-site attacker can make the browser send cookies automatically, but cannot read the CSRF cookie value (same-origin policy) and therefore cannot forge the header.

```
Header: X-CSRF-Token: <value-read-from-csrf-cookie>
Cookie: csrfToken=<same-value>; accessToken=...; refreshToken=...
```

### Summary

| Deployment | CSRF mitigation |
|------------|----------------|
| Same-origin SPA | `SameSite=Strict` — no additional action needed |
| Cross-origin (different subdomain or domain) | Double-submit CSRF token pattern |
| Mobile / native client | No cookie — use `Authorization: Bearer` header instead; no CSRF risk |

## XSS Mitigation

`HttpOnly` cookies prevent JavaScript from reading the tokens via `document.cookie`. This means:

- XSS cannot exfiltrate the access token directly.
- The refresh token is equally protected.
- Combined with `SameSite=Strict`, the attack surface for token theft is limited to network interception (mitigated by HTTPS in production).
