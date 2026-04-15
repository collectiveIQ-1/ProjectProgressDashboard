# ✅ Complete Step-by-Step Guide — Running the Progress Dashboard

---

## WHAT YOU NEED BEFORE STARTING

- A **Windows or Mac computer**
- An internet connection
- The 4 files you downloaded:
  - `server.js`
  - `package.json`
  - `.env`
  - `index.html`

---

---

# PART 1 — INSTALL THE REQUIRED SOFTWARE

---

## STEP 1 — Install Node.js

Node.js is the software that runs your server.

**Windows:**
1. Open your browser and go to: **https://nodejs.org**
2. Click the big green button that says **"LTS"** (recommended)
3. Download the `.msi` file (e.g. `node-v20.x.x-x64.msi`)
4. Open the downloaded file and click **Next → Next → Next → Install**
5. When it finishes, click **Finish**

**Mac:**
1. Open your browser and go to: **https://nodejs.org**
2. Click the big green button that says **"LTS"**
3. Download the `.pkg` file
4. Open the downloaded file and follow the installer steps
5. Click **Continue → Continue → Install → Close**

### ✅ Verify Node.js installed correctly

**Windows:** Press the **Windows key**, type `cmd`, press Enter. A black window opens.

**Mac:** Press **Command + Space**, type `terminal`, press Enter. A window opens.

Type this and press Enter:
```
node --version
```

You should see something like: `v20.11.0`

If you see that number — Node.js is installed correctly. ✅

---

## STEP 2 — Verify npm is installed

In the same terminal/command prompt, type:
```
npm --version
```

You should see something like: `10.2.4`

npm comes with Node.js automatically, so this should work. ✅

---

---

# PART 2 — SET UP YOUR PROJECT FOLDER

---

## STEP 3 — Create the project folder

**Windows:**
1. Go to your **Desktop** (or any folder you prefer)
2. Right-click on an empty area
3. Click **New → Folder**
4. Name it: `progress-dashboard`
5. Open the folder
6. Inside it, create another folder called: `public`

Your folder structure should look like:
```
progress-dashboard/          ← main folder
└── public/                  ← empty folder inside it
```

**Mac:**
1. Open **Finder**
2. Go to your **Desktop** (or Documents)
3. Right-click → **New Folder** → name it `progress-dashboard`
4. Open that folder
5. Right-click inside → **New Folder** → name it `public`

---

## STEP 4 — Copy the files into the correct locations

Take the files you downloaded and copy them like this:

```
progress-dashboard/
├── server.js          ← copy here  (in the main folder)
├── package.json       ← copy here  (in the main folder)
├── .env               ← copy here  (in the main folder)
└── public/
    └── index.html     ← copy here  (INSIDE the public folder)
```

⚠️ **Important:**
- `server.js`, `package.json`, `.env` go in the **main** `progress-dashboard` folder
- `index.html` goes **inside** the `public` folder
- The `.env` file starts with a dot — on Mac it may be hidden. That is normal.

---

## STEP 5 — Open the terminal INSIDE your project folder

This is very important — the terminal must be pointing to the `progress-dashboard` folder.

**Windows:**
1. Open the `progress-dashboard` folder in File Explorer
2. Click on the **address bar** at the top (it shows the folder path)
3. Type `cmd` and press **Enter**
4. A black Command Prompt window opens — it is already inside your folder ✅

**Mac:**
1. Open **System Preferences → Privacy & Security → Full Disk Access** (only needed first time)
   OR simply:
2. Open the `progress-dashboard` folder in Finder
3. Right-click on the folder (not inside it, but on the folder itself)
4. Hold the **Option** key → click **"Open Terminal at Folder"**

   If that option isn't there:
   - Open **Terminal** (Command+Space → type Terminal)
   - Type: `cd ~/Desktop/progress-dashboard` and press Enter

---

---

# PART 3 — INSTALL PROJECT DEPENDENCIES

---

## STEP 6 — Run npm install

In the terminal (which is inside your `progress-dashboard` folder), type:

```
npm install
```

Press **Enter**.

You will see lots of text scrolling — this is normal. It is downloading the required packages (express, pg, dotenv, cors). This takes about 30–60 seconds.

When it finishes, you will see something like:
```
added 87 packages in 15s
```

A new folder called `node_modules` will appear inside `progress-dashboard`. That is correct — do not delete it.

---

---

# PART 4 — ALLOW YOUR COMPUTER TO CONNECT TO AWS DATABASE

---

## STEP 7 — Open port 5432 in AWS Security Group

The AWS database needs to allow your computer (or your server) to connect.

1. Go to **https://console.aws.amazon.com**
2. Sign in to your AWS account
3. In the search bar at the top, type **RDS** and click it
4. Click **Databases** in the left menu
5. Click on your database name (`era-dashboard-prod`)
6. Scroll down and find the **"VPC security groups"** section
7. Click on the security group link (it looks like `sg-xxxxxxxx`)
8. Click the **"Inbound rules"** tab
9. Click **"Edit inbound rules"**
10. Click **"Add rule"**
11. Set:
    - **Type:** PostgreSQL
    - **Port:** 5432
    - **Source:** My IP (this adds your current IP automatically)
      — OR choose **Anywhere (0.0.0.0/0)** if you want to allow any IP
