const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

/**
 * Handle Stripe webhook events
 * POST /webhooks/stripe
 */
exports.handler = async (event) => {
    console.log('Webhook event received:', JSON.stringify(event, null, 2));

    try {
        const stripeEvent = JSON.parse(event.body);

        switch (stripeEvent.type) {
            case 'customer.subscription.created':
                await handleSubscriptionCreated(stripeEvent.data.object);
                break;

            case 'customer.subscription.updated':
                await handleSubscriptionUpdated(stripeEvent.data.object);
                break;

            case 'customer.subscription.deleted':
                await handleSubscriptionDeleted(stripeEvent.data.object);
                break;

            case 'invoice.payment_succeeded':
                await handleInvoicePaymentSucceeded(stripeEvent.data.object);
                break;

            case 'invoice.payment_failed':
                await handleInvoicePaymentFailed(stripeEvent.data.object);
                break;

            default:
                console.log(`Unhandled event type: ${stripeEvent.type}`);
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ received: true })
        };

    } catch (error) {
        console.error('Error processing webhook:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};

async function handleSubscriptionCreated(subscription) {
    const customerId = subscription.customer;
    const subscriptionId = subscription.id;
    const planId = subscription.items.data[0].price.id;

    let planTier = 'free';
    // Map price IDs to plan tiers
    if (planId === 'price_1SJHzFErAqVDOhJZRSJeJIkB') {
        planTier = 'pro';
    } else if (planId === 'price_1SJHzIErAqVDOhJZNfPomuW6') {
        planTier = 'enterprise';
    }

    await dynamodb.put({
        TableName: process.env.SUBSCRIPTIONS_TABLE || 'pdf-tools-subscriptions',
        Item: {
            userId: subscription.metadata.userId || customerId,
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            planTier: planTier,
            status: subscription.status,
            currentPeriodEnd: subscription.current_period_end,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }
    }).promise();

    console.log(`Subscription created for customer ${customerId}: ${planTier}`);
}

async function handleSubscriptionUpdated(subscription) {
    const customerId = subscription.customer;
    const planId = subscription.items.data[0].price.id;

    let planTier = 'free';
    if (planId === 'price_1SJHzFErAqVDOhJZRSJeJIkB') {
        planTier = 'pro';
    } else if (planId === 'price_1SJHzIErAqVDOhJZNfPomuW6') {
        planTier = 'enterprise';
    }

    await dynamodb.update({
        TableName: process.env.SUBSCRIPTIONS_TABLE || 'pdf-tools-subscriptions',
        Key: { userId: subscription.metadata.userId || customerId },
        UpdateExpression: 'SET planTier = :tier, #status = :status, currentPeriodEnd = :periodEnd, cancelAtPeriodEnd = :cancelAt, updatedAt = :updated',
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: {
            ':tier': planTier,
            ':status': subscription.status,
            ':periodEnd': subscription.current_period_end,
            ':cancelAt': subscription.cancel_at_period_end,
            ':updated': new Date().toISOString()
        }
    }).promise();

    console.log(`Subscription updated for customer ${customerId}: ${planTier} (${subscription.status})`);
}

async function handleSubscriptionDeleted(subscription) {
    const customerId = subscription.customer;

    await dynamodb.update({
        TableName: process.env.SUBSCRIPTIONS_TABLE || 'pdf-tools-subscriptions',
        Key: { userId: subscription.metadata.userId || customerId },
        UpdateExpression: 'SET planTier = :tier, #status = :status, updatedAt = :updated',
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: {
            ':tier': 'free',
            ':status': 'canceled',
            ':updated': new Date().toISOString()
        }
    }).promise();

    console.log(`Subscription deleted for customer ${customerId}`);
}

async function handleInvoicePaymentSucceeded(invoice) {
    console.log(`Payment succeeded for customer ${invoice.customer}, subscription ${invoice.subscription}`);
}

async function handleInvoicePaymentFailed(invoice) {
    console.log(`Payment failed for customer ${invoice.customer}, subscription ${invoice.subscription}`);
}
