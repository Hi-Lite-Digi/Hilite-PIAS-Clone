import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Mail,
  MessageCircle,
  Plus,
} from "lucide-react";
import { Link } from "react-router";
import { getCampaigns, type CampaignRecord } from "../../lib/api";
import { Button, Card, EmptyState, PageHeader, Skeleton } from "../components/system";
import { cn } from "../components/ui/utils";
import {
  buildCalendarDays,
  calendarMonthLabel,
  campaignCalendarEvents,
  formatSingaporeEventDate,
  formatSingaporeEventTime,
  getSingaporeDateKey,
  getSingaporeMonth,
  groupCalendarEvents,
  shiftCalendarMonth,
  upcomingCalendarEvents,
  type CalendarDay,
  type CampaignCalendarEvent,
} from "./calendar-model";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type CampaignEventLinkProps = {
  compact?: boolean;
  event: CampaignCalendarEvent;
};

function CampaignEventLink({ compact = false, event }: CampaignEventLinkProps) {
  const ChannelIcon = event.dateSource === "updated" ? CalendarDays : event.channel === "email" ? Mail : MessageCircle;
  const timeLabel = event.dateSource === "scheduled" ? formatSingaporeEventTime(event.at) : "Saved";
  return (
    <Link
      aria-label={event.dateSource === "scheduled"
        ? `${event.title}, ${formatSingaporeEventTime(event.at)}`
        : `${event.title}, no event date, shown on last updated date`}
      className={cn(
        "group flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-chip font-medium text-ink outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
        event.dateSource === "updated"
          ? "bg-lavender hover:bg-lavender/75"
          : event.channel === "email"
            ? "bg-cyan hover:bg-cyan/75"
            : "bg-mint hover:bg-mint/75",
        compact && "py-1.5",
      )}
      title={event.dateSource === "scheduled"
        ? `${event.title} · ${formatSingaporeEventTime(event.at)} Singapore time`
        : `${event.title} · No event date yet; shown on the last updated date`}
      to={`/reengage/campaigns/${encodeURIComponent(event.campaignId)}`}
    >
      <ChannelIcon aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} />
      <span className="shrink-0 tabular-nums">{timeLabel}</span>
      <span className="truncate">{event.title}</span>
    </Link>
  );
}

type CalendarDayCellProps = {
  day: CalendarDay;
  events: readonly CampaignCalendarEvent[];
  todayKey: string | null;
};

function CalendarDayCell({ day, events, todayKey }: CalendarDayCellProps) {
  const visibleEvents = events.slice(0, 3);
  return (
    <div
      aria-label={`${day.dateKey}, ${events.length} scheduled campaign${events.length === 1 ? "" : "s"}`}
      className={cn(
        "min-h-28 border-b border-r border-line p-1.5 sm:min-h-32 sm:p-2",
        day.inMonth ? "bg-surface" : "bg-surface-2/55",
      )}
      data-date={day.dateKey}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span
          className={cn(
            "inline-flex size-7 items-center justify-center rounded-full text-chip tabular-nums",
            day.inMonth ? "text-ink" : "text-ink-3",
            day.dateKey === todayKey && "bg-ink font-semibold text-surface",
          )}
        >
          {day.date}
        </span>
      </div>
      <div className="space-y-1">
        {visibleEvents.map((event) => <CampaignEventLink event={event} key={event.campaignId} />)}
        {events.length > visibleEvents.length && (
          <p className="px-2 text-chip font-medium text-ink-2">+{events.length - visibleEvents.length} more</p>
        )}
      </div>
    </div>
  );
}