12. Click **"Save rules"**

⚠️ If you skip this step, you will get a **connection timeout error** when starting the server.

---

## STEP 8 — Create the database (if it does not exist yet)

The database `project_progress_dashboard` needs to exist on the AWS RDS server before you can connect.

**Option A — Using pgAdmin (easiest, no coding needed):**

1. Download pgAdmin from: **https://www.pgadmin.org/download/**
2. Install and open it
3. Right-click **Servers → Register → Server**
4. Fill in the **General** tab:
   - Name: `AWS RDS`
5. Click the **Connection** tab and fill in:
   - Host: `era-dashboard-prod.ci7ack2wi0t3.us-east-1.rds.amazonaws.com`
   - Port: `5432`
   - Database: `postgres`
   - Username: `ppd_admin`
   - Password: `strongPassword!`
6. Click **Save**
7. Once connected, right-click on **Databases → Create → Database**
8. Name it: `project_progress_dashboard`
9. Click **Save**

**Option B — Using psql command line:**

If you have psql installed, run:
```
psql -h era-dashboard-prod.ci7ack2wi0t3.us-east-1.rds.amazonaws.com -U ppd_admin -p 5432 -d postgres
```
Then type:
```sql
CREATE DATABASE project_progress_dashboard;
\q
```

✅ Once the database exists, the server will create all the tables automatically.

---

---

# PART 5 — START THE SERVER

---

## STEP 9 — Run the server

In your terminal (still inside the `progress-dashboard` folder), type:

```
node server.js
```

Press **Enter**.

### ✅ If everything works, you will see:
```
✅  Connected to PostgreSQL — project_progress_dashboard @ era-dashboard-prod...
✅  Tables ready — progress, meeting_updates, milestones
🚀  Server running  →  http://localhost:3000
📊  Open dashboard  →  http://localhost:3000
```

**Keep this terminal window open while using the dashboard. Do NOT close it.**

---

## STEP 10 — Open the dashboard

Open your web browser (Chrome, Firefox, Edge — any browser).

Type in the address bar:
```
http://localhost:3000
```

Press **Enter**.

The dashboard will load. 🎉

⚠️ **Always use `http://localhost:3000`**
⚠️ **Never** open `index.html` by double-clicking it from your file explorer — it will not work

---

---

# PART 6 — USING THE DASHBOARD

---

## STEP 11 — First time: Upload your Excel file

1. The dashboard opens on the **Import File** page
2. Click **"Choose File"** and select your progress Excel file (`.xlsx`)
3. The dashboard loads all your projects
4. Data is automatically saved to the AWS PostgreSQL database
5. The console shows: `✅ Synced to PostgreSQL`

## STEP 12 — Every time after that: Auto loads from database

When you open `http://localhost:3000` again:
- A blue banner shows **"✓ Loaded X projects from database"**
- No need to upload Excel again
- All your Meeting Updates and Milestones are already there

---

---

# STOPPING AND RESTARTING

---

## To STOP the server:
In the terminal, press **Ctrl + C**

## To RESTART the server:
In the terminal (inside the `progress-dashboard` folder), type:
```
node server.js
```

---

---

# TROUBLESHOOTING

---

| Problem | What it means | How to fix |
|---------|--------------|------------|
| `node: command not found` | Node.js not installed | Redo Step 1 |
| `npm: command not found` | npm not found | Redo Step 1, restart computer |
| `Cannot find module 'pg'` | npm install not done | Run `npm install` again |
| `connect ETIMEDOUT` | AWS port 5432 is blocked | Redo Step 7, add your IP to security group |
| `password authentication failed` | Wrong password in .env | Check the .env file password |
| `database does not exist` | DB not created yet | Redo Step 8 |
| `EADDRINUSE: port 3000` | Port 3000 already in use | Change `PORT=3001` in .env file, then open `http://localhost:3001` |
| Blank screen / upload page | First time — no data yet | Upload your Excel file (Step 11) |
| `Cannot open index.html` | You double-clicked the file | Always use `http://localhost:3000` instead |

---

---

# QUICK REFERENCE — All commands

```bash
# Step 1: Go into your project folder (Windows)
cd Desktop\progress-dashboard

# Step 1: Go into your project folder (Mac)
cd ~/Desktop/progress-dashboard

# Step 2: Install packages (only needed ONCE)
npm install

# Step 3: Start the server (do this every time)
node server.js

# Step 4: Open dashboard in browser
# → http://localhost:3000

# To stop the server:
# Press Ctrl + C
```

---

## FILE CHECKLIST — Before running, confirm these exist:

- [ ] `progress-dashboard/server.js`
- [ ] `progress-dashboard/package.json`
- [ ] `progress-dashboard/.env`  (has your AWS credentials inside)
- [ ] `progress-dashboard/public/index.html`
- [ ] `progress-dashboard/node_modules/`  (created after `npm install`)
