# Transactional Email Setup (Brevo)

Transactional email for the contact form and job applications is sent through
**Brevo** using its HTTP API. There is no SMTP transport and no Gmail/Outlook/
Yahoo fallback — Brevo is the only sender.

**Roles:** Zoho hosts the `sosapient.in` mailbox (the MX records stay with
Zoho). Brevo only *sends* on behalf of the domain. `admin@sosapient.in` is both
the sender and the recipient of internal notifications.

---

## Step 1 — Create the API key

1. Sign in at <https://app.brevo.com>.
2. Go to **Settings → SMTP & API → API Keys** (<https://app.brevo.com/settings/keys/api>).
3. Create a key with transactional-email permission and copy it.

The key is a secret. Never commit it, never prefix it with `VITE_`, and never
expose it to the frontend.

## Step 2 — Add and authenticate the sender

1. Go to **Senders, Domains & Dedicated IPs** (<https://app.brevo.com/senders>).
2. Add `admin@sosapient.in` as a sender and complete the verification email.
3. Add `sosapient.in` as a **domain** and open its authentication page.

Brevo displays the exact records to add. **Copy the values from the dashboard —
do not guess them.** They are specific to your account.

## Step 3 — DNS records

Everything below is added at your DNS provider for `sosapient.in`.

### SPF

A domain may have **exactly one** SPF TXT record. An SPF record already exists
for Zoho at the apex (`@`), so you must **edit that existing record** rather
than add a second one.

- Add Brevo's `include:` value (shown in the Brevo domain page) to the existing
  record, alongside the Zoho include.
- Do not remove the Zoho include, or Zoho mail will start failing SPF checks.
- Keep the total number of DNS lookups in the record below 10.

### DKIM

Add the DKIM records exactly as Brevo shows them (typically one or two CNAME
records with a provider-specific selector). These are safe to add alongside
existing records and do not affect Zoho.

### DMARC

If a DMARC record already exists, leave it in place. Brevo's domain page will
report DMARC alignment status once SPF and DKIM are live.

### MX — do not touch

Leave every MX record as it is. Changing MX records would break the Zoho
mailbox and stop you receiving any mail at all.

## Step 4 — Set the environment variables

Set these in the hosting environment (Render → your service → Environment).
See `.env.example` for the authoritative list.

```env
BREVO_API_KEY=...                 # from Step 1
BREVO_SENDER_EMAIL=admin@sosapient.in
BREVO_SENDER_NAME=SoSapient
CONTACT_ADMIN_EMAIL=admin@sosapient.in   # notification recipient, server-side only
BREVO_TIMEOUT_MS=10000            # optional, per-attempt timeout
```

`ADMIN_EMAIL` is still used for admin sign-in and is the fallback notification
recipient when `CONTACT_ADMIN_EMAIL` is unset.

If `BREVO_API_KEY` or `BREVO_SENDER_EMAIL` is missing, the server logs a single
startup warning and **skips sending entirely**. The form still succeeds — the
enquiry is saved — so check the logs if notifications stop arriving.

## Step 5 — Verify

1. Restart/redeploy the backend so the new variables take effect.
2. Submit the contact form on the live site.
3. Confirm the enquiry appears in the admin dashboard and that its
   `emailDelivery` record shows `visitor: sent` and `admin: sent`.
4. Confirm the visitor confirmation arrives, and that the admin notification
   arrives at `admin@sosapient.in` (reply-to is set to the visitor).
5. Make a test job application and confirm both messages again.

---

## How sending behaves

- **Independent sends.** The visitor confirmation and the admin notification
  are attempted separately. If one fails the other still goes, and the
  successful one is never re-sent, so nobody gets a duplicate.
- **Bounded retries.** Up to 3 attempts per message with a short backoff, on
  network errors, timeouts, `429` and `5xx` only. A `4xx` is a permanent
  rejection and fails immediately. There is no background queue.
- **The database is the source of truth.** A submission is a success once it is
  stored. Email problems never fail the request and are never shown to the
  visitor in detail.
- **Acceptance is not delivery.** A `sent` status means Brevo accepted the
  message. Bounces, spam placement and blocklisting happen afterwards and are
  visible in the Brevo dashboard, not in this app.
- **Delivery status is recorded** on each contact submission and job
  application in the `emailDelivery` field (`sent` / `failed` / `skipped` plus a
  short reason code). Provider error codes are stored but never returned to the
  browser.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| No email at all, form still works | `BREVO_API_KEY` or `BREVO_SENDER_EMAIL` missing in the host environment |
| `delivery.admin = failed`, code `invalid-recipient` | `CONTACT_ADMIN_EMAIL` is not a valid address |
| `delivery.* = failed`, code `smtp-key-not-api-key` | `BREVO_API_KEY` is an SMTP key (`xsmtpsib-`). Generate a v3 API key on the **API Keys** tab, not the **SMTP** tab |
| `delivery.* = failed`, code `http-401` | API key revoked, wrong, or lacking permission |
| `delivery.* = failed`, code `not-configured` | Brevo env vars not set (see above) |
| Sends fine but lands in spam | SPF/DKIM not yet authenticated, or the sender is unverified |
| Messages sent but never arrive | Check the Brevo dashboard for bounces and blocklist entries |
