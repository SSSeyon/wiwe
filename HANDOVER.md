# Wiwe Apartments: Operations app · Handover

Version 1.9.0 · Vanilla HTML/CSS/JS PWA · GitHub Pages + Firebase (Auth + Firestore)

## 1. Go-live checklist

1. **Firebase project.** Create a project, then add a Web app and copy its config into `config.js`.
2. **Authentication.** Go to Sign-in method and enable **Email/Password**. This is only the engine underneath: staff sign in with a **username and password** and never see or need an email. Each account gets a hidden random login (`…@wiwe.staff`), and `usernames/{username}` points to it.
3. **Authorized domains.** In Authentication → Settings, add `<you>.github.io`, plus your custom domain if you have one.
4. **Firestore.** Create the database. Lagos has no region, so `europe-west` is closest. Paste `firestore.rules` into the Rules tab and **Publish**.
5. **GitHub Pages.** Push the folder to a repo and enable Pages from `main` / root.
6. **First-time setup.** Open the site, then tap **First time? Set up**. This creates:
   - the owner account (admin) and the admin code
   - 15 rooms (101–108 Standard, 109–115 With kitchen), each with a starter item list
   - 8 starter store items
7. **Admin settings.** Unlock with the admin code:
   - **Rooms and rates:** set the real rate per room type, rename rooms, and edit the item lists
   - **General:** caution fee amount, approval limit, check-in/out times
   - **Staff:** add accounts with a username, a password (6+ characters) and roles. Name accounts after the role (`frontdesk1`, `cleaner1`) so they can be handed over
8. **Store and assets.** Enter opening stock in Inventory (Stock count works well for this). Add assets in Maintenance → Assets (ACs, generator, fridges, TVs, inverter, pump), with service intervals.

No paid Firebase plan is needed. Photos are compressed on the phone (about 100 KB each) and stored in Firestore, so Cloud Storage isn't used.

## 2. Files

| File | Purpose |
|---|---|
| `index.html` | Shell: sidebar, top bar, modal, toast |
| `styles.css` | All styles; light tokens on `:root`, dark on `body.dark-mode` |
| `config.js` | Firebase config and `LOGIN_DOMAIN` |
| `js/core.js` | Firebase init, state `S`, helpers, photos, audit, auth and setup, live listeners, alerts, nav and render |
| `js/front.js` | Room board, check-in, reservations, stays, extend, check-out, caution refunds, payments, incidents |
| `js/ops.js` | Housekeeping tasks, maintenance (jobs, assets, service schedule, vendors), inventory, expenses |
| `js/admin.js` | Owner Today, Reports and CSV, admin settings (code-locked): general, rooms and rates, staff, codes, activity log, backup |
| `sw.js` | Offline app shell (network-first). **Bump `CACHE` on every deploy.** |
| `firestore.rules` | The real security. Re-publish whenever you change it. |

Same conventions as Tracker: global functions, inline `onclick`, no build step. Views register on `VIEWS[name] = {title, render(), actions?()}`. `go(view, params)` switches screens, and `render()` redraws whenever data changes. Forms live in modals, so live updates never wipe what someone is typing.

## 3. Roles

| Role | Can do |
|---|---|
| Admin (owner) | Everything. Confirms payments, approves discounts and expenses, unlocks admin settings |
| Manager | All operations, store, reports, verifies repairs, records caution refunds, resolves incidents |
| Front desk | Room board, check-in/out, reservations, extensions, expenses, inspects cleaned rooms |
| Housekeeping | Cleaning tasks, restocking from store, reporting faults and unexpected room use |
| Maintenance | Jobs, assets, service schedule, vendors |

One person can hold several roles. Roles are enforced in `firestore.rules`, not only hidden in the UI.

## 4. Anti-leak controls

- **Payments.** _(Replaced in v3.0.0: payments are final when recorded, see section 22.)_ Every payment was recorded as *Unconfirmed* with the sender name, reference and receipt photo. Only the admin can mark it *Seen in bank* or *Not received*. "Not received" creates an incident.
- **Rates.** Front desk can't change rates. Discounts need a reason and stay *pending* until the owner approves. A rejected discount is added back to the guest's balance.
- **Room state machine.**
  - Check-out → Dirty (cleaning task created automatically) → Cleaning → Inspection → Ready. A room can't be checked in unless it's Ready.
  - Out of order → Dirty → … again.
