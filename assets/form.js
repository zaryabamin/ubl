/* ===========================================================
   Account opening wizard engine (6 steps, schema-driven)
   No data leaves the browser — this is a local test build.
   =========================================================== */

const IC = {
  pref: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="m8 12 3 3 5-6"/></svg>',
  person: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6z"/></svg>',
  verify: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/></svg>',
  extra: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/></svg>',
  account: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/></svg>',
  review: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3 7-7M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m6 9 6 6 6-6"/></svg>',
  chevR: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 6 6 6-6 6"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m5 12 5 5 9-10"/></svg>',
  tick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m5 12 4 4 10-11"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 16V4M7 9l5-5 5 5M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
  cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.4"/></svg>'
};

const ACCOUNT_NAMES = {
  asaan: 'Asaan Digital Account', freelancer: 'Freelancer Account', roshan: 'Roshan Digital Account',
  urooj: 'Urooj Account', mukammal: 'Digital Mukammal Account'
};

const CITIES = ['Abbaspur','Abbottabad','Ahmed Pur Sial','Bahawalpur','Faisalabad','Gujranwala','Hyderabad','Islamabad','Karachi','Lahore','Multan','Peshawar','Quetta','Rawalpindi','Sialkot','Sukkur'];
const BRANCHES = ['UBL Main Branch - 0101','UBL Gulberg - 0233','UBL Ameen Atter Shisha - 0249','UBL Model Town - 0418','UBL Ameen Havelian - 0571','UBL Saddar - 0902','UBL DHA Phase 5 - 1120','UBL Ameen Lora - 1503'];

