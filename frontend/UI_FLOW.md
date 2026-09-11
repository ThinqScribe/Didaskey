# Didaskey interface structure

Didaskey is a focused pre-varsity tutoring product. The interface should always answer three questions: what is next, what needs attention, and where can the learner or tutor act.

## Visual language

- Warm ivory `#F8F3EA` is the canvas; off-white `#FFFCF7` is the primary surface.
- Deep teal is reserved for primary actions, live-learning emphasis and selected navigation.
- Pale mint, gold and blue communicate progress and status without making the product feel childish.
- Plus Jakarta Sans, short labels, 44–56 px touch targets, 16–30 px radii and restrained shadows create a calm, approachable hierarchy.
- Content is capped at 760 px so mobile screens stay natural and web/tablet views do not stretch into hard-to-scan rows.

The redesign is original. It draws on recurring education UX patterns visible in [language tutoring profiles](https://dribbble.com/shots/26613864-Language-Learning-App-UI), [homework planning](https://dribbble.com/shots/23769958-Homework-Planner-App-for-Students), and [structured mentor dashboards](https://dribbble.com/shots/20859664-Personal-Online-Education-App): put the next learning action first, show progress in small scannable units, and preserve tutor trust signals near booking decisions.

## Student flow

1. **Sign in or create account** — one clear form, recovery link, student/tutor role choice and pre-varsity education level.
2. **Home** — greeting and search, next confirmed lesson, progress snapshot, subject exploration, recommended verified tutors.
3. **Find tutor** — query, subject, session-format, rating and maximum-price filters; paginated tutor cards.
4. **Tutor profile** — identity and verification, experience/rating/hours, subjects, qualifications, delivery format, reviews, then one persistent price-and-book action.
5. **Book** — subject and duration, authoritative available slot, confirmation, Paystack checkout, provider-confirmed success.
6. **Bookings** — status filters and readable lesson cards; pay, open, join or cancel only when valid.
7. **Learning** — session summary followed by messages, materials, practice and notes; whiteboard is a deliberate secondary tool.
8. **Lobby and classroom** — camera/microphone check, live video as the primary surface, resources and chat one tap away, explicit leave/end behavior.
9. **After lesson** — persistent materials and notes, tutor feedback, progress update and student review.

Bottom navigation: **Home · Search · Bookings · Learning · Profile**. Labels remain visible; icons are reinforcement, not the only cue.

## Tutor flow

1. **Dashboard** — identity/verification, quick access to learning and setup, all-time teaching snapshot, upcoming sessions and recent activity.
2. **Sessions** — status-filtered teaching calendar and session actions.
3. **Students** — roster derived from real bookings, with access to learning spaces.
4. **Earnings** — gross successful completed-session value, clearly distinguished from payout balance.
5. **Profile** — public presentation and account controls; Teaching setup manages rate, subjects and WAT availability.

Bottom navigation: **Dashboard · Sessions · Students · Earnings · Profile**.

## Administrator flow

Admin remains operational rather than marketplace-facing: review tutor applications, inspect the public tutor profile, approve/reject, manage accounts, inspect bookings, cancel sessions and request refunds with confirmation. Admin never appears as a public signup role.

## Interaction rules

- Loading, empty, offline and retry states are part of every data surface.
- Financial actions never claim success before server/provider confirmation.
- Destructive actions require explicit confirmation and retain the current screen on failure.
- The warm interface is used outside the live room; the classroom uses a dark focused shell for video contrast.
- Messages, assignment drafts and whiteboard strokes use retry-safe identifiers where supported.
