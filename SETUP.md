# Setup Instructies

## Quick Start

1. **Installeer dependencies:**
   ```bash
   npm install
   ```

2. **Configureer environment variabelen:**
   ```bash
   cp .env.example .env
   # Bewerk .env met je eigen waarden
   ```

3. **Setup database:**
   ```bash
   # Zorg dat PostgreSQL draait en DATABASE_URL correct is
   npx prisma generate
   npx prisma migrate dev --name init
   ```

4. **Start development server:**
   ```bash
   npm run dev
   ```

## Vereiste Environment Variables

### Database
```env
DATABASE_URL="postgresql://user:password@localhost:5432/peppol_converter?schema=public"
```

### NextAuth
```env
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate-met-openssl-rand-base64-32"
```

### Email (voor magic link login)
```env
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="your-email@gmail.com"
SMTP_PASSWORD="your-app-password"
SMTP_FROM="your-email@gmail.com"
```

### Mollie Payments
```env
MOLLIE_API_KEY="test_your_mollie_api_key_here"
```

Voor test mode gebruik een test API key van Mollie.

### AI (optioneel maar aanbevolen)
```env
GEMINI_API_KEY="your-gemini-api-key"
# OF
OPENAI_API_KEY="your-openai-api-key"
```

## Database Migratie

Na de eerste setup:
```bash
npx prisma migrate dev
```

Voor productie:
```bash
npx prisma migrate deploy
```

## Mollie Webhooks Setup

Voor lokale development met Mollie webhooks:

1. Installeer Mollie CLI:
   ```bash
   npm install -g @mollie/cli
   ```

2. Start webhook forwarding:
   ```bash
   mollie listen --url http://localhost:3000/api/payments/webhook
   ```

3. Configureer webhook URL in Mollie dashboard (voor productie)

## Testing Flow

1. **Anonymous Upload:**
   - Ga naar http://localhost:3000
   - Upload een PDF/XLSX factuur
   - Bekijk preview en validatie resultaten
   - Download vereist login

2. **Login:**
   - Klik op "Download Peppol UBL"
   - Je wordt doorgestuurd naar login pagina
   - Voer email in, ontvang magic link
   - Klik op link in email om in te loggen

3. **Payment:**
   - Na login, probeer te downloaden
   - Je wordt doorgestuurd naar pricing pagina
   - Kies pay-per-use of unlimited plan
   - Voltooi checkout via Mollie
   - Download conversie

## Troubleshooting

### Prisma Client errors
Run `npx prisma generate` om Prisma client te genereren.

### Database connection errors
Controleer DATABASE_URL in .env en zorg dat PostgreSQL draait.

### Email not working
- Voor Gmail: gebruik App Password (niet je gewone wachtwoord)
- Controleer SMTP instellingen in .env

### Mollie webhook errors
- Zorg dat webhook URL correct is geconfigureerd
- Voor lokale testing, gebruik Mollie CLI

## Productie Deployment

1. Setup PostgreSQL database (bijv. Supabase, Railway, of AWS RDS)
2. Configureer environment variables in deployment platform
3. Run database migrations: `npx prisma migrate deploy`
4. Configureer Mollie webhook URL naar productie URL
5. Setup SMTP voor email (bijv. SendGrid, Mailgun, of AWS SES)


