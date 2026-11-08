# CUETGo

CUETGo is a campus ride-sharing web application for **CUET students and rickshaw drivers**. Students can request rides and join available rides, while approved drivers can view and accept ride requests. An administrator can review driver applications and manage rides.

**Live application:** https://cuetgo-frontend-87ru.onrender.com

## Features

### Student
- Sign up and sign in with a verified CUET student Google account.
- Create and edit a student profile.
- Select pickup and destination locations from CUET campus locations.
- Request a ride for a selected time and choose one or two seats.
- Add companion details when requesting two seats.
- View AI-ranked shared-ride recommendations based on route overlap, requested time and seat availability.
- Join another student's ride when seats are available.
- Track personal ride status and ride history.

### Rickshaw driver
- Sign up and sign in with a verified personal Gmail account.
- Submit name, Bangladeshi mobile number and NID details during registration.
- Wait for administrator approval before accessing ride requests.
- View pending ride requests grouped into compatible shared trips.
- Request an optimized stop order for a shared trip before accepting it.
- Accept available rides and mark accepted rides as completed.
- Edit profile details.

### Administrator
- Sign in through the administrator page at `/admin`.
- View student, driver and ride information.
- Review driver applications and approve, reject or return them to pending.
- View ride activity and cancel pending or accepted rides.

## How ride matching works

When a student requests a ride, CUETGo ranks pending requests using route overlap (same pickup, same destination or reverse direction), requested-time proximity and the two-seat rickshaw capacity. If a Gemini API key is configured, Gemini can refine the ranking and explanations; otherwise a deterministic scoring fallback is used. Drivers can request a stop order for a compatible shared trip. Gemini proposes an order when configured, and the backend validates that every known stop is used exactly once and each pickup precedes its drop-off. A safe heuristic fallback is used when Gemini is unavailable. The stop order is a planning suggestion, not turn-by-turn navigation or a live road-traffic route.

## Technology stack

| Area | Technology |
| --- | --- |
| Frontend | React 18, Vite, React Router |
| Styling | CSS, Tailwind CSS |
| Backend | Node.js, Express |
| Authentication | Google Identity / OAuth ID-token verification, JWT |
| Password hashing | bcryptjs (administrator password verification) |
| Ride matching and stop-order suggestions | Google Gemini API with deterministic fallback |
| Data storage | JSON file (`server/data/db.json`) |
| Deployment | Render |

## Project structure

```text
CUETGo1/
├── public/                 # Static frontend assets
├── src/
│   ├── components/         # Shared UI components
│   ├── context/            # Authentication context
│   ├── pages/              # Welcome, student, driver and admin pages
│   ├── api.js              # Frontend API client
│   └── ...
├── server/
│   ├── middleware/         # Authentication middleware
│   ├── routes/             # Authentication, rides and admin APIs
│   ├── services/           # Ride matching service
│   ├── data/               # Local JSON data store (created at runtime)
│   └── index.js            # Express server entry point
├── render.yaml             # Render deployment configuration
├── package.json
└── README.md
```

## Requirements

- Node.js 18 or newer (an active LTS release is recommended).
- npm.
- A Google Cloud OAuth 2.0 Web client ID for Google sign-in.
- A Gemini API key is optional; ride matching and stop-order suggestions have deterministic fallbacks when it is not configured.

## Run locally

### 1. Clone the repository

```bash
git clone https://github.com/FatemaJannatRup/CUETGo1.git
cd CUETGo1
```

### 2. Configure the backend

```bash
cd server
npm install
```

Create `server/.env` (you can start from `server/.env.example`) and configure:

```env
PORT=5000
NODE_ENV=development
JWT_SECRET=replace_with_a_long_random_secret
GOOGLE_CLIENT_ID=your_google_oauth_web_client_id
ADMIN_EMAIL=your_admin_email
ADMIN_PASSWORD_HASH=your_bcrypt_password_hash
GEMINI_API_KEY=
```

Generate a bcrypt hash for the administrator password from the `server` directory:

```bash
node --input-type=module -e "import bcrypt from 'bcryptjs'; console.log(await bcrypt.hash('CHANGE_THIS_PASSWORD', 12))"
```

Replace `CHANGE_THIS_PASSWORD` with a strong password, then put the generated hash in `ADMIN_PASSWORD_HASH`. Do not commit your `.env` file, API keys, passwords or generated secrets.

Start the backend:

```bash
npm run dev
```

The API runs at `http://localhost:5000`. Its health endpoint is `http://localhost:5000/api/health`.

### 3. Configure and start the frontend

Open a second terminal at the project root:

```bash
npm install
```

Create a root-level `.env` file (you can start from `.env.example`):

```env
VITE_GOOGLE_CLIENT_ID=your_google_oauth_web_client_id
VITE_API_URL=http://localhost:5000/api
```

Then run:

```bash
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`).

### 4. Configure Google sign-in

In Google Cloud Console, create or use an OAuth 2.0 Client ID with application type **Web application**. Add the exact frontend origin to **Authorized JavaScript origins**, for example:

- `http://localhost:5173` for local development.
- Your deployed frontend origin for the live application.

Use the same Web Client ID for `VITE_GOOGLE_CLIENT_ID` in the frontend and `GOOGLE_CLIENT_ID` in the backend. Never expose a client secret in frontend code.

## API overview

The backend exposes these main route groups under `/api`:

| Route group | Purpose |
| --- | --- |
| `/auth` | Google signup/login, current-user session and profile updates |
| `/rides` | Campus locations, ride requests, open rides, joining, driver actions and ride history |
| `/admin` | Administrator login, dashboard data, driver review and ride management |
| `/health` | Backend health check |

Authenticated endpoints use a JWT in the `Authorization: Bearer <token>` header.

## Deployment on Render

The repository includes a `render.yaml` Blueprint for a frontend static site and backend Node web service.

1. Push the project to GitHub.
2. In Render, create a new Blueprint deployment and select this repository.
3. Configure the environment variables requested by the Blueprint:
   - Backend: `GOOGLE_CLIENT_ID`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, and optionally `GEMINI_API_KEY`.
   - Frontend: `VITE_GOOGLE_CLIENT_ID`. The API URL is connected to the backend service by the Blueprint.
4. Add the deployed frontend URL to the Google OAuth client's authorized JavaScript origins.
5. Deploy both services and check the backend `/api/health` endpoint.

Keep all credentials in Render environment settings, not in source code or Git.

## Important limitations and security notes

- **Prototype storage:** the backend currently stores records in `server/data/db.json`. This is suitable for local development and demos, but it is not a production database. A Render service's local filesystem may be ephemeral, so records can be lost when the service is restarted or redeployed. Do not rely on this storage for important or permanent data.
- **No production guarantee:** authentication and validation are implemented for the application's current scope, but the project has not been independently security-audited.
- **Sensitive information:** driver registration collects NID information. Do not use real personal information in public demos or test environments. Keep access to the administrator account restricted.
- **Administrator credentials:** use a strong, unique password. The administrator can access account and ride information and change driver approval status.
- **Google configuration:** Google sign-in will not work until matching client IDs and authorized origins are configured in both frontend and backend environments.
- **Gemini is optional:** without a valid `GEMINI_API_KEY`, matching uses deterministic scoring and route planning uses a safe stop-order heuristic.
- **Route planning scope:** route optimization currently orders the campus pickup/drop-off stops for a shared trip. It does not calculate road geometry, turn-by-turn directions, live traffic or exact travel distances.

## Contributing

1. Create a feature branch.
2. Make and test your changes locally.
3. Open a pull request describing the changes.

Please do not include secrets, real user data, or personal identity information in commits or issue reports.
