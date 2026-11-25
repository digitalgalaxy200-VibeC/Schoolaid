/**
 * The persistent top bar for the school admin.
 *
 * Three things live here because they must be visible on EVERY screen, not just
 * the dashboard: which session/term the school is in, what needs approval, and
 * who is signed in. The term line is the one schools actually navigate by, so it
 * renders as a strip on phones too — it is not a dashboard widget.
 */

"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ShareAccessModal } from "./ShareAccessModal";
import {
  resolveCurrentTerm,
  schoolTodayISO,
  type AcademicSession,
  type TermProgress,
} from "@/lib/school-admin/term";

type TopBarProps = {
  schoolName?: string;
  schoolSlug?: string;
  schoolLogo?: string;
  email?: string;
  onOpenMenu: () => void;
  onSignOut: () => void;
};

type ReviewClass = { id: string; name: string; status?: string };

function progressLabel(progress: TermProgress): string {
  if (progress.status === "upcoming") {
    return `Starts in ${progress.daysRemaining} day${progress.daysRemaining === 1 ? "" : "s"}`;
  }
  if (progress.status === "ended") return "Term ended";
  return `Week ${progress.week} of ${progress.totalWeeks}`;
}

export function TopBar({
  schoolName,
  schoolSlug,
  schoolLogo,
  email,
  onOpenMenu,
  onSignOut,
}: TopBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  // The Collect screen owns its own student search. Showing the global
  // "Search students" field above it gave the bursar two boxes for one job.
  const showGlobalSearch = !pathname.startsWith("/school-admin/finance");

  const [sessions, setSessions] = useState<AcademicSession[] | null>(null);
  // The term strip renders only after `sessions` arrives, so reading the clock
  // in a lazy initialiser cannot produce a server/client mismatch.
  const [today] = useState(() => schoolTodayISO());
  const [pending, setPending] = useState<ReviewClass[]>([]);
  const [pendingLoaded, setPendingLoaded] = useState(false);

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");

  const notificationsRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/school-admin/sessions")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (Array.isArray(d)) setSessions(d);
      })
      .catch(() => {});

    fetch("/api/school-admin/report-card-review")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const classes: ReviewClass[] = Array.isArray(d?.classes) ? d.classes : [];
        setPending(classes.filter((c) => c.status === "pending_approval"));
      })
      .catch(() => {})
      .finally(() => setPendingLoaded(true));
  }, []);

  useEffect(() => {
    function onDocumentMouseDown(event: MouseEvent) {
      const target = event.target as Node;
      if (notificationsOpen && !notificationsRef.current?.contains(target)) {
        setNotificationsOpen(false);
      }
      if (userOpen && !userRef.current?.contains(target)) {
        setUserOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => document.removeEventListener("mousedown", onDocumentMouseDown);
  }, [notificationsOpen, userOpen]);

  const current = useMemo(
    () => (sessions && today ? resolveCurrentTerm(sessions, today) : null),
    [sessions, today],
  );

  const termLabel = current ? `${current.session.name} · ${current.term.name}` : null;
  const weekLabel = current ? progressLabel(current.progress) : null;

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = search.trim();
    router.push(
      query
        ? `/school-admin/students?search=${encodeURIComponent(query)}`
        : "/school-admin/students",
    );
    setSearchOpen(false);
  }

  const loginPath = schoolSlug ? `/school/${schoolSlug}/login` : "/login";
  const initial = (email || "A").charAt(0).toUpperCase();

  return (
    <header className="bg-surface border-b border-border shrink-0 z-30">
      <div className="h-14 px-4 tablet:px-6 flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenMenu}
          className="tablet:hidden -ml-1 p-2 rounded-md text-text-secondary hover:bg-bg hover:text-text-primary min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Open menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <Link
          href="/school-admin/dashboard"
          className="tablet:hidden min-w-0 flex-1 flex items-center gap-2"
        >
          {schoolLogo && (
            <img
              src={schoolLogo}
              alt=""
              className="w-6 h-6 rounded object-contain bg-white border border-border shrink-0"
            />
          )}
          <span className="font-bold text-primary truncate text-h3">
            {schoolName || "School Portal"}
          </span>
        </Link>

        {showGlobalSearch && (
        <form onSubmit={submitSearch} className="hidden tablet:block flex-1 max-w-md" role="search">
          <label htmlFor="school-admin-search" className="sr-only">
            Search students
          </label>
          <div className="relative">
            <svg
              className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
            </svg>
            <input
              id="school-admin-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search students…"
              className="w-full h-9 pl-9 pr-3 text-small bg-bg border border-border rounded-lg text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </form>
        )}

        <div className="flex items-center gap-1 tablet:gap-2 ml-auto">
          {termLabel && (
            <div
              className="hidden tablet:flex items-center gap-2 px-3 py-1.5 rounded-full bg-bg border border-border text-caption text-text-secondary max-w-[320px] min-w-0"
              title={`${termLabel} — ${weekLabel}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-success shrink-0" aria-hidden="true" />
              <span className="truncate">{termLabel}</span>
              {weekLabel && (
                <>
                  <span className="text-text-muted shrink-0" aria-hidden="true">·</span>
                  <span className="font-semibold text-text-primary whitespace-nowrap">{weekLabel}</span>
                </>
              )}
            </div>
          )}

          {showGlobalSearch && (
          <button
            type="button"
            onClick={() => setSearchOpen((open) => !open)}
            className="tablet:hidden p-2 rounded-md text-text-secondary hover:bg-bg hover:text-text-primary min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Search"
            aria-expanded={searchOpen}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
            </svg>
          </button>
          )}

          <div className="relative" ref={notificationsRef}>
            <button
              type="button"
              onClick={() => {
                setNotificationsOpen((open) => !open);
                setUserOpen(false);
              }}
              className="relative p-2 rounded-md text-text-secondary hover:bg-bg hover:text-text-primary min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label={
                pending.length > 0
                  ? `Notifications: ${pending.length} classes awaiting report card approval`
                  : "Notifications"
              }
              aria-expanded={notificationsOpen}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {pending.length > 0 && (
                <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-error text-[10px] font-bold text-white leading-4 text-center">
                  {pending.length > 9 ? "9+" : pending.length}
                </span>
              )}
            </button>

            {notificationsOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-surface border border-border rounded-lg shadow-lg z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-border">
                  <p className="text-small font-semibold text-text-primary">Needs attention</p>
                </div>
                {pending.length === 0 ? (
                  <p className="px-4 py-5 text-small text-text-muted">
                    {pendingLoaded ? "You're all caught up." : "Checking…"}
                  </p>
                ) : (
                  <ul className="max-h-64 overflow-auto">
                    {pending.map((cls) => (
                      <li key={cls.id}>
                        <Link
                          href="/school-admin/report-cards"
                          onClick={() => setNotificationsOpen(false)}
                          className="block px-4 py-2.5 hover:bg-bg"
                        >
                          <span className="block text-small font-medium text-text-primary truncate">
                            {cls.name}
                          </span>
                          <span className="block text-caption text-text-muted">
                            Report cards awaiting approval
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                <Link
                  href="/school-admin/report-cards"
                  onClick={() => setNotificationsOpen(false)}
                  className="block px-4 py-2.5 border-t border-border text-caption font-semibold text-primary hover:bg-bg"
                >
                  Open report cards
                </Link>
              </div>
            )}
          </div>

          <div className="relative" ref={userRef}>
            <button
              type="button"
              onClick={() => {
                setUserOpen((open) => !open);
                setNotificationsOpen(false);
              }}
              className="w-9 h-9 rounded-full bg-primary-light text-primary font-bold text-small flex items-center justify-center hover:bg-primary hover:text-white transition-colors"
              aria-label="Account menu"
              aria-expanded={userOpen}
            >
              {initial}
            </button>

            {userOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-surface border border-border rounded-lg shadow-lg z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-border">
                  <p className="text-small font-semibold text-text-primary truncate">
                    {schoolName || "School Portal"}
                  </p>
                  <p className="text-caption text-text-muted truncate">{email || "Admin"}</p>
                </div>
                <div className="py-1">
                  <Link
                    href="/school-admin/profile"
                    onClick={() => setUserOpen(false)}
                    className="block px-4 py-2 text-small text-text-secondary hover:bg-bg hover:text-text-primary"
                  >
                    School settings
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setUserOpen(false);
                      setShareOpen(true);
                    }}
                    className="block w-full text-left px-4 py-2 text-small text-text-secondary hover:bg-bg hover:text-text-primary"
                  >
                    Share access
                  </button>
                </div>
                <div className="border-t border-border py-1">
                  <button
                    type="button"
                    onClick={onSignOut}
                    className="block w-full text-left px-4 py-2 text-small font-medium text-error hover:bg-error-bg"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showGlobalSearch && searchOpen && (
        <form onSubmit={submitSearch} className="tablet:hidden px-4 pb-2" role="search">
          <label htmlFor="school-admin-search-mobile" className="sr-only">
            Search students
          </label>
          <input
            id="school-admin-search-mobile"
            type="search"
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search students…"
            className="w-full h-10 px-3 text-body bg-bg border border-border rounded-lg text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </form>
      )}

      <div className="tablet:hidden flex items-center gap-2 px-4 py-1.5 border-t border-border text-caption">
        {termLabel ? (
          <>
            <span className="text-text-muted truncate">{termLabel}</span>
            {weekLabel && (
              <span className="ml-auto font-semibold text-primary whitespace-nowrap">{weekLabel}</span>
            )}
          </>
        ) : (
          <span className="text-text-muted">No active term</span>
        )}
      </div>

      <ShareAccessModal
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        schoolName={schoolName || "your school"}
        loginPath={loginPath}
      />
    </header>
  );
}
