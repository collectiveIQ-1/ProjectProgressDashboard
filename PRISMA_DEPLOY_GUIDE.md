# Prisma 6 Deployment Guide — Progress Dashboard

## Files Delivered

```
prisma/
  schema.prisma                          ← Prisma 6 schema (3 models)
  migrations/
    migration_lock.toml                  ← Required by Prisma migrate
    20240101000000_init/
      migration.sql                      ← Full DDL for all 3 tables
package.json                             ← Prisma 6 pinned + postinstall
.env                                     ← DATABASE_URL format
```

---

## .env — Fill In Your Credentials

The `.env` uses the Prisma-required `DATABASE_URL` format (not the old
`PG_HOST / PG_USER / ...` format your original used):

```
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DBNAME"
```

The file is pre-filled with your existing RDS credentials. Adjust if
they differ. **Do not commit `.env` to Git.**

---

## Local Verification (Run Before Pushing to GitHub)

```bash
# 1. Install dependencies (postinstall auto-runs "prisma generate")
npm install

# 2. Confirm Prisma CLI version is 6.x
npx prisma --version

# 3. Validate schema syntax (no DB connection needed)
npx prisma validate

# 4. Test DB connectivity and run the migration
#    This creates the tables if they don't exist yet.
#    If the tables already exist from a previous migration, it will be a no-op.
npx prisma migrate deploy

# 5. (Optional) Open Prisma Studio to visually inspect the tables
npx prisma studio
```

> **If the DB already has tables from a manual SQL run**, and you get
> a "migration already applied" error, use this instead of step 4:
> ```bash
> npx prisma migrate resolve --applied 20240101000000_init
> ```
> This tells Prisma the migration was already applied manually.

---

## AWS EC2 Deployment Commands

SSH into your EC2 instance, then:

```bash
# 1. Pull the latest code from GitHub
cd /home/ec2-user/progress-dashboard   # adjust path as needed
git pull origin main

# 2. Install/update dependencies
#    "postinstall" will run "prisma generate" automatically
npm install

# 3. Ensure DATABASE_URL is set in the environment
#    On EC2, you can use a .env file OR export it directly:
export DATABASE_URL="postgresql://ppd_admin:strongPassword!@era-dashboard-prod.ci7ack2wi0t3.us-east-1.rds.amazonaws.com:5432/project_progress_dashboard"

# 4. Run migrations against the RDS database
npx prisma migrate deploy

# 5. Restart the app (adjust to whatever process manager you use)
pm2 restart progress-dashboard
# — or —
pm2 start server.js --name progress-dashboard   # first-time start
```

### EC2 → RDS Checklist

Before running `prisma migrate deploy` on EC2, confirm:

| Item | Check |
|---|---|
| EC2 Security Group allows outbound port 5432 | ✅ |
| RDS Security Group allows inbound port 5432 from EC2's Security Group (or private IP) | ✅ |
| `DATABASE_URL` in `.env` or exported in shell | ✅ |
| Node.js 18+ installed on EC2 | ✅ |

---

## How `prisma migrate deploy` Works vs. `migrate dev`

| Command | Use When |
|---|---|
| `npx prisma migrate deploy` | **Production / EC2** — applies pending migrations, never prompts |
| `npx prisma migrate dev` | **Local dev only** — creates new migrations interactively |

Always use `migrate deploy` on EC2.

---

## Re-generating Prisma Client After Schema Changes

If you ever update `schema.prisma`:

```bash
# Local — create a new migration and regenerate client
npx prisma migrate dev --name describe_your_change

# EC2 — apply the new migration
git pull && npm install && npx prisma migrate deploy
```

---

## Notes on `server.js` DATABASE_URL Usage

Your original `server.js` likely uses `PG_HOST`, `PG_USER`, etc. If it
still connects via the raw `pg` module with those env vars, those will
keep working alongside Prisma — they are independent. The `@prisma/client`
only reads `DATABASE_URL`.

If you want to consolidate, you can parse `DATABASE_URL` in `server.js`
or simply keep both formats in `.env`.
