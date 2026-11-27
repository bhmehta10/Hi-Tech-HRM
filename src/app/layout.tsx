import "./globals.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { currentUser } from "@/lib/server/auth";

export const metadata: Metadata = { title: "Hi-Tech HRM" };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const isAdmin = user?.role === "ADMIN";
  const canApprove = user && user.role !== "EMPLOYEE";
  return (
    <html lang="en">
      <body>
        {user && (
          <header className="top">
            <strong>Hi-Tech HRM</strong>
            <nav>
              <Link href="/">Home</Link>
              <Link href="/attendance">Attendance</Link>
              <Link href="/leave">Leave</Link>
              {canApprove && <Link href="/approvals">Approvals</Link>}
              {isAdmin && <Link href="/admin/employees">Employees</Link>}
              {isAdmin && <Link href="/admin/reports">Reports</Link>}
              {isAdmin && <Link href="/admin/setup">Setup</Link>}
              {/* A POST form, not a link: Next.js prefetches links, which would sign people out. */}
              <form action="/logout" method="post" style={{ display: "inline" }}>
                <button className="secondary" style={{ padding: "2px 8px" }}>Sign out ({user.name})</button>
              </form>
            </nav>
          </header>
        )}
        <main>{children}</main>
      </body>
    </html>
  );
}
