# Wiwe Apartments: Operations app · Handover

Version 1.7.0 · Vanilla HTML/CSS/JS PWA · GitHub Pages + Firebase (Auth + Firestore)

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
