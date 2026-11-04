import { writeFile } from "node:fs/promises";

// Only invented people, companies, reserved .example domains, and fictional
// NANP 202-555-0100..0199 phone numbers belong in this portfolio dataset.
const names = [
  "Aisha Tan", "Marcus Lim", "Elena Koh", "Daniel Wong", "Priya Nair", "Ryan Lee",
  "Sofia Chen", "Amir Rahman", "Chloe Ng", "Lucas Goh", "Nadia Hassan", "Ethan Teo",
  "Mei Lin", "Arjun Rao", "Isabelle Chua", "Adam Ong", "Sara Ho", "Jayden Yeo",
  "Zara Abdullah", "Oliver Low", "Anika Shah", "Gabriel Sim", "Hannah Foo", "Aaron Soh",
  "Leila Noor", "Benjamin Lau", "Iris Phua", "Ravi Menon", "Olivia Toh", "Dylan Heng",
  "Maya Sen", "Nathan Liew", "Clara Neo", "Samir Ali", "Grace Chew", "Noah Ang",
  "Tara Singh", "Julian Wee", "Eva Chan", "Isaac Tay", "Lina Aziz", "Adrian Yap",
  "Nora Kwan", "Caleb See", "Rhea Kapoor", "Leon Wu", "Faye Loh", "Omar Malik",
  "Amelia Han", "Reuben Oh", "Alia Zain", "Sean Sng", "Tessa Mah", "Vikram Das",
  "Alice Koo", "Felix Leong", "Dina Ismail", "Oscar Quek", "Nina Sethi", "Joel Tung",
];
const companies = ["Cedar Grove Logistics", "Meridian Bloom Health", "Northstar Harbor Retail", "Willow Arc Technologies", "Atlas Meadow Foods", "Maple Tide Hospitality", "Juniper Vale Engineering", "Orchard Moon Studios"];
const topics = ["Retirement planning", "CPF", "Financial wellness", "Insurance", "Estate planning"];
const campaignNames = ["Money Confidence Workshop", "CPF Planning Clinic", "Financial Wellness Lunch Talk", "Retirement Roadmap", "Family Protection Review", "Estate Planning Essentials"];
const campaignStatuses = ["queued", "queued", "sent", "sent", "paused", "draft"];
const replyBodies = [
  "YES, please reserve a seat for me. Thank you!",
  "Could you share the venue and whether I can bring a colleague?",
  "The lunchtime slot works for me. Please send the details.",
  "MAYBE NEXT TIME. I will be travelling that week.",
  "Would there be a recording available after the session?",
  "Thanks for following up. I am interested in the CPF clinic.",
];
const sql = [];
const quote = value => value === null ? "null" : typeof value === "number" || typeof value === "boolean" ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
const json = value => `${quote(JSON.stringify(value))}::jsonb`;
const uuid = (prefix, index) => `${prefix}0000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const slug = name => name.toLowerCase().replace(/[^a-z0-9]+/g, ".");
const at = days => `now() + interval '${days} days'`;
const insert = (table, columns, rows, conflict) => {
  sql.push(`insert into public.${table} (${columns.join(", ")}) values\n${rows.map(row => `  (${row.join(", ")})`).join(",\n")}\non conflict ${conflict};\n`);
};

sql.push(`-- Hilite portfolio demo. Entirely fictional; no external delivery.
-- Apply only to the NEW, isolated Hilite Demo project after all migrations.
-- Re-running refreshes this dataset without deleting visitor-created demo rows.
begin;
do $$
begin
  if exists (select 1 from public.leads where import_batch <> 'hilite-demo-v1') then
    raise exception 'Refusing to seed a database that contains non-demo leads';
  end if;
  if exists (select 1 from public.hr_prospects where provider_person_id not like 'hilite-demo-%') then
    raise exception 'Refusing to seed a database that contains non-demo HR prospects';
  end if;