// ---------- Schema ----------
const STEPS = [
  {
    key: 'preferences', label: 'Preferences', icon: IC.pref,
    intro: { title: 'Preferences', sub: 'First, tell us about the type of account you want.', cta: "Let's Begin" },
    questions: [
      { type: 'pcards', key: 'banking', title: 'What is your banking preference?', single: true, cards: [
        { v: 'ameen', logo: '<span class="ameen">اَمِین</span>', name: 'Ameen (Islamic)', feats: ['Shariah Compliant', 'No minimum balance', 'Lifestyle discounts'] },
        { v: 'conventional', logo: '<span class="oval">UBL</span>', name: 'Conventional', feats: ['Value packed', 'No minimum balance', '24/7 Digital Banking'] }
      ]},
      { type: 'pcards', key: 'debitcard', title: 'Select your debit card.', single: true, note: 'The cost of your debit card will be as per <a href="#">Schedule of charges</a>.', cards: [
        { v: 'silver', visual: true, name: 'UBL Silver', feats: ['Chip & PIN security', 'Daily Cash Limit PKR 40,000', 'Discounts at 300+ outlets'] },
        { v: 'gold', visual: true, name: 'UBL Gold', feats: ['3D-Secure Online Payments', 'Daily Cash Limit PKR 200,000', 'Contactless Payments Enabled'] },
        { v: 'platinum', visual: true, name: 'UBL Platinum', feats: ['3D-Secure Online Payments', 'Daily Cash Limit PKR 500,000', 'Contactless Payments Enabled'] }
      ]},
      { type: 'choice', key: 'chequebook', title: 'Would you like a cheque book to use with this account?', sub: 'You can request one later as well.', options: ['Yes', 'No'] },
      { type: 'branch', key: 'branch', title: 'Select your preferred branch.', sub: 'Search for a branch closest to you, using <b>one</b> of the two options below.' }
    ]
  },
  {
    key: 'personal', label: 'Personal Details', icon: IC.person,
    intro: { title: 'Personal Details', sub: "Let's get to know you.", cta: 'Continue' },
    questions: [
      { type: 'fields', title: 'Enter your full name.', sub: 'Please enter your full name as it appears on your Identity Card.',
        fields: [{ key: 'fullName', label: 'Full Name', type: 'text', placeholder: 'Enter here', required: true }] },
      { type: 'fields', title: 'Enter your Identity Card details.', sub: 'Please share details about your Identity Card.',
        fields: [
          { key: 'cnic', label: 'Identity Card Number', type: 'cnic', placeholder: '0000000000000', required: true },
          { key: 'cnicIssue', label: 'Identity Card Date of Issuance', type: 'date', placeholder: 'DD/MM/YYYY', required: true },
          { key: 'cnicExpiry', label: 'Identity Card Date of Expiry', type: 'date', placeholder: 'DD/MM/YYYY', required: true, checkbox: 'No Expiry Date.' },
          { key: 'dob', label: 'Date of Birth', type: 'date', placeholder: 'DD/MM/YYYY', required: true }
        ] },
      { type: 'fields', title: 'Tell us about your family.', sub: 'As recorded on your Identity Card.',
        fields: [
          { key: 'fatherName', label: "Father's / Husband's Name", type: 'text', placeholder: 'Enter here', required: true },
          { key: 'motherName', label: "Mother's Maiden Name", type: 'text', placeholder: 'Enter here', required: true }
        ] },
      { type: 'fields', title: 'A few more details about you.', sub: '',
        fields: [
          { key: 'gender', label: 'Gender', type: 'select', options: ['Male', 'Female', 'Other'], required: true },
          { key: 'marital', label: 'Marital Status', type: 'select', options: ['Single', 'Married', 'Other'], required: true },
          { key: 'placeOfBirth', label: 'Place of Birth', type: 'text', placeholder: 'Enter here', required: true },
          { key: 'nationality', label: 'Nationality', type: 'select', options: ['Pakistani', 'Dual National', 'Other'], required: true }
        ] },
      { type: 'fields', title: 'How can we reach you?', sub: 'We will send a one-time code to verify these.',
        fields: [
          { key: 'mobile', label: 'Mobile Number', type: 'tel', placeholder: '03XX XXXXXXX', required: true },
          { key: 'email', label: 'Email Address', type: 'email', placeholder: 'name@example.com', required: true }
        ] },
      { type: 'fields', title: 'Where do you live?', sub: 'Your current residential address.',
        fields: [
          { key: 'address', label: 'Residential Address', type: 'textarea', placeholder: 'House, street, area', required: true },
          { key: 'city', label: 'City', type: 'select', options: CITIES, required: true }
        ] }
    ]
  },
  {
    key: 'verification', label: 'Verification', icon: IC.verify,
    intro: { title: 'Verification', sub: "Let's confirm it's really you.", cta: 'Continue' },
    questions: [
      { type: 'upload', key: 'idFront', title: 'Upload the front of your Identity Card.', sub: 'Make sure all corners are visible and text is clear.', kind: 'id' },
      { type: 'upload', key: 'idBack', title: 'Upload the back of your Identity Card.', sub: 'Make sure all corners are visible and text is clear.', kind: 'id' },
      { type: 'upload', key: 'selfie', title: 'Take a live selfie.', sub: 'Look straight at the camera in a well-lit place.', kind: 'selfie' }
    ]
  },
  {
    key: 'additional', label: 'Additional Details', icon: IC.extra,
    intro: { title: 'Additional Details', sub: 'A few more things we need to know.', cta: 'Continue' },
    questions: [
      { type: 'fields', title: 'Tell us about your work.', sub: '',
        fields: [
          { key: 'occupation', label: 'Occupation', type: 'select', options: ['Salaried', 'Self-employed', 'Business Owner', 'Freelancer', 'Student', 'Housewife', 'Retired', 'Other'], required: true },
          { key: 'employer', label: 'Employer / Business Name', type: 'text', placeholder: 'Enter here', required: false }
        ] },
      { type: 'fields', title: 'What will this account be used for?', sub: '',
        fields: [
          { key: 'purpose', label: 'Purpose of Account', type: 'select', options: ['Salary', 'Savings', 'Business', 'Freelance Income', 'Remittances', 'Other'], required: true },
          { key: 'income', label: 'Expected Monthly Credit', type: 'select', options: ['Up to PKR 50,000', 'PKR 50,001 – 200,000', 'PKR 200,001 – 500,000', 'Above PKR 500,000'], required: true }
        ] },
      { type: 'fields', title: 'Nominate your next of kin.', sub: 'The person we should contact if needed.',
        fields: [
          { key: 'kinName', label: 'Next of Kin Name', type: 'text', placeholder: 'Enter here', required: true },
          { key: 'kinRelation', label: 'Relationship', type: 'select', options: ['Spouse', 'Parent', 'Sibling', 'Child', 'Other'], required: true }
        ] }
    ]
  },
  {
    key: 'accountdetails', label: 'Account Details', icon: IC.account,
    intro: { title: 'Account Details', sub: 'Almost there — set up your account.', cta: 'Continue' },
    questions: [
      { type: 'fields', title: 'Choose your account currency.', sub: '',
        fields: [{ key: 'currency', label: 'Account Currency', type: 'select', options: ['PKR', 'USD', 'GBP', 'EUR'], required: true }] },
      { type: 'choice', key: 'smsAlerts', title: 'Would you like SMS & email alerts?', sub: 'Stay updated on every transaction.', options: ['Yes', 'No'] },
      { type: 'choice', key: 'estatement', title: 'Would you like e-statements?', sub: 'Paperless monthly statements to your email.', options: ['Yes', 'No'] },
      { type: 'fields', title: 'How did you hear about us?', sub: '',
        fields: [{ key: 'source', label: 'Source', type: 'select', options: ['Social Media', 'Friend / Family', 'UBL Branch', 'Search Engine', 'Advertisement', 'Other'], required: true }] }
    ]
  },
  {
    key: 'review', label: 'Review Application', icon: IC.review,
    intro: { title: 'Review Application', sub: 'Please review your details before you submit.', cta: 'Review' },
    questions: [{ type: 'review', title: 'Review your application.', sub: 'Make sure everything looks right before submitting.' }]
  }
];

