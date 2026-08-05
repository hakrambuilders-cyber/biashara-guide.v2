/**
 * Telemetry — sends anonymized events to the shared aggregate store
 * (Supabase) so the separate TRA Officer Console
 * (https://github.com/hakrambuilders-cyber/biashara-guide-officer) can show
 * real activity instead of only synthetic demo data.
 *
 * This is intentionally write-only from here: the anon key below can only
 * INSERT into guidance_events / chat_events (see ../supabase-setup.sql in
 * the officer console repo for the exact database policies) and cannot
 * read anything back, whether its own submission or anyone else's. No
 * name, phone, NIDA number, location, or message text is ever included —
 * chat events store only a topic classification (see
 * engine/core.js#classifyChatTopic), never what was typed. Sending fails
 * silently; guidance never depends on network availability (Constitution
 * Principle 7 — Privacy by Default, Functional Spec §3.3 — data
 * minimization).
 */

const SUPABASE_URL = 'https://fintumxfjtzvxmscdtdj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_U6Uc8KXbeAsi0Q_nF9CepA_j0RvgVHv';

function post(table, payload) {
  fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(payload)
  }).catch(() => {
    // Never let a failed or blocked network request affect guidance.
  });
}

// Tracks the last profile actually sent (not just "have we ever sent
// anything") so re-renders of the *same* profile (navigating between
// Advisor/Snapshot/Checkup screens) don't spam duplicate events, but a
// genuinely different client filling out the form on the same shared
// device/browser — a walk-up kiosk, a family phone — still gets counted.
// A page reload also resets this naturally (it's just a module variable).
let lastSentSignature = null;

export function sendGuidanceEvent(profile, advisor, lang) {
  if (!profile?.business) return;

  const signature = JSON.stringify([
    profile.business, profile.stage, profile.sales,
    [...profile.registrations].sort(), profile.records, profile.filedReturn,
    advisor.complianceScore, advisor.risk.level
  ]);
  if (signature === lastSentSignature) return;
  lastSentSignature = signature;

  post('guidance_events', {
    sector: profile.business === 'OTHER' ? null : profile.business,
    stage: profile.stage,
    sales_bucket: profile.sales,
    has_tin: profile.registrations.includes('tin'),
    has_business_registration: profile.registrations.includes('businessRegistration'),
    has_licence: profile.registrations.includes('licence'),
    keeps_records: profile.records === 'yes',
    filed_return: profile.filedReturn === 'yes',
    compliance_score: advisor.complianceScore,
    risk_level: advisor.risk.level,
    next_action_key: advisor.actions[0]?.key ?? null,
    language: lang,
    channel: 'web'
  });
}

// One event per chat message sent — topic only, never the message text.
export function sendChatEvent(topic, lang) {
  post('chat_events', { topic, language: lang });
}
