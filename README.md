# Peppol E-invoicing Converter

MVP voor het converteren van PDF en Excel facturen naar Peppol-compatibele UBL XML met SaaS functionaliteit.

## Features

- **3 Gratis Conversies** - Probeer zonder account
- **Geen Account Nodig** - Upload en bekijk resultaten zonder registratie
- **Account Vereist voor Download** - Download volledige UBL XML na login
- **Pay on Success** - Betaal alleen bij succesvolle conversie
- **Pricing**: €2 per conversie of €20/maand unlimited
- **AI-Powered Extractie** - Gebruik Google Gemini of OpenAI voor betere extractie
- **Automatische Validatie** - Peppol BIS Billing 3.0 validatie
- **Anonymous Quota Tracking** - Cookie-based tracking met 3 gratis conversies

## Installatie

```bash
# Installeer dependencies
npm install

# Kopieer .env.example naar .env en configureer
cp .env.example .env

# Genereer Prisma client
npx prisma generate

# Setup database (PostgreSQL)
# Zorg dat DATABASE_URL correct is in .env
npx prisma migrate dev

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in je browser.

## Environment Variables

Zie `.env.example` voor alle vereiste variabelen:

- `DATABASE_URL` - PostgreSQL connection string
- `NEXTAUTH_URL` - Base URL van je applicatie
- `NEXTAUTH_SECRET` - Secret voor NextAuth (genereer met `openssl rand -base64 32`)
- `SMTP_*` - Email configuratie voor magic link authentication
- `MOLLIE_API_KEY` - Mollie API key voor payments
- `GEMINI_API_KEY` (optioneel) - Google Gemini API key
- `OPENAI_API_KEY` (optioneel) - OpenAI API key

## Database Setup

De applicatie gebruikt PostgreSQL met Prisma ORM. Schema's zijn gedefinieerd in `prisma/schema.prisma`.

**Tabellen:**
- `User` - Gebruikers accounts
- `AnonUsage` - Anonymous quota tracking
- `Conversion` - Conversie resultaten
- `Payment` - Payment records (Mollie)
- `DownloadToken` - Download tokens

Run `npx prisma migrate dev` om de database te initialiseren.

## Authentication

NextAuth wordt gebruikt voor email magic link authentication. Gebruikers kunnen:
- Anoniem uploaden en preview bekijken
- Inloggen via magic link email
- Na login conversies claimen en downloaden

## Payments (Mollie)

De applicatie gebruikt Mollie voor payments:

- **One-off**: €2 per conversie credit
- **Subscription**: €20/maand voor unlimited

Webhooks worden verwerkt via `/api/payments/webhook`. Zorg dat deze URL correct is geconfigureerd in je Mollie dashboard.

**Lokaal testen:**
Gebruik Mollie CLI voor lokale webhook testing:
```bash
mollie listen --url http://localhost:3000/api/payments/webhook
```

## API Endpoints

### POST /api/convert
Upload en converteer een factuur. Anoniem toegankelijk.

**Request:**
- `file`: PDF of XLSX bestand (multipart/form-data)

**Response:**
```json
{
  "conversionId": "...",
  "success": true,
  "validationReport": {...},
  "mappingReport": {...},
  "xmlPreview": "<Invoice>...</Invoice>",
  "canDownloadFull": false,
  "needsLoginToDownload": true,
  "quota": {
    "freeLeft": 2,
    "isLimited": false
  },
  "normalizedInvoice": {...}
}
```

### POST /api/download
Download volledige UBL XML. Vereist authenticatie en quota/payment.

### GET /api/conversions/[id]
Bekijk conversie details (owner-only).

### POST /api/payments/checkout
Start Mollie checkout flow.

### POST /api/payments/webhook
Mollie webhook endpoint.

## Anonymous Quota System

- Gebruikers krijgen 3 gratis succesvolle conversies per anon_id (cookie)
- Cookie is 1 jaar geldig
- Rate limiting: max 10 uploads per dag per IP
- Alleen succesvolle conversies tellen mee voor gratis limiet
- Quota wordt server-side getrackt in `AnonUsage` tabel

## Pricing Model

1. **Gratis**: 3 conversies zonder account
2. **Pay-per-use**: €2 per succesvolle conversie (betaal alleen bij download)
3. **Unlimited**: €20/maand voor onbeperkte conversies

**Belangrijk:**
- Geen account nodig om te uploaden en preview te bekijken
- Account vereist om te downloaden
- Je betaalt alleen bij een succesvolle conversie ("pay on success")

## Development

```bash
# Development server
npm run dev

# Build voor productie
npm run build

# Start productie server
npm start

# Prisma studio (database GUI)
npx prisma studio

# Database migrations
npx prisma migrate dev
```

## Project Structuur

```
├── pages/
│   ├── api/
│   │   ├── convert.ts          # Upload & conversie endpoint
│   │   ├── download.ts          # Download endpoint (auth required)
│   │   ├── conversions/[id].ts  # Get conversion details
│   │   ├── payments/            # Mollie payment endpoints
│   │   └── auth/                # NextAuth endpoints
│   ├── results/[id].tsx         # Results page
│   ├── pricing.tsx              # Pricing page
│   └── index.tsx                # Home page
├── lib/
│   ├── prisma.ts                # Prisma client
│   ├── auth.ts                  # Auth utilities
│   ├── anon-cookie.ts           # Anonymous cookie management
│   └── quota.ts                 # Quota checking logic
├── prisma/
│   └── schema.prisma            # Database schema
├── parser/                      # PDF/XLSX/AI parsing
├── mapping/                     # UBL mapping
├── validation/                  # Validation logic
└── types/                       # TypeScript types
```

## Testing

```bash
# Run tests (indien geconfigureerd)
npm test
```

## Deployment

Voor volledige deployment instructies, zie [DEPLOYMENT.md](./DEPLOYMENT.md).

**Quick Start voor Vercel:**
1. Push code naar GitHub
2. Import project in Vercel
3. Configureer environment variables
4. Setup PostgreSQL database (Supabase aanbevolen)
5. Run database migraties: `npx prisma migrate deploy`
6. Configureer Mollie webhook URL

Zie [DEPLOYMENT.md](./DEPLOYMENT.md) voor gedetailleerde stappen.

## Licentie

MIT
