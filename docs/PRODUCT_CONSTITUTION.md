# Product Constitution

**Project:** Biashara Guide
**Version:** 2.0
**Status:** Foundational Design Document — supersedes v1.0
**Companion document:** [FUNCTIONAL_SPEC.md](./FUNCTIONAL_SPEC.md) (how this vision is built and scaled)

> v2 changes: reframes Biashara Guide as a platform built for national scale from day one, not a prototype that gets rebuilt later. Adds a governance model, ties success metrics to real instrumentation, and adds two principles (Privacy by Default, Built to Scale) that v1 assumed implicitly but never stated. Every v1 principle, tone rule, and the motto are preserved unchanged — this is an extension, not a rewrite of the vision.

---

## 1. Vision

To create a Tanzania where every entrepreneur, regardless of education level or business size, can confidently understand, access, and comply with tax obligations through simple, personalized, and trusted digital guidance.

## 2. Mission

To increase voluntary tax registration and compliance by transforming complex tax laws into simple, actionable guidance delivered through familiar communication channels.

## 3. Problem Statement

Millions of Tanzanian businesses remain outside the formal tax system — not only because of tax costs, but also because of fear, misinformation, limited tax knowledge, and the complexity of existing processes.

Current digital services primarily serve users who already understand tax procedures, leaving many first-time and informal business owners without practical guidance.

## 4. Our Purpose

We are not building another government portal.

We are building an intelligent guidance service that helps every business make the correct next decision — and a platform capable of doing that for every business in the country, on whatever device or channel they already use.

---

## 5. Core Principles

**Principle 1 — Simplicity First**
Every interaction must be understandable by someone with minimal formal education. If it needs training, it is too complicated.

**Principle 2 — One Decision at a Time**
The system never overwhelms users. It only asks for information necessary to determine the next step.

**Principle 3 — Explain Before You Request**
Before asking a user to perform any action, explain why it matters, how it benefits them, and what happens next.

**Principle 4 — Benefits Before Obligations**
The system always explains opportunities before responsibilities. Users should understand the value of compliance before being reminded of legal duties.

**Principle 5 — Trust Before Compliance**
People comply more willingly when they trust the system. Every interaction should educate, support, and guide — not intimidate.

**Principle 6 — Personalization**
No two businesses receive exactly the same guidance. Advice adapts based on business type, business stage, estimated size, compliance status, and applicable legal provisions.

**Principle 7 — Privacy by Default** *(new in v2)*
The system stores only what is needed to give the next piece of guidance, and nothing more. A user can see what is remembered about them and erase it at any time, with no penalty and no need to explain why. Trust (Principle 5) cannot survive a platform that hoards data it does not need.

**Principle 8 — Built to Scale, Not to Rebuild** *(new in v2)*
Every architectural decision is made so the system can grow from a pilot to a national service without a rewrite: the guidance logic must work identically whether it is reached by app, USSD, WhatsApp, or a TRA officer's console. See [FUNCTIONAL_SPEC.md §2](./FUNCTIONAL_SPEC.md#2-architecture-overview) for how the current prototype already proves this with a channel-agnostic engine.

---

## 6. User Principles

The system shall:

- Never assume prior tax knowledge.
- Never use unnecessary legal language.
- Always provide explanations.
- Always recommend the next action.
- Always allow the user to ask questions.
- Always respect the user's preferred language.
- Always let the user see and erase what the system remembers about them.

## 7. System Principles

The intelligence engine must:

- Provide guidance based on current tax laws and official TRA guidance.
- Clearly distinguish between legal requirements, recommendations, and available incentives.
- Avoid speculation or making legal determinations beyond the available information.
- Adapt guidance as the user's situation changes.
- Make every recommendation traceable to a specific rule and source — never an unexplainable score. If the engine cannot explain *why*, it does not surface the recommendation.
- Escalate to human/official TRA support whenever confidence is low, rather than guessing.

---

## 8. Users

**Primary users:** informal businesses, small businesses, medium businesses, first-time entrepreneurs, newly registered taxpayers.

**Secondary users:** TRA officers, business registration officers, business associations, tax education teams, business advisors.

