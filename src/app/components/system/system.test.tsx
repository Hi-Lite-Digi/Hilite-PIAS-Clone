import assert from "node:assert/strict";
import test from "node:test";
import { Inbox, Search, Sparkles } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { toastClassNames, toastIcons } from "../ui/sonner";
import {
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  Drawer,
  EmptyState,
  FilterChips,
  IconButton,
  PageHeader,
  PageSizeSelect,
  SampleDataPill,
  SearchInput,
  Skeleton,
  StatCard,
  StatusDot,
  StatusPill,
  Toast,
  normalizeStatus,
  shouldActivateRowFromTarget,
  sortRows,
  toggleFilterValue,
  type DataTableColumn,
} from "./index";

function render(node: React.ReactNode) {
  return renderToStaticMarkup(node);
}

test("buttons use the ink action style and icon buttons require an accessible name", () => {
  const primary = render(<Button>Approve batch</Button>);
  assert.match(primary, /bg-ink/);
  assert.match(primary, /rounded-full/);
  assert.match(primary, />Approve batch</);

  const linkButton = render(<Button asChild><a href="/reengage/campaigns/new">New campaign</a></Button>);
  assert.match(linkButton, /href="\/reengage\/campaigns\/new"/);
  assert.match(linkButton, />New campaign</);

  const icon = render(<IconButton label="Open inbox" icon={Inbox} />);
  assert.match(icon, /aria-label="Open inbox"/);
  assert.match(icon, /size-9/);
});

test("status components normalize the approved shared vocabulary", () => {
  assert.equal(normalizeStatus("live"), "running");
  assert.equal(normalizeStatus("failed"), "error");

  for (const status of ["running", "paused", "draft", "done", "error", "queued"] as const) {
    const pill = render(<StatusPill status={status} />);
    const dot = render(<StatusDot status={status} label={`${status} state`} />);
    assert.match(pill, new RegExp(`data-status="${status}"`));
    assert.match(dot, new RegExp(`data-status="${status}"`));
    assert.match(dot, new RegExp(`aria-label="${status} state"`));
  }
});

test("cards provide title, action, footer, and statistic slots", () => {
  const card = render(
    <Card title="Campaign health" action={<button>View</button>} footer={<span>Updated now</span>}>
      <p>Healthy</p>
    </Card>,
  );
  assert.match(card, />Campaign health</);
  assert.match(card, />View</);
  assert.match(card, />Healthy</);
  assert.match(card, />Updated now</);

  const stat = render(<StatCard label="Total leads" value="1,248" trend="+8%" chart={<span>chart</span>} />);
  assert.match(stat, /tabular-nums/);
  assert.match(stat, />1,248</);
  assert.match(stat, />\+8%/);
  assert.match(stat, />chart</);
});

type Person = { id: string; name: string; replies: number };

const people: Person[] = [
  { id: "a", name: "Zara", replies: 2 },
  { id: "b", name: "Amir", replies: 5 },
];

const columns: DataTableColumn<Person>[] = [
  { key: "name", header: "Name", cell: (row) => row.name, sortValue: (row) => row.name },
  { key: "replies", header: "Replies", cell: (row) => row.replies, sortValue: (row) => row.replies },
];

test("data tables sort without mutating rows and render desktop and mobile structures", () => {
  const sorted = sortRows(people, columns[0], "ascending");
  assert.deepEqual(sorted.map((person) => person.name), ["Amir", "Zara"]);
  assert.deepEqual(people.map((person) => person.name), ["Zara", "Amir"]);

  const table = render(
    <DataTable rows={people} columns={columns} rowKey={(row) => row.id} onRowClick={() => undefined} />,
  );
  assert.match(table, /data-slot="data-table-desktop"/);
  assert.match(table, /data-slot="data-table-mobile"/);
  assert.match(table, /<th[^>]*>[\s\S]*Name/);
  assert.match(table, />Zara</);
  assert.match(table, />Replies</);
  assert.match(table, /tabindex="0"/);
  assert.doesNotMatch(table, /<tr[^>]*role="button"/);
  assert.equal((table.match(/role="button"/g) ?? []).length, 2);

  const plainTarget = { closest: () => null } as unknown as EventTarget;
  const nestedButton = { closest: () => ({ tagName: "BUTTON" }) } as unknown as EventTarget;
  assert.equal(shouldActivateRowFromTarget(plainTarget, {} as EventTarget), true);
  assert.equal(shouldActivateRowFromTarget(nestedButton, {} as EventTarget), false);
});

