# Deploying the Trading Journal

Two separate deploys, wired together:

- **Backend** (`trading-journal-cms`, this repo) → [Railway](https://railway.app) — a real
  server host, needed because Strapi keeps a SQLite database file and (locally)
  uploaded photos on disk. Vercel's serverless functions have no persistent
  filesystem, so Strapi can't live there.
- **Frontend** (`trading-journal-app`) → [Vercel](https://vercel.com) — plain
  Next.js, deploys there without any special setup.
- **Photos in production** → [Cloudinary](https://cloudinary.com) (free tier),
  configured as the Strapi upload provider so photos survive redeploys without
  needing a second persistent volume.

Both GitHub repos already exist and are pushed:
- https://github.com/manalkiyani/trading-journal-cms
- https://github.com/manalkiyani/trading-journal-app

---

## 1. Cloudinary (photo storage)

1. Sign up free at https://cloudinary.com/users/register/free.
2. On your Cloudinary dashboard, copy: **Cloud name**, **API Key**, **API Secret**.
   Keep this tab open — you'll paste these into Railway in step 2.

## 2. Railway (backend)

1. Go to https://railway.app → **New Project** → **Deploy from GitHub repo** →
   select `trading-journal-cms`.
2. Once the service is created, open its **Variables** tab and add:

   ```
   HOST=0.0.0.0
   DATABASE_CLIENT=sqlite
   DATABASE_FILENAME=data/data.db

   CLOUDINARY_NAME=<from Cloudinary dashboard>
   CLOUDINARY_KEY=<from Cloudinary dashboard>
   CLOUDINARY_SECRET=<from Cloudinary dashboard>
   ```

   Then generate fresh production secrets (don't reuse your local `.env` —
   keep local and production secrets separate). Run this once on your Mac and
   paste each value in:

   ```bash
   node -e "for (const k of ['APP_KEYS_1','APP_KEYS_2','APP_KEYS_3','APP_KEYS_4','API_TOKEN_SALT','ADMIN_JWT_SECRET','TRANSFER_TOKEN_SALT','JWT_SECRET','ENCRYPTION_KEY']) console.log(k+'='+require('crypto').randomBytes(24).toString('base64'))"
   ```

   Combine the four `APP_KEYS_*` values into one comma-separated `APP_KEYS`
   variable, and add the rest (`API_TOKEN_SALT`, `ADMIN_JWT_SECRET`,
   `TRANSFER_TOKEN_SALT`, `JWT_SECRET`, `ENCRYPTION_KEY`) as-is.

   Leave `PORT` unset — Railway injects it automatically and Strapi already
   reads `process.env.PORT`.

3. Add a **persistent volume**: service settings → **Volumes** → **New Volume**
   → mount path `/app/data`. This is what makes `data/data.db` (your SQLite
   database) survive redeploys.
4. Deploy. Watch the build logs — the first build recompiles the native
   `better-sqlite3` module for Linux, which is normal and can take a minute.
5. Once live, open `https://<your-railway-domain>/admin` and create your
   Strapi admin account (this is just the CMS dashboard login — the journal
   app itself still needs no login).
6. Copy the Railway-assigned domain (Settings → Networking → Public
   Networking) — you'll need it in the next steps.

## 3. Vercel (frontend)

1. Go to https://vercel.com/new → import `trading-journal-app`.
2. Framework preset should auto-detect Next.js. Before deploying, add an
   environment variable:

   ```
   NEXT_PUBLIC_STRAPI_URL=https://<your-railway-domain>
   ```
3. Deploy. Vercel gives you a `https://<something>.vercel.app` URL.

## 4. Let the frontend talk to the backend (CORS)

Back in Railway, add one more variable to the Strapi service:

```
EXTRA_CORS_ORIGINS=https://<your-vercel-domain>
```

Railway restarts the service automatically — no code change or redeploy
needed, since `config/middlewares.js` reads this env var at boot.

## 5. Bring your existing local data over

Your local SQLite database and local photos are untouched by all of the
above — production starts empty. To copy everything over (journals, trades,
notes, and every photo) run, **with your local Strapi still running**:

```bash
cd trading-journal-cms
node scripts/migrate-to-production.js https://<your-railway-domain>
```

It prints a running log and a summary at the end. Verify the trade/section
counts match your local instance in the Strapi admin panel before you start
relying on production day-to-day. Safe to leave local running as a backup —
nothing here deletes or modifies local data.

## Ongoing deploys

Both Railway and Vercel auto-deploy on every `git push` to `main` for their
respective repo. No manual redeploy step needed for future changes.
