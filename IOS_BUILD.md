# iOS Build & Volume-Button Setup

This project is wrapped with [Capacitor](https://capacitorjs.com/) so it can
run as a native iOS app. The native wrapper unlocks one thing the web app
cannot do: **reading the hardware Volume Up / Volume Down buttons** as a
remote shutter for Mark Shot / Measure Tee Shot / Mark Ball.

## Why a native wrap?

Mobile Safari (and any web browser on iOS) does not emit `keydown` events
for the hardware volume keys — iOS intercepts them. To detect them we
activate an `AVAudioSession`, KVO-observe `outputVolume`, and emit a
JS event to the Capacitor web view. See `ios/App/App/VolumeButtonPlugin.swift`.

## Build pipeline

Unsigned `.ipa` artifacts are built by **GitHub Actions on a macOS runner**
— no local Mac required. Every push to `master` kicks one off; you can also
run it on demand from the *Actions* tab → *Build iOS (unsigned IPA)* → *Run workflow*.

Download the artifact (`GolfDriveTracker-unsigned.ipa`) from the run summary.

## Signing the IPA for your phone

The CI artifact is **unsigned**, so iOS will refuse to install it directly.
Two common ways to sign with a free Apple ID (no $99/yr dev account needed):

1. **AltStore** (Mac or Windows) — install AltServer on your computer, AltStore
   on the phone, drag the `.ipa` into AltStore → it resigns with your Apple ID
   and installs. Re-sign every 7 days.
2. **Sideloadly** (Mac / Windows / Linux) — point it at the `.ipa`, enter your
   Apple ID, click *Start*. Same 7-day signing limit.

For permanent install, use a paid Apple Developer account and update the
workflow to sign during build (see "Enabling proper signing" below).

## Local iteration workflow

1. Edit TS/JS normally, run `npm run dev` for the web preview.
2. When you want a device build: `npm run build && npx cap sync ios`.
3. Push to `master` (or trigger the workflow manually) → wait ~10 min → download IPA.

## Testing the volume-button flow

1. Install the signed `.ipa` on your phone.
2. Open the app, start a round.
3. Press **Volume Up**:
   - Tee is ready → triggers **Measure Tee Shot**.
   - Drive in progress → triggers **Mark Ball**.
   - Mapping mode active → triggers **Mark Shot**.
4. The iOS volume HUD should *not* appear. Your system volume will be
   pinned to ~50% while the app is foregrounded so the plugin always has
   headroom to detect a press. Original volume is restored on app close.

## Enabling proper signing (optional, later)

Add these repo secrets: `APPLE_TEAM_ID`, `APPLE_P12_CERT` (base64), `APPLE_P12_PASSWORD`,
`APPLE_PROV_PROFILE` (base64), and switch the workflow's `CODE_SIGNING_ALLOWED=NO`
flag to reference the team + profile. Happy to wire that up when you have a
paid Apple Developer account.

## Files

- `capacitor.config.ts` — app id, web dir, iOS tuning
- `ios/App/App/VolumeButtonPlugin.swift` — native AVAudioSession observer
- `ios/App/App/VolumeButtonPlugin.m` — Capacitor plugin registration
- `src/plugins/volumeButton.ts` — TS/JS wrapper consumed by `App.tsx`
- `.github/workflows/ios-build.yml` — CI build + artifact upload
