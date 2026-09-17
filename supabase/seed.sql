-- Demo data for matters-for-claude-code.
-- Harbourview Law, a fictional Wellington firm: 4 fee earners, 16 clients,
-- 13 matters across conveyancing, litigation, employment, estates, commercial,
-- family and property, a time and disbursement ledger, five invoices in every
-- state, a key date calendar and an undertakings register.
--
-- Deliberately messy, so the attention list has something to say:
--   a limitation date 21 days out on a debt claim nobody has touched in 40 days
--   a conveyancing settlement in three days with an undertaking riding on it
--   a purchase settling in twelve days with no letter of engagement on file
--   an employment matter where the work on the clock has blown past the
--     $6,000 estimate and nobody has told the client
--   a company client with an active matter and no AML/CFT due diligence
--   an estate with unbilled work 120 days old
--   an undertaking to another firm six days overdue
--   an invoice 52 days past due and a draft bill that never went out
--   a relationship property filing date missed by two days
--   a practising certificate expiring in eighteen days
--   two tasks past their date
--
-- Dates are relative to current_date. Ids are derived from names with
-- seed_uuid, and every insert is ON CONFLICT DO NOTHING, so running it twice
-- changes nothing.
--
-- Rates, fees and names are DEMO VALUES for a fictional firm. Nothing here is
-- legal advice, and no real person or firm is depicted.

create or replace function seed_uuid(seed text) returns uuid language sql immutable as $$
  select (substr(m, 1, 8) || '-' || substr(m, 9, 4) || '-4' || substr(m, 13, 3)
          || '-8' || substr(m, 16, 3) || '-' || substr(m, 19, 12))::uuid
  from (select md5(seed) as m) s
$$;

-- Lawyers ---------------------------------------------------------------------

insert into lawyers (id, full_name, code, email, phone, role, practising_cert, pc_expires_on, rate_cents, active, started_on) values
  (seed_uuid('lawyer:helen'), 'Helen Braddock', 'HB', 'helen@harbourview.example.nz', '04 555 0141', 'principal',       'PC-118804', current_date + 200, 45000, true, current_date - 4200),
  (seed_uuid('lawyer:tane'),  'Tane Rewiti',    'TR', 'tane@harbourview.example.nz',  '04 555 0176', 'senior solicitor','PC-224417', current_date + 18,  32000, true, current_date - 2100),
  (seed_uuid('lawyer:priya'), 'Priya Sharma',   'PS', 'priya@harbourview.example.nz', '04 555 0102', 'solicitor',       'PC-301992', current_date + 240, 26000, true, current_date - 900),
  (seed_uuid('lawyer:mark'),  'Mark Donnelly',  'MD', 'mark@harbourview.example.nz',  '04 555 0163', 'legal executive', null,        null,               18500, true, current_date - 1600)
on conflict do nothing;

-- Clients ---------------------------------------------------------------------

