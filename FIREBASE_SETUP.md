# Firebase Setup Guide for Code Defuser

## Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add Project"
3. Enter project name: `code-defuser` (or your choice)
4. Disable Google Analytics (optional)
5. Click "Create Project"

## Step 2: Enable Realtime Database

1. In Firebase Console, click "Realtime Database" in left menu
2. Click "Create Database"
3. Select location (closest to you)
4. Start in **Test Mode** (for development)
5. Click "Enable"

## Step 3: Get Firebase Configuration

1. In Firebase Console, click the gear icon ⚙️ → "Project settings"
2. Scroll down to "Your apps" section
3. Click the web icon `</>`
4. Register app with nickname: "Code Defuser"
5. **Copy the firebaseConfig object**

## Step 4: Update script.js

Open `script.js` and replace the Firebase config (around line 28):

```javascript
const firebaseConfig = {
    apiKey: "YOUR_ACTUAL_API_KEY",
    authDomain: "your-project-id.firebaseapp.com",
    databaseURL: "https://your-project-id-default-rtdb.firebaseio.com",
    projectId: "your-project-id",
    storageBucket: "your-project-id.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef123456"
};
```

## Step 5: Test It!

1. Open `index.html` in your browser
2. Enter username and password: **CBAnokha**
3. Play the game
4. When game ends, check Firebase Console → Realtime Database
5. You should see scores appearing under `scores/` node!

## View Scores in Firebase Console

- Go to Realtime Database in Firebase Console
- Expand `scores/` to see all saved scores
- Each entry contains: username, score, round, question, timestamp, date

## Security Rules (Optional)

For production, update Database Rules in Firebase Console:

```json
{
  "rules": {
    "scores": {
      ".read": true,
      ".write": true
    }
  }
}
```

## Password

The game password is hardcoded in `script.js`:
- Password: **CBAnokha**
- Only users with this password can play

## Troubleshooting

- **"Firebase not initialized"** → Check if config values are correct
- **Scores not saving** → Check browser console for errors
- **Permission denied** → Update Database Rules in Firebase Console
- **Can't see scores** → Make sure you're looking at the correct project in Firebase Console

## Export Scores to JSON

To download scores from Firebase:

1. Go to Firebase Console → Realtime Database
2. Click the `scores` node
3. Click the "⋮" menu
4. Select "Export JSON"
5. Save the file

---

**All done!** Your scores will now automatically save to Firebase Cloud Database.
