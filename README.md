# Eclipse Invitational Scoring (Gym Club Scoring)

Frontend-only gymnastics competition scoring system with Firebase (Firestore + Auth) and three views:
- **Admin Panel** (`admin.html`) — manage competitions, gymnasts, scores, and stream state.
- **Public Scoreboard** (`index.html`) — spectator view with manual refresh.
- **Stream Display** (`stream.html`) — big screen / live stream layout with multiple modes.

This project is intentionally **no backend** (static HTML/CSS/JS) and relies on Firebase for storage/auth.

---

## Key Features

- Competition manager (create, archive, delete, set active).
- Gymnast(s) roster with **Category** + **Grade** tags and **Comp No.**
- Score entry with **Artistry, Execution, Difficulty, Penalties, Total** (no calculations).
- Live stream modes: Welcome, Break, Announcement, Spotlight, Scoreboard, Mix.
- Auto-pagination on stream scoreboard (7 rows per page).
- CSV export for Gymnast(s) and Scores.
- Public scoreboard **manual refresh only** (reduces read usage).

---

## Project Structure

```
admin.html          Admin panel
index.html          Public scoreboard (manual refresh)
stream.html         Stream/big-screen display
css/styles.css      Shared styles
js/admin.js         Admin logic
js/public.js        Public scoreboard logic
js/stream.js        Stream display logic
js/firebase.js      Firebase initialization
firestore.rules     Security rules
firebase.json       Hosting config
```

---

## Firebase Setup (Required)

1. **Create Firebase project**
2. **Enable Firestore**
3. **Enable Authentication**
   - Use Email/Password
   - Create admin users in Firebase Auth (email + PIN as password)
4. **Update `js/firebase.js`**
   - Replace config values with your project’s web config.

5. **Update `firestore.rules`**
   - Add your admin emails to the allowed list:
     ```js
     function isAdmin() {
       return request.auth != null
         && request.auth.token.email in [
           "eclipse@freedom-leisure.co.uk",
           "eclipse.gymnastics@yahoo.co.uk"
         ];
     }
     ```
6. **Deploy rules + hosting**
   ```
   firebase deploy --only firestore:rules,hosting
   ```

---

## Security Model (Current)

- **Public read:** `settingsPublic`, `competitions/*/scores`, `competitions/*/streamState`
- **Admin-only:** everything else (including `athletes`)
- Admins are validated by Firebase Auth **email+PIN**

> Note: The public scoreboard uses only Firestore reads and is **manual refresh**.

---

## Data Model (Firestore)

```
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
  mode (welcome | idle | announcement | spotlight | scoreboard | mix)
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

## Usage Guide

### Admin Panel (`admin.html`)
1. **Login** with email + PIN (Firebase Auth).
2. **Competition Manager**
   - Create / Set Active / Archive / Delete.
3. **Manage Gymnast(s)**
   - Enter name, club, Comp No., and tag **exactly one** category + grade.
4. **Enter Score**
   - Select category and gymnast.
   - Fill Artistry, Execution, Difficulty, Penalties, Total.
5. **Stream Controls**
   - Set mode (Welcome, Break, Announcement, Spotlight, Scoreboard, Mix).
6. **Export**
   - Export gymnasts or scores to CSV.

### Public Scoreboard (`index.html`)
- **Manual refresh only**: click **Refresh** to pull the latest scores.
- Filter by Category and Club.
- Cached results stored in `localStorage` until refreshed.

### Stream Display (`stream.html`)
- Designed for large displays.
- Auto page‑flip for long scoreboards.
- Spotlight shows current gymnast and their latest score.

---

## Local Development

Because ES Modules are used, open with a local server (not file://).

Example (PowerShell):
```
py -m http.server 8080
```

Then visit:
```
http://localhost:8080/index.html
http://localhost:8080/admin.html
http://localhost:8080/stream.html
```

---

## Deployment

Recommended:
```
firebase deploy --only hosting,firestore:rules
```

If you deploy often during development, it’s fine — Firestore costs stay within free quotas unless usage is high.

---

## Troubleshooting

- **“No eligible gymnast(s)”**
  - They already have a score in that category or are pending after save.
- **Public page looks stale**
  - Click **Refresh** (manual refresh only).
- **Admin can’t write**
  - Ensure Firebase Auth user email is listed in `firestore.rules`.
- **Stream not changing**
  - Check that `streamState` is being updated for the active competition.

---

## Notes / Future Enhancements

- Optional App Check for better protection against abuse.
- Optional server‑side snapshot doc to reduce public reads.
- Mobile‑optimized card view for public scoreboard.

---

## License

Private project for Eclipse Gymnastics Invitational. All rights reserved.