insert into clients (id, name, client_type, email, phone, city, referred_by, lawyer_id, status, cdd_completed_on, cdd_type, external_ref) values
  (seed_uuid('client:fletcher'),  'Fletcher Sheetmetal Ltd',    'company',    'accounts@fletchersheet.example.nz', '04 555 0201', 'Wellington', 'accountant referral',   seed_uuid('lawyer:tane'),  'active', current_date - 400, 'enhanced', 'AS-9001'),
  (seed_uuid('client:prescott'),  'Alan & Judith Prescott',     'couple',     'prescotts@example.nz',              '021 400 011', 'Lower Hutt', 'existing client',       seed_uuid('lawyer:mark'),  'active', current_date - 45,  'standard', 'AS-9002'),
  (seed_uuid('client:tuipulotu'), 'Sione & Mele Tuipulotu',     'couple',     'tuipulotus@example.nz',             '021 400 022', 'Porirua',    'real estate agent',     seed_uuid('lawyer:mark'),  'active', current_date - 20,  'standard', 'AS-9003'),
  (seed_uuid('client:weiss'),     'Danielle Weiss',             'individual', 'd.weiss@example.nz',                '021 400 033', 'Wellington', 'Google search',         seed_uuid('lawyer:tane'),  'active', current_date - 130, 'standard', 'AS-9004'),
  (seed_uuid('client:farrell'),   'Estate of Gordon Farrell',   'estate',     'exec.farrell@example.nz',           '021 400 044', 'Wellington', 'existing client family', seed_uuid('lawyer:priya'), 'active', current_date - 150, 'standard', 'AS-9005'),
  (seed_uuid('client:waimarie'),  'Waimarie Developments Ltd',  'company',    'office@waimariedev.example.nz',     '04 555 0233', 'Wellington', 'director is a past client', seed_uuid('lawyer:helen'), 'active', null,           null,       'AS-9006'),
  (seed_uuid('client:ormiston'),  'Rachel Ormiston',            'individual', 'r.ormiston@example.nz',             '021 400 066', 'Wellington', 'friend referral',       seed_uuid('lawyer:priya'), 'active', current_date - 90,  'standard', 'AS-9007'),
  (seed_uuid('client:totara'),    'Totara Grove Pharmacy Ltd',  'company',    'manager@totaragrove.example.nz',    '04 555 0255', 'Lower Hutt', 'existing client',       seed_uuid('lawyer:tane'),  'active', current_date - 700, 'enhanced', 'AS-9008'),
  (seed_uuid('client:mahoney'),   'Ken Mahoney',                'individual', 'k.mahoney@example.nz',              '021 400 088', 'Wellington', 'insurer panel',         seed_uuid('lawyer:helen'), 'active', current_date - 110, 'standard', 'AS-9009'),
  (seed_uuid('client:katene'),    'Brian & Shirley Katene',     'couple',     'katenes@example.nz',                '021 400 099', 'Wainuiomata','existing client',       seed_uuid('lawyer:mark'),  'active', current_date - 15,  'standard', 'AS-9010'),
  (seed_uuid('client:silveira'),  'Nathan Silveira',            'individual', 'n.silveira@example.nz',             '021 400 110', 'Wellington', 'union referral',        seed_uuid('lawyer:tane'),  'active', current_date - 380, 'standard', 'AS-9011'),
  (seed_uuid('client:lowe'),      'Harriet Lowe',               'individual', 'h.lowe@example.nz',                 '021 400 121', 'Wellington', 'Google search',         seed_uuid('lawyer:mark'),  'active', current_date - 260, 'standard', 'AS-9012'),
  (seed_uuid('client:pukerua'),   'Pukerua Land Co Ltd',        'company',    'admin@pukerualand.example.nz',      '04 555 0288', 'Porirua',    'surveyor referral',     seed_uuid('lawyer:helen'), 'active', current_date - 210, 'enhanced', 'AS-9013'),
  (seed_uuid('client:innes'),     'Marjorie Innes-Brown',       'individual', 'm.innesbrown@example.nz',           '04 555 0299', 'Wellington', 'longstanding client',   seed_uuid('lawyer:helen'), 'active', current_date - 900, 'standard', 'AS-9014'),
  (seed_uuid('client:aldgate'),   'The Aldgate Family Trust',   'trust',      'trustees@aldgate.example.nz',       '021 400 143', 'Wellington', 'accountant referral',   seed_uuid('lawyer:helen'), 'active', current_date - 500, 'enhanced', 'AS-9015'),
  (seed_uuid('client:radcliffe'), 'Colin Radcliffe',            'individual', 'c.radcliffe@example.nz',            '021 400 154', 'Eastbourne', 'Google search',         seed_uuid('lawyer:priya'), 'active', current_date - 10,  'standard', 'AS-9016')
on conflict do nothing;

-- Matters -----------------------------------------------------------------------

