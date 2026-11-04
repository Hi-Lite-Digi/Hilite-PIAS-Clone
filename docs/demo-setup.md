# Hilite portfolio demo

This deployment uses an isolated Supabase project containing invented people,
companies, and conversations. Do not apply the seed to an existing business
database. The seed refuses databases containing non-demo leads or HR prospects.

Current demo: [hilite-outreach.vercel.app](https://hilite-outreach.vercel.app/).
The dedicated **Hilite Demo** project (`zwtrfwwiualhclxjrqlh`) is in the new
**Hilite Demo** Free organization (`cvrmmrqffuroguhvzgcy`), Singapore. It is
separate from the existing business projects. Schema and seed were loaded on
4 November 2026, and the stored counts and server API reads were verified.

1. Create a **new** Supabase project for Hilite Demo.
2. Apply the SQL files in `supabase/migrations` in filename order.
3. Run `node scripts/generate-demo-seed.mjs`, then execute `supabase/seed.sql`.
4. Set these variables on the Vercel `hilite-outreach` project:
   - `SUPABASE_URL`: the new project's API URL.
   - `SUPABASE_SECRET_KEY`: the new project's server-side secret/service-role key.
   - `DEMO_MODE=true`: disables campaign sending, discovery, and cron execution.
   - `VITE_DEMO_MODE=true`: displays the fictional-data notice.
5. Deploy the updated source, verify `/api/health`, and check both workspaces.

Never put the Supabase secret key in a `VITE_` variable or commit it to Git.
Keep Gmail, WhatsApp relay, discovery-provider, and OpenAI credentials unset for
the demo. The server blocks delivery routes in demo mode even if delivery
credentials are accidentally added later. The displayed inbox connections are
simulated. A separate private WhatsApp test panel is available in RE-engage
Settings; it requires a server-side Meta token and a private operator key.
Manual test sending is disabled unless `META_TEST_SEND_ENABLED=true` is set.
It can send only the fixed image template from the new number ending 4289,
with an individually confirmed recipient. Fictional demo contacts are rejected.
See `docs/pias-clone-bot-setup.md` for the remaining Meta setup.

The seed provides 60 leads, six WhatsApp campaigns, 100 campaign recipients,
72 WhatsApp messages, 24 HR prospects, four HR email campaigns, and eight
email conversations. Refreshing the seed updates the same demo records;
it stops if additional contacts outside the seeded dataset are present.
All email addresses use reserved `.example` domains; phone numbers use the
fictional +1 202-555-0100–0199 range.

Workflows use the app's existing labelled sample fallback. Lead and campaign
edits operate on the isolated demo database. Sending returns a clear demo-only
message and does not contact an external delivery provider.
