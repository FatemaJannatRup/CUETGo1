# CUETGo

**CUETGo is a campus-only shared-rickshaw ride platform for Chittagong University of Engineering & Technology (CUET).** It helps CUET students request a campus trip, share a compatible ride with another student, and connect with approved rickshaw drivers.

**Live app:** https://cuetgo-frontend-87ru.onrender.com

> CUETGo is scoped to the locations configured inside the CUET campus. It is not a general city ride-hailing service.

## What the app currently supports

### Students
- Create an account and sign in using a Google account with a verified `@student.cuet.ac.bd` address.
- Choose a unique username during signup.
- Maintain a profile with username, CUET hall and optional gender preference.
- Request a ride between two different CUET campus locations for a selected pickup time.
- Create a **private** booking for one or two seats, or an **open-to-share** booking for one seat.
- Add a companion's name and Bangladeshi phone number when reserving both seats privately.
- Set a preferred co-rider gender (any, male or female) for open-to-share bookings. Matching checks both riders' preferences against verified profile gender on the server; profile gender is not exposed in public ride listings.
- See exact-route, time-compatible and gender-compatible shared-ride recommendations.
- Join an open-to-share ride for one seat only; private bookings cannot be joined.
- View personal rides, passenger details, status updates, each rider's fare responsibility and ride history.
- Edit a pending booking only as its original creator and before the two-minute cutoff. A joined passenger can only leave their own seat.
- Cancel their own participation without automatically cancelling another registered passenger's place.

### Drivers
- Register and sign in using a verified personal Gmail account.
- Submit their name, Bangladeshi mobile number and NID during registration.
- Wait for administrator approval before managing ride requests.
- See compatible pending requests grouped as a shared trip.
- Request a suggested pickup/drop-off stop order before accepting a shared trip.
- Accept a trip, mark arrival, start the trip and mark it completed.
- Cancel an accepted trip when appropriate and manage their profile.

### Administrator
- Sign in at `/admin` using the configured administrator email and password.
- View platform totals and lists of students, drivers and rides.
- Filter driver applications and approve, reject or return an application to pending.
- Review ride activity and cancel eligible pending or accepted trips.
- Driver approval cannot be changed while that driver has active trips.

## Campus locations

The backend currently allows these configured locations:

- **Halls:** Muktijoddha Hall; Shahid Mohammad Shah Hall; Dr. Qudrat-E-Khuda Hall; Kabi Kazi Nazrul Islam Hall; Shaheed Tareq Huda Hall; Shaheed Abu Sayed Hall; Sufia Kamal Hall; Begum Shamsunnahar Khan Hall; Tapashi Rabeya Hall.
- **Other campus points:** CUET Main Gate; Academic Building; Central Library; Cafeteria.

Pickup and destination must be two different locations from this list. Add or change locations in `server/constants/campusLocations.js`.

## How ride sharing works

- **Strict route compatibility:** recommendations require the same CUET pickup and destination in the same direction. Matching only one endpoint or matching the reverse direction is not sufficient.
- **Time compatibility:** candidate pickup times must be no more than 10 minutes apart.
- **Capacity:** a rickshaw trip can carry at most two passenger seats. A request that already uses two seats cannot be paired with another request.
- **Booking cutoff:** students cannot create or join a ride during the final two minutes before its pickup time. The backend rechecks the cutoff inside the database transaction.
- **Driver assignment:** an approved driver can accept a compatible request or shared group. A shared group is treated as one trip rather than separate driver assignments.
- **Recommendations:** the backend first builds a deterministic list of genuinely feasible candidates. If `GEMINI_API_KEY` is configured, Gemini can refine their ranking and explanations; otherwise the deterministic ranking is used.
- **Stop ordering:** Gemini may suggest an order for the known pickup/drop-off points. The backend validates that every stop appears exactly once and each pickup occurs before its drop-off. A deterministic heuristic is used if Gemini is unavailable or returns an invalid result. This is not turn-by-turn navigation or live traffic routing.

### Privacy, cancellation, sharing and fares

- **Private bookings** reserve the full rickshaw for the creator's party. They never appear in open listings and the join API rejects attempts to join them. A private two-seat booking may include a companion; the creator remains responsible for the full fare.
- **Open-to-share bookings** reserve one seat for the creator and allow one compatible registered student to join. The backend enforces the two-seat limit and both riders' gender preferences.
- Only the original creator can edit the booking. Editing is available while the request is pending, before a driver accepts it, and before the two-minute cutoff. A joined passenger can only leave their own seat.
- If the creator leaves an open-to-share trip after another registered passenger has joined, that passenger's trip is preserved. The released seat can be offered to another compatible student while the booking window remains open. The original creator does not gain control of the remaining passenger's booking.
- If the creator leaves a private booking, the private booking is cancelled. A private booking is never converted into a public ride automatically.
- **Fare allocation:** a solo rider pays the full route fare. When two registered students share one rickshaw, each pays half. A creator who books both seats for a companion pays the full fare, not twice the fare. If one rider leaves, the remaining rider becomes responsible for the full fare.
- The app displays each student's fare responsibility; it does not currently collect or process digital payments.
- Ride mutations are performed transactionally so simultaneous joins, cancellations and acceptances are serialized by the database lock.

