/**
 * Knowledge Engine — static bilingual reference data only.
 *
 * No logic lives here. Every fact quoted to a user must be traceable to
 * this file (or a future official-source connector that replaces it),
 * per the Functional Specification's Knowledge Engine rule.
 */

export const copy = (sw, en) => ({ sw, en });

// ---------------------------------------------------------------------------
// Sectors — includes sector-specific licensing/obligation hints used by the
// risk and next-best-action logic in engine/core.js.
// ---------------------------------------------------------------------------

export const SECTORS = {
  CHAKULA: {
    name: 'Chakula na Lishe (Food & Catering)',
    keywords: ['mama lishe', 'chakula', 'mgahawa', 'mkahawa', 'chippy', 'mshikaki', 'migahawa', 'usindikaji', 'food', 'restaurant', 'eatery', 'catering', 'bakery', 'snacks', 'drinks', 'juice'],
    licenceNote: copy(
      'Biashara za chakula mara nyingi huhitaji cheti cha afya/usafi pamoja na leseni ya biashara.',
      'Food businesses typically need a health/hygiene certificate in addition to a business licence.'
    ),
    efdSensitive: true
  },
  USAFIRI: {
    name: 'Usafiri na Uchukuzi (Transportation)',
    keywords: ['boda', 'bodaboda', 'bajaji', 'daladala', 'usafiri', 'taxi', 'tax', 'lori', 'pikipiki', 'transport', 'motorcycle', 'bus', 'delivery', 'courier'],
    licenceNote: copy(
      'Huduma za usafiri kwa kawaida huhitaji leseni ya safari/ruhusa ya mamlaka ya usafirishaji.',
      'Transport services typically require a route permit or transport-authority licence.'
    ),
    efdSensitive: true
  },
  UREMBO: {
    name: 'Urembo na Saluni (Beauty & Personal Care)',
    keywords: ['kinyozi', 'saluni', 'nywele', 'kusuka', 'urembo', 'barber', 'spa', 'beauty', 'salon', 'hair', 'barbershop', 'braiding', 'nails', 'makeup'],
    licenceNote: copy(
      'Saluni na vinyozi kwa kawaida huhitaji leseni ya biashara ya kawaida na usajili wa eneo.',
      'Salons and barbershops typically need a standard business licence and premises registration.'
    ),
    efdSensitive: false
  },
  UFUNDI: {
    name: 'Ufundi na Uzalishaji (Crafts & Manufacturing)',
    keywords: ['mbao', 'samani', 'ufundi', 'ujenzi', 'chuma', 'welding', 'fremu', 'shughuli za ujenzi', 'bomba', 'carpentry', 'furniture', 'construction', 'masonry', 'electrical', 'plumbing', 'repair'],
    licenceNote: copy(
      'Shughuli za uzalishaji zinaweza kuhitaji kibali cha eneo la kazi na tahadhari za usalama kazini.',
      'Manufacturing/workshop activity may need a workplace permit and workplace-safety considerations.'
    ),
    efdSensitive: true
  },
  REJAREJA: {
    name: 'Uuzaji wa Bidhaa (Retail & General Trade)',
    keywords: ['duka', 'rejareja', 'machinga', 'nguo', 'madawa', 'kioski', 'genge', 'duka la nguo', 'mali kauli', 'shop', 'retail', 'groceries', 'clothing', 'clothes', 'hardware', 'phones', 'cosmetics', 'market stall', 'online selling'],
    licenceNote: copy(
      'Maduka na biashara za rejareja kwa kawaida huhitaji leseni ya biashara ya kawaida.',
      'Retail shops typically need a standard business licence.'
    ),
    efdSensitive: true
  },
  KILIMO: {
    name: 'Kilimo, Mifugo na Uvuvi (Agriculture, Livestock & Fishing)',
    keywords: ['kilimo', 'mkulima', 'mazao', 'mboga', 'matunda', 'kuku', 'mayai', 'mifugo', 'samaki', 'uvuvi', 'farming', 'agriculture', 'crops', 'vegetables', 'fruit', 'poultry', 'eggs', 'livestock', 'fishing', 'fish'],
    licenceNote: copy(
      'Vibali vinavyohitajika hutegemea shughuli yenyewe na eneo; Biashara Guide itakuonyesha cha kuangalia bila kukisia kibali kimoja kwa biashara zote.',
      'Required permits depend on the activity and location; Biashara Guide flags what to check without assuming one permit fits every business.'
    ),
    efdSensitive: true
  },
  UZALISHAJI: {
    name: 'Uzalishaji Mdogo (Small-scale Production)',
    keywords: ['ushonaji', 'sabuni', 'kusaga', 'uzalishaji', 'kutengeneza', 'bidhaa za mikono', 'production', 'manufacturing', 'tailoring', 'soap', 'milling', 'handicrafts', 'leather', 'metal goods'],
    licenceNote: copy(
      'Uzalishaji unaweza kuhitaji leseni ya biashara pamoja na masharti yanayotegemea bidhaa, eneo la kazi au usalama.',
      'Production may require a business licence plus requirements that depend on the product, workplace or safety.'
    ),
    efdSensitive: true
  },
  WAKALA: {
    name: 'Wakala wa Fedha (Money Agency Services)',
    keywords: ['wakala', 'm-pesa', 'mpesa', 'airtel money', 'mixx', 'halopesa', 't-pesa', 'benki', 'agent', 'mobile money', 'bank agent'],
    licenceNote: copy(
      'Kwa biashara ya uwakala, masharti yanaweza kutegemea huduma unazowakilisha pamoja na leseni ya biashara ya eneo husika.',
      'For agency businesses, requirements can depend on the services represented as well as the relevant local business licence.'
    ),
    efdSensitive: true
  },
  HUDUMA: {
    name: 'Huduma Nyingine (Other Services)',
    keywords: ['kompyuta', 'kidijitali', 'tuition', 'mafunzo', 'picha', 'video', 'matukio', 'malazi', 'utalii', 'uhasibu', 'ushauri', 'usafi', 'kufua', 'services', 'technology', 'computer', 'digital', 'training', 'education', 'photo', 'event', 'accommodation', 'tourism', 'bookkeeping', 'consulting', 'professional', 'cleaning', 'laundry'],
    licenceNote: copy(
      'Masharti ya leseni au kibali hutegemea aina ya huduma na eneo ambako biashara inafanyika.',
      'Licence or permit requirements depend on the type of service and where the business operates.'
    ),
    efdSensitive: true
  }
};