function CalendarPage() {
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [currentMonth, setCurrentMonth] = useState(() => getSingaporeMonth());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    getCampaigns()
      .then((result) => {
        if (!active) return;
        setCampaigns(result.data);
        setError("");
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Campaign dates could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const events = useMemo(() => campaignCalendarEvents(campaigns), [campaigns]);
  const eventsByDate = useMemo(() => groupCalendarEvents(events), [events]);
  const monthDays = useMemo(() => buildCalendarDays(currentMonth), [currentMonth]);
  const upcomingEvents = useMemo(() => upcomingCalendarEvents(events), [events]);
  const scheduledCount = events.filter((event) => event.dateSource === "scheduled").length;
  const todayKey = getSingaporeDateKey(new Date());
  const plannedThisMonth = monthDays
    .filter((day) => day.inMonth)
    .reduce((total, day) => total + (eventsByDate.get(day.dateKey)?.length ?? 0), 0);

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-4 py-5 md:px-7 md:py-7" data-slot="reengage-calendar">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <PageHeader
          actions={(
            <>
              <Button onClick={() => setCurrentMonth(getSingaporeMonth())} variant="secondary">Today</Button>
              <Button asChild><Link to="/reengage/campaigns/new"><Plus aria-hidden="true" className="size-4" />New campaign</Link></Button>
            </>
          )}
          meta={`${campaigns.length} campaign${campaigns.length === 1 ? "" : "s"} · ${scheduledCount} scheduled`}
          subtitle="Every campaign appears automatically. Campaigns without an event date stay on their last-updated day until a Delivery date is planned."
          title="Calendar"
        />

        {error && (
          <div className="flex items-center gap-2 rounded-control border border-danger/20 bg-danger/10 px-4 py-3 text-body text-danger" role="alert">
            <CircleAlert aria-hidden="true" className="size-4 shrink-0" />{error}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <Card className="overflow-hidden p-0" aria-label="Campaign month calendar">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 md:px-5">
              <div className="flex items-center gap-2">
                <button
                  aria-label="Previous month"
                  className="inline-flex size-9 items-center justify-center rounded-full text-ink-2 outline-none hover:bg-surface-2 hover:text-ink focus-visible:ring-3 focus-visible:ring-ring/50"
                  onClick={() => setCurrentMonth((month) => shiftCalendarMonth(month, -1))}
                  type="button"
                >
                  <ChevronLeft aria-hidden="true" className="size-[18px]" />
                </button>
                <button
                  aria-label="Next month"
                  className="inline-flex size-9 items-center justify-center rounded-full text-ink-2 outline-none hover:bg-surface-2 hover:text-ink focus-visible:ring-3 focus-visible:ring-ring/50"
                  onClick={() => setCurrentMonth((month) => shiftCalendarMonth(month, 1))}
                  type="button"
                >
                  <ChevronRight aria-hidden="true" className="size-[18px]" />
                </button>
                <h2 className="ml-1 text-section-title font-medium text-ink">{calendarMonthLabel(currentMonth)}</h2>
              </div>
              <p className="text-label text-ink-2">{plannedThisMonth} campaign{plannedThisMonth === 1 ? "" : "s"} this month</p>
            </div>

            {loading ? (
              <div className="p-5"><Skeleton label="Loading campaign calendar" rows={6} variant="cards" /></div>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[760px]">
                  <div className="grid grid-cols-7 border-b border-line bg-surface-2/70">
                    {WEEKDAYS.map((weekday) => (
                      <div className="border-r border-line px-2 py-2 text-center text-chip font-medium uppercase tracking-wide text-ink-2 last:border-r-0" key={weekday}>
                        {weekday}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 border-l border-line">
                    {monthDays.map((day) => (
                      <CalendarDayCell day={day} events={eventsByDate.get(day.dateKey) ?? []} key={day.dateKey} todayKey={todayKey} />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Card>

          <div className="space-y-6">
            <Card description="The next scheduled campaign dates." title="Upcoming">
              {loading ? <Skeleton label="Loading upcoming campaigns" rows={3} variant="list" /> : upcomingEvents.length === 0 ? (
                <EmptyState icon={CalendarDays} message="No upcoming campaign dates yet." action={<Button asChild size="sm" variant="secondary"><Link to="/reengage/campaigns/new">Plan campaign</Link></Button>} />
              ) : (
                <ol className="space-y-4">
                  {upcomingEvents.map((event) => (
                    <li className="border-b border-line pb-4 last:border-0 last:pb-0" key={event.campaignId}>
                      <p className="mb-2 text-chip font-medium uppercase tracking-wide text-ink-2">{formatSingaporeEventDate(event.at)}</p>
                      <CampaignEventLink compact event={event} />
                    </li>
                  ))}
                </ol>
              )}
            </Card>

            <Card title="Channels">
              <div className="space-y-3 text-label text-ink-2">
                <p className="flex items-center gap-2"><span className="size-3 rounded-sm bg-mint" />WhatsApp campaign</p>
                <p className="flex items-center gap-2"><span className="size-3 rounded-sm bg-cyan" />Email campaign</p>
                <p className="flex items-center gap-2"><span className="size-3 rounded-sm bg-lavender" />No event date · shown when last updated</p>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}

export default CalendarPage;