insert into matters (id, ref, client_id, lawyer_id, matter_type, description, status, opened_on, closed_on, billing_type, estimate_cents, fixed_fee_cents, note, external_ref) values
  (seed_uuid('matter:lowe'),      'MT-1001', seed_uuid('client:lowe'),      seed_uuid('lawyer:mark'),  'conveyancing', 'Purchase of 14 Konini Rd, Hataitai',                             'closed', current_date - 250, current_date - 190, 'fixed',  null,    150000, 'Vendor was Quays Hospitality Group Ltd; noted for future conflict checks.', 'AS-M-501'),
  (seed_uuid('matter:fletcher'),  'MT-1002', seed_uuid('client:fletcher'),  seed_uuid('lawyer:tane'),  'litigation',   'Debt recovery v Quays Hospitality Group Ltd, $148,000 unpaid fabrication invoices', 'open', current_date - 140, null, 'hourly', 1800000, null, 'Letter of demand sent. Proceedings drafted, not filed.', 'AS-M-502'),
  (seed_uuid('matter:prescott'),  'MT-1003', seed_uuid('client:prescott'),  seed_uuid('lawyer:mark'),  'conveyancing', 'Sale of 8 Marine Parade, Petone',                                'open', current_date - 34, null, 'fixed',  null,    140000, null, 'AS-M-503'),
  (seed_uuid('matter:tuipulotu'), 'MT-1004', seed_uuid('client:tuipulotu'), seed_uuid('lawyer:mark'),  'conveyancing', 'Purchase of 21 Warspite Ave, Cannons Creek',                     'open', current_date - 18, null, 'fixed',  null,    145000, null, 'AS-M-504'),
  (seed_uuid('matter:weiss'),     'MT-1005', seed_uuid('client:weiss'),     seed_uuid('lawyer:tane'),  'employment',   'Personal grievance v Southgate Logistics NZ Ltd, unjustified dismissal', 'open', current_date - 120, null, 'hourly', 600000, null, 'Estimate given at engagement: $6,000 through mediation.', 'AS-M-505'),
  (seed_uuid('matter:farrell'),   'MT-1006', seed_uuid('client:farrell'),   seed_uuid('lawyer:priya'), 'estates',      'Probate and administration, estate of Gordon Farrell',           'open', current_date - 130, null, 'hourly', 900000, null, null, 'AS-M-506'),
  (seed_uuid('matter:waimarie'),  'MT-1007', seed_uuid('client:waimarie'),  seed_uuid('lawyer:helen'), 'commercial',   'Shareholders agreement for the Karori medical centre venture',   'open', current_date - 25, null, 'hourly', 1200000, null, 'Taken on in a hurry before the directors flew out. Paperwork to catch up.', 'AS-M-507'),
  (seed_uuid('matter:ormiston'),  'MT-1008', seed_uuid('client:ormiston'),  seed_uuid('lawyer:priya'), 'family',       'Relationship property division, separation from Simon Ormiston', 'open', current_date - 95, null, 'hourly', 1500000, null, null, 'AS-M-508'),
  (seed_uuid('matter:totara'),    'MT-1009', seed_uuid('client:totara'),    seed_uuid('lawyer:tane'),  'commercial',   'Lease renewal, Totara Grove shopping centre premises',           'open', current_date - 40, null, 'hourly', 350000,  null, null, 'AS-M-509'),
  (seed_uuid('matter:mahoney'),   'MT-1010', seed_uuid('client:mahoney'),   seed_uuid('lawyer:helen'), 'litigation',   'Defence of Apex Scaffolding Ltd claim, disputed variations',     'open', current_date - 150, null, 'hourly', 2500000, null, 'Insurer approved panel rates.', 'AS-M-510'),
  (seed_uuid('matter:katene'),    'MT-1011', seed_uuid('client:katene'),    seed_uuid('lawyer:mark'),  'estates',      'Wills and enduring powers of attorney, both partners',           'open', current_date - 12, null, 'fixed',  null,    120000, null, 'AS-M-511'),
  (seed_uuid('matter:silveira'),  'MT-1012', seed_uuid('client:silveira'),  seed_uuid('lawyer:tane'),  'employment',   'Personal grievance, settled at mediation',                       'closed', current_date - 320, current_date - 210, 'hourly', 800000, null, 'Settled. $9,500 to the client, confidentiality both ways.', 'AS-M-512'),
  (seed_uuid('matter:pukerua'),   'MT-1013', seed_uuid('client:pukerua'),   seed_uuid('lawyer:helen'), 'property',     'Subdivision of the Pukerua Bay block, easements and new titles', 'open', current_date - 200, null, 'hourly', 3000000, null, null, 'AS-M-513')
on conflict do nothing;

-- Parties: the other side, recorded forever. The conflict check reads these.

insert into parties (id, matter_id, name, role, note) values
  (seed_uuid('party:quays'),      seed_uuid('matter:fletcher'),  'Quays Hospitality Group Ltd', 'other party',           'Debtor. Also the vendor on MT-1001, noted at the conflict check.'),
  (seed_uuid('party:quay'),       seed_uuid('matter:fletcher'),  'Debra Quay',                  'related entity',        'Sole director of Quays Hospitality Group Ltd.'),
  (seed_uuid('party:meridian'),   seed_uuid('matter:fletcher'),  'Meridian Law',                'other side solicitor',  null),
  (seed_uuid('party:bell'),       seed_uuid('matter:prescott'),  'Owen & Freya Bell',           'other party',           'Purchasers.'),
  (seed_uuid('party:rutherford'), seed_uuid('matter:prescott'),  'Rutherford & Co',             'other side solicitor',  'Acting for the purchasers.'),
  (seed_uuid('party:chisholm'),   seed_uuid('matter:tuipulotu'), 'D & E Chisholm',              'other party',           'Vendors.'),
  (seed_uuid('party:harborne'),   seed_uuid('matter:tuipulotu'), 'Harborne Legal',              'other side solicitor',  null),
  (seed_uuid('party:southgate'),  seed_uuid('matter:weiss'),     'Southgate Logistics NZ Ltd',  'other party',           'Employer.'),
  (seed_uuid('party:quinn'),      seed_uuid('matter:weiss'),     'Quinn Employment Law',        'other side solicitor',  null),
  (seed_uuid('party:teu'),        seed_uuid('matter:waimarie'),  'Marcus Teu',                  'counterparty',          'Incoming shareholder.'),
  (seed_uuid('party:brightwater'),seed_uuid('matter:waimarie'),  'Lena Brightwater',            'counterparty',          'Incoming shareholder.'),
  (seed_uuid('party:sormiston'),  seed_uuid('matter:ormiston'),  'Simon Ormiston',              'other party',           null),
  (seed_uuid('party:radley'),     seed_uuid('matter:ormiston'),  'Kate Radley Law',             'other side solicitor',  null),
  (seed_uuid('party:apex'),       seed_uuid('matter:mahoney'),   'Apex Scaffolding Ltd',        'other party',           'Plaintiff.'),
  (seed_uuid('party:raumati'),    seed_uuid('matter:pukerua'),   'Raumati Earthworks Ltd',      'counterparty',          'Neighbouring owner granting the easement.'),
  (seed_uuid('party:quays2'),     seed_uuid('matter:lowe'),      'Quays Hospitality Group Ltd', 'other party',           'Vendor on the Hataitai purchase.')
