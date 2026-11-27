# Hi-Tech HRM

Attendance, leave and payroll-ready exports for one company of about 15–50 people, with
eSSL / ZKTeco biometric devices pushing punches straight to the server.

**Version 1 includes**

- eSSL / ZKTeco push (ADMS) receiver, plus file import for older devices
- Shifts (including night shifts), weekly offs, holidays, grace time, half-day and overtime rules
- Daily attendance processing every 15 minutes, with missed-punch correction requests
- Leave types with monthly accrual, balances, and manager approval
- Monthly muster with paid days, LOP, late marks and OT; month lock; CSV export for Tally
- Mobile-friendly web portal for employees, managers and HR (no app to install)

Product plan and roadmap: see the Hi-Tech HRM spec document.

## How it works

```
eSSL device --(HTTP push, port 8081)--> /iclock/cdata --> RawPunch (stored unchanged)
                                                             |
                              scheduler (every 15 min) ------+--> AttendanceDay (status per employee per day)
                                                                       |
                              leave + punch corrections approved ------+
                                                                       v
                                            Reports -> lock month -> CSV for Tally
```

The attendance rules live in `src/lib/domain/attendance.ts` as a pure function with tests in
`tests/`. Changing a rule and re-processing a month recomputes everything from the raw punches.

## Running it

You need a machine that stays on and that the devices can reach: a small cloud server in India
(around ₹500–1,500/month) or an always-on office PC. Install Docker, then:

```bash
cp .env.example .env          # fill in SESSION_SECRET, POSTGRES_PASSWORD, ADMIN_PASSWORD
docker compose up -d --build
docker compose exec app npx tsx prisma/seed.ts   # creates shift, leave types, admin login
```

Open `http://<server>/` and sign in with `ADMIN` and your `ADMIN_PASSWORD`. Then, in **Setup**:
check the General shift, add holidays and departments, and add each device's serial number.
In **Employees**, add staff with their device user ID (the number they are enrolled under on the
eSSL device). Use **Setup → Leave balance adjustment** for opening balances.

Put HTTPS in front of port 80 (for example with Caddy) before staff use it outside the office,
then set `COOKIE_SECURE=true`. Leave port 8081 as plain HTTP for the devices, since most eSSL
firmware cannot do HTTPS.

## Connecting an eSSL device

1. On the device: **Menu → Comm. → Cloud Server Setting** (on some models **ADMS**).
2. Set **Server address** to the server's IP or domain and **Server port** to `8081`.
   Turn off **Proxy** and, if shown, set **HTTPS** off.
3. Note the serial number (**Menu → System Info → Device Info**) and add it under **Setup**.
4. Within a minute the device shows as "last seen" on the Home and Setup pages, and new punches
   flow in. Older logs are uploaded too; duplicates are ignored.

If your model has no Cloud Server / ADMS menu, export the attendance log to a USB drive or
from eTimeTrackLite and use **Setup → Import punches from a file**. CSV format:
`user id, YYYY-MM-DD HH:MM:SS` per line.

## Tally export

**Reports → Download for Tally (CSV)** gives one row per employee with paid days, LOP days,
paid and unpaid leave, late marks and OT hours. Lock the month first so the numbers stop
changing. Paid days use a calendar-day basis: present, paid leave, weekly offs and holidays
count 1, a half day 0.5, and absent, leave without pay and uncorrected missed punches 0.

## Development

```bash
npm install
cp .env.example .env              # point DATABASE_URL at a local Postgres
npx prisma migrate dev
ADMIN_PASSWORD=changeme123 npm run db:seed
npm run dev                       # http://localhost:3000
npm test                          # attendance, device parsing and export rules
npm run attendance:process -- 2026-11-01 2026-11-30   # re-run a date range
```

Test a device without hardware:

```bash
printf '101\t2026-11-26 09:42:10\t0\t1\n101\t2026-11-26 18:45:00\t1\t1\n' |
  curl -X POST --data-binary @- "http://localhost:3000/iclock/cdata?SN=<serial>&table=ATTLOG"
```

Stack: Next.js 15 (App Router, server actions), TypeScript, Prisma, PostgreSQL. All times are IST.

## Not in version 1 yet

Salary calculation and statutory files (PF ECR, ESI, PT, TDS), document vault screens, MIS
dashboards, email notifications, multi-level approvals, and the sandwich leave rule. The data
model already has room for documents and audit history.
