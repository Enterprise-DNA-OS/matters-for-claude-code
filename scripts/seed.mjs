#!/usr/bin/env node
// Loads supabase/seed.sql: Harbourview Law, a fictional Wellington firm with
// 4 fee earners, 16 clients, 13 matters, a time and disbursement ledger, five
// invoices in every state, a key date calendar with a limitation date closing
// in, and an undertakings register with one overdue. Every row has a derived
// id and inserts with ON CONFLICT DO NOTHING, so re-running it is harmless.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDb, REPO_ROOT } from './lib/db.mjs';

export async function seed(db) {
  const sql = readFileSync(path.join(REPO_ROOT, 'supabase', 'seed.sql'), 'utf8');
  await db.exec(sql);
  const [c] = await db.query(`
    select (select count(*) from lawyers)         as lawyers,
           (select count(*) from clients)         as clients,
           (select count(*) from matters)         as matters,
           (select count(*) from parties)         as parties,
           (select count(*) from matter_records)  as matter_records,
           (select count(*) from time_entries)    as time_entries,
           (select count(*) from disbursements)   as disbursements,
           (select count(*) from invoices)        as invoices,
           (select count(*) from key_dates)       as key_dates,
           (select count(*) from undertakings)    as undertakings,
           (select count(*) from file_notes)      as file_notes,
           (select count(*) from tasks)           as tasks
  `);
  return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Number(v)]));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const db = await getDb();
  try {
    const n = await seed(db);
    console.log(
      `seed: ${n.lawyers} lawyers, ${n.clients} clients, ${n.matters} matters (${n.parties} parties, ` +
        `${n.matter_records} file records), ${n.time_entries} time entries, ${n.disbursements} disbursements, ` +
        `${n.invoices} invoices, ${n.key_dates} key dates, ${n.undertakings} undertakings, ` +
        `${n.file_notes} file notes, ${n.tasks} tasks`,
    );
  } finally {
    await db.close();
  }
}
