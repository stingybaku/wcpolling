# Product Requirements Document (PRD): World Cup Prediction Platform

## 1) Product Overview
**Project Name:** World Cup Prediction Platform

**Objective:** Build a social, group-based FIFA prediction game where users create predictions, submit per-group entries, and admins score matches in real time.

---

## 2) Goals & Success Metrics
**Primary Goals**
- Enable users to sign in (OAuth + credentials).
- Allow group creation/joining with invite codes.
- Let users create prediction sets and submit one chosen prediction per group.
- Provide admin match management and scoring.
- Show leaderboard per group and overall ranking.

**Success Metrics**
- 100% OAuth+email sign-in coverage.
- Group submission correctness (one submission per user/group).
- Admin scoring updates group rankings within 1 second.
- At least 80% smooth UI navigation (sign-in → dashboard → group → prediction).

---

## 3) Key User Personas
1. **Casual Fan**
   - Wants to predict game outcomes and compare with friends.
2. **Group Organizer**
   - Creates rooms, invites friends with codes, manages group membership.
3. **Admin / Contest Manager**
   - Adds matches, enters real scores, triggers automatic scoring.

---

## 4) Core Features

### A) Authentication
- OAuth (Google/Facebook) + credential login route.
- Session-based secure auth with NextAuth.
- Role-based access (`USER`, `ADMIN`).

### B) Group/Room Workflow
- Create group room with name, description, auto-generated invite code.
- Join existing group by invite code.
- Membership tracking per user/group.

### C) Predictions Workflow
- Create prediction sets (e.g. “Round 1 bracket”) with name/description.
- Add predicted scores for scheduled matches.
- Mark one prediction as “selected” per user.
- Save entries; update when changed.

### D) Group Submission Constraints
- Submit one prediction per group using selected prediction set.
- Store submission with timestamp and user/group references.
- Prevent multiple submissions for same group/user.

### E) Admin Scoring
- Admin match creation (home/away teams, date, stage, status).
- Admin enters final results.
- Auto-calculate points for each prediction entry (exact score, winner).
- Save per-match `PredictionScore`, aggregated group leaderboard.

### F) Dashboard & UX
- Landing page with sign-in.
- Dashboard showing user groups, predictions, submission status.
- Group details page with standings.
- Admin page with match list, score input, run scoring button.
- Responsive UI with Tailwind.

---

## 5) Data Model (High-Level)
- `User`: profile, role, predictions, memberships.
- `GroupRoom`: owner, invite code, memberships, submissions.
- `Match`: stage, teams, score, status.
- `Prediction`: user set, selected flag.
- `PredictionEntry`: predicted per-match scores.
- `PredictionSubmission`: chosen prediction per group.
- `PredictionScore`: per-submission points per match.

---

## 6) Technical Architecture
- **Web App:** Next.js App Router + TypeScript + Tailwind
- **Backend DB:** Prisma + SQLite (local, easy to switch to PostgreSQL)
- **Auth:** NextAuth with Google/Facebook + credentials
- **API:** Next.js app/api routes with server actions
- **Deployment:** Local dev, Docker/Railway readiness

---

## 7) MVP Scope (Phase 1)
- Auth pages + session.
- Group creation/join.
- Prediction create/edit + select/per group submit.
- Admin match entry + scoring.
- Group leaderboard.
- Basic error handling and validation.

---

## 8) Future Scope (Phase 2)
- Support live syncing (websockets/real-time).
- Bracket-style knockout predictions.
- Tournament-wide leaderboards with power-ups.
- Payment/subscription for custom leagues.
- Multi-language support and admin audit logs.

---

## 9) Non-Functional Requirements
- Secure access control for admin APIs.
- Fast response (<200ms) for dashboard APIs.
- Scalable to 1000+ concurrent users with PostgreSQL.
- Portable deployment (Railway, Vercel).

---

## 10) Implementation Notes
- Keep `lib/prisma.ts` as single global Prisma instance.
- Use `lib/auth.ts` for providers + callbacks.
- Put logic in reusable service functions in `app/api/*`.
- Keep UI state in client components with server mutations.
