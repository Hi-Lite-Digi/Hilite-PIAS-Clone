import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { matchRoutes } from "react-router";
import { APP_ROUTES, CANONICAL_ROUTE_PATHS } from "./routes";

const concreteCanonicalPaths = [
  "/reengage",
  "/reengage/leads",
  "/reengage/campaigns",
  "/reengage/campaigns/new",
  "/reengage/campaigns/example-campaign",
  "/reengage/calendar",
  "/reengage/inbox",
  "/reengage/inbox/example-thread",
  "/reengage/settings",
  "/hihunt",
  "/hihunt/leads",
  "/hihunt/campaigns",
  "/hihunt/campaigns/new",
  "/hihunt/campaigns/example-campaign/edit",
  "/hihunt/workflows",
  "/hihunt/workflows/example-workflow",
  "/hihunt/inbox",
  "/hihunt/inbox/example-thread",
  "/hihunt/settings",
] as const;

test("the route skeleton declares every canonical workspace and detail route", () => {
  assert.deepEqual(CANONICAL_ROUTE_PATHS, [
    "/reengage",
    "/reengage/leads",
    "/reengage/campaigns",
    "/reengage/campaigns/new",
    "/reengage/campaigns/:id",
    "/reengage/calendar",
    "/reengage/inbox",
    "/reengage/inbox/:threadId",
    "/reengage/settings",
    "/hihunt",
    "/hihunt/leads",
    "/hihunt/campaigns",
    "/hihunt/campaigns/new",
    "/hihunt/campaigns/:id/edit",
    "/hihunt/workflows",
    "/hihunt/workflows/:id",
    "/hihunt/inbox",
    "/hihunt/inbox/:threadId",
    "/hihunt/settings",
  ]);

  for (const pathname of concreteCanonicalPaths) {
    const matches = matchRoutes(APP_ROUTES, pathname);
    assert.ok(matches, `${pathname} should match the application route tree`);
    assert.notEqual(matches.at(-1)?.route.id, "wildcard", `${pathname} should not fall through`);
  }
});

test("root, compatibility URLs, and unknown paths have explicit redirect routes", () => {
  const redirects = [
    "/",
    "/reengage/replies",
    "/reengage/campaigns/example-campaign/edit",
    "/hihunt/prospects",
    "/hihunt/outreach",
    "/settings",
  ];

  for (const pathname of redirects) {
    assert.match(matchRoutes(APP_ROUTES, pathname)?.at(-1)?.route.id ?? "", /redirect/);
  }

  assert.equal(matchRoutes(APP_ROUTES, "/not-a-route")?.at(-1)?.route.id, "wildcard");
});

test("unsubscribe links open the public confirmation page outside the workspace shell", () => {
  const matches = matchRoutes(APP_ROUTES, "/unsubscribe/3e7ba735-8ff2-4fd7-8b20-dad5e556dd1b");
  assert.equal(matches?.at(-1)?.route.id, "unsubscribe");
  assert.equal(matches?.some((match) => match.route.id === "shell"), false);
});

test("the privacy policy is public and outside the workspace shell", () => {
  const matches = matchRoutes(APP_ROUTES, "/privacy");
  assert.equal(matches?.at(-1)?.route.id, "privacy");
  assert.equal(matches?.some((match) => match.route.id === "shell"), false);
});

test("the application mounts the route tree with a data router so route blockers cover shell navigation", () => {
  const source = readFileSync(path.join(process.cwd(), "src/app/App.tsx"), "utf8");
  assert.match(source, /createBrowserRouter\(APP_ROUTES\)/);
  assert.match(source, /<RouterProvider/);
  assert.doesNotMatch(source, /\bBrowserRouter\b/);
});

test("canonical Hi-Hunt routes mount the Phase 3 screens without deleting legacy files", () => {
  const source = readFileSync(path.join(process.cwd(), "src/app/routes.tsx"), "utf8");
  assert.match(source, /\.\/hihunt\/HomePage/);
  assert.match(source, /\.\/hihunt\/LeadsPage/);
  assert.match(source, /\.\/hihunt\/CampaignsPage/);
  assert.match(source, /\.\/hihunt\/WorkflowsPage/);
  assert.match(source, /\.\/hihunt\/WorkflowEditorPage/);
  assert.match(source, /\.\/hihunt\/InboxPage/);
  assert.match(source, /\.\/hihunt\/SettingsPage/);
  assert.doesNotMatch(source, /element: <OutreachPage \/>/);
  assert.doesNotMatch(source, /element: <HRDiscoveryPage \/>/);
});
