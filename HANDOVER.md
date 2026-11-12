# Wiwe Apartments: Operations app · Handover

Version 1.0.0 · Vanilla HTML/CSS/JS PWA · GitHub Pages + Firebase (Auth + Firestore)

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

- **Payments.** Every payment is recorded as *Unconfirmed* with the sender name, reference and receipt photo. Only the admin can mark it *Seen in bank* or *Not received*. "Not received" creates an incident.
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
  - A daily summary pushed to the owner
