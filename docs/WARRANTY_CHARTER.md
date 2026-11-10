# CarCare — Warranty & Support Charter

**Status: DRAFT for Vernex owner review before it is shared with the Client.**
This charter summarises the maintenance, support and warranty commitments in the CarCare project agreement in plain language. **The signed agreement prevails** wherever the two differ. It contains no commercial amounts; fees for any paid period are as set out in the signed agreement.

| | |
| --- | --- |
| Provider | Vernex Gen Technologies ("Vernex") |
| Client | The facility named in the signed agreement ("the Client") |
| Software | CarCare residential car-wash management platform: resident, cleaner and admin web app, database, photo storage and payments integration |
| Release | 1.0.0 (production) |
| Go-live date | ______ *(the agreed date of production launch; all periods below count from this date)* |

---

## 1. Included maintenance — first 45 days after launch

For **45 days from the go-live date**, maintenance is included **at no charge**. It covers:
- **Bug fixes:** anything that doesn't work as agreed.
- **Security patches:** dependency and platform updates that fix vulnerabilities.
- **Minor adjustments:** small wording, layout or configuration changes that don't add new features.
- **Database handling:** data corrections, account administration (new cleaner/admin accounts, password resets), monitoring of database and photo-storage usage.
- **Support:** answering questions from the Client's admins and cleaners.

After the 45 days, the agreement provides for a **limited paid maintenance period**, on the terms in the signed agreement.

**New features are not maintenance.** Anything outside the agreed scope is handled as a **change request**: Vernex quotes it, and work starts only after the Client approves the quote in writing.

## 2. Defect-fix warranty — 18 months

**In-scope defects are fixed at no cost for 18 months.** An in-scope defect is behaviour that doesn't match the agreed functional scope, for example:
- a wash counted without a photo;
- a resident seeing another resident's data;
- a correct payment not marking its invoice paid.

The warranty runs from the go-live date unless the signed agreement states otherwise *(Vernex owner to confirm against the agreement)*.

The warranty covers fixing the software, including the database migrations and photo/payment integration code that Vernex delivered. It does not cover the items in §6.

## 3. Support response targets

Vernex will acknowledge a reported issue and begin work within these times:

| Priority | Response target | Examples *(proposed definitions — Vernex owner to confirm)* |
| --- | --- | --- |
| **Critical** | **within 4 hours** | The app is down or nobody can sign in. Cleaners cannot record washes. Payments are being credited wrongly. Suspected data or photo leakage. |
| **High** | **within 1 working day** | One important feature fails for some users (e.g. reschedule requests, an admin report) and there's no workaround. |
| **General** | **within 3 working days** | Questions, account requests, minor issues with a workaround, small adjustments. |

**How to report.** The Client's nominated contact reports issues in writing to Vernex support (§9). Include the screen, the steps, what was expected and what happened, a screenshot and the priority. Critical issues should also be phoned in.

## 4. Service standards

- **Availability target:** at least **99% per month**, excluding scheduled maintenance announced at least **48 hours in advance**.
- **Release discipline:**
  - Every release has a version number, written release notes and a rollback plan.
  - Releases are deployed outside peak car-wash hours wherever possible.
  - No release goes to production without the Client's written approval, **except emergency service-restoration fixes, which are notified immediately**.
- **Backups:** the database is backed up **daily**, encrypted, and kept for **30 days**. Restores are rehearsed on the staging environment.
- **Photos:** after-wash photos are stored privately, shown only through time-limited links, and kept for at least **60 days**, after which they are deleted automatically.
- **Security:**
  - Data is encrypted in transit (HTTPS/TLS) and at rest.
  - Passwords are securely hashed.
  - Access is role-based (Admin, Cleaner, Resident).
  - CarCare never stores full card numbers; Razorpay processes card, UPI and net-banking payments.

## 5. Confidentiality and data

- Client data (customer details, vehicle information and photos) remains confidential. Vernex does not share, sell or publish it except as required to operate the Client's software.
- Vernex will **notify the Client promptly** if a data or photo leakage is suspected.
- The Client owns its business data.
- Vernex retains its source code, internal server credentials and reusable components. The Client receives a licence to use the software for its business operations for the life of the agreement.

## 6. What the warranty and included maintenance do not cover

- New features, redesigns or changes to the agreed scope (handled as change requests).
- Faults caused by changes made by anyone other than Vernex, or by misuse.
- Outages or changes at third-party providers (hosting, database, storage, payment gateway, mobile networks), beyond Vernex's reasonable control. Vernex will still help restore service.
- Third-party charges, which the Client pays directly:
  - Razorpay/payment-gateway fees;
  - SMS/WhatsApp messaging;
  - app-store developer accounts;
  - paid hosting or storage tiers if usage grows beyond free allowances (upgrade triggers are agreed in advance).
- Marketing, photography, copywriting and hardware.

## 7. Training and handover

The agreement includes:
- hands-on admin and cleaner training;
- written guides: the [Admin Manual](ADMIN_MANUAL.md) and [Cleaner Guide](CLEANER_GUIDE.md);
- short video walkthroughs *(to be recorded on the production build after go-live)*;
- live handover sessions.

## 8. Client responsibilities

Commitments from the agreement that keep support effective:
- Nominate **one primary decision-maker/contact**.
- Respond to questions and approvals within **3 working days**.
- Provide accurate business information, package rules and pricing, and lawful customer/cleaner data.
- Keep domain, hosting and app-store accounts, held in the Client's name, active and paid.

## 9. Contacts

| | |
| --- | --- |
| Vernex support | ______ *(e-mail / phone / working hours — fill in at handover)* |
| Emergency (Critical) line | ______ |
| Client's nominated contact | ______ |

## 10. Term

Either party may terminate the agreement with **15 days' written notice**; handover and refund handling follow the signed agreement. The agreement is governed by the laws of India. Disputes are first discussed and, if unresolved, referred to competent courts in India. The agreement's liability limitation and data-leakage obligations apply as written there.

---

Accepted for Vernex: ____________________ Date: ________   Accepted for the Client: ____________________ Date: ________