- **Unexpected use.** Housekeeping can report a Ready room that shows signs of use. That creates an incident for the owner.
- **Room items.** Every item is counted at check-out. Shortfalls and damage go to the stay, the caution fee and an incident.
- **Key cards.** The card number is recorded at check-in, and whether it was returned at check-out.
- **Store.** Quantities only change through Receive, Issue, restock or Stock count, and every change is logged in `moves`. Stock count shortfalls create an incident. *Usage per night* shows consumption per guest night.
- **Expenses and purchases.** Anything above the approval limit is *pending* until the owner approves. Receipts are photographed.
- **Diesel.** Litres and the generator hour meter are recorded at each refill. The expense detail shows litres per hour.
- **Repairs.** A job needs a note on the work done, an "after" photo and a receipt before it can be closed. A manager then verifies it, and the cost becomes an expense.
- **Overstays and no-shows** are flagged automatically.
- **Activity log.** `audit` can't be edited or deleted by anyone. Records are voided, never deleted.

## 5. Data (Firestore collections)

- `users`
- `settings/general`, `settings/security` (hash of the admin code, readable by admin only)
- `meta/setup`
- `roomTypes` `{name, rate, hasKitchen, items[{name,qty}]}`
- `rooms` `{number, typeId, status, currentStayId, order, oooReason, readyAt, archived}`
- `stays`: guest, dates, rate, discount and discountStatus, total/paid/balance, caution and cautionStatus, cardNo, missing[], status reserved|checked_in|checked_out|cancelled|no_show
- `payments` `{stayId, amount, kind room|extension|balance|caution|damage|refund, method, sender, ref, photos, status}`
- `tasks` (housekeeping; daily tasks have the fixed id `daily_<stayId>_<date>`)
- `jobs`, `assets`, `vendors`
- `items`, `moves`
- `expenses`
- `incidents`
- `photos` `{data: base64 JPEG}`
- `audit`

Timestamps are epoch milliseconds. Dates are `YYYY-MM-DD` strings in local (Lagos) time.

## 6. Known limits and next ideas

- **Handing over an account / forgotten password.** In Admin settings → Staff → **Hand over / reset password**, the owner creates a fresh hidden login for the same username, with the same roles and a new password. The old login is deactivated at once. The previous holder's user record stays (inactive), so everything they did is still attributed to them. Everyone can change their own password with the key button next to their name.
- **Live lists** hold the most recent 300–600 records. Reports query Firestore directly by month, so they're complete.
- **Ideas for later:**
  - WhatsApp/SMS check-in messages to guests
  - Payroll
  - Prepaid meter top-up log per room
  - Restore from a backup file

## 7. Branding and room board (v1.2.0)

- **Colours:** black from the Wiwe logo and cream from the building (`--cream #F4E6B8`). Tokens live at the top of `styles.css`.
- **Images** in `img/`:
  - `logo.png`: the Wiwe logo, black on a transparent background
  - `icon-192.png` and `icon-512.png`: app icons (logo on cream)
  - `building.jpg`: the exterior, shown on the login screen
- **Room board** has two layouts, Building (default) and Cards, and remembers the choice per device.
  - **Building** draws the block floor by floor (top floor first), with rooms left to right.
  - Each room has a `floor` (0 = Ground). If it isn't set, the floor comes from the room's position: 5 rooms per floor, so 101–105 Ground, 106–110 First, 111–115 Second.
  - Set the floor and position in Admin settings → Rooms and rates → 2 · Rooms.
- **Room types vs rooms:** a room type is a price category. Only **rooms** appear on the board. A type that no room uses can be deleted.

## 8. 3D building (v1.3.0)

- **Where:** `js/building3d.js`. It loads three.js r128 from cdnjs only when the 3D view opens, and the service worker caches it after first use.
- **Model:** based on the real block at Onilude Street, Sowhe (6.41526, 2.88910). It's a 20 m × 12 m block with its long side facing the road (north). Three storeys at 3.2 m. Cream walls, white pilasters, green-framed windows, AC units, an arched stair/balcony bay at the west end of the front, a brown hipped roof with solar panels, and a compound wall with blue pillars, a black gate and a gatehouse.
- **Room slots on every floor:** positions 1–2 face the road (west → east), positions 3–5 face the back (west → east). A room's floor and position come from Admin settings → Rooms; otherwise from board order, 5 per floor. Each room's windows (and its floor in the cut-away view) take its status colour, and the room-number labels open the room.
- **Controls:**
  - drag to rotate (vertical drag tilts the view with a mouse)
  - scroll or pinch to zoom
  - Front, Back and +/− buttons
  - floor buttons that hide the floors above and the roof, to show the rooms from above
