import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Stripe from 'stripe';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-08-16',
});

// Middleware
app.use(cors());
app.use(express.json());

// Types
interface SubscriptionData {
  customerId: string;
  subscriptionId: string;
  licenseKey: string;
  tier: 'starter' | 'professional' | 'enterprise';
  email: string;
  status: 'active' | 'canceled' | 'past_due';
  createdAt: Date;
}

// In-memory storage (replace with database)
const subscriptions = new Map<string, SubscriptionData>();

/**
 * Generate a unique license key
 * Format: MK-XXXX-XXXX-XXXX-XXXX
 */
function generateLicenseKey(): string {
  const prefix = process.env.LICENSE_KEY_PREFIX || 'MK';
  const segments = [];
  for (let i = 0; i < 4; i++) {
    segments.push(Math.random().toString(36).substring(2, 6).toUpperCase());
  }
  return `${prefix}-${segments.join('-')}`;
}

/**
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: "Mike's Diagnostic Hardware API",
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/subscriptions/create-session
 * Create Stripe checkout session for subscription
 */
app.post('/api/subscriptions/create-session', async (req: Request, res: Response) => {
  try {
    const { email, tier, returnUrl } = req.body;

    if (!email || !tier) {
      return res.status(400).json({ error: 'Missing email or tier' });
    }

    // Map tiers to Stripe price IDs
    const priceMap: Record<string, string> = {
      starter: process.env.STRIPE_STARTER_PRICE || 'price_starter',
      professional: process.env.STRIPE_PROFESSIONAL_PRICE || 'price_professional',
      enterprise: process.env.STRIPE_ENTERPRISE_PRICE || 'price_enterprise',
    };

    const priceId = priceMap[tier];
    if (!priceId) {
      return res.status(400).json({ error: 'Invalid tier' });
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${returnUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnUrl}?canceled=true`,
      customer_email: email,
      metadata: {
        tier,
        email,
      },
    });

    res.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error: any) {
    console.error('Stripe error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/subscriptions/webhook
 * Stripe webhook handler
 */
app.post('/api/subscriptions/webhook', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string;

  try {
    const event = stripe.webhooks.constructEvent(
      req.body as any,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET || ''
    );

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customer = await stripe.customers.retrieve(subscription.customer as string);

        const licenseKey = generateLicenseKey();

        subscriptions.set(subscription.id, {
          customerId: subscription.customer as string,
          subscriptionId: subscription.id,
          licenseKey,
          tier: (subscription.metadata?.tier || 'starter') as any,
          email: (customer as any).email || '',
          status: 'active',
          createdAt: new Date(),
        });

        console.log(`✓ Subscription created: ${subscription.id}, License: ${licenseKey}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const data = subscriptions.get(subscription.id);
        if (data) {
          data.status = 'canceled';
        }
        console.log(`✗ Subscription canceled: ${subscription.id}`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const data = subscriptions.get(invoice.subscription as string);
        if (data) {
          data.status = 'past_due';
        }
        console.log(`⚠ Payment failed for subscription: ${invoice.subscription}`);
        break;
      }
    }

    res.json({ received: true });
  } catch (error: any) {
    console.error('Webhook error:', error.message);
    res.status(400).send(`Webhook Error: ${error.message}`);
  }
});

/**
 * GET /api/subscriptions/:subscriptionId
 * Get subscription details (for license validation)
 */
app.get('/api/subscriptions/:subscriptionId', (req: Request, res: Response) => {
  try {
    const { subscriptionId } = req.params;
    const data = subscriptions.get(subscriptionId);

    if (!data) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    res.json({
      subscriptionId: data.subscriptionId,
      tier: data.tier,
      status: data.status,
      licenseKey: data.licenseKey,
      createdAt: data.createdAt,
      isValid: data.status === 'active',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/licenses/validate
 * Validate a license key
 */
app.post('/api/licenses/validate', (req: Request, res: Response) => {
  try {
    const { licenseKey } = req.body;

    if (!licenseKey) {
      return res.status(400).json({ error: 'License key required' });
    }

    // Find subscription by license key
    for (const [, data] of subscriptions) {
      if (data.licenseKey === licenseKey) {
        return res.json({
          valid: data.status === 'active',
          tier: data.tier,
          status: data.status,
          email: data.email,
          features: getTierFeatures(data.tier),
        });
      }
    }

    res.status(404).json({
      valid: false,
      error: 'License key not found'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/tiers
 * Get available subscription tiers
 */
app.get('/api/tiers', (req: Request, res: Response) => {
  res.json({
    tiers: [
      {
        id: 'starter',
        name: 'Starter',
        price: 29,
        description: 'For solo mechanics',
        features: [
          'Basic vehicle diagnostics',
          'Report generation',
          'Email support',
          'Up to 50 vehicles',
        ],
      },
      {
        id: 'professional',
        name: 'Professional',
        price: 79,
        description: 'For small shops',
        features: [
          'Advanced diagnostics',
          'Real-time data logging',
          'Custom reports',
          'Up to 500 vehicles',
          'Priority support',
          'Mobile app access',
        ],
      },
      {
        id: 'enterprise',
        name: 'Enterprise',
        price: 199,
        description: 'For larger shops/fleets',
        features: [
          'Unlimited vehicles',
          'Multi-user licenses (up to 10)',
          'API access',
          'Custom integrations',
          'Dedicated support',
          'Advanced analytics',
        ],
      },
    ],
  });
});

/**
 * Helper: Get features for tier
 */
function getTierFeatures(tier: string): Record<string, boolean> {
  const features: Record<string, Record<string, boolean>> = {
    starter: {
      basicDiagnostics: true,
      advancedDiagnostics: false,
      realTimeLogging: false,
      customReports: false,
      mobileApp: false,
      apiAccess: false,
      multiUser: false,
      dedicatedSupport: false,
    },
    professional: {
      basicDiagnostics: true,
      advancedDiagnostics: true,
      realTimeLogging: true,
      customReports: true,
      mobileApp: true,
      apiAccess: false,
      multiUser: false,
      dedicatedSupport: false,
    },
    enterprise: {
      basicDiagnostics: true,
      advancedDiagnostics: true,
      realTimeLogging: true,
      customReports: true,
      mobileApp: true,
      apiAccess: true,
      multiUser: true,
      dedicatedSupport: true,
    },
  };

  return features[tier] || features.starter;
}

/**
 * GET /api/subscription/:email
 * Get subscription details by email
 */
app.get('/api/subscription/:email', (req: Request, res: Response) => {
  try {
    const { email } = req.params;

    for (const [, data] of subscriptions) {
      if (data.email === email) {
        return res.json(data);
      }
    }

    res.status(404).json({ error: 'No subscription found for this email' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║  Mike's Diagnostic Hardware API                         ║
║  🚀 Server running on http://localhost:${PORT}           ║
║  📝 Stripe integration ready                             ║
║  🔐 License validation endpoint active                   ║
╚════════════════════════════════════════════════════════╝

Endpoints:
  GET    /api/health                    - Health check
  GET    /api/tiers                     - Available tiers
  POST   /api/subscriptions/create-session
  POST   /api/licenses/validate         - Validate license key
  GET    /api/subscriptions/:id         - Get subscription
  GET    /api/subscription/:email       - Get by email
  POST   /api/subscriptions/webhook     - Stripe webhook
  
Environment: ${process.env.NODE_ENV || 'development'}
  `);
});

export default app;
