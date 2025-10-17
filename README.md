# PDF Tools - SnapIT Software

Professional PDF processing tools with Stripe integration.

## Features

- **PDF Split** - Extract specific pages or page ranges
- **PDF Merge** - Combine multiple PDFs into one
- **PDF Convert** - Convert PDFs to Word, Excel, PowerPoint (coming soon)
- **PDF Compress** - Reduce file size (coming soon)

## Architecture

### Frontend
- Client-side PDF processing using pdf-lib.js
- Google OAuth authentication
- Stripe checkout integration
- Deployed to S3 + CloudFront

### Backend
- AWS Lambda functions (Node.js 16)
- DynamoDB for subscriptions and usage tracking
- API Gateway REST endpoints
- Stripe webhooks for subscription management

## Deployment

### Prerequisites
```bash
npm install -g serverless
aws configure  # Set up AWS credentials
```

### Required AWS SSM Parameters
Store these secrets in AWS Systems Manager Parameter Store:

```bash
aws ssm put-parameter \
  --name "/pdf-tools/stripe-secret-key" \
  --value "sk_test_YOUR_KEY" \
  --type "SecureString"

aws ssm put-parameter \
  --name "/pdf-tools/stripe-webhook-secret" \
  --value "whsec_YOUR_SECRET" \
  --type "SecureString"
```

### Deploy Backend
```bash
cd backend
npm install
cd ..
serverless deploy
```

### Deploy Frontend
```bash
aws s3 sync frontend/ s3://pdf.snapitsoftware.com --delete
aws cloudfront create-invalidation --distribution-id EPKB54QCT67X4 --paths "/*"
```

## API Endpoints

After deployment, serverless will output your API Gateway endpoints:

- `GET /users/{userId}/subscription` - Check user's plan and limits
- `POST /users/{userId}/usage` - Track usage and enforce limits
- `POST /webhooks/stripe` - Handle Stripe subscription events

## Environment Variables

Set these in serverless.yml:

- `SUBSCRIPTIONS_TABLE` - DynamoDB table for subscriptions
- `USAGE_TABLE` - DynamoDB table for usage tracking
- `STRIPE_SECRET_KEY` - From SSM Parameter Store
- `STRIPE_WEBHOOK_SECRET` - From SSM Parameter Store

## Subscription Plans

- **Free**: 3 files/day, 25MB max, Split & Merge only
- **Pro ($9/mo)**: 100 files/day, 100MB max, All features
- **Enterprise ($49/mo)**: Unlimited files, 500MB max, API access

## Local Development

```bash
# Start local API server
serverless offline

# Test endpoints locally
curl http://localhost:3010/users/test-user-123/subscription
```

## Testing

```bash
# Test Stripe webhook locally
stripe listen --forward-to http://localhost:3010/webhooks/stripe
stripe trigger customer.subscription.created
```

## Production URLs

- Frontend: https://pdf.snapitsoftware.com
- CloudFront ID: EPKB54QCT67X4
- S3 Bucket: pdf.snapitsoftware.com

## Support

For issues, contact SnapIT Software support.
