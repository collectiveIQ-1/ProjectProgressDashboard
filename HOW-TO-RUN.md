# 🚀 How to Run the Progress Dashboard

## What's New in This Version
- **Login page** — sign in with email + password from the credentials table
- **Role-based access** — Admins can do everything; Members get view-only mode
- **Credentials table** — all 11 users are auto-seeded on first startup

---

## Prerequisites

| Tool | Version | How to check |
|------|---------|--------------|
| Node.js | 18 or higher | `node -v` |
| npm | bundled with Node | `npm -v` |
| PostgreSQL (AWS RDS or local) | 13+ | — |

---

## Step 1 — Install dependencies

```bash
cd progress-dashboard
npm install
```

---

## Step 2 — Create your `.env` file

Create a file called `.env` in the `progress-dashboard` folder with your database credentials:

```env
PG_HOST=your-rds-endpoint.rds.amazonaws.com
PG_PORT=5432
PG_DATABASE=your_database_name
PG_USER=your_db_user
PG_PASSWORD=your_db_password

PORT=3000
```

> **AWS RDS tip:** Make sure your RDS security group allows inbound traffic on port 5432 from your IP address.

---

## Step 3 — Start the server

```bash
node server.js
```

You should see:

```
✅  Connected to PostgreSQL — your_db @ your-rds-endpoint
✅  Credentials table ready and seeded
✅  Tables ready — credentials, progress, meeting_updates, milestones
🚀  Server running  →  http://localhost:3000
```

---

## Step 4 — Open the app

Open your browser and go to:

```
http://localhost:3000
```

You will be redirected to the **login page** automatically.

---

## Step 5 — Sign in

Use any of the credentials from the table below:

### Admin accounts (full access — can import Excel, edit, delete everything)

| Username | Password |
|----------|----------|
| sruhunage@collectivercm.com | Shashani123@Admin |
| amilab@botmedfusion.com | Amila123@Admin |
| nranasinghe@collectivercm.com | Nirman123@Admin |

### Member accounts (view-only — can browse all data, cannot edit)

| Username | Password |
|----------|----------|
| bherath@collectivercm.com | Bimsara123@ |
| dfernando@collectivercm.com | Dilmi123@ |
| palwis@collectivercm.com | Piyum123@ |
| vihangam@botmedfusion.com | Vihanga123@ |
| aranasinghe@collectivercm.com | Amandi123@ |
| CVithanage@collectivercm.com | Chamath123@ |
| imalshar@botmedfusion.com | Imalsha123@ |
| shanka@collectivercm.com | Shanka123@ |

---

## Role Differences

| Feature | Admin | Member |
|---------|-------|--------|
| View all dashboards & charts | ✅ | ✅ |
| View meeting updates & milestones | ✅ | ✅ |
| Import Excel (progress data) | ✅ | ❌ |
| Import meeting updates Excel | ✅ | ❌ |
| Add / edit / delete meeting updates | ✅ | ❌ |
| Add / edit / delete milestones | ✅ | ❌ |
| Change milestone status | ✅ | ❌ |

Members see a yellow **"View-only mode"** banner at the top of the dashboard, and all edit/add/delete buttons are hidden automatically.

---

## Development mode (auto-restart on file changes)

```bash
npm run dev
```

This uses `nodemon` which is included as a dev dependency.

---

## Troubleshooting

**"Failed to connect to PostgreSQL"**
- Double-check your `.env` values
- Make sure your RDS instance is running
- Check that your IP is whitelisted in the RDS security group

**"Cannot reach server" when uploading Excel**
- Make sure you opened the app via `http://localhost:3000` and not by opening the HTML file directly

**Login says "Invalid username or password"**
- Credentials are case-sensitive — use the exact email addresses above
- If you changed passwords directly in the database, use those new passwords

---

## File Structure

```
progress-dashboard/
├── server.js          ← Express backend + all API routes + role middleware
├── package.json
├── .env               ← Your DB credentials (create this yourself)
├── prisma/
│   └── schema.prisma
└── public/
    ├── index.html     ← Main dashboard (role-aware UI)
    └── login.html     ← Login page
```
