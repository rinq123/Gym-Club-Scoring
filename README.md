# Eclipse Invitational Scoring

Frontend-only gymnastics competition scoring app using Firebase (Firestore + Auth) and three pages:
- `admin.html` - admin control panel
- `index.html` - public scoreboard
- `stream.html` - big-screen stream display

No custom backend server is used. The app is static HTML/CSS/JS with Firebase as the data/auth layer.

---

## Live URLs

- Admin: `https://eclipse-invitational.web.app/admin.html`
- Public: `https://eclipse-invitational.web.app/index.html`
- Stream: `https://eclipse-invitational.web.app/stream.html`

---

## Features

- Competition manager:
  - Set active competition
  - Create new
  - Rename
  - Archive
  - Delete selected
- Manage Gymnast(s):
  - Name, club, Comp No.
  - Exactly one category tag and one grade tag
  - Edit and delete
- Score entry:
  - Fields: Artistry, Execution, Difficulty, Penalties, Total
  - No in-app calculations (scores can come from external spreadsheet workflow)
  - Category dropdown includes `All` (default)
  - Grade filter for gymnast selection
  - Gymnast search filter in score panel
- Stream controls:
  - Modes: Welcome, Idle/Break, Scoreboard, Mix, Announcement, Spotlight
  - Performer search filter
  - Stream display settings (live): rows mode, font scale, page duration
    - Default preset: `Auto` rows, `100%` font, `7s` page duration
    - Rows mode: `Auto` or `Manual`
    - Manual rows range: `4` to `10`
    - Font scale range: `85%` to `120%`
    - Page duration range: `4s` to `12s`
  - Auto rows by screen height:
    - `< 1300px`: `5`
    - `1300px - 1899px`: `6`
    - `>= 1900px`: `7`
  - Stream scoreboard uses a 2-line row layout for readability:
    - Main row: Rank, Gymnast(s), Club, Category, Comp No., Grade, Total
    - Detail row: Artistry, Execution, Difficulty, Penalties
  - Spotlight mode auto-fits long performer names/meta/score to viewport (no manual zoom)
- Exports:
  - Export Gymnast(s) CSV
  - Export Scores CSV
- Public page:
  - Manual refresh button only (no automatic Firestore refresh on page load/reload)
  - Local cached snapshot shown until refresh is pressed
  - Category, grade, and club filters
  - Gymnast(s) search bar (name, No., club, category, grade)
  - Smooth fade-out highlight when scores update
- Scoreboard update animation:
  - Smooth highlight fade transitions on both public and stream scoreboards
- Admin list search:
  - Search Gymnast(s) list
  - Search Recent Entries list

---

## Project Structure

```txt
admin.html
index.html
stream.html
css/styles.css
js/admin.js
js/public.js
js/stream.js
js/firebase.js
firestore.rules
firebase.json
```

---

## Firebase Setup

1. Create a Firebase project.
2. Enable Firestore.
3. Enable Authentication:
   - Provider: Email/Password
   - Create admin users (email + PIN/password).
4. Put your Firebase web config into `js/firebase.js`.
5. Set Firestore rules (`firestore.rules`) with your admin emails in `isAdmin()`.
6. Deploy:

```bash
firebase deploy --only firestore:rules,hosting
```

---

## Security Model

- Public read:
  - `settingsPublic/current`
  - `competitions/{id}/scores/*`
  - `competitions/{id}/streamState/current`
- Admin-only:
  - all writes
  - competition settings
  - athletes
  - root admin documents
- Admin access uses Firebase Auth (email + PIN/password).

Note: public page is manual refresh to reduce read usage.

---

## Firestore Data Model

```txt
settings/current
  activeCompetitionId

settingsPublic/current
  competitionName
  categories[]
  grades[]
  activeCompetitionId

competitions/{id}
  name
  archived
  createdAt

competitions/{id}/settings/current
  competitionName
  categories[]
  grades[]

competitions/{id}/athletes/{athleteId}
  name
  club
  competitorNumber
  categoryTags[]
  gradeTags[]
  createdAt
  updatedAt

competitions/{id}/scores/{scoreId}
  athleteId
  athleteName
  athleteClub
  competitorNumber
  category
  grade
  artistry
  execution
  difficulty
  penalties
  total
  timestamp

competitions/{id}/streamState/current
  mode
  performerId
  performerName
  performerClub
  performerNumber
  performerCategory
  performerGrade
  mixSeconds
  displaySettings
    rowsMode
    manualRows
    fontScale
    pageDurationSeconds
  updatedAt
```

---

## Admin Usage

1. Log in on `admin.html` with admin email + PIN.
2. Pick the active competition in Competition Manager.
3. Add gymnasts in Manage Gymnast(s).
4. Enter scores in Enter Score.
   - Use `All` category default or pick a specific category.
   - Optionally filter by grade.
   - Use search to find gymnast quickly.
5. Control stream mode in Stream Controls.
6. Configure Stream Display Settings and click `Apply Display Settings` to push live:
   - Rows mode (`Auto`/`Manual`)
   - Manual rows (`4` to `10`)
   - Font scale (`85%` to `120%`)
   - Page duration (`4s` to `12s`)
7. Use `Reset Defaults` to restore default stream display settings.
8. Export CSVs if needed.

---

## Public Usage

- Open `index.html`.
- Press `Refresh` to pull latest scores.
- Use category/club filters.

---

## Stream Usage

- Open `stream.html` on projector/screen.
- Stream updates live from admin changes.
- Scoreboard pages automatically; row count depends on display settings:
  - Auto: `5/6/7` by screen height
  - Manual: configured `4-10` rows
- Recommended for first run:
  - keep `Rows Per Page = Auto`
  - keep `Font Scale = 100%`
  - adjust only if your venue screen needs larger or denser rows
- Spotlight view auto-scales long names and score text to stay visible at 1080p.

---

## Local Development

Use a local server (ES modules do not work with `file://`):

```bash
py -m http.server 8080
```

Then open:
- `http://localhost:8080/admin.html`
- `http://localhost:8080/index.html`
- `http://localhost:8080/stream.html`

---

## Deploy Notes

- Full deploy:
  - `firebase deploy`
- Only hosting + rules:
  - `firebase deploy --only hosting,firestore:rules`
- Only hosting (recommended for UI-only changes):
  - `firebase deploy --only hosting`

Quick guidance:
- Use `--only hosting` when you changed HTML/CSS/JS only.
- Use `--only hosting,firestore:rules` when you changed UI plus Firestore rules.
- Use full deploy only when you intentionally changed additional Firebase resources.

For rapid iteration, targeted deploy is usually better.

---

## Troubleshooting

- "No eligible gymnast(s)":
  - gymnast already scored in that category or is currently pending score write.
- Public page looks stale:
  - press Refresh (manual refresh design).
- Admin cannot write:
  - check Auth user and email allowlist in Firestore rules.
- Stream not changing:
  - verify active competition and stream state updates in Firestore.
- Stream display settings not applying:
  - click `Apply Display Settings` in admin and confirm stream status line updates.

---

## License

Private project for Eclipse Gymnastics Invitational.