// ---------- State ----------
const params = new URLSearchParams(location.search);
const acctType = params.get('account-type') || 'asaan';
document.getElementById('acctName').textContent = ACCOUNT_NAMES[acctType] || ACCOUNT_NAMES.asaan;

const state = { step: 0, q: -1, answers: {} };   // q = -1 means intro splash
const screen = document.getElementById('screen');

// ---------- Stepper ----------
function renderStepper() {
  document.getElementById('stepper').innerHTML = STEPS.map((s, i) => `
    <div class="step-item ${i < state.step ? 'done' : ''} ${i === state.step ? 'active' : ''}">
      <span class="num">${i < state.step ? '' : i + 1}</span>
      <span class="lbl">${s.label}</span>
    </div>
    ${i < STEPS.length - 1 ? `<span class="chev">${IC.chevR}</span>` : ''}`).join('');
  document.querySelectorAll('.step-item.done .num').forEach(n => n.innerHTML = IC.check);
}

// ---------- Pakistan skyline ----------
const SKYLINE = `<div class="skyline"><svg viewBox="0 0 1440 220" preserveAspectRatio="xMidYMax meet" xmlns="http://www.w3.org/2000/svg">
<path d="M0 220 V150 h40 v-18 h18 v18 h34 V120 h50 v100 Z"/>
<path d="M150 220 V110 h8 l18 -40 l18 40 h8 V110 h40 v110 Z"/>
<!-- Faisal mosque style -->
<path d="M250 220 V140 q60 -70 120 0 V220 Z"/>
<path d="M300 90 l10 -30 l10 30 Z M305 72 h10 v12 h-10 Z"/>
<rect x="250" y="130" width="6" height="90"/><rect x="364" y="130" width="6" height="90"/>
<!-- buildings -->
<path d="M400 220 V120 h70 v100 Z M420 130 h10 v10 h-10 Z M445 130 h10 v10 h-10 Z"/>
<path d="M490 220 V90 h55 v130 Z"/>
<!-- Minar-e-Pakistan tower -->
<path d="M620 220 V60 h20 v160 Z M615 60 l15 -40 l15 40 Z M600 220 V150 q30 -20 60 0 V220 Z"/>
<!-- domed building -->
<path d="M700 220 V150 q50 -60 100 0 V220 Z"/>
<path d="M745 95 l5 -20 l5 20 Z"/>
<rect x="700" y="145" width="6" height="75"/><rect x="794" y="145" width="6" height="75"/>
<path d="M850 220 V110 h60 v110 Z M865 122 h12 v12 h-12 Z M885 122 h12 v12 h-12 Z"/>
<path d="M930 220 V80 h45 v140 Z"/>
<path d="M990 220 V130 h70 v90 Z"/>
<!-- fort (Badshahi) -->
<path d="M1080 220 V150 h8 v-14 h8 v14 h10 v-14 h8 v14 h10 v-14 h8 v14 h10 v-14 h8 v14 h8 V220 Z"/>
<path d="M1200 220 V150 q50 -60 100 0 V220 Z"/>
<path d="M1245 100 l5 -22 l5 22 Z"/>
<rect x="1200" y="145" width="6" height="75"/><rect x="1294" y="145" width="6" height="75"/>
<path d="M1330 220 V120 h50 v100 Z M1390 220 V140 h50 v80 Z"/>
</svg></div>`;

