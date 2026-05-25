# Olympiad Scores — Project Context

## Project

- Repo: `git@github.com:palytinsley/olympiadscores.git`
- GAS Script ID: `1GrUN1bIQdkYfVDOYMamzSoKhLtR9gv3nugOgivBetk3UNnbD10wW0OPU`
- Spreadsheet ID: `1_fj6VYp7In9MHefTH-uyQt9NXvWUpEAZLHGJffkAO6Y`
- Spreadsheet URL: `https://docs.google.com/spreadsheets/d/1_fj6VYp7In9MHefTH-uyQt9NXvWUpEAZLHGJffkAO6Y/edit`
- Deployed GAS web app URL is currently hardcoded in `frontend/index.html`.

## Architecture

- Frontend: static HTML/CSS/vanilla JS, currently `frontend/index.html`
- Backend: Google Apps Script, currently `gas-backend/Code.gs`
- Apps Script manifest: `gas-backend/appsscript.json`
- Database: Google Sheets
- Hosting target: GitHub Pages for static frontend
- Version control remote must stay SSH-only.

## Active Spreadsheet Schema

Do not rename existing tabs or row 1 headers unless explicitly instructed.

### `RawLog`

- `Timestamp`
- `Period`
- `Station/Event`
- `Round`
- `Cohort10_Place`
- `Cohort11_Place`
- `Cohort12_Place`
- `Cohort10_Points`
- `Cohort11_Points`
- `Cohort12_Points`
- `Type (score/penalty/bonus)`
- `Note`

### `Totals`

- `Event/Station`
- `Cohort 10`
- `Cohort 11`
- `Cohort 12`

### `Event Config`

- `Period`
- `Event Name`
- `Sort Order`
- `Active`

## Default Event Config

### Period 5

- Human Knot
- 3-Legged Wheelbarrow
- Hula Hoop
- Tug o' War

### Period 6

- Multi Mini
- Dance Battle
- Balloon Toss
- Ice Bucket

## Project Rules

- Follow `../GLOBAL_AGENTS.md` unless this file gives a more specific instruction.
- Keep this a static frontend plus GAS plus Sheets project.
- Do not add React, Vite, Next.js, npm build systems, external databases, analytics, Firebase, Supabase, or other third-party storage for student data unless explicitly approved.
- Keep GitHub remote URLs in SSH format.
- Always include `.nojekyll` at repo root before GitHub Pages deployment work.
- Use Tabler Icons via jsDelivr CDN with `<i class="ti ti-{name}"></i>`.
- Preserve existing backend function names unless explicitly instructed.
- Do not replace working Apps Script endpoints without permission.
- Do not create duplicate active files with competing `doGet` or `doPost` handlers.
- Do not commit `.clasprc.json`, OAuth tokens, API keys, private credentials, or student data.
- Do not use `INDIRECT` formulas or dynamic spreadsheet formula indirection.
- Use flat-tab direct data reads from Sheets.
- Treat spreadsheet schemas as stable.

## Notes

- There is a `quarantine-wrong-rpject/` folder containing older or wrong-project material. Do not treat it as active project code unless explicitly instructed.
- The active backend stores the spreadsheet association in Apps Script script property `SPREADSHEET_ID`.
- The active backend supports optional script property `API_SHARED_SECRET`; the current frontend does not send a secret.