- **Fallback:** if WebGL or the CDN isn't available, the 2D "Floors" layout is shown. The Room board also keeps "Floors" and "Cards" as layouts.

## 9. Building page and room identification (v1.4.0)

- **Model corrected from the opening video.** The entrance is on the **short end** (on the left as seen from the road), not the long front. From outside, facing the entrance:
  - in the middle, an arched bay over 3 floors: entrance and reception on the ground floor, a balcony with a door, window and railing on each upper floor
  - on the left, a tall pair of louvred windows on each floor
  - on the right, a smaller window on each floor
  - on top, a raised parapet with a dark cap
- **Corridor:** runs from the entrance through the middle of the building.
- **Slots:** positions 1–2 face the road and 3–5 face the back, counted from the entrance end. Same on every floor.
- **Telling rooms apart:**
  - room-number plaques on the outside walls (with a status-colour stripe)
  - big numbers on each room's floor in the look-inside view
  - ENTRANCE, RECEPTION, STAIRS, CORRIDOR and ROAD · GATE signs
  - a colour key
  - **Find a room**: turns the model to face the room, makes it flash, and states where it is, e.g. "first floor, back, middle"
- **Building page:** a new nav item for every role, including housekeeping and maintenance. They see room numbers and statuses but not guest details, because the rules don't let them read stays.
- **Room details** now show **Where** the room is, with a **Show on building** button.

## 10. Flat building view (v1.5.0). Replaces sections 8 and 9.

- **The 3D model is gone.** `js/building3d.js` and the three.js download were removed. `js/building.js` draws everything as plain SVG: instant, offline, and readable on phones.
- **Orientation, confirmed by the owner:** the balcony/entrance face is the narrow face on the **road side**, and the building runs deep away from the road.
- **Layout on every floor**, looking down with the road at the bottom:
  - position 1: front left of the entrance (the tall louvred windows)
  - position 2: front right (the smaller window)
  - entrance and stairs between 1 and 2, with reception on the ground floor
  - a corridor across the building behind rooms 1 and 2
  - positions 3, 4 and 5: one row across the back, left to right as seen from the road (e.g. 103, 104, 105)
- **"From the road":** the front face, floor by floor (Room 1 on the left, Room 2 on the right, arched balconies and entrance in the middle). Windows are coloured by status and carry number badges.
- **Floor plans:** one per floor (or pick one). Each room shows its big number, status, the guest's first name (front desk only), a red ! when it needs attention, and its windows on the outside walls in the status colour.
- **Find a room** highlights the room in pink and scrolls to it. Room details show "Where" with a "Show on building" button.
- The Room board's Building layout and the Building page (all roles) both use this view.

## 11. Building picture (v1.6.0). Replaces the floor plans.

- **One flat picture** of the block seen from the road (`js/building.js`). The floor plans were removed at the owner's request.
- **Each floor is a band.** The windows are replaced by **room-number tiles** coloured by status:
  - **front row:** two big tiles (Rooms 1 and 2) either side of the arched balcony bay, with ENTRANCE on the ground floor, a status word, a shadow, and a red ! when the room needs attention
  - **back row:** three smaller tiles (Rooms 3, 4, 5, left to right as seen from the road) raised above and behind the front tiles
- **Find a room** outlines the tile in pink and scrolls to it. Tapping a tile opens the room. Room details still say "Where" (e.g. "First floor, back row, middle").

## 12. v1.7.0

- **Building picture is smaller.** Front and back tiles show the number only, and the colour shows the status. There's no road sign or caption.
- **No Building page.** The picture lives on the Room board only. "Show on room board" in room details jumps there and highlights the room.
- **Inventory is split** by `items.kind`:
  - `supply`: used to run the place. This is the default for old items.
  - `sale`: sold to guests, with a `sellPrice`.
- **Tabs:** Supplies (for use), For sale, Sales, Usage per night (supplies only), Movements, Room item lists. Front desk sees only For sale and Sales, and can sell.
- **Sell item:**
  - pick the item and quantity; the price defaults to the selling price, and only a manager can change it
  - the buyer is a walk-in or an in-house guest
  - payment is cash, transfer or POS, which creates a `payments` record of `kind: 'sale'` that the owner confirms; or **Add to room bill**, which adds to `stay.extras` and `stay.balance` to be collected at check-out
  - every sale is a `moves` record with `type: 'sale'`, `total` and `unitCost`, so profit is visible
