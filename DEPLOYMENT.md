# Vercel Deployment Guide

Complete stappenplan voor het deployen van de Peppol E-invoicing Converter op Vercel.

## Vereisten

- GitHub account (of GitLab/Bitbucket)
- Vercel account (gratis op [vercel.com](https://vercel.com))
- PostgreSQL database (bijv. Supabase, Railway, Neon, of Vercel Postgres)
- Mollie account voor payments
- SMTP service voor email (bijv. SendGrid, Mailgun, of Gmail App Password)

## Stap 1: Code naar GitHub pushen

1. **Zorg dat je code op GitHub staat:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/jouw-username/peppol-converter.git
   git push -u origin main
   ```

## Stap 2: Vercel Project Aanmaken

1. **Ga naar [vercel.com](https://vercel.com) en log in**
2. **Klik op "Add New Project"**
3. **Import je GitHub repository**
4. **Configureer het project:**
   - **Framework Preset:** Next.js (wordt automatisch gedetecteerd)
   - **Root Directory:** `./` (laat leeg)
   - **Build Command:** `npm run build` (standaard)
   - **Output Directory:** `.next` (standaard)
   - **Install Command:** `npm install` (standaard)

## Stap 3: Environment Variables Configureren

Voeg de volgende environment variables toe in Vercel (Settings → Environment Variables):

### Database (VERPLICHT)
```
DATABASE_URL=postgresql://user:password@host:5432/database?schema=public
```
**Tip:** Gebruik Supabase (gratis tier beschikbaar) of Vercel Postgres.

### NextAuth (VERPLICHT)
```
NEXTAUTH_URL=https://jouw-project.vercel.app
NEXTAUTH_SECRET=genereer-met-openssl-rand-base64-32
```

**NEXTAUTH_SECRET genereren:**
```bash
openssl rand -base64 32
```

### SMTP Email (VERPLICHT voor login)
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=your-email@gmail.com
```

**Voor Gmail:**
- Gebruik een [App Password](https://support.google.com/accounts/answer/185833) (niet je gewone wachtwoord)
- 2-factor authenticatie moet ingeschakeld zijn

**Alternatieven:**
- **SendGrid:** `SMTP_HOST=smtp.sendgrid.net`, `SMTP_USER=apikey`, `SMTP_PASSWORD=your-sendgrid-api-key`
- **Mailgun:** `SMTP_HOST=smtp.mailgun.org`, gebruik je Mailgun credentials

### Mollie Payments (VERPLICHT)
```
MOLLIE_API_KEY=live_your_mollie_api_key_here
```

**Voor productie:**
- Gebruik een **live** API key van [Mollie Dashboard](https://www.mollie.com/dashboard)
- Voor testen: gebruik `test_` prefix

### AI (Optioneel maar aanbevolen)
```
GEMINI_API_KEY=your-gemini-api-key
```
**Of:**
```
OPENAI_API_KEY=your-openai-api-key
```

**GEMINI_API_KEY (gratis):**
- Ga naar [Google AI Studio](https://aistudio.google.com/app/apikey)
- Maak een gratis API key aan
- Gemini heeft een gratis tier beschikbaar

## Stap 4: Database Setup

### Optie A: Supabase (Aanbevolen - Gratis tier)

1. **Maak account op [supabase.com](https://supabase.com)**
2. **Maak een nieuw project**
3. **Ga naar Settings → Database**
4. **Kopieer de connection string:**
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
   ```
5. **Voeg toe als DATABASE_URL in Vercel**

### Optie B: Vercel Postgres

1. **In Vercel dashboard, ga naar Storage tab**
2. **Klik "Create Database" → "Postgres"**
3. **Vercel voegt automatisch DATABASE_URL toe**

### Database Migraties Uitvoeren

Na het deployen, voer database migraties uit:

**Optie 1: Via Vercel CLI (lokaal)**
```bash
npm install -g vercel
vercel login
vercel env pull .env.local
npx prisma migrate deploy
```

**Optie 2: Via Vercel Build Command (automatisch)**

Voeg toe aan `package.json`:
```json
"scripts": {
  "postinstall": "prisma generate",
  "build": "prisma migrate deploy && next build"
}
```

**Optie 3: Via Vercel Dashboard (Build & Development Settings)**

Voeg toe aan "Build Command":
```
prisma migrate deploy && npm run build
```

## Stap 5: Mollie Webhook Configureren

1. **Ga naar [Mollie Dashboard](https://www.mollie.com/dashboard)**
2. **Ga naar Developers → Webhooks**
3. **Voeg webhook URL toe:**
   ```
   https://jouw-project.vercel.app/api/payments/webhook
   ```
4. **Selecteer events:**
   - `payment.paid`
   - `payment.failed`
   - `payment.canceled`

## Stap 6: Deploy

1. **Klik "Deploy" in Vercel**
2. **Wacht tot build compleet is**
3. **Check build logs voor errors**

## Stap 7: Post-Deployment Checklist

- [ ] Database migraties uitgevoerd (`npx prisma migrate deploy`)
- [ ] Environment variables correct geconfigureerd
- [ ] NEXTAUTH_URL wijst naar productie URL
- [ ] Mollie webhook URL geconfigureerd
- [ ] Test een conversie upload
- [ ] Test login flow (magic link email)
- [ ] Test payment flow
- [ ] Check Vercel logs voor errors

## Troubleshooting

### Build Fails: Prisma Client Not Generated

**Oplossing:** Voeg `postinstall` script toe aan `package.json`:
```json
"scripts": {
  "postinstall": "prisma generate"
}
```

### Database Connection Errors

- Controleer DATABASE_URL in Vercel environment variables
- Zorg dat database publiek toegankelijk is (niet alleen localhost)
- Check firewall settings van je database provider

### Email Not Working

- Voor Gmail: gebruik App Password, niet je gewone wachtwoord
- Check SMTP credentials in Vercel environment variables
- Test SMTP settings lokaal eerst

### NextAuth Errors

- Zorg dat NEXTAUTH_URL exact overeenkomt met je Vercel URL
- Check NEXTAUTH_SECRET is gegenereerd en correct ingesteld
- Zorg dat DATABASE_URL correct is (NextAuth gebruikt Prisma adapter)

### Mollie Webhook Errors

- Check webhook URL in Mollie dashboard
- Zorg dat webhook URL publiek toegankelijk is
- Check Vercel logs voor webhook errors

## Vercel Build Settings

### Aanbevolen Build Command
```
prisma generate && prisma migrate deploy && next build
```

### Aanbevolen Install Command
```
npm install
```

### Node.js Version
Vercel gebruikt automatisch Node.js 18.x of 20.x. Je kunt dit forceren in `package.json`:
```json
"engines": {
  "node": ">=18.0.0"
}
```

## Custom Domain (Optioneel)

1. **Ga naar Vercel Project Settings → Domains**
2. **Voeg je custom domain toe**
3. **Volg DNS instructies**
4. **Update NEXTAUTH_URL naar je custom domain**

## Monitoring

- **Vercel Analytics:** Automatisch beschikbaar in Vercel dashboard
- **Logs:** Bekijk real-time logs in Vercel dashboard
- **Errors:** Check "Functions" tab voor API route errors

## Kosten

**Vercel Hobby Plan (Gratis):**
- Unlimited deployments
- 100GB bandwidth/maand
- Serverless functions
- Perfect voor MVP

**Database:**
- Supabase: Gratis tier (500MB database, 2GB bandwidth)
- Vercel Postgres: Betaalt per gebruik

**Mollie:**
- Geen setup kosten
- Alleen transactiekosten (€0.25 + percentage per transactie)

## Support

- **Vercel Docs:** [vercel.com/docs](https://vercel.com/docs)
- **Prisma Docs:** [prisma.io/docs](https://www.prisma.io/docs)
- **Next.js Docs:** [nextjs.org/docs](https://nextjs.org/docs)