## Technology

| Area | Current implementation |
| --- | --- |
| Frontend | React 18, Vite, React Router |
| UI and styling | CSS, Tailwind CSS |
| Backend | Node.js, Express |
| Student and driver authentication | Google Identity ID-token verification |
| Session authentication | JWT |
| Administrator password verification | bcryptjs |
| Ride recommendations and stop ordering | Google Gemini API with deterministic fallbacks |
| Database | Supabase-hosted PostgreSQL via `pg` |
| Record storage | Relational lookup columns plus complete JSONB application records |
| Hosting | Render (frontend static site and backend web service) |

## Repository layout

```text
CUETGo1/
├── public/                     # Static assets
├── src/
│   ├── components/             # Shared UI components
│   ├── context/                # Authentication and feedback contexts
│   ├── pages/                  # Welcome, student, driver and admin screens
│   ├── api.js                  # Frontend API client
│   └── ...
├── server/
│   ├── constants/              # CUET campus locations
│   ├── middleware/             # JWT authentication middleware
│   ├── routes/                 # Auth, ride and admin APIs
│   ├── services/               # Gemini matching and route planning
│   ├── db.js                   # PostgreSQL schema and transaction handling
│   └── index.js                # Express API entry point
├── render.yaml                 # Render Blueprint
├── .env.example                # Frontend environment template
└── README.md
```

## Run locally

### Requirements

- Node.js 18 or newer (use an active LTS release).
- npm.
- A Supabase PostgreSQL database and its connection URI.
- A Google Cloud OAuth 2.0 **Web application** client ID.
- A Gemini API key is optional.

### 1. Clone the project

```bash
git clone https://github.com/FatemaJannatRup/CUETGo1.git
cd CUETGo1
```

### 2. Configure and start the backend

```bash
cd server
npm install
```

Create `server/.env` (use `server/.env.example` as a starting point):

```env
PORT=5000
NODE_ENV=development
DATABASE_URL=your_supabase_postgresql_connection_uri
JWT_SECRET=replace_with_a_long_random_secret
NID_HASH_SECRET=use_a_separate_long_random_secret
GOOGLE_CLIENT_ID=your_google_oauth_web_client_id
ADMIN_EMAIL=your_admin_email
ADMIN_PASSWORD_HASH=your_bcrypt_password_hash
GEMINI_API_KEY=
```

`NID_HASH_SECRET` is optional in the current implementation; if it is omitted, the backend uses `JWT_SECRET` to HMAC-hash NID values. A separate secret is recommended.

Generate the administrator password hash from the `server` directory:

```bash
node --input-type=module -e "import bcrypt from 'bcryptjs'; console.log(await bcrypt.hash('CHANGE_THIS_PASSWORD', 12))"
```

Put the generated hash in `ADMIN_PASSWORD_HASH`. Do not put the plain-text password in the environment file.

Start the API:

```bash
npm run dev
```

The backend normally runs at `http://localhost:5000`. Check `http://localhost:5000/api/health` for the API and database health response.

### 3. Configure and start the frontend

Open a second terminal at the project root:

```bash
npm install
```

Create a root-level `.env` file using `.env.example`:

```env
VITE_GOOGLE_CLIENT_ID=your_google_oauth_web_client_id
VITE_API_URL=http://localhost:5000/api
```

Start Vite:

```bash
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`).

### 4. Configure Google OAuth

In Google Cloud Console, create or select an OAuth 2.0 Client ID with application type **Web application**. Add each frontend origin to **Authorized JavaScript origins**, including:

- `http://localhost:5173` for local development.
- `https://cuetgo-frontend-87ru.onrender.com` for the current live frontend.

Use the same Web Client ID for frontend `VITE_GOOGLE_CLIENT_ID` and backend `GOOGLE_CLIENT_ID`. The backend verifies the Google ID token and checks that the email is verified and belongs to the correct account type. Never expose a Google client secret in frontend code.

## API overview

All API routes are prefixed with `/api`.

