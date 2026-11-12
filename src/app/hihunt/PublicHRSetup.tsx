import { useState } from "react";
import { Link } from "react-router";
import { discoverPublicHR, type PublicHRDiscoveryResult } from "../../lib/api";
import { Button, Card } from "../components/system";


export function PublicHRSetup() {
  const [domains, setDomains] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PublicHRDiscoveryResult | null>(null);
  const [error, setError] = useState("");
  async function search() {
    if (running) return;
    setRunning(true); setError(""); setResult(null);
    try { setResult(await discoverPublicHR(domains)); }
    catch (error) { setError(error instanceof Error ? error.message : "Website search could not finish."); }
    finally { setRunning(false); }
  }
  return <Card title="Singapore HR scraper">
    <form onSubmit={event => { event.preventDefault(); void search(); }} className="space-y-4">
      <label className="block text-label font-medium text-ink">Company websites
        <textarea required disabled={running} value={domains} onChange={event => setDomains(event.target.value)} maxLength={1500} aria-describedby="public-hr-help" placeholder="company.com.sg" className="mt-2 min-h-24 w-full rounded-control border border-line bg-surface-2 px-3 py-3 text-body focus:outline-none focus:ring-3 focus:ring-ring/40" />
      </label>
      <p id="public-hr-help" className="text-label text-ink-2">Enter up to 3 Singapore company websites, one per line. Searches public pages and saves HR contacts with source links. No emails are sent.</p>
      <Button type="submit" loading={running} disabled={!domains.trim()}>Search public websites</Button>
      <p className="text-chip text-ink-2">Manual searches only. Public emails need review; delivery and consent are not verified.</p>
      {error && <p role="alert" className="text-label text-danger">{error}</p>}
      {result && <div role="status" className="rounded-control border border-line p-4 text-label">
        <p>{result.saved} new contacts saved · {result.pages} pages searched</p>
        <ul className="mt-2 space-y-1">{result.details.map(row => <li key={row.domain}>{row.domain}: {row.found} found, {row.saved} saved{row.note ? ` · ${row.note}` : ""}</li>)}</ul>
        <Link to="/hihunt/leads" className="mt-3 inline-block underline">Review leads</Link>
      </div>}
    </form>
  </Card>;
}
