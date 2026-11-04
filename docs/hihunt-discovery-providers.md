# Hi-Hunt discovery providers

Hi-Hunt uses a licensed-provider waterfall to target up to 300 new verified Singapore HR work emails per daily run. Providers are tried in this order and the run stops when the target is reached:

1. Apollo (`APOLLO_API_KEY`)
2. Hunter (`HUNTER_API_KEY`)
3. People Data Labs (`PDL_API_KEY`)
4. RocketReach (`ROCKETREACH_API_KEY`)
5. Lusha (`LUSHA_API_KEY`)
6. Cognism (`COGNISM_API_KEY`)

Each configured provider is capped at 70 contacts per run. With five providers returning enough unique verified contacts, the normal allocation is 70 + 70 + 70 + 70 + 20 = 300. If one source returns fewer than its allocation, Hi-Hunt continues to every remaining configured source, with each source still capped at 70.

Add one or more keys as server-only environment variables in Vercel. Each provider account must include access to the search and enrichment/reveal endpoints used by its adapter. API calls may consume provider credits, and 300 new records is a target rather than a guarantee because rejected, duplicate, unavailable, or unverified records are not saved.

The pipeline requests work emails only. Personal emails and phone numbers are not requested. A normalized work email already in `hr_prospects` is rejected even when another provider returns it with a different name.

LinkedIn Sales Navigator can still be used manually for profile research. It is shown as a manual-only source because LinkedIn does not offer a general-purpose API for scraping member email addresses; do not automate scraping or bypass its access controls.
