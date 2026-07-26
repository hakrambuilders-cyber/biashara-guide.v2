/**
 * Text Channel Adapter — proves the "one engine, many channels" claim from
 * the Functional Specification (Module: Multi-Channel Delivery).
 *
 * This is the same engine/core.js that drives the web app (app.js), wired
 * to a numbered-menu, plain-text conversation shape — the pattern a USSD
 * session or a WhatsApp bot would use on a feature phone with no buttons
 * or rich UI. No DOM, no localStorage: a real USSD/WhatsApp gateway would
 * hold `session` in its own request-scoped store between messages instead.
 *
 * Run a scripted demo conversation:
 *   node channels/text-adapter.js
 */

import { pathToFileURL } from 'node:url';
import { getComplianceAdvisor, calculateTRAPresumptiveTax, parseSwahiliNumber } from '../engine/core.js';
import { SECTORS } from '../engine/knowledge.js';

const SECTOR_KEYS = Object.keys(SECTORS);

const STAGE_MENU = ['mpya', 'inaendelea', 'imara'];
const SALES_MENU = ['belowOne', 'oneToFive', 'fiveToTwenty', 'aboveTwenty'];

export function createSession(lang = 'sw') {
  return { step: 'business', lang, profile: { registrations: [] } };
}

function menuText(session) {
  const sw = session.lang === 'sw';
  switch (session.step) {
    case 'business':
      return (sw ? 'Karibu Biashara Guide.\nBiashara yako ni ya aina gani?\n' : 'Welcome to Biashara Guide.\nWhat kind of business is it?\n') +
        SECTOR_KEYS.map((k, i) => `${i + 1}. ${SECTORS[k].name.split(' (')[0]}`).join('\n');
    case 'stage':
      return sw ? '1. Mpya\n2. Inaendelea\n3. Imara' : '1. New\n2. Operating\n3. Established';
    case 'sales':
      return sw
        ? '1. Chini ya TSh 1M/mwaka\n2. TSh 1M-5M/mwaka\n3. TSh 5M-20M/mwaka\n4. Zaidi ya TSh 20M/mwaka'
        : '1. Below TSh 1M/year\n2. TSh 1M-5M/year\n3. TSh 5M-20M/year\n4. Above TSh 20M/year';
    case 'tin':
      return sw ? 'Una TIN? (1=Ndiyo, 2=Hapana)' : 'Do you have a TIN? (1=Yes, 2=No)';
    default:
      return '';
  }
}

export function handleInput(session, rawInput) {
  const input = (rawInput ?? '').trim();
  const sw = session.lang === 'sw';

  switch (session.step) {
    case 'business': {
      const idx = parseInt(input, 10) - 1;
      session.profile.business = SECTOR_KEYS[idx] ?? 'OTHER';
      session.step = 'stage';
      return { reply: menuText(session), done: false };
    }
    case 'stage': {
      const idx = parseInt(input, 10) - 1;
      session.profile.stage = STAGE_MENU[idx] ?? 'mpya';
      session.step = 'sales';
      return { reply: menuText(session), done: false };
    }
    case 'sales': {
      const idx = parseInt(input, 10) - 1;
      session.profile.sales = SALES_MENU[idx] ?? 'belowOne';
      session.step = 'tin';
      return { reply: menuText(session), done: false };
    }
    case 'tin': {
      if (input === '1') session.profile.registrations.push('tin');
      session.step = 'done';
      const advisor = getComplianceAdvisor(session.profile);
      const action = advisor.actions[0];
      const reply = sw
        ? `Asante! Alama yako ya utii: ${advisor.complianceScore}%.\nHatua yako inayofuata: ${action.title.sw} (${action.time.sw}).\n${action.reason.sw}`
        : `Thanks! Your compliance score: ${advisor.complianceScore}%.\nYour next step: ${action.title.en} (${action.time.en}).\n${action.reason.en}`;
      return { reply, done: true, advisor };
    }
    default:
      return { reply: sw ? 'Mazungumzo yamekamilika. Piga tena kuanza upya.' : 'Session complete. Dial again to restart.', done: true };
  }
}

// ---------------------------------------------------------------------------
// Scripted demo — run with `node channels/text-adapter.js`
// ---------------------------------------------------------------------------

const isDirectRun = typeof process !== 'undefined' && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const session = createSession('en');
  console.log('--- USSD/WhatsApp-style text channel demo (same engine as the web app) ---\n');
  console.log(menuText(session));

  const scriptedReplies = ['1', '2', '3', '2']; // CHAKULA, Operating, 5-20M/year, no TIN yet
  for (const reply of scriptedReplies) {
    console.log(`\n> ${reply}`);
    const result = handleInput(session, reply);
    console.log(result.reply);
    if (result.done) break;
  }

  console.log('\n--- Presumptive tax lookup via free text, same parser used by the chat screen ---');
  const daily = parseSwahiliNumber('mauzo laki 2 kwa siku');
  console.log(`Parsed daily sales: ${daily}`);
  console.log(calculateTRAPresumptiveTax(daily));
}