- **Reports** count item sales as revenue.

## 13. v1.8.0

- **Edit details:** fix a guest's name, phone, ID and key card. For reservations, also the dates. Every change is written to the activity log with its old and new value.
- **Move to another room:** works for an in-house guest or a reservation. The guest keeps their booked rate, the old room goes to Dirty with a cleaning task, and the move is recorded on the stay (`roomMoves`).
- **Early check-out:** check-out works out the unused nights. A refund is recorded as a negative `payments` record with `kind: 'refund'` and status *unconfirmed*. The owner approves or rejects it on Payments, and the Today page shows a "REFUND OK?" alert.
- **Calendar:** Stays → Calendar shows 21 nights × all rooms. Tap a booking to open it, or tap an empty night to reserve from that date.
- **Plain report terms:** "Average rate per night" and "Earnings per room per night".
- **Daily cleaning on/off:** Admin settings → General → Cleaning checklists.
- **Old ID photos:** deleted automatically after N months (Admin settings → General → Guest privacy; 0 = keep). It runs once a day when the owner opens the app. Names and ID numbers are kept.
- **Laundry:** Housekeeping → Laundry. Count pieces out and back. Shortages create a `laundry_short` incident, and the bill becomes an expense. Linen types are set in Admin settings → General.
- **Shift handover:** the Shift page, for front desk and managers.
  - Start shift: everything the person records is counted (check-ins and outs, payments by method, sales, refunds, expenses).
  - _(Replaced in v3.0.0 by the POS total check, see section 22.)_ End shift: the person counts the cash. Being short creates a `cash_short` incident.
  - The next person accepts or disputes the handover; a dispute creates a `handover_dispute` incident. Accepting starts their own shift.
- **Daily summary:** a "Yesterday in brief" card on Today with Send to WhatsApp and Copy buttons.
- **New Firestore collections:** `laundry` and `shifts`. Re-publish `firestore.rules`.

### Daily summary email (one-time setup)

`.github/workflows/daily-summary.yml` runs `scripts/daily-summary.mjs` every day at 06:30 Lagos time, for free on GitHub Actions. It reads Firestore with a service account and emails you through Gmail. To turn it on:

1. **Service account key:** in the Firebase console, go to Project settings → Service accounts → Generate new private key. This downloads a JSON file. Keep it private, and never commit it.
2. **Gmail app password:** in your Google Account, go to Security → 2-Step Verification (it must be on) → App passwords → create one called "Wiwe".
3. **Repository secrets:** in the GitHub repo, go to Settings → Secrets and variables → Actions → New repository secret, and add:
   - `FIREBASE_SERVICE_ACCOUNT`: the whole contents of the JSON file
   - `GMAIL_USER`: the Gmail address that sends
   - `GMAIL_APP_PASSWORD`: the 16-character app password
   - `SUMMARY_TO`: where to send it
4. **Test it:** in the repo, go to Actions → Daily summary email → Run workflow.

### Checking the security rules on the live site

Do this once, after publishing the rules:

1. Create a test account `fdtest` with only the **Front desk** role, and sign in with it in a private window.
2. Check that it **can:** check a guest in and out, record payments, sell an item, start and end a shift, and add an expense.
3. Check that it **can't:**
   - see Admin settings, Reports, Today or Inventory → Supplies
   - see "Seen in bank" on payments
   - change a rate. Try it in the browser console: `db.collection('roomTypes').doc('<id>').update({rate:1})` should fail with a permission error.
4. Repeat with a **Housekeeping**-only account: it should see only Housekeeping and Maintenance, and must not be able to read payments or stays (try `db.collection('payments').get()` in the console).
5. When you're done, disable the test accounts in Admin settings → Staff.

## 14. v1.9.0

- **ID is optional at check-in.** Both the ID number and the photo can be left empty.
- **Staff onboarding.** The admin creates the account with name, username, phone and roles, and **no password**. The app then:
  - creates a hidden login with a random throw-away password
  - stores a one-time invite at `invites/{12-character code}` (`uid`, `email`, `temp`, `username`, `name`, `expires`, 3 days)
  - shows the **Onboard** link (`…/#onboard=CODE`), with Send on WhatsApp and Copy buttons. The link is regenerated automatically if it has expired.
