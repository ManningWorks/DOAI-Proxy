---
title: Security
description: Security practices and implementation details for DOAI Proxy
---

# Security

DOAI Proxy takes security seriously — even if the name doesn't.

## For Users

1. **Never commit `.env`** to version control
2. **Use strong API keys** — Obtain from official sources
3. **Keep API keys secret** — Never share or commit
4. **Use HTTPS in production** — Add a reverse proxy with SSL
5. **Add authentication** — Use `AUTH_MODE=required` for production (see [Authentication](/guides/authentication))
6. **Monitor logs** — Regularly check for suspicious activity

## For Repository Maintainers

1. **No secrets in code** — All secrets loaded from environment variables
2. **No sensitive files tracked** — `.env`, `*.log`, and sensitive files in `.gitignore`
3. **Regular dependency audits** — Run `npm audit fix` regularly
4. **Keep dependencies updated** — Use `npm update` for security patches

## Implementation Details

### Timing-Safe Auth Comparison

All API key checks use `crypto.timingSafeEqual` to prevent timing attacks.

### Log Sanitization

Authorization headers are redacted to `[REDACTED]`. Response bodies with `content` > 200 chars are truncated. Keys containing `password`, `token`, `api_key` are replaced with `[REDACTED]`.

### Trust Proxy

`trust proxy` is enabled only in `external` auth mode.

### Body Size Limit

JSON body limit: 50 MB.

## Known Limitations

- **Proxy does not execute tools** — Tool calls are formatted but not executed
- **No rate limiting** — Consider adding for production deployments
- **No authentication by default** — Configure `AUTH_MODE` explicitly
- **Logs stored locally** — Logs are written to disk and not encrypted

## Secrets Management

Secrets live in `.env` file (not committed). `STRAICO_API_KEY` and `PROXY_API_KEY` are consumed from environment. No vault or rotation mechanism.