end $$;\n`);

insert("leads", ["id", "source_row", "name", "age", "age_band", "phone", "email", "dob", "topics", "status", "struck", "subscribed", "first_captured", "remarks", "source_tabs", "import_batch", "created_at"], names.map((name, index) => {
  const age = 28 + index % 47;
  const ageBand = age < 50 ? "Below 50" : age < 55 ? "50-54" : age <= 65 ? "55-65" : "65-75";
  return [10001 + index, index + 1, name, age, ageBand, `+1202555${String(100 + index).padStart(4, "0")}`, `${slug(name)}@demo.hilite.example`].map(quote).concat([
    `(current_date - make_interval(years => ${age}))::date`,
    `array[${quote(topics[index % topics.length])}, ${quote(topics[(index + 1) % topics.length])}]`,
    quote(["New", "Contacted", "Interested", "Follow-up"][index % 4]), "false", index % 13 === 0 ? "false" : "true",
    `(current_date - ${index % 24})`, quote("Fictional portfolio demo contact. Not a real person or contact address."), quote("Hilite Demo"), quote("hilite-demo-v1"), at(-(index % 24)),
  ]);
}), "(import_batch, source_row) do update set name = excluded.name, topics = excluded.topics, status = excluded.status, subscribed = excluded.subscribed, first_captured = excluded.first_captured");

insert("campaigns", ["id", "title", "subject", "message", "audience", "audience_count", "status", "created_at", "updated_at"], campaignNames.map((title, index) => [
  quote(uuid("a", index + 1)), quote(title), quote(`You're invited: ${title}`),
  quote(`Hi {{first_name}} 👋\n\nJoin Hilite for our ${title.toLowerCase()}.\n\n📍 Hilite Demo Studio, Singapore\n🎟️ Complimentary session\n\nReply *YES* to attend or *MAYBE NEXT TIME*.\n\nHilite Team`),
  `jsonb_build_object('ageBands', '[]'::jsonb, 'topics', '[]'::jsonb, 'statuses', '[]'::jsonb, 'delivery', jsonb_build_object('channel', 'whatsapp', 'senderEmail', null, 'scheduledAt', to_char(${at([5, 9, -8, -3, 12, 18][index])}, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'ctaUrl', null, 'reminderDates', '[]'::jsonb))`,
  "20", quote(campaignStatuses[index]), at(-(18 - index * 2)), at(-index),
]), "(id) do update set title = excluded.title, message = excluded.message, audience = excluded.audience, status = excluded.status, updated_at = excluded.updated_at");

const recipients = [];
const messages = [];
for (let c = 0; c < 5; c++) {
  for (let n = 0; n < 20; n++) {
    const i = (c * 9 + n) % names.length;
    const status = c === 2 || c === 3 ? (n % 5 === 0 ? "replied" : "sent") : n < 6 ? "sent" : n === 6 ? "failed" : "queued";
    const recipientId = 20001 + c * 20 + n;
    recipients.push([quote(recipientId), quote(uuid("a", c + 1)), quote(10001 + i), quote(`${slug(names[i])}@demo.hilite.example`), quote(status), at(-(n % 7))]);
    if (status === "sent" || status === "replied") {
      messages.push([quote(`hilite-demo-out-${recipientId}`), quote("outbound"), quote(10001 + i), quote(uuid("a", c + 1)), quote(`demo-${10001 + i}`), quote("+12025550199"), quote(`+1202555${String(100 + i).padStart(4, "0")}`), quote("Hilite"), quote(`Hi ${names[i].split(" ")[0]}, we'd love to see you at our ${campaignNames[c].toLowerCase()}. This is a complimentary session. Would you like us to reserve a seat?`), quote("Follow-up"), at(-1 - n % 6), at(-1 - n % 6), json({ demo: true })]);
    }
  }
}
insert("campaign_recipients", ["id", "campaign_id", "lead_id", "email", "status", "created_at"], recipients, "(campaign_id, lead_id) do update set status = excluded.status");
for (let i = 0; i < 14; i++) {
  const category = ["Interested", "Question", "Interested", "Not Interested", "Question", "Follow-up"][i % 6];
  messages.push([quote(`hilite-demo-in-${i + 1}`), quote("inbound"), quote(10001 + i), quote(uuid("a", i % 4 + 1)), quote(`demo-${10001 + i}`), quote(`+1202555${String(100 + i).padStart(4, "0")}`), quote("+12025550199"), quote(names[i]), quote(replyBodies[i % replyBodies.length]), quote(category), `now() - interval '${30 + i * 35} minutes'`, i % 3 === 0 ? "null" : "now()", json({ demo: true })]);
}
insert("whatsapp_messages", ["external_message_id", "direction", "lead_id", "campaign_id", "chat_id", "sender_phone", "recipient_phone", "sender_name", "body", "category", "occurred_at", "read_at", "raw_metadata"], messages, "(external_message_id) do update set body = excluded.body, occurred_at = excluded.occurred_at, read_at = excluded.read_at");

insert("hr_discovery_runs", ["id", "provider", "status", "filters", "requested_count", "searched_count", "saved_count", "verified_count", "triggered_by", "started_at", "completed_at"], [[quote(uuid("c", 1)), quote("multi_provider"), quote("completed"), json({ location: "Singapore", demo: true, seniorities: ["director", "manager"] }), "24", "36", "24", "24", quote("manual"), "now() - interval '3 hours'", "now() - interval '2 hours'"]], "(id) do update set started_at = excluded.started_at, completed_at = excluded.completed_at");

insert("hr_prospects", ["id", "provider", "provider_person_id", "full_name", "first_name", "last_name", "job_title", "seniority", "company_name", "company_domain", "work_email", "email_status", "location", "hr_match_reason", "review_status", "suppressed", "source_metadata", "discovered_at", "updated_at"], names.slice(24, 48).map((name, i) => {
  const company = companies[i % companies.length];
  const domain = `${company.toLowerCase().replaceAll(" ", "-")}.example`;
  return [uuid("b", i + 1), "apollo", `hilite-demo-${i + 1}`, name, name.split(" ")[0], name.split(" ").slice(1).join(" "), ["HR Director", "Head of People", "HR Manager", "People & Culture Lead"][i % 4], i % 3 === 0 ? "director" : "manager", company, domain, `${slug(name)}@${domain}`, "verified", "Singapore", "Fictional HR decision-maker for the Hilite portfolio demo.", i % 4 === 0 ? "qualified" : "new", false].map(quote).concat([json({ demo: true, hihunt_status: ["new", "queued", "contacted", "replied"][i % 4] }), at(-(i % 10)), at(-(i % 3))]);
}), "(provider, provider_person_id) do update set source_metadata = excluded.source_metadata, discovered_at = excluded.discovered_at, updated_at = excluded.updated_at");

