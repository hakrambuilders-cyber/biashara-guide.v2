# Functional Specification

**Project:** Biashara Guide
**Version:** 2.0
**Status:** Engineering reference — supersedes v1.0
**Companion document:** [PRODUCT_CONSTITUTION.md](./PRODUCT_CONSTITUTION.md) (why we're building this)

> v2 changes: v1 described ten conceptual "modules." This version keeps every one of them, maps each to a concrete piece of the working prototype, and adds the architecture, data, security, and rollout treatment a platform needs to go from one pilot to a nationwide, multi-channel GovTech service without a rewrite. Where v1 said "the system should," v2 says what actually exists today, what interface it exposes, and what changes as we scale.

---

## 1. System Objective

Provide every Tanzanian business with personalized tax guidance through a conversation that is simple, fast, accurate, bilingual, and available on multiple channels.

---

## 2. Architecture Overview

The single most important architectural decision in this system: **guidance logic is channel-agnostic**. It is a pure-function engine that knows nothing about HTML, WhatsApp, or USSD menus — every channel is a thin adapter translating its I/O shape into calls against the same engine.

```
                    ┌───────────────────────────────────────┐
                    │           Knowledge Engine             │
                    │   (engine/knowledge.js today; a        │
                    │    versioned Tax-Law Registry service   │
                    │    at national scale — see §11)         │
                    └───────────────────┬─────────────────────┘
                                        │
                    ┌───────────────────▼─────────────────────┐
                    │        Compliance Advisor Engine          │
                    │            (engine/core.js)                │
                    │  parsing · tax calculator · risk scoring   │
                    │  next-best-action · benefits · journey     │
                    └───────┬─────────────────────────┬─────────┘
                            │                         │
              ┌─────────────▼───────────┐   ┌─────────▼─────────────┐
              │     Memory Engine        │   │   Channel Adapters      │
              │    (engine/memory.js;    │   │  Web (app.js) · USSD/  │
              │  client cache today,     │   │  WhatsApp-style text   │
              │  session store at scale) │   │  (channels/text-       │
              └──────────────────────────┘   │  adapter.js) · future: │
                                              │  Android, call-centre  │
                                              └────────────────────────┘
```

This is not aspirational: `channels/text-adapter.js` in this repository is a working, numbered-menu conversation (the shape a USSD session or a WhatsApp bot needs) driven by the exact same `engine/core.js` functions that render the web screens in `app.js`. Run `npm run demo:text-channel` to see it. Adding a real WhatsApp or USSD gateway later means writing a new adapter of the same shape — the engine does not change.

### Module map (v1 concepts → current implementation)

| v1 Module | Purpose | Current implementation |
|---|---|---|
| Module 1 — Conversation Engine | Controls interaction flow, never asks unnecessary questions | `app.js` router (web) / `channels/text-adapter.js` session state machine (text) |
| Module 2 — User Context Engine | Builds the user's profile incrementally | `state.profile` (app.js) / `session.profile` (text adapter), both plain objects passed into `engine/core.js` |
| Module 3 — Decision Engine | The brain: business type → stage → intent → tax rules → recommendation | `engine/core.js`: `getNextBestActions`, `computeComplianceScore`, `getComplianceAdvisor` |
| Module 4 — Knowledge Engine | Official information only, traceable to source | `engine/knowledge.js` (sectors, FAQs, notices) |
| Module 5 — Learning Engine | Micro-lessons instead of long documents | Represented today by the short "why it matters" reason attached to every next-best-action; a dedicated lesson feed is Phase 2 (§16) |
| Module 6 — Benefits Engine | Checks opportunities, not just obligations | `engine/core.js`: `getBenefits` (eligibility-aware: `eligible` / `check` / `not-yet`) |
| Module 7 — Risk Engine | Educates about exposure without frightening tone | `engine/core.js`: `computeRisk` (weighted factors + informational notes, never a bare "you are at risk") |
| Module 8 — Progress Engine | Visual journey with a current step | `engine/core.js`: `getJourney`; rendered as the journey ladder in the Advisor Dashboard |
| Module 9 — Memory Engine | Remembers just enough between visits | `engine/memory.js` (localStorage today; see §3.2 for the server-side evolution) |
| Module 10 — Analytics Engine | Aggregate insight for TRA, not surveillance | `engine/analytics.js` (`buildTRAInsights`) — real aggregation logic (risk/sector/region/gap/notice/topic breakdowns), currently fed a synthetic population since no event-collection backend exists yet (§3.2); rendered in `officer.js`/`officer.html` as the TRA Officer Console — a genuinely separate, desktop-oriented app behind a login gate (§9), not a screen inside the citizen SPA — which only ever displays aggregates, never the underlying records |

---

## 3. Data Architecture

### 3.1 Core entities

| Entity | Owned by | Contains | Notes |
|---|---|---|---|
| **BusinessProfile** | User Context Engine | sector, stage, sales bucket, registrations held, records/filing status | Self-reported today; becomes verifiable against TRA systems in Phase 2+ (§16) |
| **ComplianceSnapshot** | Decision Engine (derived, not stored) | compliance score, risk level/factors, next-best-actions, journey state | Computed on demand from BusinessProfile — never persisted as stale truth, always recomputed |
| **ChatSession** | Conversation Engine | message history for the current session | Not persisted across visits by default (Principle 7 — Privacy by Default) |
| **KnowledgeEntry** | Knowledge Engine | a single fact (a bracket, a threshold, an FAQ answer) with a source citation and effective date | See §11 for the versioning model |
| **AuditEvent** | Platform (secondary-user actions only) | who viewed/exported what, when, why | Never logs citizen browsing of their own guidance — see §10 |

### 3.2 Storage tiers

- **Client-side cache (today):** `engine/memory.js` — a single localStorage key holding the minimum needed to recognise a returning user: profile, language, last-visited notice type, timestamp. Nothing else. This is Principle 7 in code: `clearMemory()` is one tap away in the UI ("Forget my saved data").
- **Session store (Phase 1+):** once a server exists (needed for WhatsApp/USSD, which have no client storage), the same shape moves to a keyed session store (e.g. Redis) addressed by phone number or channel session ID, with a defined TTL — not a permanent citizen record.
- **System of record (Phase 2+):** only once the platform integrates with real TRA systems does BusinessProfile data need durable server-side storage, and at that point it is the citizen's actual TRA account data being reflected back, not a shadow database Biashara Guide owns.

### 3.3 Data minimization rule

The system stores only what changes a future recommendation. Chat transcripts, exact GPS location, and device identifiers are never part of BusinessProfile. This is a direct implementation of Product Constitution Principle 7 and the original Module 2 rule ("stores only what's necessary").

---

## 4. AI / Recommendation Engine

**Today:** every recommendation is produced by deterministic, human-readable rules in `engine/core.js` — weighted risk factors, an ordered next-best-action queue, eligibility flags. Nothing is a statistical black box. This is intentional and stays true even as the engine grows: **Principle: every recommendation must cite the rule that produced it.**

**Where machine learning earns its place (Phase 2+):**
- Ranking *within* an already-valid next-best-action queue when multiple actions are equally applicable (e.g. personalising which benefit to surface first based on aggregate outcomes for similar businesses) — never inventing a new obligation.
- Free-text understanding in the chat channel beyond keyword/number parsing (`parseSwahiliNumber`, `checkForFAQ` today) — e.g. intent classification for messier phrasing — with a confidence threshold below which the system falls back to the deterministic router rather than guessing.

Any ML component sits **beside** the deterministic engine, not inside it: it may re-rank or route, but the underlying facts (tax brackets, thresholds, required registrations) always come from the Knowledge Engine / Tax-Law Registry, never from a model.

---

## 5. TRA Integration Interfaces

The prototype takes all inputs as user self-report (business type, sales bucket, "do you have a TIN?"). At pilot scale, guidance quality improves by verifying against real TRA systems through narrow, read-mostly interfaces:

| Interface | Purpose | Direction |
|---|---|---|
| **TIN Verification** | Confirm a claimed TIN is valid and active | Read |
| **Business Registration Status** | Confirm BRELA/registration status instead of self-report | Read |
| **Notice Feed** | Fetch actual notices issued to a verified taxpayer (replaces manual notice-type selection in the TRA Notices journey) | Read |
| **Tax-Law Registry** | Source of truth for brackets, thresholds, effective dates (replaces hardcoded values in `engine/knowledge.js`) | Read |
| **Filing Status** | Confirm whether a return was actually filed (replaces the yes/no self-report in Business Checkup) | Read |

None of these are write interfaces — Biashara Guide never files, registers, or pays on the citizen's behalf (Product Constitution: "Our promise"). Each integration should degrade gracefully to today's self-report flow if the upstream system is unavailable, never blocking guidance entirely.

---

## 6. API Strategy

- **Style:** REST over HTTPS, JSON payloads, versioned via URL path (`/v1/...`) so channel adapters and TRA integrations can move independently.
- **Idempotency:** any endpoint that changes session state (e.g. "record that this user completed a step") accepts an idempotency key, since USSD and SMS gateways routinely retry on timeout.
- **Auth:** citizen-facing channels authenticate the *channel session*, not the citizen personally, for the guidance API (no login required, consistent with "no training needed"). TRA-internal callers (officer console, analytics) use OAuth2 client-credentials or mTLS, scoped per role (§9).
- **Rate limiting:** per-channel-session limits on the chat/parsing endpoints to absorb retry storms from unreliable mobile networks without needing to rate-limit individual citizens punitively.

---

## 7. Multi-Channel Delivery

| Channel | Status | Adapter shape |
|---|---|---|
| Web (mobile-first PWA) | **Built** — `index.html` / `app.js` / `styles.css` | Hash-router, rich UI, localStorage memory |
| USSD / WhatsApp-style text | **Demonstrated** — `channels/text-adapter.js` | Numbered menu, one question per turn, session held by the gateway |
| Native Android | Planned (Phase 2) | Same engine via a thin Kotlin/JS-bridge or REST client |
| Call-centre agent console | Planned (Phase 2) | Same engine, richer UI for an officer to relay guidance to a caller |
| SMS fallback | Planned (Phase 3) | Same text-adapter session shape, single-message-per-turn |

Every new channel is required to satisfy one test before it ships: **it must not contain its own copy of any tax rule, risk weight, or eligibility check.** If a channel needs a rule the engine doesn't expose yet, that is an `engine/core.js` change, not a channel-local one. This is how the platform avoids the classic GovTech failure mode of five channels silently drifting out of sync with each other.

### 7.1 Observability hooks

Every channel adapter emits the same event shape — `guidance_requested`, `recommendation_shown`, `action_completed`, `escalated_to_tra` — tagged with channel and language, so the Analytics Engine (Module 10 / §12) can compare a WhatsApp user's journey to a web user's journey without three different event schemas.

---

## 8. Security & Privacy

- **Data classification:** BusinessProfile fields are "sensitive personal/business data" even though no name or NIDA number is collected by the prototype today; treat sector + sales + compliance status as sensitive because it is business-identifying in small communities.
- **Encryption:** TLS in transit for any networked deployment; at-rest encryption for the session store and any future system of record.
- **Consent:** the Memory Engine's persistence is opt-out-by-default-visible, not opt-in-buried — the "Forget my saved data" control is always one tap away from the home screen, not nested in a settings menu.
- **NIDA/identity data:** if a future step verifies identity against NIDA (mentioned in the Knowledge Engine's TIN FAQ), that integration is a narrow verification call ("is this ID valid for this phone number"), never a bulk data pull, and is subject to its own data-sharing agreement outside this system's scope.
- **Secrets management:** TRA integration credentials, gateway API keys, and any ML provider keys live in a secrets manager, never in channel-adapter code — the current prototype has zero secrets by design (it calls no external services), and that should remain true for the web channel even after other channels gain integrations.

---

## 9. Roles & Access (RBAC)

| Role | Sees | Cannot see |
|---|---|---|
| **Citizen** | Their own profile, guidance, and history; can export/erase it | Any other citizen's data |
| **TRA Officer** | An individual citizen's case *only when that citizen sought assistance through an officer-mediated channel*, plus an audit trail of that access | Aggregate analytics is not a substitute for this — officers get case access, not a browsing license |
| **Business Registration Officer** | Registration-pathway completion status in aggregate; case-level only via the same access-with-reason rule as TRA Officer | Compliance/risk detail unrelated to registration |
| **Business Association Admin** | Aggregate trends for their sector/region (Module 10 style insights) | Any individual business's identity or data |
| **Tax Education Team** | Aggregate confusion/drop-off points (which guidance step loses people) | Individual citizen identities |
| **Platform Admin** | System configuration, Knowledge Engine content, deployment | Is still subject to the audit log in §10 — "admin" is not "unaudited" |

This directly operationalizes the Product Constitution's Governance and Secondary Users commitments: aggregate access by default, case-level access only with a logged reason.

**Prototype note:** `officer.html`/`officer.js` puts a login screen in front of the aggregate dashboard to make this access boundary visible in the demo — it is a UI simulation only (any username/password is accepted, nothing is validated or stored). A real deployment replaces it with actual TRA staff authentication (e.g. SSO against an existing TRA identity system) and the role checks this table describes; the citizen app deliberately has no login at all, since Principle 1 (Simplicity First) and the "no training needed" design goal rule out asking an informal business owner to manage an account.

---

## 10. Audit Logging

Logged, immutably, with a minimum retention appropriate to public-sector accountability norms (final retention period to be set with TRA legal/compliance, not assumed here):

- Every secondary-user (§9 roles) access to case-level citizen data: who, when, which case, stated reason.
- Every change to Knowledge Engine content: who changed which fact, old value, new value, effective date, approver (see §11).
- Every TRA integration call and its result (not its payload, to avoid duplicating sensitive data into logs).

**Never logged:** a citizen's own browsing of their own guidance. Audit logging exists to hold the platform and its officers accountable to citizens, not to surveil citizens.

---

## 11. Tax-Law Versioning

`engine/knowledge.js` today is a static module — correct for a single-law-version prototype, but a growth risk at scale: a change to the presumptive-tax brackets means editing and redeploying code. The Phase 1+ evolution:

1. Every fact (a bracket, a threshold, a licensing note) becomes a **KnowledgeEntry** with `value`, `sourceCitation`, `effectiveFrom`, `effectiveTo` (nullable), and `approvedBy`.
2. The engine resolves "what's true" by querying the entry effective *as of the date guidance is being given* — this makes it possible to correctly re-explain historical guidance to a business that acted on last year's rules, per the Governance Model's "visible effective date" commitment.
3. Publishing a new entry requires the Governance Model's review step (Product Constitution §9) before it becomes the active version — no silent edits.
4. `engine/knowledge.js` remains the correct shape for local development and the offline/prototype mode; production points the same read interface at the versioned registry instead.

---

## 12. Observability

- **Metrics:** activation, comprehension, compliance movement, trust, escalation health, reach — one counter/gauge per Product Constitution §10 metric, tagged by channel and language.
- **Logging:** structured, per the event shape in §7.1, with no free-text citizen input logged verbatim (log the *classification* of a chat message — "tax question," "notice question" — not its raw text) unless the citizen explicitly submits it as a support escalation.
- **Tracing:** a single request ID follows a guidance request from channel adapter → engine → (if applicable) TRA integration call, so a slow or failed recommendation can be diagnosed end to end.
- **Dashboards & SLOs:** a pilot-stage SLO target of sub-2-second guidance response on web and sub-5-second on USSD (accounting for gateway round-trip) is a reasonable starting target to validate against real traffic, not a guarantee — revisit after the pilot's first real load data.

---

## 13. Performance Targets

Directional targets to design against, to be validated (and revised) with real pilot traffic rather than treated as committed SLAs:

- Web: guidance recommendation renders client-side from already-loaded state — effectively instant (current prototype: synchronous, no network round-trip for guidance logic itself).
- API-backed guidance (once server-side): p95 under 2 seconds including any TRA integration call.
- USSD: p95 under 5 seconds per menu turn, budgeted for gateway overhead outside our control.
- Concurrency: architecture should assume bursty regional traffic (e.g. a market-day spike in one district) rather than smooth national averages — stateless engine + externalized session store makes this a scaling (not redesign) exercise.

---

## 14. Disaster Recovery

- **RPO/RTO targets** for the session store and any system of record should be set with TRA infrastructure teams once real citizen data is involved; the current prototype has no server-side state to recover (client-only), which is itself a reasonable Phase 0/1 DR posture.
- **Backup strategy:** Knowledge Engine content (§11) is the highest-value data to protect against loss — a corrupted tax-law registry affects every user simultaneously. Version it like code (it effectively *is* code today) with full history.
- **Multi-region:** deferred until national-scale traffic data justifies it; premature multi-region adds operational complexity the pilot doesn't need.

---

## 15. Deployment Strategy & CI/CD

- **Environments:** local (this prototype, `npm start`) → pilot (single region/channel) → national (multi-channel, multi-region as justified by §14).
- **Pipeline stages:** lint/syntax check (`npm run check`, already wired to every engine file) → automated screen/journey smoke tests → deploy to a staging channel adapter → manual sign-off for Knowledge Engine content changes (per the Governance Model) → production.
- **Feature flags:** new channels and new Knowledge Engine entries roll out behind flags scoped by region/channel, so a bracket change or a new channel can be limited to a pilot cohort before national rollout.
- **Canary releases:** especially important for Knowledge Engine content changes — a bad tax-bracket edit reaching 100% of traffic immediately is the platform's single biggest operational risk.

---

## 16. Phased Roadmap

| Phase | Scope | What's true today |
|---|---|---|
| **Phase 0 — Prototype** | Web-only, client-side engine, self-reported profile, static Knowledge Engine | ✅ This repository |
| **Phase 1 — Pilot** | Add a real backend session store, one additional channel (WhatsApp or USSD) using `channels/text-adapter.js` as the pattern, basic Analytics Engine (§12) | Not started |
| **Phase 2 — Expansion** | TRA integration interfaces (§5) replace self-report where available, call-centre console, Tax-Law Registry (§11) replaces static knowledge module, ML-assisted ranking (§4) | Not started |
| **Phase 3 — National Scale** | Remaining channels (Android, SMS), multi-region DR posture if justified, full RBAC-backed officer tooling (§9) | Not started |

Each phase is additive: no phase requires re-architecting what the previous phase shipped, because the channel-agnostic engine boundary (§2) was the very first decision made.

---

## 17. Non-Goals

Reaffirming Product Constitution §12: this specification deliberately does not cover accounting, inventory, payroll, banking, loans, e-commerce, POS, bookkeeping, or a replacement tax-filing system. Any future proposal in these areas should start with a fresh product-constitution conversation, not be smuggled in as a "small addition" to this spec.

---

## 18. Appendix — File-to-Spec Traceability

| File | Spec section |
|---|---|
| `engine/knowledge.js` | §3.1 KnowledgeEntry (pre-versioning form), §11 |
| `engine/core.js` | §2 Decision Engine, §4, Modules 3/6/7/8 |
| `engine/memory.js` | §3.2 client-side tier, Module 9 |
| `channels/text-adapter.js` | §2 architecture proof, §7 |
| `engine/analytics.js` | Module 10, §12 |
| `app.js` | Module 1 (citizen web adapter) |
| `officer.js` / `officer.html` | Module 10 UI, §9 (login-gated access, prototype simulation) |
| `brand.js` | Shared visual identity between the two front-ends — not a spec module |
| `styles.css` / `officer.css` | Presentation layer only — contains no business logic by design |
