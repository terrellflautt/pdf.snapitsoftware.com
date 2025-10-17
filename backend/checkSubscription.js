const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

/**
 * Check user's subscription plan and usage limits
 * GET /users/{userId}/subscription
 */
exports.handler = async (event) => {
    console.log('Event:', JSON.stringify(event, null, 2));

    try {
        // Extract userId from path parameters
        const userId = event.pathParameters?.userId;

        if (!userId) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'GET,OPTIONS'
                },
                body: JSON.stringify({ error: 'Missing userId parameter' })
            };
        }

        // Query DynamoDB for user's subscription
        const result = await dynamodb.get({
            TableName: process.env.SUBSCRIPTIONS_TABLE || 'pdf-tools-subscriptions',
            Key: { userId }
        }).promise();

        // Default to free tier if no subscription found
        let subscription = {
            userId,
            planTier: 'free',
            status: 'active',
            maxFilesPerDay: 3,
            maxFileSize: 25 * 1024 * 1024, // 25MB
            features: ['split', 'merge']
        };

        // If subscription exists, use those details
        if (result.Item) {
            const item = result.Item;

            // Determine features based on plan tier
            let maxFilesPerDay, maxFileSize, features;

            switch (item.planTier) {
                case 'pro':
                    maxFilesPerDay = 100;
                    maxFileSize = 100 * 1024 * 1024; // 100MB
                    features = ['split', 'merge', 'convert', 'compress'];
                    break;
                case 'enterprise':
                    maxFilesPerDay = Infinity;
                    maxFileSize = 500 * 1024 * 1024; // 500MB
                    features = ['split', 'merge', 'convert', 'compress', 'api', 'whitelabel'];
                    break;
                default: // free
                    maxFilesPerDay = 3;
                    maxFileSize = 25 * 1024 * 1024;
                    features = ['split', 'merge'];
            }

            subscription = {
                userId: item.userId,
                planTier: item.planTier,
                status: item.status,
                stripeCustomerId: item.stripeCustomerId,
                stripeSubscriptionId: item.stripeSubscriptionId,
                currentPeriodEnd: item.currentPeriodEnd,
                cancelAtPeriodEnd: item.cancelAtPeriodEnd,
                maxFilesPerDay,
                maxFileSize,
                features
            };
        }

        // Get today's usage count
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const usageResult = await dynamodb.get({
            TableName: process.env.USAGE_TABLE || 'pdf-tools-usage',
            Key: {
                userId,
                date: today
            }
        }).promise();

        const filesProcessedToday = usageResult.Item?.count || 0;
        const filesRemainingToday = Math.max(0, subscription.maxFilesPerDay - filesProcessedToday);

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'GET,OPTIONS',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                ...subscription,
                filesProcessedToday,
                filesRemainingToday,
                canProcessMore: filesProcessedToday < subscription.maxFilesPerDay
            })
        };

    } catch (error) {
        console.error('Error checking subscription:', error);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'GET,OPTIONS'
            },
            body: JSON.stringify({ error: error.message })
        };
    }
};