- **When staff open the link:** they see their username and choose a password. The app signs in with the throw-away password, calls `updatePassword`, sets `users.onboarded = true` and deletes the invite. The link then stops working.
- **Reset password / hand over** no longer asks the admin for a password. It makes a new login and a new onboarding link. The old login is deactivated and the history stays with the old person.
- **Rename a username:** in Admin settings → Staff → Edit. The `usernames/{old}` entry moves to `usernames/{new}`.
- **Kitchen icon** on every room tile: a pot means the room's type "Has a kitchen"; a crossed-out pot means it doesn't. It's in the colour key too.
- **Rules:**
  - `invites`: readable only with the code until it expires; admin creates; the invited user or the admin deletes
  - a user may set only `onboarded`, `onboardedAt` and `inviteCode` on their own user record
  - the admin can delete usernames (for renames)
  - **Re-publish `firestore.rules`.**

## 15. v2.0.0: home page, themes, card icons
- The sidebar menu is gone. After sign-in everyone lands on **Home**: one card per section they are allowed to see, with a count badge (alerts, payments to confirm, open tasks/jobs, handover waiting). Every section has a **Home** button top-left; the logo also goes Home.
- **Top-right corner (always visible):** three theme swatches (Black & white, the default; Black & cream; Colourful) and a dark-mode switch. Both are remembered per device.
- Cards inside each section get a small icon picked from their heading (`CARD_ICON_RULES` in js/core.js). If nothing matches, the section's own icon is used. In the Colourful theme the icons and home cards are coloured per section.
- Room status is never set by hand. It changes through the actions: check-in → Occupied, check-out → Dirty (cleaning task created), cleaner starts → Cleaning, cleaner finishes → Inspection, front desk/manager passes inspection → Ready, Report fault + "take out of order" → Out of order, "Back in service" → Dirty.

## 16. v2.1.0
- **Set status override:** managers and the owner see "Set status…" on a room with no guest in it. It needs a reason and is written to the activity log as `room_status_override`. Setting Dirty creates a cleaning task if none is open.
- No Home button inside sections; the logo goes Home.
- **Colour scheme picker:** one swatch shows the active scheme; tap it to pick Colourful (now the default), Black & white or Black & cream. In Colourful, each section has its own colour (`--accent` per `data-view` in styles.css) used by the header, buttons, tabs, cards, figure tiles and dialogs; the top bar is a gradient.
- **My account page** (tap your name or initials): profile (read only), colour scheme, dark mode, text size, start page (per device), change password, sign out, owner/manager shortcuts, app version and "Check for update".
- Room board: back-row tiles now line up with the front tiles (left edge over room 1, right edge over room 2, equal gaps).

## 17. v2.2.0: less clutter
- **Inventory:** header is "Store ▾" (Receive stock, Issue supplies, Stock count) + Sell item. Two figure boxes (To reorder; Sales this month with profit). Tabs: Supplies, For sale, Sales, More (Usage per night, Movements, Room item lists as small sub-tabs).
- **Room board:** 3 figure boxes (Occupied, Today in/out, Unconfirmed payments). The colour key under the building now carries the counts; the separate status pills only show in Cards layout. On phones the building comes first.
- **Today:** Rooms card removed; Recent activity shows 5 entries with "See all".
- **Admin settings → General:** sections fold open/closed; one Save button still saves all.
- **Reports:** 4 figure boxes (average rate moved into Occupancy); CSV downloads under "Export ▾"; By room table folds (earnings per room per night shown on its header).
- **Maintenance / Payments:** figure boxes only on the first tab (Jobs / Unconfirmed).
- **My account:** one column; profile with password, sign-out (and Admin settings for the owner) together; version line at the bottom.
- Helpers in js/core.js: `actionMenu()`, `subTabs()`, `fold()`.

## 18. v2.3.0: less scrolling
- Room board: the Cards layout and its toggle are gone; the building picture is the only board.
- "Sell item" is now "Record sale" everywhere.
- Home: all section cards fit on one screen (phones: 3 per row, names only; larger screens: name + description).
- Tighter spacing app-wide (header, cards, figure tiles, tabs); on phones figure tiles sit two per row and the page title gets its own line.
- Today: the "Yesterday in brief" text folds away; WhatsApp and Copy buttons stay visible.

