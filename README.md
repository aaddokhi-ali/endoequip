# EndoEquip Supply — v1 Skeleton

Fresh, simplified rebuild. Four roles, two hubs, verification-free auth,
admin-managed departments/clinics/users. No service-account key required.

This step delivers: the skeleton, clean auth, a self-disabling first-admin
setup, and a full admin panel. The hubs (Order Hub, Ready Hub) come next.

---

## The model (what to know)

- **Roles:** clinic · store · sterilization · admin.
- **clinic** users belong to one clinic (which belongs to one department).
- **store / sterilization / admin** are HOSPITAL-WIDE — they serve every
  department, and carry no clinic/department.
- **Departments** have a short **code** (e.g. `ENDO`). **Clinics** are created
  with their **real room number** (e.g. `258`) and displayed as `ENDO258`.
  Clinic numbers are globally unique across the whole facility.
- Departments, clinics, and users are all created by the admin in-app —
  nothing is hardcoded or seeded.
- **Catalogue is per-department-ready:** every catalogue item carries a
  departmentId. Only Endodontics is populated for now; adding another
  department later needs no code change.

---

## Setup — do these in order

### 1. Install
```bash
npm install
```

### 2. Environment
```bash
cp .env.local.example .env.local   # (PowerShell: Copy-Item .env.local.example .env.local)
```
Fill `.env.local` with your Firebase web config (public keys).

### 3. Enable Email/Password auth
Firebase console → Authentication → Sign-in method → **Email/Password → Enable**.
(Without this, setup fails with `auth/operation-not-allowed`.)

### 4. Publish Firestore rules
Copy `firestore.rules` into Firebase console → Firestore → Rules → **Publish**.

### 5. Run
```bash
npm run dev
```

### 6. Create the first admin (one time)
Go to **http://localhost:3000/setup**. The form is pre-filled. Click
**Create admin & initialize**. This creates only the admin account, then
locks itself. (Visiting `/setup` again shows "already complete".)

### 7. Sign in and build your org
Go to `/login`, sign in as the admin. On the **Admin** page:
1. Create a **department** (name + code, e.g. Endodontics / `ENDO`).
2. Create **clinics** under it by real room number (e.g. `258` → `ENDO258`).
3. Create **users** — pick a role; for clinic users, pick their clinic.
   Store/sterilization/admin are hospital-wide (no clinic).

Every account created this way gets a matching `users/{uid}` profile doc, so
the old login-bounce can't happen. Test it: create a sterilization user, sign
out, sign in as them → lands on the Sterilization dashboard cleanly.

---

## If a login fails, the error tells you why
- **"Wrong email or password"** → credential issue.
- **"Your account exists but has no profile yet"** → auth account without a
  `users/{uid}` doc (shouldn't happen via the admin panel; would only occur if
  an account was made directly in the console). Replaces the old silent bounce.
- **"Couldn't sign in (auth/…)"** → raw Firebase code shown for diagnosis.

---

## Notes
- **No email verification** anywhere (v1 decision).
- **No service-account key needed** — user creation happens in-app via an
  isolated secondary Firebase session, so creating a user won't sign the admin
  out, and the org policy blocking key creation is irrelevant.
- `next.config.ts` pins `turbopack.root` so a stray parent-folder lockfile
  can't confuse the build again.
- Theme: emerald `#10b981` on navy `#0a1428`, glassmorphism, Playfair display.

---

## Next step
Load the reviewed Endodontics catalogue into `catalogueItems`, then build the
**Order Hub** (clinic add → admin live sum → Close & Send → store + PDF).
