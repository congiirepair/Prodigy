# Black / White Redesign Rollback

## Branch

Redesign branch:

```powershell
git switch redesign-black-white-spectator-upgrade
```

The redesign is intentionally isolated in:

- `assets/prodigy-black-white-redesign.css`
- one stylesheet link in `index.html`

## Filesystem Backup

Pre-redesign backup:

```text
C:\Users\Chuck\OneDrive\Desktop\Prodigy-backups\Prodigy-2026-05-03-235836-pre-black-white-redesign
```

That folder contains the app source and a `_git-safety` folder with the pre-redesign git status and working-tree patch.

## Fast Visual Rollback

To remove only the redesign theme while keeping every other current app change:

1. Open `index.html`.
2. Remove this line:

```html
<link rel="stylesheet" href="./assets/prodigy-black-white-redesign.css" />
```

3. Deploy the app again.

## Full Folder Restore

To restore the exact pre-redesign source snapshot:

```powershell
$backup = 'C:\Users\Chuck\OneDrive\Desktop\Prodigy-backups\Prodigy-2026-05-03-235836-pre-black-white-redesign'
$app = 'C:\Users\Chuck\OneDrive\Desktop\Prodigy'
robocopy $backup $app /E /XD '.git' 'node_modules' '.firebase' /XF '*.log'
```

Then run:

```powershell
npm run test:unit
firebase deploy --only hosting --project prodigy-rc-competitions
```

## Preview Deployment Rollback

If the redesign is deployed only to a Firebase preview channel, production is not replaced. You can ignore or expire that preview channel without affecting `https://prodigyrccomp.com`.