on conflict do nothing;

-- The client care file: six records per matter, created missing, then marked
-- on file where the work was actually done. The gaps left open are the point.

insert into matter_records (id, matter_id, kind, standard, status)
select seed_uuid('record:' || m.ref || ':' || k.kind), m.id, k.kind, k.standard, 'missing'
from matters m
cross join (values
  ('letter of engagement',             'Conduct and Client Care Rules 2008, rr 3.4 and 3.5: client care and service information in writing, in advance'),
  ('scope of the retainer',            'Conduct and Client Care Rules 2008, r 3.5: the principal aspects of the service, recorded'),
  ('fee information',                  'Conduct and Client Care Rules 2008, r 3.5: the basis on which fees will be charged, given in advance'),
  ('conflict check',                   'Conduct and Client Care Rules 2008, rr 5.4 and 6.1: no acting where interests conflict, checked before the retainer'),
  ('AML/CFT customer due diligence',   'AML/CFT Act 2009, ss 11 to 16: CDD before the business relationship (law firms captured since 1 July 2018)'),
  ('record of instructions',           'Conduct and Client Care Rules 2008, r 3: an attendance note of what the client actually asked for')
) as k(kind, standard)
on conflict do nothing;

-- Mark what is genuinely on file. Everything not updated here stays missing.
update matter_records mr set status = 'on file', done_on = m.opened_on
from matters m where m.id = mr.matter_id
  and m.ref not in ('MT-1004', 'MT-1007')
  and mr.kind in ('letter of engagement', 'scope of the retainer', 'fee information', 'record of instructions');
update matter_records mr set status = 'on file', done_on = m.opened_on
from matters m where m.id = mr.matter_id
  and m.ref <> 'MT-1007'
  and mr.kind = 'conflict check';
update matter_records mr set status = 'on file', done_on = c.cdd_completed_on
from matters m join clients c on c.id = m.client_id
where m.id = mr.matter_id and c.cdd_completed_on is not null
  and mr.kind = 'AML/CFT customer due diligence';
-- MT-1004 got its instructions noted even though the engagement letter never went out.
update matter_records mr set status = 'on file', done_on = m.opened_on
from matters m where m.id = mr.matter_id and m.ref = 'MT-1004'
  and mr.kind in ('record of instructions', 'scope of the retainer');
-- The MT-1002 conflict check found the prior Quays involvement and cleared it.
update matter_records mr set note = 'Quays Hospitality was the vendor on MT-1001. No ongoing retainer, no confidential information held. Cleared.'
from matters m where m.id = mr.matter_id and m.ref = 'MT-1002' and mr.kind = 'conflict check';

-- Time entries -------------------------------------------------------------------
-- Minutes, at the rate captured when the work was done.

