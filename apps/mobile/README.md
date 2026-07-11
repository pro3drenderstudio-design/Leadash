# Leadash Mobile (iOS + Android)

Native companion app — check campaigns, answer CRM replies, and watch inbox
health on the go. Expo (managed workflow) in the pnpm monorepo. Design
reference: `handoff_mobile_app/Leadash Mobile App.dc.html` at the repo root.

## Setup

```bash
# from repo root
pnpm install
cp apps/mobile/.env.example apps/mobile/.env   # fill in Supabase URL + anon key
```

`.env` values:
- `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` — same project the web app uses
- `EXPO_PUBLIC_API_BASE_URL` — `https://www.leadash.com` (the deployed web API; the app is a pure client of `/api/outreach/*` + `/api/mobile/*`)

## Run (development)

```bash
cd apps/mobile
npx expo start          # QR code → Expo Go (screens work; remote push does NOT)
```

For push notifications and store builds you need a development/preview build,
not Expo Go:

```bash
npm i -g eas-cli
eas login               # Expo account
eas init                # links the project, writes extra.eas.projectId into app.json
eas build --profile development --platform android   # or ios
```

## Push credentials (one-time)

- **Android**: create a Firebase project → Project settings → Service accounts
  → generate a private key JSON → `eas credentials` → Android → upload the
  FCM v1 service account key.
- **iOS**: requires an Apple Developer Program account ($99/yr). `eas credentials`
  → iOS → let EAS create/manage the APNs key.

Push flow: reply ingested / campaign completed / DNS health change →
`enqueuePush` (BullMQ `leadash:push`) → `apps/worker` push-worker → Expo push
service → device. Per-user prefs (type toggles, positive-only, quiet hours)
live in `mobile_notification_prefs`; the in-app feed is `mobile_notifications`.

**The worker on the VPS must be redeployed** (`git pull && pnpm install &&
pm2 restart leadash-worker`) after any push-pipeline change so the
`leadash:push` worker is registered.

## Release

```bash
eas build --profile preview --platform all      # internal APK + TestFlight ad-hoc
eas build --profile production --platform all   # store builds (auto-increment)
eas submit --platform ios                        # App Store Connect
eas submit --platform android                    # Play Console
```

Store checklist before first submission:
- Privacy policy URL on leadash.com
- App Store privacy labels + Play Data Safety form (account-linked: email, user content)
- Screenshots (dark UI) per device class
- Demo login for Apple review (seeded workspace with a few campaigns/replies)
- Bundle ids are `com.leadash.mobile` on both platforms (change in app.json before first build if needed)

## Architecture notes

- **Auth**: Supabase `signInWithPassword`, session in encrypted storage
  (LargeSecureStore — AES key in SecureStore, blob in AsyncStorage). Every API
  call sends `Authorization: Bearer <access_token>` + `x-workspace-id`.
  Backend support: `requireWorkspace`/`requireUser` in
  `apps/web/src/lib/api/workspace.ts` accept Bearer alongside cookies.
- **API client**: `src/lib/api.ts` ports `apps/web/src/lib/outreach/api.ts`
  function-for-function. `src/types/outreach.ts` is a copy of the web types —
  re-copy when web types change.
- **Design tokens**: `src/theme/tokens.ts` ports `apps/web/src/v2-app/v2-app.css`.
  Dark-only. Geist fonts bundled in `assets/fonts/`.
- **Unread badges**: thread unread is client-side (AsyncStorage last-seen);
  the bell/Inbox badge uses server-side `mobile_notifications.read_at`.
