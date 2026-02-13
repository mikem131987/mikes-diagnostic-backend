# Mike's Diagnostic Hardware - Backend API

Professional subscription and licensing backend for Mike's Diagnostic Hardware application.

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup Environment Variables
```bash
cp .env.example .env
```

Edit `.env` with your Stripe keys:
- Get keys from https://dashboard.stripe.com/api keys
- Set `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY`

### 3. Run Server
```bash
npm run dev
```

Server will start on `http://localhost:3001`

## API Endpoints

### Health Check
```
GET /api/health
```

### Subscription Tiers
```
GET /api/tiers
```
Returns all available subscription tiers with pricing and features.

### Create Checkout Session
```
POST /api/subscriptions/create-session

Body:
{
  "email": "user@example.com",
  "tier": "professional",
  "returnUrl": "http://localhost:3000"
}

Response:
{
  "sessionId": "cs_...",
  "url": "https://checkout.stripe.com/pay/..."
}
```

### Validate License Key
```
POST /api/licenses/validate

Body:
{
  "licenseKey": "MK-XXXX-XXXX-XXXX-XXXX"
}

Response:
{
  "valid": true,
  "tier": "professional",
  "status": "active",
  "email": "user@example.com",
  "features": {
    "basicDiagnostics": true,
    "advancedDiagnostics": true,
    ...
  }
}
```

### Get Subscription Details
```
GET /api/subscriptions/:subscriptionId

Response:
{
  "subscriptionId": "sub_...",
  "tier": "professional",
  "status": "active",
  "licenseKey": "MK-XXXX-XXXX-XXXX-XXXX",
  "createdAt": "2024-02-12T..."
}
```

### Get Subscription by Email
```
GET /api/subscription/:email

Response:
{
  "customerId": "cus_...",
  "subscriptionId": "sub_...",
  "licenseKey": "MK-XXXX-XXXX-XXXX-XXXX",
  "tier": "professional",
  "email": "user@example.com",
  "status": "active",
  "createdAt": "2024-02-12T..."
}
```

### Stripe Webhook
```
POST /api/subscriptions/webhook

Handles:
- customer.subscription.created
- customer.subscription.updated
- customer.subscription.deleted
- invoice.payment_failed
```

## Stripe Setup

### 1. Create Stripe Account
- Go to https://stripe.com
- Create free account
- Go to Dashboard → API keys
- Copy Secret Key and Publishable Key

### 2. Create Products & Prices
In Stripe Dashboard:

1. Navigate to Products
2. Create 3 Products:
   - "Starter" ($29/month, recurring)
   - "Professional" ($79/month, recurring)
   - "Enterprise" ($199/month, recurring)
3. Copy price IDs to `.env`:
   ```
   STRIPE_STARTER_PRICE=price_xxx
   STRIPE_PROFESSIONAL_PRICE=price_xxx
   STRIPE_ENTERPRISE_PRICE=price_xxx
   ```

### 3. Setup Webhook
1. Go to Developers → Webhooks
2. Click "Add endpoint"
3. URL: `https://your-api.com/api/subscriptions/webhook`
4. Events to send:
   - customer.subscription.created
   - customer.subscription.updated
   - customer.subscription.deleted
   - invoice.payment_failed
5. Copy Signing Secret to `STRIPE_WEBHOOK_SECRET`

## License Key System

License keys are auto-generated when subscription is created:
- Format: `MK-XXXX-XXXX-XXXX-XXXX`
- Unique per subscription
- Never expires (subscription status determines validity)
- Tied to customer email

## Feature Gating by Tier

### Starter
- ✓ Basic diagnostics
- ✗ Advanced features
- Email: support@

### Professional
- ✓ Basic + Advanced diagnostics
- ✓ Real-time logging
- ✓ Custom reports
- ✓ Mobile app
- Email: priority support

### Enterprise
- ✓ Everything
- ✓ API access
- ✓ Multi-user (10 licenses)
- ✓ Dedicated support

## Development

### Build
```bash
npm run build
```

### Start Production
```bash
npm start
```

### Test Endpoint
```bash
curl http://localhost:3001/api/health
```

## Database (Future)

Currently using in-memory storage. For production, setup PostgreSQL:

```bash
# Create database
createdb mikes_diagnostic

# Set DATABASE_URL in .env
DATABASE_URL=postgresql://user:password@localhost:5432/mikes_diagnostic
```

## Troubleshooting

### Stripe Key Errors
- Verify keys in `.env`
- Keys should start with `sk_test_` or `pk_test_`
- Check Stripe account is active

### Webhook Issues
- Make sure webhook URL is public (ngrok for local dev)
- Verify signing secret is correct
- Check Stripe webhook logs

### License Validation Fails
- Ensure subscription status is "active"
- Check email matches
- Verify Stripe webhook fired

## Production Deployment

### Using Heroku
```bash
# Create app
heroku create mikes-diagnostic-api

# Set env vars
heroku config:set STRIPE_SECRET_KEY=sk_live_...
heroku config:set STRIPE_WEBHOOK_SECRET=whsec_...

# Deploy
git push heroku main
```

### Environment
```
NODE_ENV=production
PORT=3001
STRIPE_SECRET_KEY=sk_live_... (use live keys!)
API_URL=https://your-production-url.com
```

## Support

For issues or questions:
- Email: support@mikesdiagnostic.com
- GitHub Issues: [link to repo]