// ---------- Render ----------
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function render(keepScroll) {
  renderStepper();
  const step = STEPS[state.step];
  if (state.q === -1) renderIntro(step);
  else renderQuestion(step, step.questions[state.q]);
  if (!keepScroll) window.scrollTo(0, 0);
}

function renderIntro(step) {
  screen.innerHTML = `
    <section class="intro">
      ${SKYLINE}
      <div class="inner">
        <div class="badge">${step.icon}</div>
        <h2>${step.intro.title}</h2>
        <p>${step.intro.sub}</p>
        <div class="btns">
          <button class="btn btn-white" id="beginBtn">${step.intro.cta}</button>
          <button class="btn btn-outline" id="tutorialBtn">Tutorial</button>
        </div>
      </div>
    </section>`;
  document.getElementById('beginBtn').onclick = () => { state.q = 0; render(); };
  document.getElementById('tutorialBtn').onclick = () => alert('Tutorial video would play here (test build).');
}

function renderQuestion(step, q) {
  const n = state.q + 1, total = step.questions.length;
  let body = '';
  if (q.type === 'fields') body = renderFields(q);
  else if (q.type === 'pcards') body = renderPcards(q);
  else if (q.type === 'choice') body = renderChoice(q);
  else if (q.type === 'branch') body = renderBranch(q);
  else if (q.type === 'upload') body = renderUpload(q);
  else if (q.type === 'review') body = renderReview();

  const isLast = state.step === STEPS.length - 1;
  const nextLabel = q.type === 'review' ? 'Submit Application' : (state.q === total - 1 && step.key === 'preferences' ? 'Continue' : 'Next');

  screen.innerHTML = `
    <div class="qwrap">
      <div class="qcount">Question <b>${n}</b> / ${total}</div>
      <h1 class="qtitle">${q.title}</h1>
      ${q.sub ? `<p class="qsub">${q.sub}</p>` : ''}
      ${body}
      ${q.note ? `<p class="note">${q.note}</p>` : ''}
      <div class="qnav">
        ${(state.step === 0 && state.q === 0) ? '' : `<button class="btn-back" id="backBtn">${IC.back} Back</button>`}
        ${q.type === 'review' ? '' : `<button class="btn btn-primary btn-arrow" id="nextBtn">${nextLabel} ${IC.arrow}</button>`}
      </div>
    </div>`;

  wireQuestion(q);
  const back = document.getElementById('backBtn');
  if (back) back.onclick = goBack;
  const next = document.getElementById('nextBtn');
  if (next) next.onclick = () => { if (validate(q)) goNext(); };
}

