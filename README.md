# Biashara Guide — Prototype v3

This repo is the **citizen app only** — mobile-first, no login, designed to explain rights, opportunities, next steps, and routes to support. Not to judge or inspect the citizen. It has no link anywhere to the TRA Officer Console.

**The TRA Officer Console is a genuinely separate project**, its own repo and its own deployment, not a page inside this one: **[biashara-guide-officer](https://github.com/hakrambuilders-cyber/biashara-guide-officer)**. Desktop-oriented, gated behind a login simulation, showing aggregate national analytics only — never an individual case file. It's reached only by knowing its URL, the same way a real internal TRA tool wouldn't be advertised on the public-facing product.

**Read next:** [docs/PRODUCT_CONSTITUTION.md](./docs/PRODUCT_CONSTITUTION.md) (vision & principles) and [docs/FUNCTIONAL_SPEC.md](./docs/FUNCTIONAL_SPEC.md) (architecture & scale-out plan).

## Run it

Open `index.html` in a modern browser, or run:

```
npm start
```

No build step is required.

## What's new in v3

- **Channel-agnostic engine.** All guidance logic (parsing, tax math, risk scoring, next-best-action, benefits, journey) moved into `engine/core.js` + `engine/knowledge.js` — pure functions with no DOM or storage dependency. `app.js` is now just the web adapter.
- **A working second channel.** `channels/text-adapter.js` drives a numbered-menu, USSD/WhatsApp-style conversation using the *same* engine functions as the web UI — proof that "one engine, many channels" (see the Functional Spec's original competitive-advantage note) isn't aspirational. Run it with `npm run demo:text-channel`.
- **Compliance Advisor Dashboard.** A new screen (`#/advisor`) unifying a compliance score, a plain-language risk read (with reasons, never just a scary number), a prioritized next-best-action queue, the journey ladder, and eligibility-aware benefits.
- **Memory Engine, for real.** `engine/memory.js` persists just the profile/language/notice-type to `localStorage` so a returning user sees a "Welcome back" banner with their last visit and next step — and can erase it in one tap ("Forget my saved data").
- **Deeper compliance logic.** Sector-specific licensing notes, an EFD-machine threshold check (TSh 14M/year), and a weighted risk model replace the single "next step" of v2.
- **`styles.css` exists now.** (It was referenced by `index.html` but missing from the v2 prototype — the app rendered unstyled. Fixed.)
- **TRA Officer Console split into its own repo entirely.** It used to live in this repo as `officer.html`/`officer.js`/`officer.css`; it's now a fully separate project ([biashara-guide-officer](https://github.com/hakrambuilders-cyber/biashara-guide-officer)) with its own deployment. `engine/analytics.js` moved with it — this repo no longer contains any officer/analytics code at all.
- **Contrast fix.** Section labels ("Hatua ya 1 kati ya 5" etc.) were rendering in yellow on white backgrounds — fixed to black.
- **Real telemetry — this app now feeds the officer console real data.** `engine/telemetry.js` sends one anonymized event (sector, stage, sales bracket, registration status, compliance score, risk level, next action, language — nothing identifying) to a shared Supabase database when someone reaches their Compliance Advisor screen. It's write-only from here: this app has no ability to read anything back, whether its own event or anyone else's. Sending fails silently and never blocks guidance. See the officer console repo's `supabase-setup.sql` for the exact database policies.

## Implemented journeys

- **Start a Business**: Splash → Welcome → Home → Category → Details → Stage → Sales → Registration → Analysis → Business Snapshot → Business Journey.
- **Compliance Advisor**: score, risk factors, prioritized next actions, journey, and eligibility-aware benefits in one dashboard.
- **I Have a Business**: Business Checkup covering business age, registrations, records, and returns — now risk-scored.
- **Benefits & Incentives**: an opportunities report with eligibility flags (eligible / worth checking / not yet), clearly labelled as preliminary guidance.
- **TRA Notices**: notice-type selection, plain-language explanation, and a suggested action.
- **Understand My Taxes**: an educational tax summary paired with a live illustrative Presumptive Tax + EFD-threshold calculator.
- **Ask Anything**: a conversational assistant that answers FAQs, runs the real presumptive-tax calculator from free text, and — if it remembers your profile — leads with your actual next step instead of a generic reply.

The **TRA Officer Console** (login simulation → National Analytics Overview, now backed by real anonymized data from this app via Supabase, with a synthetic fallback when there's none) lives entirely in its own repo now: [biashara-guide-officer](https://github.com/hakrambuilders-cyber/biashara-guide-officer).

## Design tokens

- Primary: `#F9E50F` (yellow) — sampled from TRA's real public site (tra.go.tz) nav/CTA color
- Secondary: `#0A0A0A` (near-black) — sampled from the same source
- Logo: an original checkmark-badge mark (`brandMarkSvg()` in `brand.js`), not a reproduction of TRA's registered logo — see the "Unofficial concept prototype" banner shown on every screen. The officer console repo has its own copy of `brand.js` so both projects share one visual identity without sharing a codebase.
- Mobile-first frame: 480px reference width (desktop shows a framed device card)

## Code organization

- `index.html`, `app.js` — hash router, screen rendering, DOM events for the **web channel only**
- `brand.js` — the original logo mark (also copied into the officer console repo)
- `engine/core.js` — the channel-agnostic brain: parsing, presumptive-tax calculator, compliance score, risk engine, next-best-action queue, journey, benefits, notice guidance, and the assistant's routing logic
- `engine/knowledge.js` — static bilingual reference data (sectors, licensing notes, FAQs, notice copy) — the seed for the Tax-Law Registry described in the Functional Spec
- `engine/memory.js` — localStorage persistence for the Memory Engine
- `engine/telemetry.js` — sends one anonymized event per session to the shared Supabase database backing the officer console's live data mode
- `styles.css` — design tokens, reset, and component styles for the citizen app
- `channels/text-adapter.js` — a USSD/WhatsApp-style numbered-menu channel driven by `engine/core.js`; run with `npm run demo:text-channel`

This repo is the source of truth for `engine/core.js`, `engine/knowledge.js`, and `brand.js` — the officer console repo keeps its own hand-synced copies (see its README for why: two static, no-build-step sites with independent deployments).

## Compliance Advisor scoring (current rules)

**Compliance score** starts at 20 and adds points for profile completeness (business type, detail, stage, sales — up to 32) and formal status (TIN 18, business registration 16, licence 14, records 10, filed return 6), capped at 96.

**Risk score** (0–100) adds weighted points for what's missing: no TIN (+30), no business registration (+20), no licence (+15), no records (+10), no filed return once past the "new" stage (+10), and a sales level suggesting an EFD machine is needed while still unregistered (+10). ≤25 is low risk, ≤55 medium, above that high — always paired with plain-language reasons, never a bare number.

**Next-best-action** is an ordered queue (TIN → business registration → licence → EFD check if applicable → records → filed return), not just a single recommendation — the first item is high urgency, the second medium, the rest low.

## Presumptive tax calculator rules

Based on annual turnover (daily sales × 365):

- Below TSh 4M → exempt.
- TSh 4M – 7M → flat TSh 100,000/year.
- TSh 7M – 11M → flat TSh 250,000/year.
- TSh 11M – 100M → 3.5% of annual turnover.
- Above TSh 100M → outside the presumptive-tax band.
- At/above TSh 14M → an EFD machine is flagged as likely required.

The prototype gives broad preliminary guidance only. It does not make legal or tax determinations; official TRA requirements should always be verified before action.