## 19. v2.4.0
- **Dark mode** is one icon in the top-right corner, as in the Apowo (Spendwise) app: ☀️ = light now, 🌙 = dark now; tap to switch. With no choice saved it follows the phone's own setting.
- **Phone tables:** on screens under 640px every table (except the stays calendar) turns into two-line rows: name first, the other columns as "Label value" after it. Done generically by `labelTables()` in js/core.js.
- **Quick actions:** Home shows the role's most common jobs as buttons (Confirm payments for the owner when any wait, Check in, New reservation, Record sale, Report an issue, Add expense; housekeeping/maintenance get their task list). See `quickActions()`.
- **Phone bottom bar:** Home · main section (Rooms / Housekeeping / Maintenance) · **Do** (+, opens the quick actions) · Me.
- **Fewer steps:** payment method starts on the one last used on that device (`wiwe_paymethod`); Check-in and Extend/Balance fill "Amount received" with the amount due until the user types in it.
- **Speed:** stays (checking out within the last 90 days or later), payments, stock moves and expenses from the last 90 days are kept in memory (`RECENT_DAYS`). Unconfirmed payments and pending expenses are always loaded whatever their age. Reports still read any month; Backup exports everything; returning-guest lookup asks the database for older stays by phone number.

## 20. v2.4.1
- **Phone Home:** the section cards now share out the whole screen between the greeting and the bottom bar (`fitHome()` in js/core.js sets the grid height; it divides by the text-size zoom). 6 or fewer sections → 2 per row, more → 3 per row; icons and names are bigger.
- **Room board:** each back-row tile is the same width as, and centred directly above, the front tile below it; the middle back tile is centred over the entrance bay. The grey band behind the back row and the drop shadow under the front tiles are gone.

## 21. v2.5.0: fewer taps on phones
- **Room board tiles:** back-row tiles are narrower than the front ones (52 vs 72) and centred over them.
- **Room pop-up next step:** `roomNextStep()` in js/front.js puts the one thing to do next as a big button at the top: Check in (named if reserved today), Check out (due today / overstayed), Take balance payment, Inspect, Start / Continue cleaning, or Back in service. The other actions stay below.
- **js/phone.js (new):**
  - Swipe left/right on a section's page to move between its tabs (skips things that scroll sideways, e.g. the stays calendar, and form fields).
  - Pull down at the top of a page to refresh (reconnects Firestore, checks for an app update). The browser's own pull-to-reload is turned off on phones (`overscroll-behavior-y`).
  - Form drafts: anything typed into a pop-up form is kept in localStorage (`wiwe_draft_<pop-up title>`, 12 hours) until that form is saved. Reopening the same pop-up brings it back with a "Start empty" link. Photos and passwords are never kept; pre-filled amounts are only kept if someone changed them.
- **Part payments:** check-in, extend and balance payment ask for confirmation when the amount received is less than the amount due, stating how much will be owed.

## 22. v3.0.0: POS payments, no confirmation step, receipts, deposits, safer rules

**Publish `firestore.rules` BEFORE (or together with) this version.** The v3 rules accept everything the old app writes, but the old rules refuse what the v3 app writes (payments saved as recorded). `.github/workflows/deploy-rules.yml` publishes the rules whenever `firestore.rules` changes on main, using the `FIREBASE_SERVICE_ACCOUNT` secret. If that job fails with a permission error, paste the rules into the Firebase console by hand (or give the service account the "Firebase Rules Admin" role). The owner sees a "Security rules need updating" alert until the v3 rules are live (the app probes `meta/rules`).

### Payments
- **Methods:** POS (default) and bank transfer (for deposits paid from far away). **Cash is not accepted** and is gone from every form. Old cash records still show as "Cash".
- **No owner confirmation.** A payment is final when recorded (`status: 'confirmed'`). Old `unconfirmed` payments with a positive amount are treated as recorded. "Seen in bank", "Not received", the Confirm payments card and the unconfirmed counters are removed.
- **Refunds still wait for the owner:** early check-out refunds (`refund_early`) and deposit refunds (`refund_deposit`) are saved as negative `unconfirmed` payments; the owner approves or refuses them in Payments → Refunds.
- **Reference is required** for every payment, and a reference already used on another payment asks for confirmation and is flagged (Payments → Same reference, and in Reports). Two parts of one payment (room + caution within 2 minutes on the same stay) are not flagged.
- **Void (owner):** voiding a room, extension, balance or deposit payment puts the amount back on the guest's balance; voiding a caution payment reduces the caution held.
- **Balances use `FieldValue.increment`** everywhere (extend, balance payment, item on room bill, discount rejected, void), so two phones or an offline phone cannot overwrite each other.
- Payments view: today's totals by POS and by transfer, search by reference/guest/room, tabs All / Refunds / Same reference / Void. The owner's Today page lists today's payments to compare with the terminal's end-of-day total.