insert into time_entries (id, matter_id, lawyer_id, worked_on, minutes, description, billable, rate_cents, status, invoice_id) values
  -- MT-1002 Fletcher debt recovery: real work, then 40 days of silence.
  (seed_uuid('time:fl1'), seed_uuid('matter:fletcher'), seed_uuid('lawyer:tane'), current_date - 55, 120, 'Review fabrication contracts and unpaid invoice schedule', true, 32000, 'unbilled', null),
  (seed_uuid('time:fl2'), seed_uuid('matter:fletcher'), seed_uuid('lawyer:tane'), current_date - 48, 90,  'Draft letter of demand and director correspondence',       true, 32000, 'unbilled', null),
  (seed_uuid('time:fl3'), seed_uuid('matter:fletcher'), seed_uuid('lawyer:tane'), current_date - 40, 45,  'Draft statement of claim, holding for instructions',       true, 32000, 'unbilled', null),
  -- MT-1003 Prescott sale: humming along, settles in three days.
  (seed_uuid('time:pr1'), seed_uuid('matter:prescott'), seed_uuid('lawyer:mark'), current_date - 20, 60,  'Contract review and title search',                          true, 18500, 'unbilled', null),
  (seed_uuid('time:pr2'), seed_uuid('matter:prescott'), seed_uuid('lawyer:mark'), current_date - 6,  60,  'Settlement statement and discharge arrangements',           true, 18500, 'unbilled', null),
  (seed_uuid('time:pr3'), seed_uuid('matter:prescott'), seed_uuid('lawyer:tane'), current_date - 2,  60,  'Pre-settlement review and undertaking to Rutherford & Co',  true, 32000, 'unbilled', null),
  -- MT-1004 Tuipulotu purchase.
  (seed_uuid('time:tu1'), seed_uuid('matter:tuipulotu'), seed_uuid('lawyer:mark'), current_date - 15, 45, 'Contract and LIM review',                                   true, 18500, 'unbilled', null),
  (seed_uuid('time:tu2'), seed_uuid('matter:tuipulotu'), seed_uuid('lawyer:mark'), current_date - 4,  45, 'KiwiSaver withdrawal and deposit confirmation',             true, 18500, 'unbilled', null),
  -- MT-1005 Weiss employment: billed to INV-5003, then more work on the clock.
  (seed_uuid('time:we1'), seed_uuid('matter:weiss'), seed_uuid('lawyer:helen'), current_date - 110, 240, 'Review dismissal process and advise on grievance',          true, 45000, 'billed', seed_uuid('invoice:5003')),
  (seed_uuid('time:we2'), seed_uuid('matter:weiss'), seed_uuid('lawyer:tane'),  current_date - 100, 420, 'Raise grievance, correspondence with Quinn Employment Law', true, 32000, 'billed', seed_uuid('invoice:5003')),
  (seed_uuid('time:we3'), seed_uuid('matter:weiss'), seed_uuid('lawyer:priya'), current_date - 80,  660, 'Prepare mediation bundle and statement',                    true, 26000, 'billed', seed_uuid('invoice:5003')),
  (seed_uuid('time:we4'), seed_uuid('matter:weiss'), seed_uuid('lawyer:tane'),  current_date - 30,  180, 'Mediation day one',                                         true, 32000, 'unbilled', null),
  (seed_uuid('time:we5'), seed_uuid('matter:weiss'), seed_uuid('lawyer:priya'), current_date - 22,  150, 'Revised settlement position and without prejudice letter',  true, 26000, 'unbilled', null),
  -- MT-1006 Farrell estate: the oldest unbilled entry is 120 days old.
  (seed_uuid('time:fa1'), seed_uuid('matter:farrell'), seed_uuid('lawyer:priya'), current_date - 120, 180, 'Probate application and affidavits',                       true, 26000, 'unbilled', null),
  (seed_uuid('time:fa2'), seed_uuid('matter:farrell'), seed_uuid('lawyer:priya'), current_date - 95,  120, 'Asset schedule and bank correspondence',                   true, 26000, 'unbilled', null),
  (seed_uuid('time:fa3'), seed_uuid('matter:farrell'), seed_uuid('lawyer:priya'), current_date - 60,  90,  'KiwiSaver and insurance claims for the estate',            true, 26000, 'unbilled', null),
  (seed_uuid('time:fa4'), seed_uuid('matter:farrell'), seed_uuid('lawyer:priya'), current_date - 35,  60,  'Beneficiary correspondence',                               true, 26000, 'unbilled', null),
  -- MT-1007 Waimarie shareholders agreement: good work, missing paperwork.
  (seed_uuid('time:wa1'), seed_uuid('matter:waimarie'), seed_uuid('lawyer:helen'), current_date - 20, 180, 'Structure advice and heads of terms',                     true, 45000, 'unbilled', null),
  (seed_uuid('time:wa2'), seed_uuid('matter:waimarie'), seed_uuid('lawyer:priya'), current_date - 8,  240, 'First draft shareholders agreement',                      true, 26000, 'unbilled', null),
  -- MT-1008 Ormiston relationship property.
  (seed_uuid('time:or1'), seed_uuid('matter:ormiston'), seed_uuid('lawyer:priya'), current_date - 60, 150, 'Disclosure schedule and valuation instructions',          true, 26000, 'unbilled', null),
  (seed_uuid('time:or2'), seed_uuid('matter:ormiston'), seed_uuid('lawyer:priya'), current_date - 9,  90,  'Draft s 21A agreement amendments',                        true, 26000, 'unbilled', null),
  -- MT-1009 Totara Grove lease renewal.
  (seed_uuid('time:to1'), seed_uuid('matter:totara'), seed_uuid('lawyer:tane'), current_date - 10, 45, 'Renewal notice review against the deed of lease',             true, 32000, 'unbilled', null),
  -- MT-1010 Mahoney defence: billed to INV-5004, current work unbilled.
  (seed_uuid('time:ma1'), seed_uuid('matter:mahoney'), seed_uuid('lawyer:helen'), current_date - 70, 300, 'Statement of defence and insurer reporting',               true, 45000, 'billed', seed_uuid('invoice:5004')),
  (seed_uuid('time:ma2'), seed_uuid('matter:mahoney'), seed_uuid('lawyer:tane'),  current_date - 55, 240, 'Discovery list and document review',                       true, 32000, 'billed', seed_uuid('invoice:5004')),
  (seed_uuid('time:ma3'), seed_uuid('matter:mahoney'), seed_uuid('lawyer:tane'),  current_date - 7,  90,  'Briefs of evidence, first pass',                           true, 32000, 'unbilled', null),
  -- MT-1011 Katene wills, fixed fee.
  (seed_uuid('time:ka1'), seed_uuid('matter:katene'), seed_uuid('lawyer:mark'), current_date - 5, 150, 'Instructions, drafts of both wills and four EPAs',           true, 18500, 'unbilled', null),
  -- MT-1012 Silveira, closed: billed and a chunk written off. The recovery story.
  (seed_uuid('time:si1'), seed_uuid('matter:silveira'), seed_uuid('lawyer:tane'),  current_date - 300, 600, 'Grievance through to mediation',                         true, 32000, 'billed', seed_uuid('invoice:5002')),
  (seed_uuid('time:si2'), seed_uuid('matter:silveira'), seed_uuid('lawyer:priya'), current_date - 280, 360, 'Mediation preparation and bundle',                      true, 26000, 'billed', seed_uuid('invoice:5002')),
  (seed_uuid('time:si3'), seed_uuid('matter:silveira'), seed_uuid('lawyer:priya'), current_date - 260, 240, 'Settlement drafting rework after instructions changed', true, 26000, 'written off', null),
  -- MT-1001 Lowe, closed conveyancing.
  (seed_uuid('time:lo1'), seed_uuid('matter:lowe'), seed_uuid('lawyer:mark'), current_date - 220, 300, 'Purchase, start to registration',                            true, 18500, 'billed', seed_uuid('invoice:5001')),
  -- MT-1013 Pukerua subdivision.
  (seed_uuid('time:pu1'), seed_uuid('matter:pukerua'), seed_uuid('lawyer:helen'), current_date - 30, 120, 'Easement instrument negotiation with Raumati Earthworks', true, 45000, 'unbilled', null),
  (seed_uuid('time:pu2'), seed_uuid('matter:pukerua'), seed_uuid('lawyer:mark'),  current_date - 12, 200, 'New title schedules and survey plan checks',              true, 18500, 'unbilled', null),
  -- Practice development time, not chargeable: recovery reads honestly.
  (seed_uuid('time:nc1'), seed_uuid('matter:waimarie'), seed_uuid('lawyer:helen'), current_date - 20, 30, 'Client development lunch with the directors',             false, 45000, 'unbilled', null)