// ----- field renderers -----
function renderFields(q) {
  return `<div class="qfields">` + q.fields.map(f => {
    const val = state.answers[f.key] || '';
    if (f.type === 'select') {
      return `<div class="field" data-key="${f.key}" data-required="${!!f.required}">
        <label>${f.label}</label>
        <div class="select" data-key="${f.key}">
          <div class="select-display ${val ? '' : 'placeholder'}">${val || 'Select one'} ${IC.chev}</div>
          <div class="select-menu">${f.options.map(o => `<div class="opt ${o === val ? 'sel' : ''}" data-v="${o}">${o}</div>`).join('')}</div>
        </div>
        <div class="err">This field is required.</div>
      </div>`;
    }
    if (f.type === 'textarea') {
      return `<div class="field" data-key="${f.key}" data-required="${!!f.required}">
        <label>${f.label}</label><textarea placeholder="${f.placeholder || ''}">${esc(val)}</textarea>
        <div class="err">This field is required.</div></div>`;
    }
    const checkbox = f.checkbox ? `<label class="checkrow"><input type="checkbox" data-nocheck="${f.key}" ${state.answers[f.key + '__none'] ? 'checked' : ''}> ${f.checkbox}</label>` : '';
    return `<div class="field" data-key="${f.key}" data-required="${!!f.required}" data-type="${f.type}">
      <label>${f.label}</label>
      <input type="text" inputmode="${f.type === 'tel' || f.type === 'cnic' ? 'numeric' : 'text'}" placeholder="${f.placeholder || ''}" value="${esc(val)}" ${state.answers[f.key + '__none'] ? 'disabled' : ''}>
      ${checkbox}
      <div class="err">Please enter a valid value.</div>
    </div>`;
  }).join('') + `</div>`;
}

function renderPcards(q) {
  return `<div class="pcards">` + q.cards.map(c => {
    const sel = state.answers[q.key] === c.v ? 'sel' : '';
    const logo = c.visual ? `<div class="pc-card-visual"></div>` : `<div class="pc-logo">${c.logo}</div>`;
    return `<div class="pcard ${sel}" data-key="${q.key}" data-v="${c.v}">
      <span class="tick">${IC.tick}</span>
      ${logo}
      <h4>${c.name}</h4>
      <ul>${c.feats.map(f => `<li>${IC.tick.replace('stroke-width="3"', 'stroke-width="2.4"')} ${f}</li>`).join('')}</ul>
    </div>`;
  }).join('') + `</div>`;
}

function renderChoice(q) {
  return `<div class="choices" style="margin-top:40px" data-key="${q.key}">` +
    q.options.map(o => `<div class="choice ${state.answers[q.key] === o ? 'sel' : ''}" data-v="${o}">${o}</div>`).join('') + `</div>`;
}

