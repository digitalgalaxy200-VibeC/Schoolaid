import type { PublicSchool } from "@/lib/site/types";

export function Footer({ school }: { school: PublicSchool }) {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-gray-200 bg-gray-900 text-gray-400">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
        <div className="grid gap-8 lg:grid-cols-12">
          {/* School Brand */}
          <div className="lg:col-span-6 space-y-4">
            <div className="flex items-center gap-3">
              {school.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={school.logoUrl}
                  alt={school.name}
                  className="h-10 w-10 rounded-lg object-contain bg-white p-1"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--site-primary)] text-sm font-black text-white">
                  {school.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <span className="text-lg font-bold text-white tracking-tight">
                {school.name}
              </span>
            </div>
            {school.motto ? (
              <p className="text-xs italic text-gray-400 max-w-sm">&ldquo;{school.motto}&rdquo;</p>
            ) : null}
            {school.address ? (
              <p className="text-xs text-gray-400 max-w-sm">{school.address}</p>
            ) : null}
          </div>

          {/* Quick Links */}
          <div className="lg:col-span-3 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white">Quick Navigation</h4>
            <ul className="space-y-2 text-xs">
              <li>
                <a href="#about" className="hover:text-white transition-colors">About the School</a>
              </li>
              <li>
                <a href="#programs" className="hover:text-white transition-colors">Academic Programmes</a>
              </li>
              <li>
                <a href="#principal" className="hover:text-white transition-colors">Principal&apos;s Message</a>
              </li>
              <li>
                <a href="#gallery" className="hover:text-white transition-colors">Campus Gallery</a>
              </li>
              <li>
                <a href="#contact" className="hover:text-white transition-colors">Contact & Location</a>
              </li>
            </ul>
          </div>

          {/* Portal Links */}
          <div className="lg:col-span-3 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white">School Portals</h4>
            <ul className="space-y-2 text-xs">
              <li>
                <a href="/login" className="hover:text-white transition-colors font-semibold text-[var(--site-tint)]">
                  Student / Parent Login →
                </a>
              </li>
              <li>
                <a href="/login" className="hover:text-white transition-colors">
                  Teacher & Staff Portal →
                </a>
              </li>
              <li>
                <a href="/login" className="hover:text-white transition-colors">
                  School Administration →
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-gray-800 pt-8 sm:flex-row text-xs text-gray-500">
          <p>© {currentYear} {school.name}. All rights reserved.</p>
          <div className="flex items-center gap-2">
            <span>Powered by</span>
            <span className="font-bold text-gray-300">SchoolAid</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
