#!/usr/bin/env node
/**
 * One-time migration: copies journals, trades, note-sections, note-items,
 * and every photo from a local Strapi instance to a production one.
 *
 * Usage:
 *   node scripts/migrate-to-production.js https://your-app.up.railway.app
 *
 * Safe to re-run: it does not delete or modify anything on the source
 * (local) instance. Re-running will create duplicates on the target if data
 * already exists there — only run this once against a fresh production DB.
 */

const LOCAL_URL = process.env.LOCAL_URL || "http://localhost:1338";
const PROD_URL = process.argv[2];

if (!PROD_URL) {
  console.error("Usage: node scripts/migrate-to-production.js <production-url>");
  process.exit(1);
}

async function get(base, path) {
  const res = await fetch(`${base}/api${path}`);
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}: ${await res.text()}`);
  return res.json();
}

async function post(base, path, body) {
  const res = await fetch(`${base}/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: body }),
  });
  if (!res.ok) throw new Error(`POST ${path} -> ${res.status}: ${await res.text()}`);
  return (await res.json()).data;
}

// Downloads a photo from the source instance and re-uploads it to the
// target, attached to the given content type + numeric id + field.
async function migratePhoto(photo, ref, numericId, field) {
  const fileRes = await fetch(`${LOCAL_URL}${photo.url}`);
  if (!fileRes.ok) throw new Error(`Failed to download ${photo.url}`);
  const blob = await fileRes.blob();

  const formData = new FormData();
  formData.append("files", blob, photo.name);
  formData.append("ref", ref);
  formData.append("refId", String(numericId));
  formData.append("field", field);

  const res = await fetch(`${PROD_URL}/api/upload`, { method: "POST", body: formData });
  if (!res.ok) throw new Error(`Upload ${photo.name} -> ${res.status}: ${await res.text()}`);
}

async function migrateJournals() {
  const journals = (await get(LOCAL_URL, "/journals?pagination[pageSize]=200")).data;
  const journalMap = {}; // local documentId -> prod documentId
  for (const j of journals) {
    const created = await post(PROD_URL, "/journals", { name: j.name });
    journalMap[j.documentId] = created.documentId;
    console.log(`journal: "${j.name}" -> ${created.documentId}`);
  }
  return journalMap;
}

async function migrateTrades(journalMap) {
  const trades = (
    await get(LOCAL_URL, "/trades?populate=photos&sort=sort_order:asc&pagination[pageSize]=1000")
  ).data;
  let count = 0;
  for (const t of trades) {
    const journalDoc = t.journal ? journalMap[t.journal.documentId] : undefined;
    const created = await post(PROD_URL, "/trades", {
      symbol: t.symbol,
      buy_date: t.buy_date,
      sell_date: t.sell_date,
      entry_price: t.entry_price,
      entry_notes: t.entry_notes,
      rsi_avg: t.rsi_avg,
      rsi: t.rsi,
      exit_reason: t.exit_reason,
      profit: t.profit,
      balance: t.balance,
      sort_order: t.sort_order,
      journal: journalDoc,
    });
    for (const p of t.photos ?? []) {
      await migratePhoto(p, "api::trade.trade", created.id, "photos");
    }
    count++;
  }
  console.log(`trades: migrated ${count}`);
}

async function migrateNotes() {
  const sections = (
    await get(
      LOCAL_URL,
      "/note-sections?populate[items][populate]=photos&populate[items][sort]=sort_order:asc" +
        "&sort=sort_order:asc&pagination[pageSize]=200"
    )
  ).data;
  let sectionCount = 0;
  let itemCount = 0;
  for (const s of sections) {
    const createdSection = await post(PROD_URL, "/note-sections", {
      title: s.title,
      sort_order: s.sort_order,
    });
    for (const item of s.items ?? []) {
      const createdItem = await post(PROD_URL, "/note-items", {
        content: item.content,
        sort_order: item.sort_order,
        section: createdSection.documentId,
      });
      for (const p of item.photos ?? []) {
        await migratePhoto(p, "api::note-item.note-item", createdItem.id, "photos");
      }
      itemCount++;
    }
    sectionCount++;
  }
  console.log(`notes: migrated ${sectionCount} sections, ${itemCount} items`);
}

(async () => {
  console.log(`Migrating from ${LOCAL_URL} -> ${PROD_URL}\n`);
  const journalMap = await migrateJournals();
  await migrateTrades(journalMap);
  await migrateNotes();
  console.log("\nDone. Verify counts on production before relying on it.");
})().catch((err) => {
  console.error("\nMigration failed:", err.message);
  process.exit(1);
});