### Bookings and guests
- **Check-in checks for clashes:** a walk-in cannot be checked into a room that is reserved within the nights asked for (warning in the form, refusal on save).
- **Deposits on reservations** (`kind: 'deposit'`, stay fields `deposit`, `paid`). The deposit is taken off the amount due at check-in. Cancelling or marking a no-show asks whether to refund it (owner approves) or keep it.
- **Booking source** (`source`: walkin, phone, returning, referral, airbnb, booking, other) on reservations and check-ins; Reports shows where guests came from.
- **Guest register:** home address, number of guests, vehicle plate. Admin settings → General → "Check-in needs an ID number or a photo of the ID" (`settings.requireId`, off by default).
- **Receipt / booking confirmation:** the Receipt button on a stay gives text to send by WhatsApp, copy or print.
- **Guests owing:** a guest can be checked out owing (after a warning); the debt can be taken from the caution fee at check-out (`cautionApplied`), is listed under Stays → Owing, raises an OWES alert, and can be paid later with "Record balance payment". A listener on `stays where balance > 0` keeps debtors visible however old.
- Caution fully used at check-out now shows as "kept in full" (`cautionStatus: 'kept'`), not "refunded".

### Shifts
- No cash count. At the end of a shift the person enters the POS terminal's total (optional); a difference from the POS payments they recorded creates a `pos_mismatch` incident.

### Reports
- Income = room money (room, extension, balance, deposit, damage, less approved early-check-out and deposit refunds) + item sales paid at the counter + caution kept. Average room rate uses room money only.
- New: next 30 days booked, guests owing, average turnover cleaning time, where guests came from, payments voided, payments sharing a reference, refunds paid, checked out still owing, and a "Last 6 months" table (read on request).
- CSV export labels kinds and methods and cannot run a guest's name as a spreadsheet formula.

### Security rules (v3)
- A stay's `rate` must be the room type's rate when the bill is first made, and cannot change afterwards; the bill cannot shrink (total − nights × rate never goes down) unless the owner does it. `paid` and `balance` are still trusted to the app: the rules cannot see the payments behind them.
- Only front desk or a manager can set a room to Ready or finish a turnover task (the inspection).
- Usernames can be looked up one at a time but not listed; photos can be opened one at a time but only the owner can list them; item quantity must be a number; payments and expenses need a numeric amount.
- In the app, every record is cleaned as it arrives (`clean()` / `docRows()` in js/core.js): number fields are forced to numbers and odd record ids are dropped, so stored text cannot become page code.
- The activity-log entry is saved in the same batch as the action for check-in, check-out, extend, balance payment, sale, void, refunds, reservations, discounts, stay edits and shifts.

### Reliability
- Firebase and font files load with `crossorigin`, so the service worker can save them and the app starts offline. If they cannot be loaded at all the boot screen says so and offers "Try again".
- The service worker waits at most 3 seconds for the network when it already holds a copy.
- Typing in Admin settings is no longer wiped by background refreshes (`viewDirty`).
- Daily cleaning tasks are created when the date changes even if the app is left open.
- Rows that open something can be reached with Tab and opened with Enter.
- Backup (Admin → Backup) now includes laundry, shifts and usernames.

### Emails (GitHub Actions, same four secrets)
- `daily-summary.yml`: updated figures (POS / transfer, guests owing, refunds waiting). **On Mondays it attaches a zipped backup** of everything except photos; run it by hand with the "backup" box ticked for one any time.
- `urgent-alerts.yml` (new, about hourly): emails only when something new needs the owner: an incident, an overstay one hour past check-out, a guest checked out owing, a refund or an expense waiting for approval. It remembers its last run in `meta/alerts`.
- `deploy-rules.yml` (new): publishes `firestore.rules`.

### Not done
- No restore from a backup file, no automated tests, no separate test database, no App Check, no content security policy (the app uses inline handlers), and record times still come from the phone's clock.
- The v3 rules and the three scripts were written without a way to run them here (no Node, no rules emulator). The app itself was tested against a local mock database only.

