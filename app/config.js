// The pages of the read-only app. Each widget reads one key of app/data.js (see app/sources.json).
// Add a page or a widget here, or ask Claude Code to: "add a page to the app that shows ...".
(function () {
  const F = () => window.F;
  const m = (c, short) => F().money(c, { short });
  const shortName = (n) => String(n || '').replace(/ (Ltd|Limited)$/, '').replace(/^Estate of /, '');

  const LABELS = {
    limitation_soon: 'Limitation date', key_date_missed: 'Date missed', undertaking_overdue: 'Undertaking overdue',
    key_date_week: 'Date this week', cdd_missing: 'No CDD', record_gap: 'Client care gap', over_estimate: 'Over estimate',
    invoice_overdue: 'Invoice overdue', wip_stale: 'Unbilled work', invoice_draft: 'Bill never sent', matter_quiet: 'Matter gone quiet',
    practising_cert: 'Practising certificate', task_overdue: 'Task overdue',
  };
  const RED = ['limitation_soon', 'key_date_missed', 'undertaking_overdue', 'cdd_missing'];
  const AMBER = ['key_date_week', 'record_gap', 'over_estimate', 'invoice_overdue', 'wip_stale', 'practising_cert'];
  const passCount = (D) => D.compliance.filter((r) => !r.breaches.length).length;
  const dateTone = (r) => (r.days_left < 0 ? 'red' : r.kind === 'limitation' || r.days_left <= 7 ? 'amber' : '');
  const pending = (D) => D.keydates.filter((k) => !k.completed_on);
  const lockupTotal = (D) => Number(D.stats.wip_cents) + Number(D.stats.debtors_cents);
  const typeLabel = (t) => t.charAt(0).toUpperCase() + t.slice(1);

  window.APP = {
    product: 'Matters for Claude Code',
    demoFirm: 'Harbourview Law',
    customise: [
      'Add a fixed fee for every conveyancing matter and show it against the work done.',
      'Warn me thirty days before any limitation date, not twenty-one.',
      'Add a page to the app that shows each lawyer their own week.',
    ],
    pages: [
      {
        id: 'today', title: 'Today', icon: 'home', heading: 'This week',
        sub: (D) => `${D.attention.length} things want a decision. ${pending(D).filter((k) => k.days_left >= 0 && k.days_left <= 7).length} key dates in the next 7 days, ${pending(D).filter((k) => k.days_left < 0).length} missed.`,
        count: (D) => ({ n: D.attention.length, tone: 'red' }),
        ask: ['What needs my attention this week?', 'Write the Monday review.', 'Which matters have gone quiet, and who owns them?', 'Run a conflict check on Quays Hospitality Group.'],
        widgets: [
          {
            type: 'kpis', bare: true, items: [
              { label: 'Work in progress', value: (D) => m(D.stats.wip_cents), sub: () => 'on the clock, not yet billed' },
              { label: 'Owed to the firm', value: (D) => m(D.stats.debtors_cents), sub: (D) => `${D.debtors.length} invoices out, ${D.debtors.filter((x) => x.days_overdue > 0).length} overdue`, tone: (D) => (D.debtors.some((x) => x.days_overdue > 30) ? 'amber' : '') },
              { label: 'Lockup', value: (D) => m(lockupTotal(D)), sub: () => 'work done, cash not in' },
              { label: 'Key dates, 30 days', value: (D) => String(D.stats.key_dates_30d), sub: (D) => `${pending(D).filter((k) => k.days_left < 0).length} missed, ${pending(D).filter((k) => k.kind === 'limitation').length} limitation`, tone: (D) => (pending(D).some((k) => k.days_left < 0) ? 'red' : '') },
              { label: 'Undertakings', value: (D) => String(D.stats.open_undertakings), sub: (D) => `open, ${D.undertakings.filter((u) => !u.discharged_on && u.days_overdue > 0).length} overdue`, tone: (D) => (D.undertakings.some((u) => !u.discharged_on && u.days_overdue > 0) ? 'red' : '') },
              { label: 'Compliance', value: (D) => `${passCount(D)}/${D.compliance.length}`, sub: () => 'rules passing on the file', tone: (D) => (passCount(D) < D.compliance.length ? 'red' : 'green') },
            ],
          },
          { type: 'attention', source: 'attention', title: 'Needs a decision', note: 'Worst first', span: 7, limit: 11, labels: LABELS, red: RED, amber: AMBER, more: (D) => (D.attention.length > 11 ? `+${D.attention.length - 11} more` : '') },
          { type: 'stack', span: 5, widgets: [
            {
              type: 'list', source: (D) => pending(D).slice(0, 6), title: 'Key dates',
              row: (r, f) => ({ client: r.client, title: r.title, sub: `${r.ref} · ${r.client} · ${r.lawyer}`, right: f.date(r.due_on), rightSub: r.days_left < 0 ? `missed ${-r.days_left}d ago` : f.rel(r.days_left), tone: dateTone(r) }),
            },
            {
              type: 'list', source: (D) => D.undertakings.filter((u) => !u.discharged_on), title: 'Undertakings given',
              row: (r, f) => ({ client: r.client, title: r.undertaking, sub: `${r.ref} · to ${r.given_to} · ${r.lawyer}`, right: f.date(r.due_on), rightSub: r.days_overdue > 0 ? `${r.days_overdue}d overdue` : 'due', tone: r.days_overdue > 0 ? 'red' : '' }),
            },
          ] },
        ],
      },
      {
        id: 'matters', title: 'Matters', icon: 'board', heading: 'Matters',
        sub: (D) => `${D.matters.length} open matters across ${D.lawyers.length} fee earners, ${m(D.stats.wip_cents)} on the clock.`,
        count: (D) => ({ n: D.matters.length }),
        ask: ['Which matters are past their estimate?', 'Draft an update for Danielle Weiss.', 'Open a matter for Ken Mahoney: review of a commercial lease, estimate $3,000.', 'Who is carrying too much this month?'],
        widgets: [
          {
            type: 'kanban', source: 'matters', groupBy: 'lawyer', sum: (r) => r.wip_cents,
            columns: (D) => D.lawyers.map((l) => ({ key: l.full_name, label: l.full_name })),
            card: (r, f) => {
              const d = r.next_key_date_on ? f.daysFrom(r.next_key_date_on) : null;
              return {
                client: r.client, title: r.client, amount: m(r.wip_cents), sub: `${typeLabel(r.matter_type)} · ${r.description}`,
                chips: [
                  d != null && [d < 0 ? `Date missed ${-d}d ago` : `Next date ${f.rel(d)}`, d < 0 ? 'red' : d <= 7 ? 'amber' : ''],
                  r.over_estimate && ['Over estimate', 'red'],
                  !r.cdd_completed_on && ['No CDD', 'red'],
                  r.record_gaps > 0 && [`${r.record_gaps} client care gap${r.record_gaps > 1 ? 's' : ''}`, 'amber'],
                  r.open_undertakings > 0 && [`${r.open_undertakings} undertaking`, 'grey'],
                  r.days_since_activity > 30 && [`Quiet ${r.days_since_activity}d`, 'grey'],
                ],
                left: r.ref, right: r.estimate_cents ? `estimate ${m(r.estimate_cents)}` : `${r.days_open}d open`,
              };
            },
          },
        ],
      },
      {
        id: 'dates', title: 'Key dates', icon: 'calendar', heading: 'Key dates and undertakings',
        sub: () => 'The calendar that must not slip. A missed limitation date is the one that ends careers.',
        count: (D) => { const n = pending(D).filter((k) => k.days_left < 0 || k.days_left <= 7).length; return n ? { n, tone: pending(D).some((k) => k.days_left < 0) ? 'red' : '' } : null; },
        ask: ['What is due in the next fortnight?', 'Mark the Ormiston affidavit filed today.', 'Add a filing date on MT-1005: statement of problem due 30 October.', 'Which undertakings are open, and to whom?'],
        widgets: [
          {
            type: 'timeline', source: pending, title: 'Next 90 days', note: 'Limitation dates are the large ones', from: -14, to: 90, height: 250,
            date: (r) => r.due_on, value: (r) => (r.kind === 'limitation' ? 10 : r.kind === 'hearing' ? 6 : 4), label: (r) => shortName(r.client), inner: (r) => r.kind, client: (r) => r.client, tone: dateTone, pastLabel: 'MISSED',
            legend: [['red', 'Missed'], ['amber', 'Within 7 days, or a limitation date'], ['', 'Coming up']],
          },
          {
            type: 'table', source: pending, title: 'Every date', span: 7, client: (r) => r.client,
            columns: [
              { label: 'Due', value: (r, f) => `<span class="tag ${dateTone(r)}">${f.date(r.due_on)} · ${f.rel(r.days_left)}</span>`, html: true },
              { label: 'Kind', value: (r) => r.kind, cls: 'dim' },
              { label: 'What', value: (r) => r.title, cls: 'strong' },
              { label: 'Matter', value: (r) => `${r.ref} · ${r.client}`, cls: 'dim' },
              { label: 'Lawyer', value: (r) => r.lawyer, cls: 'dim' },
            ],
          },
          {
            type: 'list', source: 'undertakings', title: 'Undertakings register', span: 5,
            row: (r, f) => ({ client: r.client, title: r.undertaking, sub: `${r.ref} · given to ${r.given_to} on ${f.date(r.given_on)} · ${r.lawyer}`, right: r.discharged_on ? 'discharged' : f.date(r.due_on), rightSub: r.discharged_on ? f.date(r.discharged_on) : r.days_overdue > 0 ? `${r.days_overdue}d overdue` : 'open', tone: r.discharged_on ? 'green' : r.days_overdue > 0 ? 'red' : 'amber' }),
          },
        ],
      },
      {
        id: 'money', title: 'Money', icon: 'money', heading: 'Work in progress and lockup',
        sub: (D) => `${m(lockupTotal(D))} of work done that has not turned into cash: ${m(D.stats.wip_cents)} unbilled, ${m(D.stats.debtors_cents)} billed and unpaid.`,
        count: (D) => { const n = D.debtors.filter((x) => x.days_overdue > 0).length; return n ? { n, tone: 'red' } : null; },
        ask: ['Which unbilled work is going stale?', 'Draft the bill for MT-1006.', 'Who owes us money, aged?', 'What is each lawyer\'s recovery rate this quarter?'],
        widgets: [
          { type: 'bars', source: (D) => D.lockup.filter((x) => Number(x.lockup_cents) > 0), title: 'Lockup by client', note: 'Unbilled work plus unpaid bills', span: 7, label: (r) => shortName(r.client), client: (r) => r.client, value: (r) => r.lockup_cents, tone: (r) => (Number(r.debtors_cents) > 0 ? 'amber' : ''), sub: (r) => `${m(r.wip_cents)} WIP · ${m(r.debtors_cents)} owed` },
          { type: 'stack', span: 5, widgets: [
            {
              type: 'list', source: 'debtors', title: 'Invoices out',
              row: (r, f) => ({ client: r.client, title: r.client, sub: `${r.number} · ${r.ref} · issued ${f.date(r.issued_on)}`, right: m(r.total_cents), rightSub: r.days_overdue > 0 ? `${r.days_overdue}d overdue` : `due ${f.date(r.due_on)}`, tone: r.days_overdue > 30 ? 'red' : r.days_overdue > 0 ? 'amber' : 'green' }),
            },
            {
              type: 'list', source: (D) => D.wip.filter((w) => w.oldest_unbilled_days > 0).slice(0, 5), title: 'Oldest unbilled work',
              row: (r) => ({ client: r.client, title: `${r.ref} · ${r.client}`, sub: `${r.lawyer} · ${Math.round(r.wip_minutes / 6) / 10} hours on the clock`, right: m(r.wip_cents), rightSub: `${r.oldest_unbilled_days}d old`, tone: r.oldest_unbilled_days > 90 ? 'red' : r.oldest_unbilled_days > 45 ? 'amber' : '' }),
            },
          ] },
          { type: 'people', source: 'recovery', title: 'Recovery by fee earner', note: 'Billed against worked', card: (r) => ({ name: r.lawyer, role: `${Math.round((Number(r.billed_cents) / Math.max(1, Number(r.worked_cents))) * 100)}% recovered so far`, stats: [['Worked', m(r.worked_cents)], ['Billed', m(r.billed_cents)], ['Written off', m(r.written_off_cents)], ['Unbilled', m(r.unbilled_cents)]] }) },
        ],
      },
      {
        id: 'compliance', title: 'Compliance', icon: 'shield', heading: 'Compliance, checked against the records',
        sub: () => 'The Conduct and Client Care Rules, AML/CFT and the Limitation Act, run on your own file. Your rule book, pointed at your data. Not legal advice.',
        count: (D) => { const n = D.compliance.length - passCount(D); return n ? { n, tone: 'red' } : null; },
        ask: ['Run the compliance check and tell me where to start.', 'Which open matters have no letter of engagement?', 'Draft the engagement letter for MT-1007.'],
        widgets: [{ type: 'rules', source: 'compliance', bare: true, intro: 'Fix the red ones from the top. Every breach names the matter, so the fix is one sentence to Claude.', breachText: (b) => b.client || (b.given_to ? `to ${b.given_to}` : '') || (b.lawyer ? `${b.lawyer}, expires ${b.expires}` : '') }],
      },
      {
        id: 'clients', title: 'Clients', icon: 'users', heading: 'Clients',
        sub: (D) => `${D.clients.length} clients. Click one for every matter, bill and date.`,
        ask: ['Which clients owe us money and still have work on the clock?', 'Show me everything for Waimarie Developments.', 'Import our clients and matters from an Actionstep export.'],
        widgets: [{
          type: 'table', source: 'clients', search: 'Find a client', client: (r) => r.client, sort: (a, b) => Number(b.lockup_cents) - Number(a.lockup_cents),
          columns: [
            { label: 'Client', value: (r) => r.client, cls: 'strong' },
            { label: 'Type', value: (r) => r.client_type, cls: 'dim' },
            { label: 'Lawyer', value: (r) => r.lawyer || '', cls: 'dim' },
            { label: 'Open matters', value: (r) => r.open_matters || '', align: 'r' },
            { label: 'WIP', value: (r) => (Number(r.wip_cents) ? m(r.wip_cents) : ''), align: 'r' },
            { label: 'Owing', value: (r) => (Number(r.owing_cents) ? m(r.owing_cents) : ''), align: 'r' },
            { label: 'Paid to date', value: (r) => (Number(r.lifetime_paid_cents) ? m(r.lifetime_paid_cents) : ''), align: 'r' },
            { label: 'Last contact', value: (r, f) => (r.last_contact_on ? `<span class="tag ${r.days_since_contact > 60 ? 'red' : r.days_since_contact > 30 ? 'amber' : 'grey'}">${f.rel(-r.days_since_contact)}</span>` : '<span class="tag grey">never</span>'), html: true },
            { label: 'CDD', value: (r) => (r.cdd_completed_on ? '<span class="tag green">on file</span>' : '<span class="tag red">missing</span>'), html: true },
          ],
        }],
      },
    ],
    clientDetail(name, D, f) {
      const c = D.clients.find((x) => x.client === name);
      if (!c) return null;
      const matters = D.matters.filter((x) => x.client === name);
      const bills = D.debtors.filter((x) => x.client === name);
      const att = D.attention.filter((a) => a.client === name);
      return {
        sub: `${c.client_type} · ${c.lawyer || 'no lawyer'} · ${c.cdd_completed_on ? 'CDD on file' : 'no CDD on file'}`,
        facts: [['Work in progress', m(c.wip_cents)], ['Owing', m(c.owing_cents)], ['Open matters', String(c.open_matters || 0)], ['Last contact', c.last_contact_on ? f.rel(-c.days_since_contact) : 'never']],
        sections: [
          { title: 'Needs a decision', rows: att.map((a) => ({ title: LABELS[a.reason] || a.reason, sub: a.detail, right: Number(a.amount_cents) ? m(a.amount_cents) : '', rightSub: a.label, tone: RED.includes(a.reason) ? 'red' : AMBER.includes(a.reason) ? 'amber' : 'grey' })) },
          { title: 'Matters', rows: matters.map((x) => ({ title: `${x.ref} · ${x.description}`, sub: `${typeLabel(x.matter_type)} · ${x.lawyer}${x.next_key_date ? ` · next: ${x.next_key_date} ${f.date(x.next_key_date_on)}` : ''}`, right: m(x.wip_cents), rightSub: x.over_estimate ? 'over estimate' : x.estimate_cents ? `of ${m(x.estimate_cents)}` : '', tone: x.over_estimate ? 'red' : x.record_gaps ? 'amber' : 'grey' })) },
          { title: 'Bills out', rows: bills.map((b) => ({ title: `${b.number} · ${b.ref}`, sub: `issued ${f.date(b.issued_on, true)}`, right: m(b.total_cents), rightSub: b.days_overdue > 0 ? `${b.days_overdue}d overdue` : 'not yet due', tone: b.days_overdue > 30 ? 'red' : b.days_overdue > 0 ? 'amber' : 'green' })) },
        ],
        ask: [`Show me everything for ${name}.`, `Draft a client update for ${name}.`, `Log a call with ${name}: discussed next steps, sending the draft Friday.`],
      };
    },
  };
})();