insert("hr_campaigns", ["id", "name", "subject", "body", "status", "sender_email", "audience_count", "sent_at", "created_at", "updated_at"], ["Employee wellness introduction", "CPF lunch-and-learn", "Benefits planning follow-up", "Workplace money confidence"].map((name, i) => [quote(uuid("d", i + 1)), quote(name), quote(`A complimentary ${i % 2 ? "CPF planning" : "financial wellness"} session for your team`), quote("Hi {{first_name}},\n\nHilite runs practical financial-wellness sessions for teams in Singapore. Could we share the outline for a complimentary workplace session?\n\nWarm regards,\nHilite"), quote(["draft", "sent", "partial", "draft"][i]), quote("demo@hilite.example"), "6", i === 1 || i === 2 ? at(-2) : "null", at(-8 + i), at(-i)]), "(id) do update set status = excluded.status, updated_at = excluded.updated_at");
const hrRecipients = [];
for (let c = 0; c < 4; c++) for (let n = 0; n < 6; n++) {
  const i = c * 6 + n;
  const company = companies[i % companies.length].toLowerCase().replaceAll(" ", "-");
  const status = c === 1 ? "sent" : c === 2 ? (n === 5 ? "failed" : "sent") : "queued";
  hrRecipients.push([quote(uuid("e", i + 1)), quote(uuid("d", c + 1)), quote(uuid("b", i + 1)), quote(names[24 + i]), quote(`${slug(names[24 + i])}@${company}.example`), quote(status), status === "sent" ? at(-1 - n % 3) : "null", status === "sent" ? quote(`hilite-demo-email-${i + 1}`) : "null"]);
}
insert("hr_campaign_recipients", ["id", "campaign_id", "prospect_id", "prospect_name", "email", "status", "sent_at", "external_message_id"], hrRecipients, "(id) do update set status = excluded.status, sent_at = excluded.sent_at");

const now = Date.now();
const sender = { name: "Hilite Demo", address: "demo@hilite.example" };
insert("demo_email_threads", ["id", "payload", "updated_at"], names.slice(24, 32).map((name, i) => {
  const company = companies[i % companies.length];
  const party = { name, address: `${slug(name)}@${company.toLowerCase().replaceAll(" ", "-")}.example` };
  const receivedAt = new Date(now - (i + 1) * 45 * 60_000).toISOString();
  const reply = ["This sounds useful for our team. Could you send a session outline and some available dates?", "Could you tell me how long the session runs? We have about 40 employees.", "Thank you for the information. I have shared it with our benefits committee.", "Our team would be interested in a CPF planning workshop next month."][i % 4];
  const payload = {
    id: `demo-email-${i + 1}`, prospectId: uuid("b", i + 1), workflowId: null, workflowName: "Financial wellness outreach", sender: party,
    subject: `Re: A financial wellness session for ${company}`, snippet: reply, lastMessageAt: receivedAt, unread: i % 3 !== 0, status: "needs_reply", category: i % 3 === 0 ? "Follow-up" : "Interested",
    messages: [
      { id: `demo-mail-out-${i + 1}`, direction: "outbound", from: sender, to: [party], occurredAt: new Date(now - (i + 1) * 45 * 60_000 - 86_400_000).toISOString(), body: `Hi ${name.split(" ")[0]},\n\nWe run complimentary financial-wellness workshops for Singapore teams. Would a practical session on CPF and retirement planning be useful for your colleagues?\n\nWarm regards,\nHilite` },
      { id: `demo-mail-in-${i + 1}`, direction: "inbound", from: party, to: [sender], occurredAt: receivedAt, body: `Hi Hilite team,\n\n${reply}\n\nBest,\n${name}` },
    ],
  };
  return [quote(payload.id), json(payload), quote(receivedAt)];
}), "(id) do update set payload = excluded.payload, updated_at = excluded.updated_at");

sql.push(`select setval(pg_get_serial_sequence('public.leads', 'id'), greatest((select max(id) from public.leads), 1));
select setval(pg_get_serial_sequence('public.campaign_recipients', 'id'), greatest((select max(id) from public.campaign_recipients), 1));
commit;\n`);
await writeFile(new URL("../supabase/seed.sql", import.meta.url), sql.join("\n"), "utf8");
console.log(`Prepared demo seed: ${names.length} leads, 6 campaigns, ${recipients.length} recipients, ${messages.length} WhatsApp messages, 24 HR prospects, 4 HR campaigns, 8 email threads.`);