## 23. v3.1.0: UI refresh

### Foundations (js/core.js, styles.css "v3.1" section)
- **Design tokens** on `:root`: spacing `--sp-1…6`, radius `--r-sm…xl`, text sizes `--fs-xs…2xl`, and room status colours `--t-ready`, `--t-occupied`, `--t-reserved`, `--t-dirty`, `--t-cleaning`, `--t-ooo`, `--t-attn` (with dark-mode values). Inline styles in the scripts became small classes (`mt-2`, `span-all`, `sub-h`…); only bar widths and the photo viewer window still use inline styles.
- **Text size** no longer uses CSS `zoom`. Every text size in styles.css is in rem and Account → Text size sets the page font size (92% / 100% / 112%). `fitHome()` no longer divides by the zoom.
- **In-app dialog** replaces every browser `confirm()` and `prompt()`: `ask({ title, text, ok, cancel, danger })` resolves true/false, `askText({ title, label, ok })` resolves the text or null. Each one names its buttons ("Save as part payment" / "Fix the amount"). The functions that use them are now `async`; `refOk()` is async too, so callers `await` it.
- **Pop-ups** are centred cards on big screens and bottom sheets on phones. The body scrolls inside; the Save row (`.form-actions`) stays pinned at the bottom. Focus is kept inside the pop-up or dialog (Tab wraps), Esc closes, and focus goes back to the button that opened it.
- **Toast** sits above the bottom bar, and at the top of the screen while a pop-up is open so it never covers a form. `toast(msg, bad, { label, fn })` adds an Undo button (7 seconds). Undo is offered for: archive item, remove room, delete room type, cancel job, resolve incident, clear a restored form draft.
- **Money boxes**: any field whose label contains ₦ gets a ₦ prefix and thousands separators while typing (`moneyFields()`, run on every pop-up and page). `num()` ignores the commas. Use `setMoney(id, n)` or `prefillAmount()` to fill one from code.
- **One main button per screen**: `onePrimary()` keeps the first filled button and turns the rest plain (a form's Save row and small list buttons are left alone).
- **Records**: `recRow()` lays a record out as amount and guest / details / who and when, with status and buttons on the right. Used for payments and repair jobs.
- **Empty states**: `emptyState(icon, title, text, button, js)` says what belongs in the list and offers the button to add it. **Loading**: `skeleton(lines, stats)` grey placeholders on Reports, the activity log and Recent activity.
- **Card icons** are set explicitly in `CARD_ICONS` (by exact heading, or `data-icon` on the heading) instead of guessed from words.
- **Header**: the floating theme / dark-mode corner is gone. Colour scheme, dark mode (with drawn sun and moon icons) and text size are in My account → Appearance.

### Check-in on phones
- `stepForm()` shows the check-in form one part at a time (Guest → Stay → Payment → Caution fee and key card) in a full-screen sheet, with a bar pinned at the bottom: "Collect now ₦…", Back, Next / Complete check-in. Next checks the current part's required fields. On big screens the form is unchanged.

### Room board (js/building.js, rewritten)
- Each tile shows the room number, the guest's first name and leaving day (or the reserved guest and arrival time, the cleaner's name, the repair reason, the status), and a red badge for Overstay / Due out / Owes. Tiles are bigger (back row 64×30, front 78×35 in the drawing) for easier tapping. The kitchen mark is a drawn pot, not an emoji.
- The colour key is a set of filters: tap "Dirty 3" to dim every other room; tap again (or "Show all rooms") to clear. "Needs attention" filters to rooms with a badge. On phones the key is one row that scrolls sideways.
- **Building / List** switch (remembered on the device as `wiwe_board_view`): the list shows every room floor by floor with its line, status, type and badges.
- Colours, the focus ring and the calendar now use the theme tokens.

### Other screens
- Calendar: 7 days on phones (21 on big screens), today's column tinted, room column fixed with an edge.
- Receipt: a branded page with the logo, receipt number, stay details, bill, payments and balance. Print prints only the receipt (`printReceipt()` sets `body.print-modal`). WhatsApp and Copy still send the plain-text version.
- Reports: the six-month table is now a bar chart (income, spent) with an occupancy line, figures folded underneath. Export → "Print this report" prints the page with folded sections opened; the app bar, bottom bar and buttons are hidden in print.
- Read-only details in pop-ups sit two per row on phones.

### Not changed
- Colour-only status (no per-status icons or patterns), as decided.
