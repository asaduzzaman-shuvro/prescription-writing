# cPanel-এ আপলোড

`dist` আর `rxpad-cpanel.zip` তৈরি হওয়ার পর এই ধাপগুলো। ডোমেইনের বানান যেমন আছে তেমনই: `prescpetion-api` (মাঝখানে r নেই)।

দুটো জায়গা আলাদা:

- **Windows PowerShell** — এই পিসি। এখানে বিল্ড হয়।
- **cPanel Terminal** — সার্ভার। প্রম্পট দেখতে এমন: `[sakuraph@atrai-bd-cp7 ~]$`

PowerShell-এ সার্ভারের কমান্ড চালাবেন না। `psql` আর `unzip` শুধু cPanel টার্মিনালে।

## 1. পিসিতে dist আর জিপ বানানো

প্রজেক্ট ফোল্ডারে PowerShell:

```powershell
cd "C:\Users\USER\Desktop\Sakura doctor app\prescription-writing"
pnpm --filter web build
node scripts/pack-cpanel.mjs
```

হয়ে গেলে এই দুটো পাবেন:

- `dist\` — অ্যাপের ফাইল (`index.js`, `apps`, `node_modules`)
- `rxpad-cpanel.zip` — একই ফাইল, জিপের ভিতরে অতিরিক্ত ফোল্ডার নেই

`dist` ফোল্ডারটা নিজে জিপ করবেন না। করলে সার্ভারে আরেকটা `dist` ফোল্ডার ঢুকে অ্যাপ চলবে না। আপলোড করতে হবে `rxpad-cpanel.zip`।

## 2. জিপ আপলোড

1. cPanel → **File Manager**
2. `/home/sakuraph` খুলুন (`public_html` নয়, অ্যাপের ফোল্ডারের ভিতরও নয়)
3. `rxpad-cpanel.zip` আপলোড করুন। আগের জিপ থাকলে তার ওপর লিখে দিন।

## 3. সার্ভারে খোলা

**cPanel Terminal** খুলে এই দুই লাইন পেস্ট করুন:

```bash
cd /home/sakuraph
unzip -o rxpad-cpanel.zip -d prescpetion-api.sakurapharmabd.com
```

`inflating:` অনেক লাইন আসবে। শেষে প্রম্পট ফিরে এলে ঠিক আছে।

এক নজরে দেখে নিন:

```bash
cd /home/sakuraph/prescpetion-api.sakurapharmabd.com
ls index.js apps/web/server.js apps/web/.env.production
```

তিনটা ফাইলের নাম দেখা গেলে আনজিপ ঠিক হয়েছে।

স্কিমার SQL (`cpanel-schema.sql`) আবার চালাবেন না। টেবিল আগেই তৈরি।

এই রিলিজে নতুন কলাম আছে (`doctor_profile.sakura_phone` / `sakura_password`)। অ্যাপ রিস্টার্টের **আগে** cPanel Postgres-এ একবার চালান (phpPgAdmin / psql):

```sql
ALTER TABLE "doctor_profile" ADD COLUMN IF NOT EXISTS "sakura_phone" text;
ALTER TABLE "doctor_profile" ADD COLUMN IF NOT EXISTS "sakura_password" text;
```

অথবা এই পিসি থেকে টানেল খুলে: `pnpm db:migrate:cpanel -- --host 127.0.0.1 --port 5433`

**Run NPM Install** চাপবেন না। `node_modules` জিপের ভিতরেই আছে।

## 4. অ্যাপ রিস্টার্ট

cPanel → **Setup Node.js App** → এই অ্যাপ → **Restart**।

সেটিংস আগের মতোই থাকবে:

- Application root: `prescpetion-api.sakurapharmabd.com`
- Application startup file: `index.js`
- Mode: Production

## 5. সাইট খোলা

ব্রাউজারে খুলুন: `https://prescpetion-api.sakurapharmabd.com/login`

ঢুকুন:

- ইমেইল: `doctor@rx.local`
- পাসওয়ার্ড: `doctor123`

পুরনো পেজ আটকে থাকলে ট্যাব বন্ধ করে আবার খুলুন। ড্যাশবোর্ড খুললে সিঙ্ক ব্যাজে **Synced** দেখাবে। ডাটা এখন অ্যাপের নিজের সিঙ্ক দিয়ে আসে (`/api/sync/pull`)। আলাদা PowerSync সার্ভার লাগে না।

## সমস্যা হলে

cPanel টার্মিনালে:

```bash
tail -n 80 /home/sakuraph/prescpetion-api.sakurapharmabd.com/stderr.log
```

লগের শেষ ৮০ লাইন পাঠালে বোঝা যাবে অ্যাপ কেন ওঠেনি।
