"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { apiClient } from "@/lib/api-client";
import {
  ActivityLogsIcon,
  ClockTaskIcon,
  CloseIcon,
  DashboardIcon,
  LogoMarkIcon,
  MenuIcon,
  PlusIcon,
} from "../ui/Icons";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", shortLabel: "Home", icon: DashboardIcon, matchExact: true },
  { href: "/tasks", label: "Scheduled Tasks", shortLabel: "Tasks", icon: ClockTaskIcon, matchExact: false },
  { href: "/logs", label: "Execution Logs", shortLabel: "Logs", icon: ActivityLogsIcon, matchExact: false },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [apiOnline, setApiOnline] = useState<"checking" | "online" | "offline">("checking");

  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        await apiClient.getHealth();
        if (active) setApiOnline("online");
      } catch {
        if (active) setApiOnline("offline");
      }
    };
    void check();
    const timer = setInterval(() => void check(), 30_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const isActive = (href: string, matchExact: boolean) => {
    if (matchExact) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const statusDotClass =
    apiOnline === "online"
      ? "bg-emerald-500"
      : apiOnline === "offline"
        ? "bg-rose-500"
        : "bg-amber-400";

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between px-4 py-6">
      <div>
        {/* Brand */}
        <Link
          href="/"
          onClick={() => setMobileOpen(false)}
          className="flex items-center gap-3 px-2"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#5865F2] to-[#4338CA] text-white shadow-md shadow-indigo-500/25">
            <LogoMarkIcon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[15px] font-semibold tracking-tight text-slate-900">
              PulseHook
            </p>
            <p className="text-[11px] font-medium text-slate-400">
              Discord Scheduler
            </p>
          </div>
        </Link>

        {/* Primary Action */}
        <div className="mt-6">
          <Link
            href="/tasks/new"
            onClick={() => setMobileOpen(false)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#5865F2] px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-500/25 transition-all hover:bg-[#4752C4] hover:shadow-md hover:shadow-indigo-500/30 active:scale-[0.99]"
          >
            <PlusIcon className="h-4 w-4" />
            New Task
          </Link>
        </div>

        {/* Navigation */}
        <div className="mt-7">
          <p className="px-3 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
            Workspace
          </p>
          <nav className="mt-2.5 space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href, item.matchExact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                    active
                      ? "bg-[#EEF0FF] text-[#4752C4] shadow-2xs"
                      : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
                  }`}
                >
                  <Icon
                    className={`h-[18px] w-[18px] transition-colors ${
                      active
                        ? "text-[#5865F2]"
                        : "text-slate-400 group-hover:text-slate-600"
                    }`}
                  />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Bottom Engine Status Card */}
      <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-700">
            Scheduler Engine
          </span>
          <span className="relative flex h-2.5 w-2.5">
            {apiOnline === "online" && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            )}
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${statusDotClass}`} />
          </span>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
          {apiOnline === "online"
            ? "Connected to NestJS API & PostgreSQL"
            : apiOnline === "offline"
              ? "Backend unreachable — check server on port 4000"
              : "Checking API connectivity..."}
        </p>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen w-full overflow-x-hidden bg-[#F6F7FB]">
      {/* Desktop Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-[#E5E8F0] bg-white lg:block">
        {sidebarContent}
      </aside>

      {/* Mobile Slide-Over Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-10 flex w-72 max-w-[85vw] flex-col bg-white shadow-2xl">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close navigation"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col lg:pl-64">
        {/* Mobile Top Bar */}
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[#E5E8F0] bg-white/90 px-4 py-3 backdrop-blur-md lg:hidden">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 active:bg-slate-200/70"
              aria-label="Open navigation"
            >
              <MenuIcon className="h-5 w-5" />
            </button>
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#5865F2] to-[#4338CA] text-white shadow-xs">
                <LogoMarkIcon className="h-4 w-4" />
              </div>
              <span className="text-sm font-semibold tracking-tight text-slate-900">
                PulseHook
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600"
              title="Backend scheduler status"
            >
              <span className={`h-2 w-2 rounded-full ${statusDotClass}`} />
              {apiOnline === "online"
                ? "Live"
                : apiOnline === "offline"
                  ? "Offline"
                  : "..."}
            </span>
            <Link
              href="/tasks/new"
              className="inline-flex items-center gap-1 rounded-xl bg-[#5865F2] px-3 py-1.5 text-xs font-semibold text-white shadow-xs active:scale-95"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              New
            </Link>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 pt-5 pb-24 sm:px-6 sm:pt-7 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[#E5E8F0] bg-white/95 px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md lg:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-4 items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href, item.matchExact);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-1 rounded-xl py-1.5 text-[11px] font-semibold transition-colors ${
                  active
                    ? "bg-[#EEF0FF]/80 text-[#4752C4]"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Icon
                  className={`h-[19px] w-[19px] ${
                    active ? "text-[#5865F2]" : "text-slate-400"
                  }`}
                />
                <span>{item.shortLabel}</span>
              </Link>
            );
          })}
          <Link
            href="/tasks/new"
            className={`flex flex-col items-center justify-center gap-1 rounded-xl py-1.5 text-[11px] font-semibold transition-colors ${
              pathname === "/tasks/new"
                ? "bg-[#5865F2] text-white"
                : "text-[#5865F2] hover:bg-[#EEF0FF]"
            }`}
          >
            <PlusIcon className="h-[19px] w-[19px]" />
            <span>Create</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
