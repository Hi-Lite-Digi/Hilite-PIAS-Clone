import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router";
import HomePage from "./HomePage";

test("Hi-Hunt Home exposes the overnight digest, batch, stats and highlights surfaces", () => {
  const markup = renderToStaticMarkup(
    <StaticRouter location="/hihunt">
      <HomePage />
    </StaticRouter>,
  );

  assert.match(markup, />Home</);
  assert.match(markup, /What happened overnight/);
  assert.match(markup, /Pending emails/);
  assert.match(markup, /Reply highlights/);
});

test("Home loads live discovery, drafts, threads and account independently", async () => {
  const source = await readFile(new URL("./HomePage.tsx", import.meta.url), "utf8");

  assert.match(source, /getHRProspects\(\{ limit: 1 \}\)/);
  assert.match(source, /perProviderLimit/);
  assert.match(source, /Daily target/);
  assert.match(source, /Verified saved/);
  assert.match(source, /getOutreachDrafts/);
  assert.match(source, /getEmailThreads/);
  assert.match(source, /getEmailAccount/);
  assert.match(source, /Promise\.allSettled/);
  assert.match(source, /loadRequestRef/);
  assert.match(source, /highlight\.href/);
  assert.match(source, /refreshBadges\(\)/);
});

test("Home's reply donut uses token colours and reports the rate in its centre", async () => {
  const source = await readFile(new URL("./HomePage.tsx", import.meta.url), "utf8");

  assert.match(source, /var\(--mint\)/);
  assert.match(source, /var\(--surface-2\)/);
  assert.match(source, /replyRate/);
  assert.doesNotMatch(source, /#[0-9a-f]{3,8}/i);
});

test("Home renders an unavailable reply-rate ring consistently when sent totals are missing", async () => {
  const source = await readFile(new URL("./HomePage.tsx", import.meta.url), "utf8");

  assert.match(source, /summary\.replyRate === null/);
  assert.match(source, /No tracked sent emails/);
  assert.match(source, /Reply rate unavailable/);
});