function renderBranch(q) {
  const by = state.answers.branchBy || 'city';
  return `<div class="qfields" style="max-width:460px;margin-top:40px">
    <div class="radio-row">
      <label class="radio-opt"><input type="radio" name="branchBy" value="city" ${by === 'city' ? 'checked' : ''}> Search by City</label>
      <label class="radio-opt"><input type="radio" name="branchBy" value="name" ${by === 'name' ? 'checked' : ''}> Search by Branch Name</label>
    </div>
    <div class="field" data-key="branchCity" data-required="true">
      <label>City</label>
      <div class="select" data-key="branchCity">
        <div class="select-display ${state.answers.branchCity ? '' : 'placeholder'}">${state.answers.branchCity || 'Select one'} ${IC.chev}</div>
        <div class="select-menu">${CITIES.map(o => `<div class="opt ${o === state.answers.branchCity ? 'sel' : ''}" data-v="${o}">${o}</div>`).join('')}</div>
      </div><div class="err">Please select a city.</div>
    </div>
    <div class="field" data-key="branchName" data-required="true">
      <label>Branch Name</label>
      <div class="select" data-key="branchName">
        <div class="select-display ${state.answers.branchName ? '' : 'placeholder'}">${state.answers.branchName || 'Select one'} ${IC.chev}</div>
        <div class="select-menu">${BRANCHES.map(o => `<div class="opt ${o === state.answers.branchName ? 'sel' : ''}" data-v="${o}">${o}</div>`).join('')}</div>
      </div><div class="err">Please select a branch.</div>
    </div>
    ${state.answers.branchName ? `<p class="note">You have selected <b style="color:var(--ubl-blue)">${state.answers.branchName}</b>.</p>` : ''}
  </div>`;
}

function renderUpload(q) {
  const f = state.answers[q.key];
  const icon = q.kind === 'selfie' ? IC.cam : IC.upload;
  return `<div style="max-width:480px;margin-top:40px">
    <div class="upload ${f ? 'filled' : ''}" data-key="${q.key}">
      <div class="uic">${f ? IC.check : icon}</div>
      <div class="utitle">${f ? f : (q.kind === 'selfie' ? 'Open camera / choose a photo' : 'Click to upload or drag & drop')}</div>
      <div class="usub">${f ? 'Tap to replace' : 'JPG or PNG, up to 5 MB'}</div>
      <input type="file" accept="image/*">
    </div>
  </div>`;
}

function renderReview() {
  const a = state.answers;
  const row = (k, v) => v ? `<div class="rrow"><dt>${k}</dt><dd>${esc(v)}</dd></div>` : '';
  const sec = (title, stepIdx, rows) => `<div class="review-sec"><h4>${title} <a href="#" data-edit="${stepIdx}">Edit</a></h4><dl>${rows}</dl></div>`;
  return `<div class="review-group">
    ${sec('Preferences', 0,
      row('Banking', a.banking === 'ameen' ? 'Ameen (Islamic)' : a.banking ? 'Conventional' : '') +
      row('Debit Card', a.debitcard) + row('Cheque Book', a.chequebook) + row('Branch', a.branchName))}
    ${sec('Personal Details', 1,
      row('Full Name', a.fullName) + row('Identity Card No.', a.cnic) + row('Date of Birth', a.dob) +
      row('Mobile', a.mobile) + row('Email', a.email) + row('City', a.city))}
    ${sec('Verification', 2,
      row('ID Front', a.idFront ? '✓ Uploaded' : '') + row('ID Back', a.idBack ? '✓ Uploaded' : '') + row('Selfie', a.selfie ? '✓ Uploaded' : ''))}
    ${sec('Additional Details', 3,
      row('Occupation', a.occupation) + row('Purpose', a.purpose) + row('Monthly Credit', a.income) + row('Next of Kin', a.kinName))}
    ${sec('Account Details', 4,
      row('Currency', a.currency) + row('SMS Alerts', a.smsAlerts) + row('E-Statements', a.estatement))}
    <label class="terms"><input type="checkbox" id="agree"> I confirm the information above is correct and I agree to the <a href="#">Terms &amp; Conditions</a> and <a href="#">Privacy Policy</a>.</label>
    <div class="qnav">
      <button class="btn-back" id="backBtn">${IC.back} Back</button>
      <button class="btn btn-primary btn-arrow" id="submitBtn">Submit Application ${IC.arrow}</button>
    </div>
  </div>`;
}

