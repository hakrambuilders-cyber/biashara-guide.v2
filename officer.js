/**
 * TRA Officer Console — a separate, desktop-oriented front-end from the
 * citizen app (app.js / index.html). It is a distinct entry point on
 * purpose: a different persona, a different device assumption (desktop,
 * not mobile-first), and its own login gate — reflecting the RBAC model
 * in docs/FUNCTIONAL_SPEC.md §9 (officers authenticate; citizens don't).
 *
 * The login here is a simulation only: no real authentication exists in
 * this prototype. It exists to make the access boundary visible in the
 * demo, not to secure anything. Both this console and the citizen app sit
 * on top of the same channel-agnostic engine (engine/core.js,
 * engine/analytics.js) — nothing about the guidance/analytics logic is
 * duplicated here.
 */

import { generateMockPopulation, buildTRAInsights } from './engine/analytics.js';
import { brandMarkSvg } from './brand.js';

const CHANNEL_LABEL = { web: 'Web', ussd: 'USSD', whatsapp: 'WhatsApp' };
const CHAT_TOPIC_LABEL = {
  tin: 'TIN questions',
  tax: 'Tax / VAT questions',
  notice: 'TRA notice questions',
  benefits: 'Benefits / incentive questions',
  general: 'General questions'
};

let session = null; // { username } — in-memory only, resets on reload by design
let insightsCache = null;

function getInsights() {
  if (!insightsCache) insightsCache = buildTRAInsights(generateMockPopulation());
  return insightsCache;
}

function t(copyObj) {
  return copyObj?.en ?? '';
}

