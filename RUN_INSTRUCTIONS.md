# How to Run Code Defuser

## Quick Start

1. **Set up Firebase** (one-time setup):
   - See [FIREBASE_SETUP.md](FIREBASE_SETUP.md) for detailed instructions
   - Takes about 5 minutes

2. **Open the game**:
   - Just double-click `index.html` in your browser
   - Or open it with any browser

3. **Play the game**:
   - Enter your username
   - Enter password: **CBAnokha**
   - Click "Start Mission"
   - Your scores will automatically save to Firebase!

## Password

**Password: CBAnokha**

Only users with this password can play the game.

## Files

- `index.html` - Game interface
- `script.js` - Game logic with Firebase integration
- `style.css` - Game styling with Matrix theme
- `questions.json` - All coding challenges
- `FIREBASE_SETUP.md` - Firebase setup guide

## Features

✅ Password protection (CBAnokha)
✅ Auto-save scores to Firebase Cloud Database
✅ **Leaderboard with your rank** - See where you stand!
✅ No backend server needed
✅ Works offline (uses localStorage fallback)
✅ Matrix-themed UI with animations
✅ 5 rounds, 5 questions each
✅ Multiple programming languages

## Viewing Scores

Scores are saved to Firebase Realtime Database. View them at:
- Firebase Console → Your Project → Realtime Database

Or export them as JSON from Firebase Console.

