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
  - Scoreboard auto-pagination (7 rows per page)
- Exports:
  - Export Gymnast(s) CSV
  - Export Scores CSV
- Public page:
  - Manual refresh button only (no automatic Firestore refresh on page load/reload)
  - Local cached snapshot shown until refresh is pressed
  - Category and club filters
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
6. Export CSVs if needed.

---

## Public Usage

- Open `index.html`.
- Press `Refresh` to pull latest scores.
- Use category/club filters.

---

## Stream Usage

- Open `stream.html` on projector/screen.
- Stream updates live from admin changes.
- Scoreboard pages automatically when many rows exist.

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

---

## License

Private project for Eclipse Gymnastics Invitational.
