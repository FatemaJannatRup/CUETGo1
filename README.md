# CUET Shared Ride 

A working prototype: React frontend + Node/Express backend + AI-integrated ride
matching (Google Gemini API, with an automatic rule-based fallback if you
don't have a key yet).

## What's included

- **Frontend** (`/` root folder): React + Vite + Tailwind, mobile-app style UI
- **Backend** (`/server` folder): Express API, JSON file storage (no database
  installation needed), JWT login, password hashing, Gemini-powered ride
  matching

## 1. Install requirements

You need **Node.js** installed (version 18 or newer).
Check with:
```
node -v
```
If you don't have it, download from https://nodejs.org (choose the LTS version).

## 2. Open the project in VS Code

`File > Open Folder` → select the unzipped `cuet-shared-ride` folder.

## 3. Set up the backend

Open a terminal in VS Code (`` Terminal > New Terminal ``) and run:

```
cd server
npm install
```

Create your environment file:
```
cp .env.example .env
```
(On Windows, use `copy .env.example .env` instead.)

Open `server/.env` and optionally paste in a Gemini API key:
```
GEMINI_API_KEY=your_key_here
```
If you don't have a Gemini API Key, then you get one at https://aistudio.google.com/app/apikey for free. **This step is
optional** — if you leave it blank, ride matching still works using a
simple rule (same route + close request time), so you can demo the app
immediately without waiting on an API key.

Start the backend:
```
npm run dev
```
You should see:
```
CUET Shared Ride backend running on http://localhost:5000
```
Leave this terminal running.

## 4. Set up the frontend

Open a **second** terminal (`` Terminal > New Terminal `` again — don't close
the backend one) and run, from the project root:

```
npm install
npm run dev
```

Click the `http://localhost:5173` link shown in the terminal. Narrow your
browser window (or use dev tools' device mode) to see the mobile layout.

## 5. Try it out 

1. Welcome screen → **Get Started**
2. Choose **Student** → **Create an account** → sign up with an email like
   `uXXXXXXX@student.cuet.ac.bd`
3. On the student home screen, pick a route and tap **Find a Ride** — this
   calls the backend, which asks Gemini (or the fallback rule) to look for
   matching riders
4. Open a **second browser tab**, choose **Rickshaw Driver** → sign up with
   a Gmail address or phone number plus an NID number
5. On the driver home screen (in Bengali), the ride request appears within
   a few seconds — tap **গ্রহণ করুন** (Accept) to accept it
6. Switch back to the student tab — the ride status updates to "Driver on
   the way"

## How the AI matching works

When a student requests a ride, the backend sends the pending ride requests
to Gemini and asks it to group riders by route and request time. If no
`GEMINI_API_KEY` is set, or the Gemini call fails for any reason, the app
automatically falls back to a simple rule (same route, requests within 20
minutes of each other) — so the demo never breaks even without internet
access to Google's API.

## Notes for your teacher / presentation

- Data is stored in `server/data/db.json` (auto-created on first run) —
  you can open it to show real signup/ride data during a demo.
- Passwords are hashed with bcrypt, not stored in plain text.
- Login sessions use JWT tokens, sent as `Authorization: Bearer <token>`.
- This is a prototype: it's for local demo purposes only, not deployed to
  the internet or production-hardened.