test("drawer and confirmation wrappers expose accessible trigger contracts", () => {
  const drawer = render(
    <Drawer title="Lead details" description="Contact history" trigger={<button>Open lead</button>}>
      <p>Profile</p>
    </Drawer>,
  );
  assert.match(drawer, />Open lead</);

  const dialog = render(
    <ConfirmDialog
      title="Delete lead?"
      description="This removes the lead from active campaigns."
      trigger={<button>Delete</button>}
      confirmLabel="Delete lead"
      variant="destructive"
      onConfirm={() => undefined}
    />,
  );
  assert.match(dialog, />Delete</);
});

test("search, filters, empty, loading, page header, and sample marker are reusable", () => {
  const search = render(
    <SearchInput aria-label="Search leads" value="Ada" onValueChange={() => undefined} />,
  );
  assert.match(search, /aria-label="Search leads"/);
  assert.match(search, /value="Ada"/);
  assert.match(search, /aria-label="Clear search"/);

  assert.deepEqual(toggleFilterValue(["live"], "paused", true), ["live", "paused"]);
  assert.deepEqual(toggleFilterValue(["live", "paused"], "live", true), ["paused"]);
  assert.deepEqual(toggleFilterValue("live", "paused", false), "paused");

  const filters = render(
    <FilterChips
      value="all"
      onValueChange={() => undefined}
      options={[
        { value: "all", label: "All" },
        { value: "active", label: "Active", count: 4 },
        { value: "empty", label: "Empty", count: 0, hideWhenZero: true },
      ]}
    />,
  );
  assert.match(filters, /aria-pressed="true"/);
  assert.match(filters, />Active/);
  assert.doesNotMatch(filters, />Empty/);

  const empty = render(<EmptyState icon={Search} message="No matches" action={<button>Clear filters</button>} />);
  assert.match(empty, />No matches</);
  assert.match(empty, />Clear filters</);

  const loading = render(<Skeleton rows={3} label="Loading leads" />);
  assert.equal((loading.match(/data-slot="skeleton-row"/g) ?? []).length, 3);
  assert.match(loading, /aria-label="Loading leads"/);

  const header = render(<PageHeader title="Leads" meta="Wednesday, 26 August" actions={<Button>Add lead</Button>} />);
  assert.match(header, />Leads</);
  assert.match(header, />Wednesday, 26 August</);
  assert.match(header, />Add lead</);

  const samplePill = render(<SampleDataPill icon={Sparkles} />);
  assert.match(samplePill, />Sample data</);
  assert.match(samplePill, /size-4/);
  assert.equal(render(<SampleDataPill show={false} />), "");
});

test("page size selection exposes the shared 10, 20, 50, and 100 row options", () => {
  const control = render(<PageSizeSelect onValueChange={() => undefined} value={10} />);
  assert.match(control, /aria-label="Rows per page"/);
  assert.match(control, /<option value="10" selected="">10<\/option>/);
  assert.match(control, /<option value="20">20<\/option>/);
  assert.match(control, /<option value="50">50<\/option>/);
  assert.match(control, /<option value="100">100<\/option>/);
});

test("toast viewport can be mounted once by the shell", () => {
  const toast = render(<Toast />);
  assert.match(toast, /data-slot="toast-viewport"/);
  assert.match(toast, /aria-label="Notifications/);
  assert.match(toastClassNames.closeButton, /!size-11/);
  assert.match(toastClassNames.closeButton, /md:!size-9/);
  assert.match(toastClassNames.closeButton, /!rounded-full/);
  assert.match(toastClassNames.actionButton, /!h-\[38px\]/);
  assert.match(toastClassNames.cancelButton, /!h-\[38px\]/);
  const closeIcon = render(toastIcons.close);
  assert.match(closeIcon, /lucide-x/);
  assert.match(closeIcon, /size-4/);
  assert.match(closeIcon, /stroke-width="1\.75"/);
});
