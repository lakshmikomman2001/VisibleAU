# VisibleAU — Install the Stripe CLI on Windows (via Claude Code in VS Code)
**Claude Code prompt — paste into the Claude Code VS Code extension. This assumes VS Code is running
NATIVELY on Windows (PowerShell terminal), NOT connected to WSL/remote.**

## First, confirm the environment (don't assume)
Run and report:
```powershell
$PSVersionTable.PSVersion        # confirms PowerShell (Windows)
echo $env:OS                     # expect: Windows_NT
where.exe stripe 2>$null; if ($?) { stripe --version } else { echo "stripe NOT installed yet" }
```
If this does NOT look like Windows PowerShell (e.g. it returns a Linux uname), STOP — you're not in the
operator's Windows environment and cannot install onto their machine. Report that and stop.

## What this CAN and CANNOT do
- CAN: download the Stripe CLI, unzip it, verify it runs.
- CANNOT: run `stripe login` (interactive browser approval — the operator must do that themselves).
So this prompt installs the CLI and verifies it; the operator does `stripe login` + `stripe listen`
afterward.

## STEP 1 — Check if Scoop exists (preferred if present)
```powershell
where.exe scoop 2>$null
```
If Scoop IS installed, just run:
```powershell
scoop install stripe
stripe --version
```
…and skip to "Report". If Scoop is NOT installed, use STEP 2 (direct download) — do NOT install Scoop
(don't add a package manager the operator didn't ask for).

## STEP 2 — Direct download + unzip (no package manager)
Download the latest Windows release into a stable folder and unzip it:
```powershell
# Create a folder for it:
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\stripe-cli" | Out-Null

# Fetch the latest release's Windows x86_64 zip URL from GitHub and download it:
$asset = (Invoke-RestMethod "https://api.github.com/repos/stripe/stripe-cli/releases/latest").assets |
         Where-Object { $_.name -like "*windows_x86_64.zip" } | Select-Object -First 1
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile "$env:USERPROFILE\stripe-cli\stripe.zip"

# Unzip:
Expand-Archive -Path "$env:USERPROFILE\stripe-cli\stripe.zip" -DestinationPath "$env:USERPROFILE\stripe-cli" -Force

# Verify it runs (from that folder):
& "$env:USERPROFILE\stripe-cli\stripe.exe" --version
```
Report the version string it prints. (If GitHub API is rate-limited/unreachable, report that — the
operator can instead download manually from github.com/stripe/stripe-cli/releases/latest.)

## STEP 3 — (Optional) make `stripe` available without the full path
Add the folder to the USER PATH so the operator can type `stripe` anywhere (takes effect in NEW
terminals):
```powershell
$p = [Environment]::GetEnvironmentVariable("Path","User")
if ($p -notlike "*stripe-cli*") {
  [Environment]::SetEnvironmentVariable("Path", "$p;$env:USERPROFILE\stripe-cli", "User")
  echo "Added stripe-cli to USER PATH. Open a NEW terminal for 'stripe' to be recognized."
} else { echo "stripe-cli already on PATH." }
```
Note: existing terminals won't see the PATH change — a NEW terminal (or VS Code reload) is needed.
Until then, the operator runs it via the full path: `& "$env:USERPROFILE\stripe-cli\stripe.exe"`.

## STEP 4 — Report + hand back the manual steps
Report: the environment check result, install method used (scoop vs download), the `stripe --version`
output, and the full path to `stripe.exe`. Then tell the operator to do these THEMSELVES (cannot be
automated):
1. In a NEW terminal: `stripe login`  → approve the pairing code in the browser (links CLI to their
   test sandbox).
2. In its OWN terminal (leave it open): 
   `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
   → copy the printed `whsec_...` into `STRIPE_WEBHOOK_SECRET` in `.env.dev`, then restart `pnpm dev`.

## Constraints
- Do NOT install Scoop or any package manager if absent — use the direct download instead.
- Do NOT attempt `stripe login` (interactive; can't be automated) — only install + verify.
- Do NOT modify `.env.dev` here (the webhook secret comes later, from the operator running listen).
- If the environment is not Windows/native, STOP and report — do not pretend to install.
