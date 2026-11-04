import { lazy } from "react";
import { Navigate, useLocation, useParams, useRoutes, type RouteObject } from "react-router";
import { AppShell } from "./components/system/app-shell";
import { getWorkspaceRoot, resolveLegacyRedirect } from "./navigation";
import { useBadges } from "./layout/BadgesContext";

const ReengageHomePage = lazy(() => import("./reengage/HomePage"));
const ReengageLeadsPage = lazy(() => import("./reengage/LeadsPage"));
const CampaignsPage = lazy(() => import("./reengage/CampaignsPage"));
const CalendarPage = lazy(() => import("./reengage/CalendarPage"));
const CampaignWizardPage = lazy(() => import("./reengage/CampaignWizardPage"));
const CampaignDetailPage = lazy(() => import("./reengage/CampaignDetailPage"));
const ReengageInboxPage = lazy(() => import("./reengage/InboxPage"));
const ReengageSettingsPage = lazy(() => import("./reengage/SettingsPage"));
const HiHuntHomePage = lazy(() => import("./hihunt/HomePage"));
const HiHuntLeadsPage = lazy(() => import("./hihunt/LeadsPage"));
const HiHuntCampaignsPage = lazy(() => import("./hihunt/CampaignsPage"));
const WorkflowsPage = lazy(() => import("./hihunt/WorkflowsPage"));
const WorkflowEditorPage = lazy(() => import("./hihunt/WorkflowEditorPage"));
const HiHuntInboxPage = lazy(() => import("./hihunt/InboxPage"));
const HiHuntSettingsPage = lazy(() => import("./hihunt/SettingsPage"));
const UnsubscribePage = lazy(() => import("./UnsubscribePage"));
const PrivacyPage = lazy(() => import("./PrivacyPage"));

const CANONICAL_ROUTE_PATHS = [
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
] as const;

function ReengageInboxRoute() {
  const { setReplyCounts } = useBadges();
  return <ReengageInboxPage onCountsChange={setReplyCounts} />;
}

function HiHuntInboxRoute() {
  const { setEmailCounts } = useBadges();
  return <HiHuntInboxPage onCountsChange={setEmailCounts} />;
}

function RootRedirect() {
  return <Navigate replace to={getWorkspaceRoot()} />;
}

function SettingsRedirect() {
  return <Navigate replace to={resolveLegacyRedirect("/settings") ?? "/reengage/settings"} />;
}

function CampaignEditRedirect() {
  const location = useLocation();
  const { id } = useParams();
  return (
    <Navigate
      replace
      state={location.state}
      to={id ? `/reengage/campaigns/${encodeURIComponent(id)}` : "/reengage/campaigns"}
    />
  );
}

const APP_ROUTES: RouteObject[] = [
  { element: <UnsubscribePage />, id: "unsubscribe", path: "/unsubscribe/:token" },
  { element: <PrivacyPage />, id: "privacy", path: "/privacy" },
  {
    element: <AppShell />,
    id: "shell",
    path: "/",
    children: [
      { element: <RootRedirect />, id: "root-redirect", index: true },
      { element: <ReengageHomePage />, id: "reengage-home", path: "reengage" },
      { element: <ReengageLeadsPage />, id: "reengage-leads", path: "reengage/leads" },
      { element: <CampaignsPage />, id: "reengage-campaigns", path: "reengage/campaigns" },
      { element: <CampaignWizardPage />, id: "reengage-campaign-new", path: "reengage/campaigns/new" },
      { element: <CampaignDetailPage />, id: "reengage-campaign-detail", path: "reengage/campaigns/:id" },
      { element: <CalendarPage />, id: "reengage-calendar", path: "reengage/calendar" },
      { element: <ReengageInboxRoute />, id: "reengage-inbox", path: "reengage/inbox" },
      { element: <ReengageInboxRoute />, id: "reengage-inbox-thread", path: "reengage/inbox/:threadId" },
      { element: <ReengageSettingsPage />, id: "reengage-settings", path: "reengage/settings" },
      { element: <HiHuntHomePage />, id: "hihunt-home", path: "hihunt" },
      { element: <HiHuntLeadsPage />, id: "hihunt-leads", path: "hihunt/leads" },
      { element: <HiHuntCampaignsPage />, id: "hihunt-campaigns", path: "hihunt/campaigns" },
      { element: <HiHuntCampaignsPage />, id: "hihunt-campaign-new", path: "hihunt/campaigns/new" },
      { element: <HiHuntCampaignsPage />, id: "hihunt-campaign-edit", path: "hihunt/campaigns/:id/edit" },
      { element: <WorkflowsPage />, id: "hihunt-workflows", path: "hihunt/workflows" },
      { element: <WorkflowEditorPage />, id: "hihunt-workflow-detail", path: "hihunt/workflows/:id" },
      { element: <HiHuntInboxRoute />, id: "hihunt-inbox", path: "hihunt/inbox" },
      { element: <HiHuntInboxRoute />, id: "hihunt-inbox-thread", path: "hihunt/inbox/:threadId" },
      { element: <HiHuntSettingsPage />, id: "hihunt-settings", path: "hihunt/settings" },
      {
        element: <Navigate replace to="/reengage/inbox" />,
        id: "reengage-replies-redirect",
        path: "reengage/replies",
      },
      {
        element: <CampaignEditRedirect />,
        id: "reengage-campaign-edit-redirect",
        path: "reengage/campaigns/:id/edit",
      },
      {
        element: <Navigate replace to="/hihunt/leads" />,
        id: "hihunt-prospects-redirect",
        path: "hihunt/prospects",
      },
      {
        element: <Navigate replace to="/hihunt" />,
        id: "hihunt-outreach-redirect",
        path: "hihunt/outreach",
      },
      { element: <SettingsRedirect />, id: "settings-redirect", path: "settings" },
      { element: <Navigate replace to="/" />, id: "wildcard", path: "*" },
    ],
  },
];

function AppRoutes() {
  return useRoutes(APP_ROUTES);
}

export { APP_ROUTES, AppRoutes, CANONICAL_ROUTE_PATHS };
