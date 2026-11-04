# Hi-Hunt public web discovery

This optional local collector adapts the useful part of the referenced Google email-extraction tutorial without importing its unsafe assumptions. It uses Playwright to render public company pages, extracts only addresses on the company's own domain, and requires nearby HR or talent-acquisition evidence.

It does not scrape LinkedIn, use personal Gmail/Yahoo/Outlook addresses, bypass CAPTCHAs, or pretend that a public address was verified. Public company-domain HR listings use `verificationStatus: "public"` and are eligible for Hi-Hunt outreach without an external verification provider. Suppression, unsubscribe, deduplication, and campaign approval checks still apply.

## Run it

Install Chromium once:

```powershell
npx playwright install chromium
```

Copy `config/hihunt-public-web-seeds.example.json`, replace the example company with approved company domains or public careers/team URLs, then run:

```powershell
npm run discover:public-hr -- --seeds config/hihunt-public-web-seeds.json --headed
```

After reviewing the JSON/CSV evidence, import the same run into Hi-Hunt with the server-only Supabase credentials from `.env.local`:

```powershell
npm run discover:public-hr -- --seeds config/hihunt-public-web-seeds.json --import-supabase
```

The default scan is deliberately bounded to 10 company domains, three pages per domain, and a 2.5-second delay between requests. It starts from each company's public homepage and follows relevant careers, people, team, about, or contact links. Google search is supplemental; a Google automation/CAPTCHA checkpoint is recorded and skipped without bypassing it.

To seed from existing Hi-Hunt company domains instead:

```powershell
npm run discover:public-hr -- --seed-api "https://hi-lite-pias-snowy.vercel.app/api/hr-prospects?limit=100" --max-domains 10
```

Use `--help` for all options. Generated `public-hr-discovery-YYYY-MM-DD.json` and `.csv` files are ignored by Git because they may contain contact information.

## Eligibility model

A webpage containing a syntactically valid company-domain address is evidence that the address was published, not proof that the mailbox currently accepts mail or belongs to the named person. Hi-Hunt therefore displays these records as `Public listing`, keeps the source URL and evidence, and permits them in campaigns without calling them verified. Licensed-provider contacts retain the separate `Verified` state.
