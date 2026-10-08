import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist_Mono, IBM_Plex_Sans, Source_Serif_4 } from "next/font/google";
import { NavLinks } from "./_components/NavLinks";
import { SidebarToggle } from "./_components/SidebarToggle";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
});

// opsz is included so the browser's default optical sizing applies: a 46px
// name on the conference profile wants a different cut from a 19px heading,
// and without the axis every size renders at the 14pt text default.
const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  axes: ["opsz"],
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MYP Feedback Assistant",
  description: "Evidence-anchored grading and feedback for MYP mathematics assessments.",
};

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/classes", label: "Classes" },
  { href: "/students", label: "Students" },
  { href: "/students/conferences", label: "Conferences" },
  { href: "/assessments", label: "Assessments" },
  { href: "/ia", label: "IA" },
  { href: "/settings", label: "Settings" },
];

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read here rather than on the client so a collapsed sidebar is collapsed on
  // the first paint of every page, not after a flash of the open one.
  const collapsed = (await cookies()).get("nav")?.value === "collapsed";

  return (
    <html
      lang="en"
      className={`${plexSans.variable} ${sourceSerif.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body
        data-nav={collapsed ? "collapsed" : "open"}
        className="group/app min-h-full flex bg-ground font-sans text-slate-900"
      >
        {/* The nav is a flex sibling of the page, so without print:hidden it prints
            at the top of the first sheet and leaves a 14rem gutter down every page.
            sticky h-screen keeps it in place on pages taller than the viewport —
            the review screen scrolls the window now rather than an inner pane. */}
        <aside className="sticky top-0 h-screen w-56 shrink-0 border-r border-slate-200 bg-panel flex flex-col print:hidden group-data-[nav=collapsed]/app:w-11">
          <div className="flex items-start justify-between gap-2 px-5 py-6 group-data-[nav=collapsed]/app:px-1.5">
            <span className="block font-display text-xl font-semibold leading-tight tracking-tight group-data-[nav=collapsed]/app:hidden">
              Feedback
              <br />
              Assistant
            </span>
            <SidebarToggle initialCollapsed={collapsed} />
          </div>
          <nav className="flex-1 px-3 pb-6 group-data-[nav=collapsed]/app:hidden">
            <NavLinks items={NAV_ITEMS} />
          </nav>
        </aside>
        <main className="flex-1 min-h-screen overflow-y-auto print:overflow-visible">
          {/* Wider with the sidebar folded away: that is what folding it is for. */}
          <div className="mx-auto max-w-5xl px-8 py-8 group-data-[nav=collapsed]/app:max-w-7xl print:max-w-none print:px-0 print:py-0">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
