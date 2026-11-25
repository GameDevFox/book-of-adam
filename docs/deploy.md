# Deploying bookofadam.org — S3 + CloudFront

Static SPA served from a private bucket through CloudFront, the nekoagent.org pattern
(its write-up, with the reasoning behind each setting, is `~/projects/neko-agent/docs/site-deploy.md`).
Stood up 2026-10-23 from the CLI as the `neko` AWS profile; first deployed the same day.

## Layout

| What          | Value                                                                    |
| ------------- | ------------------------------------------------------------------------ |
| Registrar     | Porkbun — nameservers delegated to Route 53 (nothing else lives there)   |
| Hosted zone   | `bookofadam.org`, apex + `www` A/AAAA Alias → CloudFront                 |
| Certificate   | ACM **us-east-1**, `bookofadam.org` + `*.bookofadam.org`, DNS-validated  |
| Bucket        | `book-of-adam-site`, us-east-2, all public access blocked, no website hosting |
| Distribution  | CloudFront with OAC                                                      |
| Deploy rights | inline policy `BookOfAdamDeploy` on user `neko`                          |

The account-specific identifiers (zone, certificate, distribution, OAC, account id) and the
JSON applied to AWS live in **`deploy/aws/`, which is gitignored** so the public repo carries
none of them — `deploy/aws/README.md` holds this table with its values, and
`deploy/aws/site.env` sets `DISTRIBUTION` for `scripts/deploy.sh`. A new machine needs that
directory copied over before it can deploy.

Distribution settings (`deploy/aws/dist-config.json`, local): GET/HEAD, redirect to HTTPS, compress
on (the text corpus is 46 MB of JSON), managed CachingOptimized + SecurityHeadersPolicy, root
`index.html`, 403 **and** 404 → `/index.html` as 200 (the SPA fallback — 403 is the one that
fires behind OAC), PriceClass_100, HTTP/2+3, IPv6. Bucket policy
(`deploy/aws/bucket-policy.json`, local) admits only the CloudFront service principal for this
distribution.

## Standing up the next site

`neko` normally cannot create buckets, distributions, certificates or zones. The account holds
a reusable managed policy **`neko-site-bootstrap`** (`deploy/aws/neko-site-bootstrap.json`, local) for
that phase: attach it, do the setup, detach it. It covers S3 on buckets named `*-site` only,
CloudFront create/read/update, ACM in us-east-1, and Route 53 zones and records; no deletes,
no IAM. Attaching and detaching is itself allowed by the standing `neko-bootstrap-temporary`
policy, which lets `neko` manage customer-managed policies and its own inline policies.

Order that worked: zone → nameservers at the registrar → certificate (us-east-1, DNS
validation, "Create records in Route 53") → bucket → OAC + distribution + bucket policy →
four Alias records → per-site inline deploy policy → detach the bootstrap policy.

If the registrar's old nameservers answer with a parking wildcard, ACM validation stalls until
resolver caches expire; adding the validation CNAME at the registrar too is the shortcut.

## Deploying

```bash
yarn deploy             # build, check, upload, invalidate, verify
yarn deploy --dry-run   # build, check, list what would change — read-only on AWS
yarn verify:deploy      # is the site serving the build in dist/? (any time)
```

Either of us runs it — it sets `AWS_PROFILE=neko` unless one is already set, and the
`BookOfAdamDeploy` policy covers exactly what it does. `scripts/deploy.sh`, in order:

1. `yarn build:public` (read-only site, unshipped apps compiled out, data API as static files
   under `dist/api/`), then `yarn check:public` — a failing check uploads nothing.
2. **Pass 1** — `assets/*` with `public,max-age=31536000,immutable`, uploads only. Vite
   content-hashes everything there, so it can be cached forever.
3. **Pass 2** — everything else with `no-cache`, `--delete`: `index.html`, all of `api/`, the
   Deseret dictionaries. These keep their names across deploys, so the edge must revalidate.
   The line is drawn at `assets/` rather than by listing stable names, so a new data file
   cannot be missed (nekoagent.org's list did miss one).
4. **Pass 3** — delete hashed assets the new build no longer references, _after_ the new
   `index.html` is live, so a reader mid-visit keeps the JS their page asked for.
5. Invalidate `/index.html`, `/api/*`, `/deseret/*` and every deleted path — a deleted
   immutable asset otherwise stays on the edge for a year. Wildcards are one path each.
6. `scripts/verify-deploy.sh`.

The whole 42 MB is re-uploaded each time (a fresh build gives every file a new mtime); fine at
this size. Content-hashing the data files would make them immutable too — a later refinement.

## Analytics

Pageviews go to the self-hosted Umami at https://analytics.gamedevfox.org (website "Book of
Adam", id `95336653-1c05-4b86-9cd4-d94ed82762ba`, created 2026-10-23 over its API with the
admin login in `~/projects/umami/.env` — its last line, `# NAME=user / password`; strip the
`NAME=` before posting to `/api/auth/login`). The instance is shared with domus and nekoagent.org;
its runbook and site list are `~/projects/kitsune/packages/domus/docs/analytics.md`.

`src/analytics.ts` loads the cookieless tracker only in a production public build, with
`data-domains="bookofadam.org"` so a LAN preview of that build sends nothing. `yarn
check:public` fails a build that lacks it. **Umami drops headless browsers as bots** — a
Playwright visit gets `{"beep":"boop"}` back and records nothing, so verify a live pageview
with a real browser or a normal desktop user agent. Checked before the first deploy by
serving the
preview _as_ bookofadam.org in Playwright and capturing (and aborting) the `/api/send`
requests: one pageview per route, client-side navigations included, with the right id.

## Verifying

A 200 proves nothing — the SPA fallback answers 200 with `index.html` for every path. Verify
against the hashed bundle `index.html` references, which cannot be faked by the fallback.
`yarn verify:deploy` does that: it waits (up to 180 s, for the edge's cached copy to expire)
until `/` is byte-for-byte `dist/index.html`, then checks the bundle it names is served as
JavaScript with the immutable header, and that the data API is JSON and `no-cache`.
`SITE=http://host:port yarn verify:deploy` points it at a preview server.