export const NUMBER_UNITS = {
  moja: 1, mbili: 2, tatu: 3, nne: 4, tano: 5,
  sita: 6, saba: 7, nane: 8, tisa: 9, kumi: 10,
  ishirini: 20, thelatini: 30, arobaini: 40, hamsini: 50,
  sitini: 60, sabini: 70, themanini: 80, tisini: 90, mia: 100
};

export const FAQS = [
  {
    keywords: ['presumptive', 'kodi ya makadirio', 'makadirio ni nini', 'inafanya kazi vipi'],
    response: copy(
      '**Kodi ya Makadirio (Presumptive Tax)** ni mfumo wa kodi kwa wafanyabiashara binafsi wanaotimiza masharti, ikiwa mauzo ya mwaka hayazidi TSh Milioni 200. Kiasi hutegemea mauzo na ukamilifu wa kumbukumbu.',
      '**Presumptive Tax** is a regime for eligible individual traders with annual turnover not exceeding TSh 200 Million. The amount depends on turnover and record completeness.'
    )
  },
  {
    keywords: ['tin', 'usajili', 'kupata tin', 'namba ya tin'],
    response: copy(
      'Kupata **namba ya TIN** ni bure. Kwa kawaida utahitaji Kitambulisho cha NIDA, namba ya simu iliyosajiliwa, na taarifa za eneo la biashara.',
      'Getting a **TIN Number** is completely free! You need a NIDA ID, a registered phone number, and your business location.'
    )
  },
  {
    keywords: ['efd', 'mashine ya efd', 'efd machine'],
    response: copy(
      'Kwa taarifa ya sasa ya TRA, mfanyabiashara anayefikisha mauzo ya **TSh Milioni 11 kwa mwaka au zaidi** ana wajibu wa kupata na kutumia **EFD/VFD**; baadhi ya maeneo au sekta pia zinaweza kuhusishwa.',
      'Under current TRA guidance, a trader reaching **TSh 11 Million or more in annual turnover** must acquire and use an **EFD/VFD**; some locations or sectors may also be included.'
    )
  }
];