// ----- wiring -----
function wireQuestion(q) {
  // custom selects
  screen.querySelectorAll('.select').forEach(sel => {
    const disp = sel.querySelector('.select-display');
    disp.onclick = e => { e.stopPropagation(); closeSelects(sel); sel.classList.toggle('open'); };
    sel.querySelectorAll('.opt').forEach(opt => opt.onclick = () => {
      state.answers[sel.dataset.key] = opt.dataset.v;
      sel.classList.remove('open');
      if (sel.dataset.key === 'branchName') render(); else {
        disp.classList.remove('placeholder');
        disp.childNodes[0].textContent = opt.dataset.v + ' ';
        sel.closest('.field')?.classList.remove('invalid');
        sel.querySelectorAll('.opt').forEach(o => o.classList.toggle('sel', o === opt));
      }
    });
  });
  // text/textarea inputs
  screen.querySelectorAll('.field input[type=text], .field textarea').forEach(inp => {
    const field = inp.closest('.field');
    inp.oninput = () => {
      let v = inp.value;
      if (field.dataset.type === 'cnic') { v = v.replace(/\D/g, '').slice(0, 13); inp.value = v; }
      if (field.dataset.type === 'tel') { v = v.replace(/[^\d\s]/g, '').slice(0, 15); inp.value = v; }
      state.answers[field.dataset.key] = v;
      field.classList.remove('invalid');
    };
  });
  // date masking DD/MM/YYYY
  screen.querySelectorAll('.field[data-type=date] input, .field').forEach(() => {});
  screen.querySelectorAll('.field').forEach(field => {
    if (field.dataset.key && isDateField(field)) {
      const inp = field.querySelector('input');
      if (!inp) return;
      inp.oninput = () => {
        let d = inp.value.replace(/\D/g, '').slice(0, 8);
        let out = d;
        if (d.length > 4) out = d.slice(0, 2) + '/' + d.slice(2, 4) + '/' + d.slice(4);
        else if (d.length > 2) out = d.slice(0, 2) + '/' + d.slice(2);
        inp.value = out;
        state.answers[field.dataset.key] = out;
        field.classList.remove('invalid');
      };
    }
  });
  // no-expiry checkbox
  screen.querySelectorAll('input[data-nocheck]').forEach(cb => cb.onchange = () => {
    const key = cb.dataset.nocheck;
    state.answers[key + '__none'] = cb.checked;
    const inp = cb.closest('.field').querySelector('input[type=text]');
    inp.disabled = cb.checked; if (cb.checked) { inp.value = ''; state.answers[key] = ''; }
  });
  // pcards
  screen.querySelectorAll('.pcard').forEach(card => card.onclick = () => {
    state.answers[card.dataset.key] = card.dataset.v;
    screen.querySelectorAll(`.pcard[data-key="${card.dataset.key}"]`).forEach(c => c.classList.toggle('sel', c === card));
  });
  // choice
  screen.querySelectorAll('.choices .choice').forEach(ch => ch.onclick = () => {
    const box = ch.closest('.choices');
    state.answers[box.dataset.key] = ch.dataset.v;
    box.querySelectorAll('.choice').forEach(c => c.classList.toggle('sel', c === ch));
  });
  // branch radios
  screen.querySelectorAll('input[name=branchBy]').forEach(r => r.onchange = () => { state.answers.branchBy = r.value; });
  // upload
  screen.querySelectorAll('.upload').forEach(up => {
    const input = up.querySelector('input');
    up.onclick = () => input.click();
    input.onchange = () => { if (input.files[0]) { state.answers[up.dataset.key] = input.files[0].name; render(); } };
  });
  // review edit + submit
  screen.querySelectorAll('[data-edit]').forEach(a => a.onclick = e => { e.preventDefault(); state.step = +a.dataset.edit; state.q = 0; render(); });
  const sub = document.getElementById('submitBtn');
  if (sub) sub.onclick = submit;
  const back2 = document.getElementById('backBtn');
  if (back2) back2.onclick = goBack;
}