| Endpoint | Access | Purpose |
| --- | --- | --- |
| `GET /health` | Public | Check API and PostgreSQL connectivity |
| `POST /auth/google/signup` | Public | Create a student or driver account after Google verification |
| `POST /auth/google/login` | Public | Sign in an existing Google-linked account |
| `GET /auth/me` | Authenticated | Restore the current student or driver session |
| `PUT /auth/profile` | Authenticated | Update allowed profile fields |
| `GET /rides/routes` | Public | Return configured campus locations and halls |
| `GET /rides/open` | Student | List joinable campus rides |
| `POST /rides/request` | Student | Create a ride request |
| `POST /rides/:id/join` | Student | Join an open-to-share ride with one seat |
| `PATCH /rides/:id` | Student | Edit the creator's eligible pending booking |
| `POST /rides/:id/cancel` | Student | Cancel the creator's place or leave the passenger's own seat |
| `GET /rides/mine` | Student | List the student's rides |
| `GET /rides/pending` | Approved driver | List compatible pending ride groups |
| `POST /rides/optimize` | Approved driver | Suggest a shared-trip stop order |
| `POST /rides/accept` | Approved driver | Accept a ride or compatible group |
| `POST /rides/:id/driver-cancel` | Approved driver | Cancel a driver's accepted ride |
| `POST /rides/:id/status` | Approved driver | Update arrival or in-progress status |
| `POST /rides/:id/complete` | Approved driver | Complete a trip |
| `GET /rides/mine-driver` | Approved driver | List the driver's assigned rides |
| `POST /admin/login` | Public, rate-limited | Administrator sign-in |
| `GET /admin/me` | Admin | Validate administrator session |
| `GET /admin/overview` | Admin | Dashboard counts |
| `GET /admin/drivers` | Admin | List/filter driver applications |
| `PATCH /admin/drivers/:id/status` | Admin | Approve, reject or reset driver status |
| `GET /admin/students` | Admin | List student accounts |
| `GET /admin/rides` | Admin | List ride records |
| `PATCH /admin/rides/:id/cancel` | Admin | Cancel an eligible trip |

Authenticated requests use `Authorization: Bearer <token>`. Student, driver and administrator routes enforce their respective roles; ride-management endpoints additionally require driver approval.

## Database

The backend connects to Supabase PostgreSQL using `DATABASE_URL`. On startup, it creates the following tables if they do not exist and ensures the current lookup columns and indexes are present:

- `cuetgo_students` — student records.
- `cuetgo_drivers` — driver records and verification status.
- `cuetgo_rides` — ride records, route, fare, seats, status and timestamps.

Each table stores the full application record in a `data JSONB` column and also maintains relational columns used for lookup and filtering. The application reads and writes PostgreSQL records; it does not use a local JSON-file database.

All application mutations run in a PostgreSQL transaction protected by a transaction-scoped advisory lock. If a mutation fails, the transaction is rolled back. This helps prevent concurrent ride operations from overwriting one another.

To inspect records, open the Supabase project and go to **Table Editor**, then select a `cuetgo_*` table. Treat student contact details and driver identity information as private data.

## Deploy on Render

The repository includes a `render.yaml` Blueprint defining:

- `cuetgo-backend`: Node/Express web service rooted at `server`.
- `cuetgo-frontend`: Vite-built static site served by Render.

To deploy:

1. Push the repository to GitHub.
2. In Render, create or update the Blueprint using this repository.
3. Configure the backend environment variables: `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD_HASH`. `JWT_SECRET` is generated by the Blueprint. Set a separate `NID_HASH_SECRET` if desired, and add `GEMINI_API_KEY` only if Gemini features are required.
4. Configure frontend `VITE_GOOGLE_CLIENT_ID`. The Blueprint wires `VITE_API_URL` to the backend service URL.
5. Add the deployed frontend origin to the Google OAuth client's authorized JavaScript origins.
6. Deploy both services and verify the backend `/api/health` endpoint.

Keep credentials and secrets in Render environment settings, not in source code or Git.

## Security, privacy and operational notes

- Student registration requires a verified CUET student Google address. Driver registration requires a verified Gmail account and administrator approval.
- Driver NID is HMAC-hashed by the backend; the UI receives only the last four digits. Configure a strong, separate `NID_HASH_SECRET` and protect database backups and access.
- The administrator login uses bcrypt password verification and has an in-memory limit of five failed attempts per IP within a 15-minute window. This limiter resets when the backend process restarts and is not a substitute for a distributed rate limiter.
- JWT signing, Google OAuth, database credentials and Gemini API keys must remain server-side.
- The current Render Blueprint sets demo flags off. The current database initialization also removes legacy records explicitly marked as temporary demo records; do not rely on demo accounts or sample data.
- The project has not been independently security-audited or fully load-tested. Test the complete student, driver and administrator workflows in a controlled environment before relying on the service for real rides.
- Gemini is optional. Matching and stop-order suggestions have deterministic fallbacks when the API key is absent or the service fails.
- Stop ordering is a campus stop-sequencing suggestion, not live navigation, distance estimation or traffic-aware routing.

## Contributing

1. Create a feature branch from `main`.
2. Make focused changes and run the relevant checks locally.
3. Open a pull request describing the behavior change and how it was tested.
4. Never include credentials, real NID values, private contact details or other real user data in commits or issue reports.