export const NOTICES = {
  Kikumbusho: {
    status: copy('Inahitaji uangalizi', 'Needs attention'),
    meaning: copy('Kikumbusho kwa kawaida huomba uchukue au uthibitishe hatua fulani.', 'A reminder normally asks you to take or confirm a specific step.'),
    action: copy('Soma tarehe, jambo linalotajwa na maelekezo kwenye taarifa.', 'Read the date, issue mentioned, and instructions on the notice.')
  },
  'Taarifa ya adhabu': {
    status: copy('Hatua inahitajika', 'Action required'),
    meaning: copy('Taarifa ya adhabu inaweza kuonyesha TRA inaona wajibu fulani haukutimizwa kwa wakati au kwa namna ilivyohitajika.', 'A penalty notice may indicate TRA considers that an obligation was not met on time or as required.'),
    action: copy('Kagua taarifa, thibitisha rekodi zako, kisha tafuta msaada rasmi ikiwa kuna makosa au huielewi.', 'Review the notice, confirm your records, then seek official support if there is an error or you do not understand it.')
  },
  'Taarifa ya ukadiriaji': {
    status: copy('Hatua inahitajika', 'Action required'),
    meaning: copy('Taarifa ya ukadiriaji inaweza kueleza maamuzi au kiasi kilichokadiriwa kulingana na taarifa zilizopo.', 'An assessment notice may set out a decision or estimated amount based on information available.'),
    action: copy('Soma maelezo na tarehe zake kwa makini; weka rekodi zako tayari kabla ya kuomba ufafanuzi rasmi.', 'Read the details and dates carefully; have your records ready before requesting official clarification.')
  },
  'Kikumbusho cha return': {
    status: copy('Hatua inahitajika', 'Action required'),
    meaning: copy('Kikumbusho kinaweza kuhusiana na ritani ya kodi inayotakiwa kuwasilishwa.', 'The reminder may relate to information or a return that needs to be submitted.'),
    action: copy('Thibitisha kama ritani ya kodi tayari iliwasilishwa; kama haikuwasilishwa, fuata njia rasmi ya kuiwasilisha.', 'Confirm whether the return was already submitted; if not, use the official filing route.')
  },
  'Kikumbusho cha malipo': {
    status: copy('Hatua inahitajika', 'Action required'),
    meaning: copy('Kikumbusho cha malipo kinaweza kuomba uthibitishe au ukamilishe malipo yaliyotajwa.', 'A payment reminder may ask you to confirm or complete a payment mentioned.'),
    action: copy('Linganisheni taarifa na rekodi zako za malipo, kisha fuata maelekezo rasmi yaliyo kwenye taarifa.', 'Compare the notice with your payment records, then follow the official instructions on it.')
  },
  'Sina uhakika': {
    status: copy("Tuanze kwa kuielewa", "Let's understand it first"),
    meaning: copy('Usijali—anza kwa kusoma kichwa cha taarifa, tarehe na jambo linalotajwa.', "Don't worry—start by reading the notice heading, date, and issue mentioned."),
    action: copy('Tumia picha au nakala ya taarifa kupata ufafanuzi rasmi wa aina yake.', 'Use a photo or copy of the notice to obtain official clarification of its type.')
  }
};
