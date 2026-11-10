# CarCare — User Acceptance Test Guide

**For:** the client's reviewer · **Build:** 1.0.0-rc.1 (staging) · **Site:** `https://staging.<client-domain>` (link sent by Vernex)

This guide walks you through CarCare as a **resident**, a **cleaner** and an **admin**. Each test lists what to do and what you should see. Mark each one **Pass** or **Fail**. Write a short note for anything that looks wrong.

Everything on the staging site is **test data**. The people, cars and phone numbers are made up. Payments run in Razorpay **test mode**, so no real money moves. Please don't enter real customer details.

---

## Before you start

**You will need:**
- **A phone** (Android with Chrome, or iPhone with Safari) for the resident and cleaner tests. Cleaners and residents use their phones.
- **A laptop or desktop** for the admin tests.
- **Two days** for some tests: a wash can only be recorded on its scheduled day. Tests marked *Day 2* are done the next day.

**Test accounts.** Vernex sends the passwords separately; they are never written in this document. Sign in with the mobile number and password.

| Role | Mobile number | Notes |
| --- | --- | --- |
| Admin | 90000 00001 | Staging Admin |
| Cleaner A | 90000 00101 | Covers Block A |
| Cleaner B | 90000 00102 | Covers Block B |
| Resident One | 90000 01001 | Block A, daily plan, one missed wash two days ago |
| Resident Two | 90000 01002 | Block B, Mon · Wed · Fri plan |
| *New resident (you create it)* | 90000 03001 | Use this made-up number in test R1 |

To switch roles, use **Sign out** (top right), then sign in with another account. On one device, use a private/incognito window for the second role.

---

## Part 1 — Resident

