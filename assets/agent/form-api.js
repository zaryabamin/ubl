/* ===========================================================
   FormAPI — lets Ayesha read and drive the account opening form.
   Uses the form's own state + render(); every call returns a plain
   object describing what happened, which is sent back to the model.
   =========================================================== */
(() => {
  const strip = s => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  // Short names for answers whose question title is a whole sentence.
  const SHORT = {
    banking: 'Banking Type', debitcard: 'Debit Card', chequebook: 'Cheque Book', branchCity: 'Branch City',
    branchName: 'Branch Name', idFront: 'ID Card (Front)', idBack: 'ID Card (Back)', selfie: 'Live Selfie',
    smsAlerts: 'SMS & Email Alerts', estatement: 'E-Statements'
  };
  // Fields the customer types freely: these must be read back and confirmed.
  const TYPED = ['text', 'textarea', 'cnic', 'date', 'tel', 'email'];

  // ---- Index of every answerable field: key -> definition
  const FIELDS = {};
  STEPS.forEach((s, step) => s.questions.forEach((q, qi) => {
    const add = (key, kind, extra) => FIELDS[key] = { key, kind, step, q: qi, required: true, label: SHORT[key] || strip(q.title), ...extra };
    if (q.type === 'fields') q.fields.forEach(f => add(f.key, f.type, { label: f.label, required: !!f.required, options: f.options, format: f.placeholder, noExpiry: !!f.checkbox }));
    if (q.type === 'pcards') add(q.key, 'card', { options: q.cards.map(c => c.name), cards: q.cards });
    if (q.type === 'choice') add(q.key, 'choice', { options: q.options });
    if (q.type === 'branch') { add('branchCity', 'select', { options: CITIES }); add('branchName', 'select', { options: BRANCHES }); }
    if (q.type === 'upload') add(q.key, 'upload');
  }));

  const fieldsOf = q => Object.values(FIELDS).filter(f => f.step === state.step && f.q === STEPS[state.step].questions.indexOf(q));
  const current = () => (state.q < 0 ? null : STEPS[state.step].questions[state.q]);
  const filled = f => !!(state.answers[f.key] || state.answers[f.key + '__none']);
  const isComplete = q => fieldsOf(q).every(f => !f.required || filled(f));

  function display(f) {
    if (state.answers[f.key + '__none']) return 'No expiry';
    const v = state.answers[f.key];
    if (!v) return '';
    if (f.kind === 'card') return f.cards.find(c => c.v === v)?.name || v;
    if (f.kind === 'upload') return 'uploaded';
    return v;
  }

  // ---- Value checking / normalisation: returns { value } or { error }
  function pickOption(options, raw) {
    const v = norm(raw);
    return options.find(o => norm(o) === v) || options.find(o => norm(o).startsWith(v))
      || options.find(o => norm(o).includes(v)) || options.find(o => v.includes(norm(o))) || null;
  }
  function toDate(raw) {
    const s = String(raw).trim(); let d, m, y, r;
    if ((r = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) [, y, m, d] = r;
    else if ((r = s.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4})$/))) [, d, m, y] = r;
    else return null;
    const t = new Date(+y, m - 1, +d);
    if (t.getFullYear() !== +y || t.getMonth() !== m - 1 || t.getDate() !== +d) return null;
    return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
  }
  function check(f, raw) {
    const s = String(raw ?? '').trim();
    switch (f.kind) {
      case 'upload': return { error: `${f.label} must be uploaded by the customer: ask them to click the highlighted box.` };
      case 'select': case 'choice': {
        const o = pickOption(f.options, s);
        return o ? { value: o } : { error: `"${s}" is not an option for ${f.label}. Options: ${f.options.join(', ')}` };
      }
      case 'card': {
        const c = f.cards.find(c => norm(c.v) === norm(s) || norm(c.name) === norm(s))
          || f.cards.find(c => norm(s).includes(norm(c.v)) || norm(c.name).includes(norm(s)));
        return c ? { value: c.v } : { error: `"${s}" is not an option for ${f.label}. Options: ${f.options.join(', ')}` };
      }
      case 'cnic': {
        const d = s.replace(/\D/g, '');
        return d.length === 13 ? { value: d } : { error: `Identity Card Number must be 13 digits; got ${d.length}. Ask again.` };
      }
      case 'date': {
        if (f.noExpiry && /^(none|no expiry|lifetime)$/i.test(s)) return { value: '', none: true };
        const d = toDate(s);
        return d ? { value: d } : { error: `${f.label}: "${s}" is not a valid date (DD/MM/YYYY).` };
      }
      case 'tel': {
        let d = s.replace(/\D/g, '');
        if (d.startsWith('92')) d = '0' + d.slice(2);
        return /^03\d{9}$/.test(d) ? { value: d.slice(0, 4) + ' ' + d.slice(4) } : { error: `Mobile number must be 11 digits starting with 03; got "${d}".` };
      }
      case 'email': {
        const e = s.replace(/\s+/g, '').toLowerCase();
        return /^[^@]+@[^@]+\.[^@]+$/.test(e) ? { value: e } : { error: `"${s}" is not a valid email address.` };
      }
      default: return s ? { value: s } : { error: `${f.label} cannot be empty.` };
    }
  }

  // ---- The one thing Ayesha should ask next, based purely on the screen.
  function askNow() {
    if (state.submitted) return 'Nothing — the application is submitted. Thank the customer.';
    const q = current();
    if (!q) return 'Section intro screen: call next_question to open the first question.';
    if (q.type === 'review') return 'Final review: ask the customer to check everything, tick the Terms box and press "Submit Application" themselves.';
    const todo = fieldsOf(q).filter(f => !filled(f));
    if (!todo.length) return 'Everything on this screen is filled: call next_question.';
    if (q.type === 'upload') return `Ask the customer to click the highlighted box and upload: ${strip(q.title)}`;
    return `${strip(q.title)} — still needed: ` + todo.map(f => f.label + (f.kind === 'card' ? ` (${f.cards.map(c => c.name).join(' / ')})` : f.options && f.options.length <= 8 ? ` (${f.options.join(' / ')})` : '')).join('; ');
  }

  // Opening Ayesha starts the form if it is still on the very first intro screen.
  function start() {
    if (!state.submitted && state.q === -1) { state.q = 0; render(); }
  }

  // ---- What is on screen right now
  function getState() {
    if (state.submitted) return { screen: 'submitted', askNow: askNow() };
    const step = STEPS[state.step], q = current();
    const out = { askNow: askNow(), section: `${state.step + 1}/${STEPS.length} ${step.label}` };
    if (!q) { out.screen = 'section intro'; return out; }
    out.screen = q.type === 'review' ? 'final review' : 'question';
    out.question = `${state.q + 1}/${step.questions.length}: ${strip(q.title)}`;
    out.fields = fieldsOf(q).map(f => ({
      key: f.key, label: f.label, kind: f.kind, required: f.required, value: display(f),
      ...(f.kind === 'card' ? { options: f.cards.map(c => `${c.name} (${c.feats.join('; ')})`) } : f.options ? { options: f.options } : {}),
      ...(f.noExpiry ? { note: 'value may be "none" if the card has no expiry' } : {})
    }));
    if (q.type === 'review') out.note = 'The customer must tick the Terms box and press Submit Application themselves.';
    return out;
  }

  // ---- Fill fields of the question on screen
  function fill(list) {
    const done = [], errors = [];
    let onScreen = false;
    for (const { key, value, confirmed } of list || []) {
      const f = FIELDS[key];
      if (!f) { errors.push(`Unknown field "${key}".`); continue; }
      // Only the page on screen can be filled — this keeps Ayesha on the current step.
      if (f.step !== state.step || f.q !== state.q) {
        errors.push(`"${key}" is NOT on the current screen, so it was not filled. Do not ask about it now. Current screen needs: ${askNow()}`);
        continue;
      }
      if (TYPED.includes(f.kind) && confirmed !== true) {
        errors.push(`${f.label} NOT filled: read "${value}" back to the customer, get a clear yes, then fill again with confirmed=true.`);
        continue;
      }
      const r = check(f, value);
      if (r.error) { errors.push(r.error); continue; }
      state.answers[f.key] = r.value;
      state.answers[f.key + '__none'] = !!r.none;
      done.push(`${f.key} = ${display(f)}`);
      if (f.step === state.step && f.q === state.q) onScreen = true;
    }
    if (onScreen) { render(true); flashAll(done.map(d => d.split(' = ')[0])); }
    const q = current();
    return { filled: done, errors, questionComplete: !!(q && q.type !== 'review' && isComplete(q)), askNow: askNow() };
  }

  // ---- Navigation
  function next(reviewed) {
    if (state.submitted) return { error: 'Already submitted.' };
    if (state.q === -1) { state.q = 0; render(); return { ok: true, now: getState() }; }
    const q = current();
    if (q.type === 'review') return { error: 'Final screen: the customer must tick the Terms box and press Submit themselves.' };
    if (!isComplete(q) || !validate(q)) {
      return { error: 'This question is not complete.', missing: fieldsOf(q).filter(f => f.required && !filled(f)).map(f => f.label) };
    }
    const lastInSection = state.q === STEPS[state.step].questions.length - 1;
    if (lastInSection) {
      if (!reviewed) {
        const summary = Object.values(FIELDS).filter(f => f.step === state.step).map(f => `${f.label}: ${display(f) || '(empty)'}`);
        showReview(STEPS[state.step].label, summary);
        return { reviewNeeded: true, section: STEPS[state.step].label, summary,
          instruction: 'Read these answers back briefly, ask if everything is correct, fix anything, then call next_question with reviewed=true.' };
      }
      state.step++; state.q = 0;
    } else state.q++;
    // Skip questions in this section that were already answered earlier.
    while (state.q < STEPS[state.step].questions.length - 1 && current().type !== 'review' && isComplete(current())) state.q++;
    render();
    return { ok: true, now: getState() };
  }

  function back() {
    if (state.submitted) return { error: 'Already submitted.' };
    if (state.q > 0) state.q--;
    else if (state.step > 0) { state.step--; state.q = STEPS[state.step].questions.length - 1; }
    else state.q = -1;
    render();
    return { ok: true, now: getState() };
  }

  function goTo(target) {
    if (state.submitted) return { error: 'Already submitted.' };
    const f = FIELDS[target];
    const step = f ? f.step : STEPS.findIndex(s => norm(s.key) === norm(target) || norm(s.label).includes(norm(target)));
    if (step < 0) return { error: `Unknown section or field "${target}".` };
    state.step = step; state.q = f ? f.q : 0;
    render();
    if (f) highlight(f.key);
    return { ok: true, now: getState() };
  }

  // ---- Visual helpers
  function elementFor(key) {
    if (key === 'terms') return screen.querySelector('.terms');
    if (key === 'submit') return document.getElementById('submitBtn');
    return screen.querySelector(`.field[data-key="${key}"]`) || screen.querySelector(`.pcard[data-key="${key}"]`)?.parentElement
      || screen.querySelector(`.choices[data-key="${key}"]`) || screen.querySelector(`.upload[data-key="${key}"]`);
  }
  let focused;
  function highlight(key) {
    focused?.classList.remove('agent-focus');
    focused = key ? elementFor(key) : null;
    if (!focused) return key ? { error: `"${key}" is not on screen.` } : { ok: true };
    focused.classList.add('agent-focus');
    focused.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return { ok: true };
  }
  function flashAll(keys) {
    keys.forEach(k => { const el = elementFor(k); if (el) { el.classList.remove('agent-filled'); void el.offsetWidth; el.classList.add('agent-filled'); } });
  }
  let showReview = () => { };

  // ---- Helpers for the conversation controller (agent.js)
  // Validate + normalise a value without saving it: { value, display } or { error }.
  function checkValue(key, raw) {
    const f = FIELDS[key];
    if (!f) return { error: `Unknown field ${key}` };
    const r = check(f, raw);
    if (r.error) return r;
    const display = r.none ? 'No expiry' : f.kind === 'card' ? f.cards.find(c => c.v === r.value).name : r.value;
    return { value: r.value, none: !!r.none, display };
  }
  // The current screen's fields, for understanding the customer's answer.
  function screenFields() {
    const q = current();
    return q ? fieldsOf(q).map(f => ({
      key: f.key, label: f.label, kind: f.kind, required: f.required, value: display(f),
      ...(f.kind === 'card' ? { options: f.cards.map(c => c.name) } : f.options ? { options: f.options } : {}),
      ...(f.noExpiry ? { note: 'may be "none" if the card has no expiry' } : {})
    })) : [];
  }
  const fieldInfo = key => FIELDS[key] ? { key, label: FIELDS[key].label, kind: FIELDS[key].kind, required: FIELDS[key].required, typed: TYPED.includes(FIELDS[key].kind) } : null;
  // Answers given so far (for "I want to change my …").
  const answered = () => Object.values(FIELDS).filter(filled).map(f => ({ key: f.key, label: f.label, value: display(f) }));
  const screenType = () => state.submitted ? 'submitted' : !current() ? 'intro' : current().type;

  // ---- Words the speech-to-text should expect: every option in the form
  // plus common Pakistani names (it biases recognition towards these).
  function vocabulary() {
    const words = new Set(['UBL', 'Ameen', 'Islamic', 'Conventional', 'Shariah', 'CNIC', 'debit card', 'cheque book', 'e-statement', 'Asaan', 'Roshan', 'Urooj', 'Mukammal', 'Freelancer', 'gmail', 'hotmail', 'yahoo', 'outlook', 'dot com']);
    Object.values(FIELDS).forEach(f => (f.options || []).forEach(o => words.add(o)));
    // Common Roman Urdu answers (the customer may speak Urdu).
    ['haan', 'ji', 'bilkul', 'theek hai', 'sahi', 'nahi', 'galat', 'shukriya', 'madad', 'chahiye', 'mera naam', 'Islami',
      'shanakhti card', 'walid', 'walida', 'shohar', 'shehar', 'tareekh', 'koi expiry nahi'].forEach(w => words.add(w));
    BRANCHES.forEach(b => words.add(b.replace(/^UBL (Ameen )?| - \d+$/g, '')));
    ['Muhammad', 'Ahmed', 'Ali', 'Hassan', 'Hussain', 'Usman', 'Umar', 'Bilal', 'Hamza', 'Saad', 'Zaryab', 'Amin', 'Imran', 'Faisal', 'Kamran', 'Asif',
      'Fatima', 'Ayesha', 'Zainab', 'Maryam', 'Sana', 'Hira', 'Amna', 'Khadija', 'Iqra', 'Mahnoor',
      'Khan', 'Malik', 'Butt', 'Chaudhry', 'Qureshi', 'Siddiqui', 'Iqbal', 'Raza', 'Shah', 'Sheikh', 'Awan', 'Javed', 'Akhtar', 'Rehman', 'Hashmi'].forEach(w => words.add(w));
    return [...words].slice(0, 300);
  }

  window.FormAPI = {
    getState, askNow, start, fill, next, back, goTo, highlight, vocabulary,
    checkValue, screenFields, fieldInfo, answered, screenType,
    position: () => `${state.step}:${state.q}:${!!state.submitted}`,   // which screen is showing
    onReview: fn => { showReview = fn; }
  };
})();
