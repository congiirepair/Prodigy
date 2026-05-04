# Prodigy RC Competition Hosting Rollout

This app is prepared to run from a single Firebase Hosting site. The recommended long-term routing model is event-scoped paths on the main domain:

- `https://prodigyrccomp.com/events/{eventId}/spectator`
- `https://prodigyrccomp.com/events/{eventId}/admin`
- `https://prodigyrccomp.com/events/{eventId}/judge/1`
- `https://prodigyrccomp.com/events/{eventId}/judge/2`
- `https://prodigyrccomp.com/events/{eventId}/judge/3`
- `https://prodigyrccomp.com/events/{eventId}/spectator/self-register`
- `https://prodigyrccomp.com/events/{eventId}/spectator/bracket`
- `https://prodigyrccomp.com/events/{eventId}/spectator/results`

The older role-locked hostnames still work as compatibility aliases:

- `https://prodigyrccomp.com`
- `https://www.prodigyrccomp.com`
- `https://websiteadmin.prodigyrccomp.com`
- `https://eventadmin.prodigyrccomp.com`
- `https://judge1.prodigyrccomp.com`
- `https://judge2.prodigyrccomp.com`
- `https://judge3.prodigyrccomp.com`

The same deployed `index.html` is served to every domain. The app can read `window.location.hostname` for backwards-compatible role hostnames, but event-day judge QR codes and copied links should use the event-scoped route form so each phone is tied to a specific event ID.

## Step 1: Install the deploy tools

Install Node.js LTS first, then install the Firebase CLI:

```powershell
npm install -g firebase-tools
firebase login
```

If you do not want a global install, you can use:

```powershell
npx firebase-tools login
```

## Step 2: Deploy the current app to Firebase Hosting

This project is already wired to the Firebase project:

- Project ID: `prodigy-rc-competitions`

From this folder, deploy with:

```powershell
firebase deploy --only hosting
```

Important notes:

- `firebase.json` rewrites all routes to `index.html`
- `index.html` is sent with `no-cache` headers so phones refresh to the latest app build
- static assets are cached aggressively

## Step 3: Attach the custom domains in Firebase Hosting

In the Firebase console:

1. Open the `prodigy-rc-competitions` project
2. Go to `Hosting`
3. Add each custom domain to the same Hosting site:
   - `prodigyrccomp.com`
   - `www.prodigyrccomp.com`
   - `websiteadmin.prodigyrccomp.com`
   - `eventadmin.prodigyrccomp.com`
   - `judge1.prodigyrccomp.com`
   - `judge2.prodigyrccomp.com`
   - `judge3.prodigyrccomp.com`

Firebase will give you the DNS records required for each domain.

## Step 4: Add the DNS records at your domain provider

Use the exact records shown by Firebase.

Typical setup:

- apex/root domain (`prodigyrccomp.com`): A records and/or TXT verification records from Firebase
- subdomains (`www`, `websiteadmin`, `eventadmin`, `judge1`, `judge2`, `judge3`): CNAME records pointing to the Firebase target shown in the console

If you use Cloudflare:

- keep the DNS records in `DNS only` mode until Firebase verification and SSL finish
- after SSL is active, you can decide whether to enable proxying, but `DNS only` is the safest initial rollout

## Step 5: Wait for SSL issuance and verify each route

After Firebase verifies DNS, it will provision SSL certificates automatically.

Test each domain after SSL becomes active:

- `https://websiteadmin.prodigyrccomp.com`
  - should only show the website admin workflow
  - should require the website admin password

- `https://eventadmin.prodigyrccomp.com`
  - should require the event admin password
  - should show the event admin workflow only

- `https://judge1.prodigyrccomp.com`
  - should only allow Judge 1 access
  - should require the Judge 1 password

- `https://judge2.prodigyrccomp.com`
  - should only allow Judge 2 access
  - should require the Judge 2 password

- `https://judge3.prodigyrccomp.com`
  - should only allow Judge 3 access
  - should require the Judge 3 password

- `https://prodigyrccomp.com`
  - should open as spectator

## Safe verification checklist

Run this checklist after deployment:

1. Open each hostname in a private/incognito window.
2. Confirm the wrong panels are hidden on that hostname.
3. Confirm the matching password is still required.
4. Confirm the active event sync still changes across devices.
5. Confirm a judge hostname cannot switch to another judge role.
6. Confirm `websiteadmin` cannot accidentally land on qualifying or bracket views.
7. Confirm `eventadmin` cannot open the website admin panel.

## Current limitation

This rollout locks the front-end workflow by hostname and keeps the password flow separated, but it is not the final backend security layer by itself.

The next hardening step should be:

- Firestore rules or server-backed auth that enforce:
  - website admin can manage site-level settings
  - event admin can manage event data
  - each judge can only write their own judging fields

That backend lock is what prevents a technical user from bypassing client-side restrictions.
