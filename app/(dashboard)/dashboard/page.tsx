import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/Button";
import { InvitesStrip } from "@/components/dashboard/InvitesStrip";
import { MyTasks } from "@/components/dashboard/MyTasks";
import { SetupChecklist } from "@/components/dashboard/SetupChecklist";
import { StatCards } from "@/components/dashboard/StatCards";
import { UpcomingEvents } from "@/components/dashboard/UpcomingEvents";
import { ExternalLinkIcon, PlusBoldIcon } from "@/components/icons";
import { greetingIST, todayIST } from "@/lib/dates";
import { pageMember } from "@/lib/page-access";
import { getDashboard } from "@/modules/dashboard/service";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { user, member } = await pageMember();
  // The layout has already sent anyone without a wedding to onboarding.
  const { wedding } = member!;
  const data = await getDashboard(wedding.id, { userId: user.id, role: member!.role });
  const firstName = user.name.trim().split(/\s+/)[0];

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 bg-ivory px-5 py-5 sm:px-8">
        <div className="min-w-0">
          <p className="text-xs text-ink-secondary">
            {greetingIST()}, {firstName}
          </p>
          <h1 className="mt-0.5 font-display text-2xl leading-tight text-ink lg:text-[28px]">
            {wedding.brideName} &amp; {wedding.groomName}’s wedding
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/w/${wedding.slug}`}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-xs font-medium text-ink shadow-2xs transition-colors hover:bg-ivory"
          >
            <span>View website</span>
            <ExternalLinkIcon className="size-3.5 text-ink-secondary" />
          </Link>
          <ButtonLink href="/guests" className="h-auto gap-2 px-4 py-2 text-xs shadow-2xs">
            <PlusBoldIcon strokeWidth={2} className="size-3.5" />
            <span>Add guest</span>
          </ButtonLink>
        </div>
      </header>

      <div className="flex-1 space-y-6 p-5 sm:p-8">
        <StatCards data={data} />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <UpcomingEvents events={data.upcomingEvents} />
          <MyTasks tasks={data.tasks} today={todayIST()} />
        </div>
        {data.pendingInviteNames && <InvitesStrip names={data.pendingInviteNames} />}
        <SetupChecklist setup={data.setup} />
      </div>
    </>
  );
}