function esc(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function barRow(label, percent, sublabel) {
  return `
    <div class="bar-row">
      <div class="bar-row-top"><span>${esc(label)}</span><b>${percent}%</b></div>
      <div class="bar-track"><i style="width:${percent}%;"></i></div>
      ${sublabel ? `<span class="bar-sublabel">${esc(sublabel)}</span>` : ''}
    </div>`;
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

function renderLogin() {
  return `
    <div class="login-screen">
      <div class="login-panel">
        <div class="brand-mark">${brandMarkSvg()}</div>
        <h1>TRA Officer Console</h1>
        <p class="login-sub">Aggregate analytics access for authorised TRA staff.</p>
        <form id="loginForm" class="login-form">
          <label>Username
            <input type="text" id="loginUser" placeholder="e.g. officer.demo" autocomplete="off" />
          </label>
          <label>Password
            <input type="password" id="loginPass" placeholder="••••••••" autocomplete="off" />
          </label>
          <button type="submit" class="btn btn-primary">Log In</button>
        </form>
        <p class="login-note">🧪 Demo simulation — enter any username and password; nothing is checked, validated, or stored. No real TRA authentication exists in this prototype.</p>
        <a class="login-back" href="index.html">← Back to citizen app</a>
      </div>
    </div>`;
}

function renderDashboard() {
  const insights = getInsights();

  return `
    <div class="officer-app">
      <aside class="officer-sidebar">
        <div class="brand-mark">${brandMarkSvg()}</div>
        <div class="sidebar-title">TRA Officer Console</div>
        <div class="sidebar-session">
          <span class="session-label">Signed in as</span>
          <strong>${esc(session.username)}</strong>
        </div>
        <button class="link-btn logout-btn" id="logoutBtn">Log out</button>
        <p class="legal-note sidebar-note">🧪 Aggregate demo data only — never individual case files. Case-level access requires a logged reason (Functional Specification §9–§10).</p>
      </aside>

      <main class="officer-main">
        <h1>National Analytics Overview <span class="chip officer-chip">DEMO DATA</span></h1>
        <p class="lead">Aggregate data from ${insights.overview.total} simulated businesses — no individual name or case data appears here, by design.</p>

        <div class="kpi-grid">
          <div class="kpi-tile">
            <span class="kpi-value">${insights.overview.total}</span>
            <span class="kpi-label">Businesses (mock)</span>
          </div>
          <div class="kpi-tile">
            <span class="kpi-value">${insights.overview.avgComplianceScore}%</span>
            <span class="kpi-label">Avg. Compliance Score</span>
          </div>
          <div class="kpi-tile ${insights.overview.highRiskShare > 30 ? 'warn' : ''}">
            <span class="kpi-value">${insights.overview.highRiskShare}%</span>
            <span class="kpi-label">At High Risk</span>
          </div>
          <div class="kpi-tile">
            <span class="kpi-value">${insights.overview.escalationRate}%</span>
            <span class="kpi-label">Escalated to TRA</span>
          </div>
        </div>

        <div class="dashboard-grid">
          <div class="card">
            <span class="snapshot-label">Risk Level (National)</span>
            <div class="risk-legend">
              ${insights.riskBreakdown.map(r => `
                <div class="risk-legend-item">
                  <span class="risk-chip risk-${r.level}">${r.level[0].toUpperCase() + r.level.slice(1)} risk</span>
                  <b>${r.pct}%</b>
                  <span class="step-time">${r.count} businesses</span>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="card">
            <span class="snapshot-label">Biggest Compliance Gaps (National)</span>
            ${insights.registrationGaps.map(g => barRow(t(g.label), g.pct, `${g.missing} businesses`)).join('')}
          </div>

          <div class="card">
            <span class="snapshot-label">Most Common Next-Best-Actions</span>
            <p class="question-note">Shows where most businesses are stuck — never who they are.</p>
            ${insights.topNextActions.map(a => barRow(t(a.title), a.pct, `${a.count} businesses`)).join('')}
          </div>

          <div class="card">
            <span class="snapshot-label">Breakdown by Business Sector Selected</span>
            ${insights.sectorBreakdown.map(s => barRow(s.name, s.pct, `${s.count} businesses · avg score ${s.avgScore}%`)).join('')}
          </div>

          <div class="card">
            <span class="snapshot-label">Breakdown by Region</span>
            ${insights.regionBreakdown.map(r => barRow(r.region, r.pct, `${r.count} businesses · biggest gap: ${t(r.topGap)} · avg ${r.avgScore}%`)).join('')}
          </div>

          ${insights.noticeBreakdown.length ? `
            <div class="card">
              <span class="snapshot-label">Notice Types Received</span>
              ${insights.noticeBreakdown.map(n => barRow(n.type, n.pct, `${n.count} cases`)).join('')}
            </div>` : ''}

          ${insights.chatTopicBreakdown.length ? `
            <div class="card">
              <span class="snapshot-label">Topics Causing the Most Confusion</span>
              ${insights.chatTopicBreakdown.map(c => barRow(CHAT_TOPIC_LABEL[c.topic], c.pct, `${c.count} conversations`)).join('')}
            </div>` : ''}

          <div class="card">
            <span class="snapshot-label">Language &amp; Channel Split</span>
            <div class="two-col">
              <div>
                <p class="question-note">Language</p>
                ${insights.languageSplit.map(l => barRow(l.lang === 'sw' ? 'Kiswahili' : 'English', l.pct)).join('')}
              </div>
              <div>
                <p class="question-note">Channel</p>
                ${insights.channelSplit.map(c => barRow(CHANNEL_LABEL[c.channel], c.pct)).join('')}
              </div>
            </div>
          </div>

          <div class="card">
            <span class="snapshot-label">Benefits Eligibility Snapshot</span>
            <div class="benefit"><b>✓</b> ${insights.benefitsSnapshot.presumptiveEligiblePct}% are eligible for the presumptive tax exemption/flat rate</div>
            <div class="benefit"><b>?</b> ${insights.benefitsSnapshot.growthCheckPct}% are worth checking for growth resources</div>
          </div>
        </div>

        <p class="legal-note footer-note">This is synthetic demo data (generated, not real people) showing the kind of insight the Analytics Engine would give TRA. Access to any individual case requires a logged reason — see Functional Specification §9–§10.</p>
      </main>
    </div>`;
}

// ---------------------------------------------------------------------------
// Router / events
// ---------------------------------------------------------------------------

function render() {
  document.getElementById('app').innerHTML = session ? renderDashboard() : renderLogin();
}

function attachEvents() {
  document.addEventListener('submit', (e) => {
    if (e.target && e.target.id === 'loginForm') {
      e.preventDefault();
      const userInput = document.getElementById('loginUser');
      const username = (userInput?.value ?? '').trim() || 'officer.demo';
      session = { username };
      render();
    }
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('#logoutBtn')) {
      session = null;
      render();
    }
  });
}

attachEvents();
render();