on conflict do nothing;

-- Disbursements -------------------------------------------------------------------

insert into disbursements (id, matter_id, incurred_on, description, amount_cents, status, invoice_id) values
  (seed_uuid('disb:fl1'), seed_uuid('matter:fletcher'),  current_date - 40,  'High Court filing fee, held pending instructions', 20000, 'unbilled', null),
  (seed_uuid('disb:pr1'), seed_uuid('matter:prescott'),  current_date - 20,  'Title search and instruments',                     3500,  'unbilled', null),
  (seed_uuid('disb:tu1'), seed_uuid('matter:tuipulotu'), current_date - 15,  'Title search and LIM',                             38500, 'unbilled', null),
  (seed_uuid('disb:fa1'), seed_uuid('matter:farrell'),   current_date - 118, 'High Court probate filing fee',                    20000, 'unbilled', null),
  (seed_uuid('disb:ma1'), seed_uuid('matter:mahoney'),   current_date - 70,  'Filing fee, statement of defence',                 11000, 'billed', seed_uuid('invoice:5004')),
  (seed_uuid('disb:pu1'), seed_uuid('matter:pukerua'),   current_date - 25,  'LINZ lodgement fees, easement instruments',        16000, 'unbilled', null),
  (seed_uuid('disb:lo1'), seed_uuid('matter:lowe'),      current_date - 230, 'Title searches and registration fees',             9000,  'billed', seed_uuid('invoice:5001'))
on conflict do nothing;

-- Invoices ---------------------------------------------------------------------
-- Totals match the ledger entries marked billed against each one.

