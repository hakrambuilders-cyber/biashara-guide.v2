/**
 * Telemetry — sends one anonymized guidance event to the shared aggregate
 * store (Supabase) so the separate TRA Officer Console
 * (https://github.com/hakrambuilders-cyber/biashara-guide-officer) can show
 * real activity instead of only synthetic demo data.
 *
 * This is intentionally write-only from here: the anon key below can only
 * INSERT into guidance_events (see ../supabase-setup.sql in the officer
 * console repo for the exact database policies) and cannot read anything
 * back, whether its own submission or anyone else's. No name, phone, NIDA
 * number, location, or free-text is ever included — see the fields below,
 * that is the complete set. Sending fails silently; guidance never depends
 * on network availability (Constitution Principle 7 — Privacy by Default,
 * Functional Spec §3.3 — data minimization).
 */

const SUPABASE_URL = 'https://fintumxfjtzvxmscdtdj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_U6Uc8KXbeAsi0Q_nF9CepA_j0RvgVHv';

let sentThisSession = false;

export function sendGuidanceEvent(profile, advisor, lang) {
  if (sentThisSession) return; // one signal per session is enough; avoids spamming on every re-render
  if (!profile?.business) return;
  sentThisSession = true;

  const payload = {
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
  };

  fetch(`${SUPABASE_URL}/rest/v1/guidance_events`, {
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
