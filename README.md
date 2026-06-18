# 🚀 Jobsschart Backend

<div align="center">

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-5.x-000000?style=for-the-badge&logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=for-the-badge&logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-5.x-2D3748?style=for-the-badge&logo=prisma&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-Optional-DC382D?style=for-the-badge&logo=redis&logoColor=white)
![Stripe](https://img.shields.io/badge/Stripe-Payments-635BFF?style=for-the-badge&logo=stripe&logoColor=white)

A production-ready REST API backend for the Jobsschart consultation platform — supporting real-time calls, credit billing, donations, webshop, blog, and AI-powered features.

</div>


## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (ESM) |
| Framework | Express 5 |
| ORM | Prisma 5 + `@prisma/adapter-pg` |
| Database | PostgreSQL 16 |
| Cache | Redis (optional) |
| Auth | JWT + Passport (Google OAuth) |
| Payments | Stripe |
| Email | Nodemailer (SMTP) / SendGrid |
| File Storage | Cloudinary |
| AI | OpenAI |
| PDF | Puppeteer / html-pdf-node |
| Validation | Zod |
| Testing | Vitest + Supertest |
| Process Manager | PM2 |
| Package Manager | pnpm |

---

## 📁 Project Structure

```
jobsschart-backend/
├── prisma/
│   └── schema.prisma          # Database schema
├── src/
│   ├── bootstrap.js           # App entry point
│   ├── app.js                 # Express app setup
│   ├── routes.js              # Root router
│   ├── server.js              # HTTP server
│   ├── config/                # App configuration
│   ├── features/              # Feature modules (controllers, routes, services)
│   │   ├── auth/
│   │   ├── user/
│   │   ├── consultant/
│   │   ├── schedule/
│   │   ├── package/
│   │   ├── payment/
│   │   ├── order/
│   │   ├── product/
│   │   ├── productCategory/
│   │   ├── donation/
│   │   ├── adcampaign/
│   │   ├── blog/
│   │   ├── review/
│   │   └── ...
│   ├── shared/
│   │   ├── globals/
│   │   │   └── helpers/       # Auth middleware, guards
│   │   └── services/          # Email, mail transport
│   ├── generated/             # Prisma client (auto-generated)
│   ├── seeds/                 # Database seeders
│   ├── upload/                # Multer upload config
│   ├── utils/                 # Utility helpers
│   └── temp/                  # Temporary files (gitignored)
├── .env                       # Environment variables (never commit)
├── .env.dev                   # Dev env template
├── package.json
└── README.md
```

---

## ✅ Prerequisites

Ensure the following are installed before you begin:

| Tool | Version | Install |
|---|---|---|
| Node.js | ≥ 18.x | [nodejs.org](https://nodejs.org) |
| pnpm | ≥ 10.x | `npm install -g pnpm` |
| PostgreSQL | ≥ 14 | [postgresql.org](https://www.postgresql.org) |
| Redis | Any (optional) | [redis.io](https://redis.io) |
| Chromium | For PDF generation | `sudo apt install chromium-browser` |

---

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/your-org/jobsschart-backend.git
cd jobsschart-backend
```

### 2. Install dependencies

```bash
pnpm install
```

> `postinstall` automatically runs `prisma generate` after install.

### 3. Configure environment variables

```bash
cp .env.dev .env
```

Open `.env` and fill in your values. See the [Environment Variables](#-environment-variables) section for details.

### 4. Set up the database

```bash
# Run all pending migrations
pnpm prisma:deploy

# (Optional) Seed default admin and packages
pnpm seeds:admin
pnpm seeds:package
```

### 5. Start the development server

```bash
pnpm dev
```

The API will be available at `http://localhost:5000`.

---

## 🔐 Environment Variables

Create a `.env` file in the project root. Below is a full reference:

```env
# ============================================
# APP CONFIGURATION
# ============================================
NODE_ENV=development
PORT=5000
API_URL=http://localhost:5000
BACKEND_URL=http://localhost:5000
FRONTEND_URL=http://localhost:5173
CLIENT_URLS=http://localhost:5173,https://your-production-domain.com

# ============================================
# DATABASE
# ============================================
DATABASE_URL=postgres://USER:PASSWORD@HOST:PORT/DATABASE

# ============================================
# JWT AUTHENTICATION
# ============================================
JWT_TOKEN=your_jwt_secret_here
JWT_REFRESH_TOKEN=your_refresh_secret_here

# ============================================
# REDIS (Optional — for caching/session)
# ============================================
REDIS_URL=redis://localhost:6379

# ============================================
# CLOUDINARY (File & image uploads)
# ============================================
CLOUD_NAME=your_cloud_name
CLOUD_API_KEY=your_cloud_api_key
CLOUD_API_SECRET=your_cloud_api_secret

# ============================================
# EMAIL — SMTP
# ============================================
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM=noreply@yourdomain.com

# EMAIL — SendGrid (alternative)
SENDGRID_API_KEY=your_sendgrid_api_key
SENDGRID_SENDER=your_verified_email@example.com

# ============================================
# STRIPE PAYMENT
# ============================================
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# ============================================
# ADMIN SEED CREDENTIALS
# ============================================
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=your_admin_password

# ============================================
# OPENAI (AI features)
# ============================================
OPENAI_API_KEY=sk-proj-...

# ============================================
# GOOGLE OAUTH
# ============================================
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:5000/api/v1/auth/google/callback

# ============================================
# PUPPETEER / CHROMIUM (PDF generation)
# ============================================
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
CHROME_BIN=/usr/bin/chromium-browser
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
```

> ⚠️ **Never commit your `.env` file.** It is already listed in `.gitignore`.

---

## 🗄 Database Setup

This project uses **Prisma** as the ORM against a **PostgreSQL** database.

```bash
# Generate Prisma client (runs automatically on install)
pnpm prisma:generate

# Create and apply migrations (development)
pnpm prisma:migrate

# Apply existing migrations (production / CI)
pnpm prisma:deploy

# Open Prisma Studio (visual DB browser)
pnpm prisma:studio
```

---

## ▶️ Running the App

### Development (with hot-reload)

```bash
pnpm dev
```

### Production (standard Node)

```bash
pnpm start
```

### Production (PM2 process manager)

```bash
pnpm start:pm2   # Start with PM2
pnpm stop        # Stop PM2 process
pnpm delete      # Remove PM2 process and flush logs
```

---

## 📜 Available Scripts

| Script | Description |
|---|---|
| `pnpm dev` | Start dev server with nodemon (hot-reload) |
| `pnpm start` | Start production server |
| `pnpm start:pm2` | Start with PM2 in production |
| `pnpm build` | Generate Prisma client |
| `pnpm prisma:generate` | Regenerate Prisma client |
| `pnpm prisma:migrate` | Create and run new migration (dev) |
| `pnpm prisma:deploy` | Apply pending migrations (prod) |
| `pnpm prisma:studio` | Open Prisma Studio UI |
| `pnpm seeds:admin` | Seed default admin user |
| `pnpm seeds:package` | Seed credit packages |
| `pnpm test` | Run test suite (Vitest) |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm test:coverage` | Run tests with coverage report |
| `pnpm lint` | Lint with ESLint |
| `pnpm lint:fix` | Auto-fix lint issues |
| `pnpm format` | Format code with Prettier |

---

## 📡 API Overview

All endpoints are prefixed with `/api/v1`.

| Module | Base Path | Description |
|---|---|---|
| Auth | `/api/v1/auth` | Register, login, OTP, Google OAuth, token refresh |
| Users | `/api/v1/users` | Profile management, admin user control |
| Consultants | `/api/v1/consultants` | Profiles, availability, reviews, earnings |
| Schedules | `/api/v1/schedules` | Booking and appointment management |
| Calls | `/api/v1/calls` | Live call initiation, billing, history |
| Packages | `/api/v1/packages` | Credit package listing and management |
| Payments | `/api/v1/payments` | Stripe checkout, webhooks, history |
| Wallet | `/api/v1/wallet` | Balance, credit transactions |
| Products | `/api/v1/products` | Webshop product catalog |
| Orders | `/api/v1/orders` | Order placement and tracking |
| Donations | `/api/v1/donations` | Donor registration and donation history |
| Ad Campaigns | `/api/v1/ad-campaigns` | Ad creation, status, impressions |
| Blog | `/api/v1/blogs` | Blog CRUD, categories, publishing |
| Posts | `/api/v1/posts` | Community posts, comments, likes |
| Notifications | `/api/v1/notifications` | Fetch and mark notifications |
| Conversations | `/api/v1/conversations` | Messaging threads and analytics |
| Reviews | `/api/v1/reviews` | Consultant reviews |
| FAQs | `/api/v1/faqs` | FAQ management |

> 📮 A full Postman collection (`Jobsschart-API_postman_collection.json`) is included in the repository root. Import it into Postman to explore and test all endpoints.

---

## 🚢 Deployment

### Checklist

- [ ] Set `NODE_ENV=production` in `.env`
- [ ] Use strong, randomly generated secrets for `JWT_TOKEN` and `JWT_REFRESH_TOKEN`
- [ ] Configure Stripe **live** keys and webhook secrets
- [ ] Run `pnpm prisma:deploy` to apply all migrations
- [ ] Run seeders: `pnpm seeds:admin && pnpm seeds:package`
- [ ] Set `CLIENT_URLS` to your production frontend domain(s)
- [ ] Configure Chromium path for PDF generation if using Puppeteer
- [ ] Start with PM2: `pnpm start:pm2`

### CORS

Allowed origins are controlled by the `CLIENT_URLS` environment variable (comma-separated). Update this for each environment.

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Commit your changes: `git commit -m "feat: add your feature"`
4. Push to the branch: `git push origin feature/your-feature-name`
5. Open a Pull Request

Please ensure all linting passes (`pnpm lint`) and tests pass (`pnpm test`) before submitting a PR.

---

## 📄 License

This project is proprietary. All rights reserved.

---

<div align="center">
Built with  by the Ibrahim Sikder
</div>