insert into invoices (id, number, matter_id, client_id, issued_on, due_on, time_cents, disbursements_cents, total_cents, status, sent_on, paid_on, paid_cents, note) values
  (seed_uuid('invoice:5001'), 'INV-5001', seed_uuid('matter:lowe'),     seed_uuid('client:lowe'),     current_date - 195, current_date - 181, 92500,  9000,  101500, 'paid', current_date - 195, current_date - 170, 101500, 'Fixed fee purchase, billed at registration.'),
  (seed_uuid('invoice:5002'), 'INV-5002', seed_uuid('matter:silveira'), seed_uuid('client:silveira'), current_date - 215, current_date - 201, 476000, 0,     476000, 'paid', current_date - 215, current_date - 188, 476000, null),
  (seed_uuid('invoice:5003'), 'INV-5003', seed_uuid('matter:weiss'),    seed_uuid('client:weiss'),    current_date - 66,  current_date - 52,  690000, 0,     690000, 'sent', current_date - 66,  null, null, 'Interim bill to mediation. Unpaid.'),
  (seed_uuid('invoice:5004'), 'INV-5004', seed_uuid('matter:mahoney'),  seed_uuid('client:mahoney'),  current_date - 24,  current_date + 10,  353000, 11000, 364000, 'sent', current_date - 24,  null, null, 'Insurer panel invoice.'),
  (seed_uuid('invoice:5005'), 'INV-5005', seed_uuid('matter:farrell'),  seed_uuid('client:farrell'),  current_date - 12,  current_date + 2,   127400, 20000, 147400, 'draft', null, null, null, 'Drafted for the executor and never sent.')
on conflict do nothing;

-- Key dates ----------------------------------------------------------------------

insert into key_dates (id, matter_id, kind, title, due_on, completed_on, note) values
  (seed_uuid('kd:fletcher'),  seed_uuid('matter:fletcher'),  'limitation', 'Six years from the first dishonoured invoice (Limitation Act 2010)', current_date + 21, null, 'File proceedings before this date or the oldest invoices die.'),
  (seed_uuid('kd:prescott'),  seed_uuid('matter:prescott'),  'settlement', 'Settlement, 8 Marine Parade',                                        current_date + 3,  null, null),
  (seed_uuid('kd:tuipulotu'), seed_uuid('matter:tuipulotu'), 'settlement', 'Settlement, 21 Warspite Ave',                                        current_date + 12, null, null),
  (seed_uuid('kd:totara'),    seed_uuid('matter:totara'),    'renewal',    'Serve the lease renewal notice',                                     current_date + 5,  null, 'Deed requires notice no later than three months before expiry.'),
  (seed_uuid('kd:mahoney1'),  seed_uuid('matter:mahoney'),   'filing',     'File and serve briefs of evidence',                                  current_date + 15, null, null),
  (seed_uuid('kd:mahoney2'),  seed_uuid('matter:mahoney'),   'hearing',    'Trial, three days, Wellington High Court',                           current_date + 40, null, null),
  (seed_uuid('kd:ormiston'),  seed_uuid('matter:ormiston'),  'filing',     'File the amended s 21A agreement affidavit',                         current_date - 2,  null, 'Registry granted no extension. Late.'),
  (seed_uuid('kd:farrell'),   seed_uuid('matter:farrell'),   'deadline',   'Distribution statement to beneficiaries',                            current_date + 30, null, null),
  (seed_uuid('kd:done'),      seed_uuid('matter:prescott'),  'deadline',   'Obtain discharge figures from the bank',                             current_date - 8,  current_date - 8, null)
on conflict do nothing;

-- Undertakings ---------------------------------------------------------------------

insert into undertakings (id, matter_id, lawyer_id, given_on, given_to, undertaking, due_on, discharged_on, note) values
  (seed_uuid('ut:prescott'), seed_uuid('matter:prescott'), seed_uuid('lawyer:tane'),  current_date - 2,  'Rutherford & Co',  'Pay the discharge amount to the mortgagee and register the discharge within 5 working days of settlement', current_date + 8, null, null),
  (seed_uuid('ut:pukerua'),  seed_uuid('matter:pukerua'),  seed_uuid('lawyer:helen'), current_date - 20, 'Meridian Law',     'Deliver the certified easement instrument for lodgement',                                                   current_date - 6, null, 'Waiting on the surveyor. The undertaking does not wait with us.'),
  (seed_uuid('ut:lowe'),     seed_uuid('matter:lowe'),     seed_uuid('lawyer:mark'),  current_date - 200, 'Quays Hospitality Group Ltd solicitors', 'Hold the deposit as stakeholder pending settlement',                                  current_date - 193, current_date - 193, 'Discharged at settlement.')
on conflict do nothing;

-- File notes: who has actually been spoken to ---------------------------------------