| # | What to do | What you should see | Pass / Fail | Notes |
| --- | --- | --- | --- | --- |
| R1 | On the sign-in screen, choose to register. Fill in owner name, mobile **90000 03001**, a made-up registration (e.g. TN-10-ZZ-0101), make & model, car size, block **A**, a flat number, a parking slot and a password (8+ characters with a letter and a number). Submit. | A confirmation that the registration was received. Leaving any field empty or invalid shows a clear message next to that field. | | |
| R2 | Sign in as the new resident (90000 03001). | You are taken to **Registration Under Review**. You cannot open the dashboard or other resident pages yet. | | |
| R3 | *After A2 (admin approves you)*: sign in again as 90000 03001. | You now reach the resident dashboard. | | |
| R4 | Open **Packages & schedule**. | Only packages that fit your car size are listed, with the four schedules (Daily; Mon · Wed · Fri; Tue · Fri; Thursday only). Prices are **placeholders** (₹1–₹8). | | |
| R5 | Choose a package. | The choice is saved and the dashboard shows the package. Washes start from tomorrow. | | |
| R6 | Sign in as **Resident One** (90000 01001). Look at the dashboard. | The **13-wash milestone** gauge shows completed washes this month out of 13, the remaining count and a percentage. The next wash date is shown. | | |
| R7 | *After C3 (cleaner completes Resident One's wash)*: refresh the dashboard. | The completed count goes up by **exactly 1**. | | |
| R8 | Open **Wash photos**. Open the newest photo. | The after-wash photo is shown with the **date only**. **No time of day and no cleaner name** appear anywhere for residents. | | |
| R9 | Open **Request Reschedule**. Pick the missed wash (two days ago), choose a new date in the next 14 days, give a reason, submit. | The request appears under **Your requests** as pending. The 13-wash count does **not** change. | | |
| R10 | *After A9 (admin approves the reschedule)*: look at your requests and dashboard. | The request shows as approved. The missed wash shows as **Rescheduled**. The count still does **not** change; it only goes up when the makeup wash is actually done with a photo. | | |
| R11 | Open **Billing / Pay Dues**. | Outstanding balance, this month's invoice and payment history. | | |
| R12 | Tap **Pay now** on the invoice. Choose **UPI**. In the Razorpay window, use the test UPI ID **success@razorpay**. | Payment completes, the invoice shows **Paid**, and the payment appears in the history once. | | |
| R13 | Sign in as **Resident Two** (90000 01002), tap **Pay now**, and in Razorpay use **failure@razorpay** (or close the Razorpay window). | A clear "payment failed" or "cancelled" result. The invoice is still **due**. Trying again works. | | |
| R14 | While signed in as a resident, type `/admin/dashboard` at the end of the site address. | A **"You don't have access"** page. Residents can never see admin screens. | | |

## Part 2 — Cleaner (use a phone)

| # | What to do | What you should see | Pass / Fail | Notes |
| --- | --- | --- | --- | --- |
| C1 | Sign in as **Cleaner A** (90000 00101). | **Today's jobs** with a sticky "X / Y Completed" counter, filter chips (All / Pending / Completed / Vehicle Not Present), and for each car: plate, slot, block/flat and a call button. Only Block A cars assigned to Cleaner A appear. | | |
| C2 | Open Resident One's job (TN-01-UA-0001), then **Complete Wash & Upload Photo**. | **Confirm Wash Completed** stays **disabled** until a photo is attached. | | |
| C3 | Take a photo with the camera (or choose one). Wait until the size appears ("Compressed: … KB"), then tap **Confirm Wash Completed**. | The size shown is **150 KB or less**. You return to Today's jobs and the job shows **Completed**. The counter goes up by one. | | |
| C4 | Tap the call button on a job. | The phone dialler opens with the resident's number. | | |
| C5 | *Day 2*: open Resident One's job and choose **Vehicle Not Present**. Add an optional note and confirm. | The dialog warns that **this does not count as a wash**. After confirming, the job shows **Vehicle Not Present**. On Resident One's dashboard the completed count does **not** go up. | | |
| C6 | Try to open the same job again to complete it. | It is already recorded and can't be changed. | | |
| C7 | Open **Schedule**, **Customers** and **Targets**. | Schedule: cars per day for the next week, by block. Customers: only your assigned residents, searchable. Targets: this month's washes against the goal, with Vehicle Not Present counted separately. | | |
| C8 | Sign in as **Cleaner B** (90000 00102). | Cleaner B sees only Block B cars, and **none** of Cleaner A's jobs. | | |
| C9 | On the day of an approved reschedule (from R9), sign in as Cleaner A. | The makeup wash appears on that day's list, marked as a makeup wash. Completing it with a photo adds one to Resident One's count. | | |

## Part 3 — Admin (use a laptop or desktop)

| # | What to do | What you should see | Pass / Fail | Notes |
| --- | --- | --- | --- | --- |
| A1 | Sign in as **Admin** (90000 00001). | **Operations dashboard** with total customers, today's washes, completion rate, cleaners active, outstanding invoices and a 14-day wash trend. | | |
| A2 | **Customers → Pending Approvals.** Open the new registration from R1 and **Approve**, choosing **Cleaner A** under "Assign cleaner". | The registration leaves the pending tab and the resident is now active. | | |
| A3 | Register another made-up resident (repeat R1 with **90000 03002**), then **Reject** it with a reason. | The resident sees "Registration not approved" with your reason when they sign in. | | |
| A4 | **Customers → All Residents.** Search by name, flat or registration. Use the block, status and cleaner filters. | Results update; lists load page by page. | | |
| A5 | Open a resident and pause, then resume them. | Status changes. A paused resident gets no new washes scheduled. | | |
| A6 | **Cleaners → Reassign cleaner.** Move Block B from Cleaner B to Cleaner A, then move it back. | The roster and block coverage update. Cleaner A temporarily sees the Block B cars. | | |
| A7 | **Packages.** Edit a package's price and description. Then try to switch **off** a car size that subscribed cars use. | The edit saves. Removing a size still in use is **refused** with an explanation. | | |
| A8 | **Schedules → Master calendar.** Move between months; filter by block. | Each day shows scheduled, completed, not-present and rescheduled counts. | | |
| A9 | **Schedules → Reschedule queue.** Approve Resident One's request from R9 (add a note). | The request moves to approved, and the resident sees your note. | | |
| A10 | **Payments.** Filter by Paid / Outstanding / Overdue. Use **Manual status override** to mark Resident Two's invoice **Paid (e.g. cash received at the office)**, with a reason. | The invoice shows Paid. The reason is recorded. | | |
| A11 | **Photos.** Filter by date, block and cleaner. | Every after-wash photo with its wash date, **recorded time and cleaner name** (admins only; residents never see these). | | |
| A12 | **Activity log.** Filter by action and role. | Every change made during these tests is listed (approvals, rejections, washes, Vehicle Not Present, reschedules, packages, payments, overrides), with who did it and when. Entries can't be edited or deleted. | | |
| A13 | Try opening a cleaner page such as `/cleaner/today` as admin, and an admin page as a cleaner. | Each role sees only its own area. | | |

## Part 4 — General

| # | What to check | Pass / Fail | Notes |
| --- | --- | --- | --- |
| G1 | Resident and cleaner screens are easy to use on a phone: nothing cut off, no sideways scrolling, buttons big enough to tap. | | |
| G2 | The site address starts with **https://** and the browser shows a padlock. | | |
| G3 | No "review build", "mock", "demo" or developer panel appears anywhere. (Known exception: some payment captions still say "simulated"; see below.) | | |
| G4 | Signing out and pressing Back does not show the previous user's data. | | |

---

## Known items in this build

Please don't report these as new defects. They are already logged.

1. **Payment captions.** After a payment, the result title still reads "Payment successful (simulated)". The invoice page says "All Phase 1 transactions are simulated", and the admin dashboard says "Collections are simulated". The payments themselves are real Razorpay test-mode transactions. The screens are frozen, so these captions change only with your written approval.
2. **Retaking a photo.** If a cleaner retakes a photo, they should wait until the new size ("Compressed: … KB") appears before tapping Confirm. Tapping too early saves the previous photo. The fix is also waiting for your approval to change the frozen screen.
3. **Vehicle reference photo.** The job screen shows "Photo unavailable" where a reference photo of the car would appear; reference photos aren't stored in this version.
4. **"Earlier months" summaries** in the resident gallery stay empty until the monthly roll-up feature is added. All detailed history is shown.
5. **Accounts.** New cleaner and admin accounts, and password resets, are done by Vernex support on request. There is no in-app screen for them in this version.

## How to send feedback

Send one e-mail (or shared sheet) to the Vernex contact with every issue, using this format:

| Test # | Role | Screen | What you did | What you expected | What happened | Screenshot | How serious (Critical / High / Normal) |
| --- | --- | --- | --- | --- | --- | --- | --- |

**Timeline from the agreement:**
- Please report issues in writing within **7 working days** of receiving this build.
- If no written response arrives within **5 working days**, the build is treated as accepted.
- Production go-live happens only after your **written approval**, on a date agreed with you.

**Sign-off.** When you're satisfied, reply with: *"UAT complete — approved for production, release 1.0.0-rc.1"*, plus your name and the date.
