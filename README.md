# Patrocino

Premium, mobile-first creator subscription prototype for Brazil. This branch is the Patrocino variant (`patrocino.com`). The FanMimo brand stays on `main`. It is a working mock-first demo: the web runs without PostgreSQL, NestJS, payment credentials, or external services. All people and metrics are fictitious; creator images are AI-generated and SFW.

## Stack

- pnpm 10 + Turborepo 2
- Next.js 16, React 19, TypeScript 5, Tailwind CSS 4, shadcn/ui and Lucide
- NestJS 11 REST API under `/v1`, with Swagger and PostgreSQL-backed creators/auth
- Prisma 6 schema for PostgreSQL 16
- Shared contracts in `packages/core`, UI/tokens in `packages/ui`, config in `packages/config`

Exact versions are in [`docs/STACK.md`](docs/STACK.md).

## Quick start — web only

Requirements: Node.js 22 LTS and pnpm 10 (`corepack enable`).

macOS/Linux, Windows PowerShell, and Windows Terminal use the same commands:

```bash
pnpm install
pnpm dev:web
```

Open [http://localhost:3333](http://localhost:3333). `MockGateway` keeps the demo working if the API/database are unavailable.

## Full local workspace

Install Docker Desktop on Windows/macOS or Docker Engine with Compose on Linux.

```bash
copy .env.example .env
docker compose up -d db
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

On macOS/Linux, replace `copy` with `cp`.

- Web: [http://localhost:3333](http://localhost:3333)
- API: [http://localhost:3334/v1/health](http://localhost:3334/v1/health)
- Swagger: [http://localhost:3334/v1/docs](http://localhost:3334/v1/docs)

PostgreSQL is optional for the web demo. The API uses it for seeded creators and
test-only password/JWT authentication. No live payment or payout occurs. Creator
uploads, when the API is running, are stored on local disk.

## Demo accounts

| Role | Email | Password |
|---|---|---|
| Fan | `fan@mimelux.com.br` | `mimelux123` |
| Creator | `criadora@mimelux.com.br` (alias `creator@mimelux.com.br`) | `mimelux123` |
| Affiliate | `afiliado@mimelux.com.br` | `mimelux123` |

The same accounts also sign in with `@patrocino.com` (`fan@`, `criadora@` or `creator@`, and `afiliado@`), and with the earlier `@fanmimo.com` and `@fanmimo.com.br` aliases. The public site for this variant is [patrocino.com](https://patrocino.com). The login field starts on `fan@patrocino.com`. The password stays `mimelux123`.

The affiliate demo identity is Nara Costa, code `nara`. Promotion links look like `/r/nara/lunaferraz?lang=pt-BR&sub=tiktok`. See [`docs/AFFILIATES.md`](docs/AFFILIATES.md).

Registration uses mock verification code `224488`, then four onboarding steps. Completion, likes, saves, comments, messages, subscriptions, and unlocks persist only in `localStorage`.

## Main flows

1. `/` → login/registration.
2. Registration → mock verification → onboarding → coach marks → Em Alta.
3. Ranking/search → creator profile → plan → simulated checkout.
4. Public posts stay visible; subscription posts, PPV posts, and packs use separate simulated unlock paths.
5. Fans can send a special request; creators can quote, decline, and mark paid requests as delivered.
6. Creators configure bundle discounts, time-limited promotions, affiliate commission scope, and demo offers.
7. Feed interactions, chat, the demo publish button, and payout actions remain local simulations.
8. The creator dashboard and `/admin` also have a real media library (photos and locked videos) when the API is up.

## Creator media

Creators upload from the dashboard. An admin picks any creator on `/admin` and manages that library the same way: caption, free, subscribers-only, pay-per-view, or subscriber pay-per-view, schedule, reorder, edit, and soft delete. Photos and videos (mp4, mov, webm, up to 2 GB) upload in 5 MB chunks with a progress bar, drag and drop, and multiple files. A failed chunk retries; the browser remembers the upload id and skips parts already received.

Subscriber pay-per-view is a video a fan can buy only while subscribed to that creator. The subscription unlocks photos; the video stays locked until that fan pays for it once, and the purchase stays valid after the subscription ends. The public profile shows a blurred preview and a subscribe button. A subscriber sees the price and “Desbloquear por R$ X”. The original and the clear poster stay under `uploads/<creatorId>/private/` so `/media/*` never serves them. The file URL is returned only after a paid purchase.

Each video has its own price, edited in the creator dashboard and on `/admin` (same library, creator selector). A blank price uses the creator’s default video price. That default is editable in the same library and starts at 100 cents (R$ 1,00) for testing.

Bulk import uses the same disk storage and poster/preview step as the uploader. It skips a file when that creator already has the same SHA-256, including a soft-deleted row. Run it inside the API container:

```bash
pnpm --filter api media:import -- --creator <slug> --dir <path> --access subscriber_ppv --price-cents 100
```

`--price-cents` is optional. Without it, subscriber pay-per-view uses the creator default, or 100 cents when that default is unset.

Files go through `DiskStorage` (`apps/api/src/modules/media/storage.ts`). The default root is `/opt/patrocino/media` (`MEDIA_ROOT`). Layout:

```text
uploads/<creatorId>/public/<mediaId>.<ext>          free original
uploads/<creatorId>/private/<mediaId>.<ext>         locked original
uploads/<creatorId>/posters/<mediaId>.jpg           public poster
uploads/<creatorId>/private/posters/<mediaId>.jpg   subscriber pay-per-view poster
uploads/<creatorId>/previews/<mediaId>.jpg          blurred preview
```

Caddy's `(app)` snippet serves `/media/*` from `/srv/media` before the web catch-all, except `uploads/*/private` and `uploads/*/tmp`, which return 404. Locked bytes are only returned by `GET /v1/media/:id/file` after the API checks the owner, an admin, an active subscription (photos and subscribers-only video), or a paid purchase (pay-per-view and subscriber pay-per-view). A subscription does not unlock a subscriber pay-per-view file. Blurred previews stay public. Clear posters for subscriber pay-per-view live under `private/` with the original. `Dockerfile.prod` installs ffmpeg for those derivatives.

Production is `docker compose -f docker-compose.prod.yml up -d --build`. The `migrate` service runs `prisma migrate deploy` and `prisma/seed.ts`. API and web mount `/opt/patrocino/media` read-write (`MEDIA_ROOT`). Caddy mounts it read-only at `/srv/media`. `DATABASE_URL` stays in `.env`. `POSTGRES_PASSWORD` in `.env` must be the password already used by the Postgres volume. `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is a build arg from `.env`, empty in git. Swap the storage class later (Bunny Storage or Stream) without changing the upload routes.

## Commands

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test:unit
pnpm test:e2e
pnpm dev:web
pnpm --filter @mimelux/api dev
pnpm db:generate
pnpm generate:creator-images # optional, never needed for normal development
```

The image script reads `GEMINI_API_KEY` only when explicitly invoked. Supplied V2 media is committed under `apps/web/public/media/generated/`; normal setup never calls an image API.

## Architecture

```text
apps/web        Next.js UI and mock adapter
apps/api        NestJS versioned REST/OpenAPI API
packages/ui     Shared components and design tokens
packages/core   Framework-neutral contracts and schemas
packages/db     PostgreSQL Prisma schema and seed
packages/config Shared TypeScript/ESLint/Tailwind config
```

V0.3 keeps presentation separate from `MockGateway`/`ApiGateway`. The web uses
an API-first adapter with transparent mock fallback. The API includes seeded
PostgreSQL creators, password hashing, access/refresh JWTs, and a Stripe
test-mode gateway. The target stack adds Redis + BullMQ, Auth.js with
MFA/passkeys, Backblaze B2 private storage behind signed CDN URLs, HLS,
WebSocket chat, and a formally approved Pix/card/recurring/split PSP on Oracle
Cloud.

Content policy is configurable through `CONTENT_MODE=general|adult|hybrid`. Legal, age-verification, moderation, KYC, and PSP decisions must be resolved before production.

See:

- [`docs/AUDITORIA_V01.md`](docs/AUDITORIA_V01.md)
- [`docs/RELATORIO-TECNICO.md`](docs/RELATORIO-TECNICO.md)
- [`docs/STATUS_V01.md`](docs/STATUS_V01.md)
- [`docs/STATUS_V02.md`](docs/STATUS_V02.md)
- [`docs/STATUS_V03.md`](docs/STATUS_V03.md)
- [`docs/AFFILIATES.md`](docs/AFFILIATES.md)
- [`docs/PROXIMOS_PASSOS.md`](docs/PROXIMOS_PASSOS.md)
- Original research report: [`uploads/relatorio-privacy-arquitetura_b5c7.md`](uploads/relatorio-privacy-arquitetura_b5c7.md)

## Tests and limitations

Copy `.env.example` to `.env` before running workspace checks so Prisma can
validate its PostgreSQL datasource.

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test:unit
pnpm test:e2e
```

The Playwright suite covers login navigation, role selection, affiliate
attribution through a simulated subscription, locale switching, the monetize
section, subscription unlock and refresh persistence, creator search, local
chat persistence, PPV unlock, promotions, the full special-request demo flow,
demo/real isolation, responsive overflow at 360/390/768/1024/1440 px, key
screenshots, and the 404 response. Broader accessibility coverage and k6 load
tests remain planned; this demo is not production-ready.

## Safety

- No secrets are committed; copy `.env.example` to `.env`.
- No real charge, Pix code, receipt, or payout is generated. Uploaded media stays on the server disk and is not committed.
- AI creator identities are marked `fictitious` and `aiGenerated`.
- Media is original generated demo material, not third-party creator content.