insert into file_notes (id, matter_id, client_id, lawyer_id, noted_on, channel, note) values
  (seed_uuid('note:fl1'), seed_uuid('matter:fletcher'),  seed_uuid('client:fletcher'),  seed_uuid('lawyer:tane'),  current_date - 40, 'phone',   'Director wants one more attempt at commercial settlement before filing. Diarise.'),
  (seed_uuid('note:pr1'), seed_uuid('matter:prescott'),  seed_uuid('client:prescott'),  seed_uuid('lawyer:mark'),  current_date - 2,  'phone',   'Pre-settlement call. Keys with the agent, chattels list confirmed.'),
  (seed_uuid('note:tu1'), seed_uuid('matter:tuipulotu'), seed_uuid('client:tuipulotu'), seed_uuid('lawyer:mark'),  current_date - 4,  'meeting', 'Signed the authority. KiwiSaver funds confirmed for settlement.'),
  (seed_uuid('note:we1'), seed_uuid('matter:weiss'),     seed_uuid('client:weiss'),     seed_uuid('lawyer:tane'),  current_date - 22, 'email',   'Sent the without prejudice letter for approval. She is thinking about the number.'),
  (seed_uuid('note:fa1'), seed_uuid('matter:farrell'),   seed_uuid('client:farrell'),   seed_uuid('lawyer:priya'), current_date - 35, 'email',   'Beneficiary schedule confirmed by the executor.'),
  (seed_uuid('note:wa1'), seed_uuid('matter:waimarie'),  seed_uuid('client:waimarie'),  seed_uuid('lawyer:helen'), current_date - 8,  'meeting', 'Draft agreement walkthrough with the directors before they flew out.'),
  (seed_uuid('note:or1'), seed_uuid('matter:ormiston'),  seed_uuid('client:ormiston'),  seed_uuid('lawyer:priya'), current_date - 9,  'phone',   'Talked through the amended agreement. She will sign Thursday.'),
  (seed_uuid('note:to1'), seed_uuid('matter:totara'),    seed_uuid('client:totara'),    seed_uuid('lawyer:tane'),  current_date - 10, 'email',   'Confirmed the renewal terms the pharmacy wants.'),
  (seed_uuid('note:ma1'), seed_uuid('matter:mahoney'),   seed_uuid('client:mahoney'),   seed_uuid('lawyer:helen'), current_date - 7,  'meeting', 'Brief review session. Ken solid on the variation timeline.'),
  (seed_uuid('note:ka1'), seed_uuid('matter:katene'),    seed_uuid('client:katene'),    seed_uuid('lawyer:mark'),  current_date - 5,  'meeting', 'Instructions taken at the kitchen table. Guardianship wishes recorded.'),
  (seed_uuid('note:pu1'), seed_uuid('matter:pukerua'),   seed_uuid('client:pukerua'),   seed_uuid('lawyer:helen'), current_date - 12, 'phone',   'Surveyor promises the certified plan this week. Undertaking to Meridian flagged.'),
  (seed_uuid('note:in1'), null,                          seed_uuid('client:innes'),     seed_uuid('lawyer:helen'), current_date - 130,'phone',   'Asked about updating her will after the grandson arrived. No matter opened yet.'),
  (seed_uuid('note:ra1'), null,                          seed_uuid('client:radcliffe'), seed_uuid('lawyer:priya'), current_date - 10, 'meeting', 'Initial consult on a boundary dispute. Waiting on his survey documents.')
on conflict do nothing;

-- Tasks ------------------------------------------------------------------------------

insert into tasks (id, title, matter_id, client_id, lawyer_id, due_on, status, done_on, note) values
  (seed_uuid('task:fletcher'), 'Get filing instructions from Fletcher Sheetmetal before the limitation date', seed_uuid('matter:fletcher'), seed_uuid('client:fletcher'), seed_uuid('lawyer:tane'), current_date - 5, 'open', null, 'The letter of demand expired unanswered.'),
  (seed_uuid('task:pukerua'),  'Chase the surveyor for the certified easement plan (undertaking overdue)',    seed_uuid('matter:pukerua'),  seed_uuid('client:pukerua'),  seed_uuid('lawyer:helen'), current_date - 3, 'open', null, null),
  (seed_uuid('task:tuipulotu'),'Send the letter of engagement to the Tuipulotus',                             seed_uuid('matter:tuipulotu'), seed_uuid('client:tuipulotu'), seed_uuid('lawyer:mark'), current_date + 1, 'open', null, null),
  (seed_uuid('task:waimarie'), 'CDD documents for Waimarie Developments before the next draft goes out',      seed_uuid('matter:waimarie'), seed_uuid('client:waimarie'), seed_uuid('lawyer:helen'), current_date + 2, 'open', null, null),
  (seed_uuid('task:farrell'),  'Send INV-5005 to the executor',                                               seed_uuid('matter:farrell'),  seed_uuid('client:farrell'),  seed_uuid('lawyer:priya'), current_date + 1, 'open', null, null),
  (seed_uuid('task:done1'),    'Book settlement figures for Marine Parade',                                   seed_uuid('matter:prescott'), seed_uuid('client:prescott'), seed_uuid('lawyer:mark'), current_date - 8, 'done', current_date - 8, null)
on conflict do nothing;