Secondary users consume the same guidance engine through different lenses — a TRA officer needs case context and audit trails, an association admin needs aggregate trends, not individual case files. [FUNCTIONAL_SPEC.md §9](./FUNCTIONAL_SPEC.md#9-roles--access-rbac) defines exactly what each role can see; this constitution's commitment is simply that **no secondary user gets a raw feed of individual citizen data by default** — aggregate first, case-level access only when a specific, logged reason exists (e.g. a citizen requested help).

---

## 9. Governance Model *(new in v2)*

A system that gives tax guidance is only as trustworthy as the process behind it. Biashara Guide commits to:

- **A named content authority.** Every fact in the Knowledge Engine (tax brackets, thresholds, registration steps) has an accountable owner responsible for keeping it current against the Income Tax Act, VAT Act, Tax Administration Act, Finance Act, and TRA guidelines.
- **Change control before publish.** No update to tax rules, thresholds, or guidance copy reaches users without a review step — see the Tax-Law Versioning workflow in [FUNCTIONAL_SPEC.md §11](./FUNCTIONAL_SPEC.md#11-tax-law-versioning). A wrong presumptive-tax bracket shown to thousands of businesses is a national-scale incident, not a typo.
- **A visible effective date.** Every piece of guidance can answer "as of when is this true?" so a business acting on last year's guidance can be identified and corrected.
- **A feedback loop from secondary users.** TRA officers and tax educators can flag guidance that confused or misled a citizen; those flags feed the review queue, not a black hole.
- **Verify before presenting a change as complete.** Every prototype change must be re-checked in the actual citizen-facing journey and against the submitted proposal before it is presented for review. Factual, tax, licensing, regulatory, or eligibility claims must be re-verified against current authoritative Tanzanian sources rather than assumed from memory. If the visible build, source, proposal, and evidence do not agree, the change is not complete.

---

## 10. Success Metrics

Metrics are grouped so the platform is evaluated on trust and understanding, not just raw usage:

| Category | What we watch | Why it matters |
|---|---|---|
| **Activation** | Share of sessions that reach a first personalised recommendation | Proves the "one decision at a time" principle isn't losing people before it helps them |
| **Comprehension** | Share of users who proceed to the recommended next action after seeing *why* it matters | Tests Principle 3 (Explain Before You Request) directly |
| **Compliance movement** | Change in registration/records/filing status for returning users, tracked via the Memory Engine | The actual mission metric: are businesses moving from informal to formal |
| **Trust** | Rate of users who complete a journey vs. abandon after a Risk Engine screen | A spike in abandonment after a risk message signals the tone slipped into "intimidating" |
| **Escalation health** | Rate of chat/notice questions correctly routed to official TRA support instead of guessed | Directly tests the System Principle against speculation |
| **Reach** | Completion rates and language split, per channel (web / USSD / WhatsApp) | Confirms the service is reaching first-time and informal users, not just smartphone owners |

Every metric above has a concrete instrumentation hook defined in [FUNCTIONAL_SPEC.md §12](./FUNCTIONAL_SPEC.md#12-observability); this document defines *what to measure and why*, the spec defines *how*.

---

## 11. Features We WILL Build

- Personalized guidance
- Business assessment
- Registration pathway
- Benefits eligibility guidance
- Compliance roadmap
- Learning support
- Conversational assistance
- Progress tracking
- **Compliance Advisor** — a single view combining a compliance score, a plain-language risk read, and a prioritized queue of next actions (added in v2; see the prototype's Advisor Dashboard)

## 12. Features We WILL NOT Build (Version 1)

- Accounting software
- Inventory management
- Payroll
- Banking
- Loan processing
- E-commerce
- POS system
- Bookkeeping replacement
- Tax filing system (the service guides users to the appropriate filing process rather than replacing official TRA systems)

## 13. Designed For, Not Yet Built

These are explicitly out of scope for the current release but the architecture already assumes they are coming — nothing above should ever require a rewrite to add:

- WhatsApp and USSD delivery (the guidance engine is channel-agnostic by construction, see [FUNCTIONAL_SPEC.md §7](./FUNCTIONAL_SPEC.md#7-multi-channel-delivery))
- A call-centre agent console reusing the same recommendations
- Live TRA system integration for registration status and notice delivery, replacing today's self-reported inputs

---

## 14. Tone of the System

The system speaks like a trusted business advisor. Not like a government notice.

Instead of: *"Submit your return immediately."*

It says: *"Your next step is to submit your return by the due date. Doing so helps you avoid penalties and keeps your business compliant."*

## 15. Design Philosophy

Inspired by human-centered design. Every feature must satisfy three questions:

1. Does it solve a real problem?
2. Is it the simplest possible solution?
3. Would a first-time entrepreneur understand it without assistance?

If the answer to any question is No, the feature should be redesigned or removed.

## 16. Our Innovation Statement

The TRA Intelligent Tax Guidance Service transforms tax compliance from a complex administrative process into a personalized, conversational journey. Rather than expecting businesses to understand the tax system, the service adapts the tax system's guidance to the needs, language, and stage of each business — and does so through one shared engine reachable from whichever channel a business already trusts, from a smartphone app to a feature-phone USSD menu.

---

## 17. Our Motto

**"Guide, Don't Burden."**

Those three words capture our philosophy:

- We guide rather than overwhelm.
- We educate rather than confuse.
- We encourage voluntary compliance rather than relying on enforcement alone.

If we consistently design around that principle, every feature we build will naturally support the overall vision and remain focused on the users we are trying to help.