function isDateField(field) {
  const q = STEPS[state.step].questions[state.q];
  if (q.type !== 'fields') return false;
  const f = q.fields.find(x => x.key === field.dataset.key);
  return f && f.type === 'date';
}

function closeSelects(except) { screen.querySelectorAll('.select.open').forEach(s => { if (s !== except) s.classList.remove('open'); }); }
document.addEventListener('click', () => closeSelects(null));

// ----- validation -----
function validate(q) {
  let ok = true;
  if (q.type === 'fields') {
    q.fields.forEach(f => {
      if (!f.required) return;
      if (f.checkbox && state.answers[f.key + '__none']) return;
      const field = screen.querySelector(`.field[data-key="${f.key}"]`);
      let v = state.answers[f.key];
      if (!v) { invalid(field); ok = false; return; }
      if (f.type === 'cnic' && v.length !== 13) { invalid(field, 'Identity Card number must be 13 digits.'); ok = false; }
      if (f.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { invalid(field, 'Please enter a valid email.'); ok = false; }
      if (f.type === 'date' && !/^\d{2}\/\d{2}\/\d{4}$/.test(v)) { invalid(field, 'Use DD/MM/YYYY.'); ok = false; }
    });
  } else if (q.type === 'pcards' || q.type === 'choice') {
    if (!state.answers[q.key]) { toast('Please make a selection to continue.'); ok = false; }
  } else if (q.type === 'branch') {
    if (!state.answers.branchCity) { invalid(screen.querySelector('.field[data-key=branchCity]')); ok = false; }
    if (!state.answers.branchName) { invalid(screen.querySelector('.field[data-key=branchName]')); ok = false; }
  } else if (q.type === 'upload') {
    if (!state.answers[q.key]) { toast('Please upload a file to continue.'); ok = false; }
  }
  return ok;
}
function invalid(field, msg) { if (!field) return; field.classList.add('invalid'); if (msg) { const e = field.querySelector('.err'); if (e) e.textContent = msg; } }

let toastTimer;
function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.style.cssText = 'position:fixed;left:50%;bottom:30px;transform:translateX(-50%);background:#d64545;color:#fff;padding:12px 22px;border-radius:30px;font-size:14px;z-index:999;box-shadow:0 8px 24px rgba(0,0,0,.2)'; document.body.appendChild(t); }
  t.textContent = msg; t.style.opacity = '1';
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.style.opacity = '0', 2200);
}

// ----- navigation -----
function goNext() {
  const step = STEPS[state.step];
  if (state.q < step.questions.length - 1) state.q++;
  else if (state.step < STEPS.length - 1) { state.step++; state.q = -1; }
  render();
}
function goBack() {
  if (state.q > 0) state.q--;
  else if (state.q === 0) state.q = -1;
  else if (state.step > 0) { state.step--; state.q = STEPS[state.step].questions.length - 1; }
  render();
}

function submit() {
  if (!document.getElementById('agree').checked) { toast('Please accept the Terms & Conditions.'); return; }
  const ref = 'ADA-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  document.querySelector('.stepper').style.display = 'none';
  state.submitted = true;
  screen.innerHTML = `<div class="success">
    <div class="big-check">${IC.check}</div>
    <h2>Application Submitted!</h2>
    <p>Thank you, ${esc(state.answers.fullName) || 'applicant'}. Your ${ACCOUNT_NAMES[acctType]} application has been received.</p>
    <p>We'll verify your details and notify you on <b>${esc(state.answers.mobile) || 'your mobile'}</b> and <b>${esc(state.answers.email) || 'your email'}</b>.</p>
    <div class="ref">Reference: ${ref}</div>
    <div><a href="index.html" class="btn btn-primary">Back to Home</a></div>
    <p style="margin-top:24px;font-size:13px;color:#9aa4ad">This is a local test build — no application was actually submitted and no data left your browser.</p>
  </div>`;
  window.scrollTo(0, 0);
}

// ---------- boot ----------
render();
