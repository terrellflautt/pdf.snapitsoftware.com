const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

/**
 * Track PDF processing usage
 * POST /users/{userId}/usage
 */
exports.handler = async (event) => {
    console.log('Event:', JSON.stringify(event, null, 2));

    try {
        const userId = event.pathParameters?.userId;
        const body = JSON.parse(event.body || '{}');
        const operation = body.operation; // 'split', 'merge', 'convert', 'compress'
        const fileSize = body.fileSize || 0;

        if (!userId) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'POST,OPTIONS'
                },
                body: JSON.stringify({ error: 'Missing userId parameter' })
            };
        }

        // Check if user has remaining quota
        const today = new Date().toISOString().split('T')[0];

        // Get current usage
        const usageResult = await dynamodb.get({
            TableName: process.env.USAGE_TABLE || 'pdf-tools-usage',
            Key: {
                userId,
                date: today
            }
        }).promise();

        const currentCount = usageResult.Item?.count || 0;

        // Get user's subscription to check limits
        const subResult = await dynamodb.get({
            TableName: process.env.SUBSCRIPTIONS_TABLE || 'pdf-tools-subscriptions',
            Key: { userId }
        }).promise();

        // Determine max files based on plan
        let maxFilesPerDay = 3; // free tier default
        if (subResult.Item) {
            switch (subResult.Item.planTier) {
                case 'pro':
                    maxFilesPerDay = 100;
                    break;
                case 'enterprise':
                    maxFilesPerDay = Infinity;
                    break;
            }
        }

        // Check if user has exceeded quota
        if (currentCount >= maxFilesPerDay) {
            return {
                statusCode: 429, // Too Many Requests
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'POST,OPTIONS'
                },
                body: JSON.stringify({
                    error: 'Daily limit exceeded',
                    limit: maxFilesPerDay,
                    used: currentCount,
                    message: `You've reached your daily limit of ${maxFilesPerDay} files. Upgrade to Pro for 100 files/day!`
                })
            };
        }

        // Increment usage counter
        await dynamodb.update({
            TableName: process.env.USAGE_TABLE || 'pdf-tools-usage',
            Key: {
                userId,
                date: today
            },
            UpdateExpression: 'ADD #count :inc SET #operation = if_not_exists(#operation, :zero) + :inc, #updatedAt = :now',
            ExpressionAttributeNames: {
                '#count': 'count',
                '#operation': operation,
                '#updatedAt': 'updatedAt'
            },
            ExpressionAttributeValues: {
                ':inc': 1,
                ':zero': 0,
                ':now': new Date().toISOString()
            }
        }).promise();

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST,OPTIONS',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                filesProcessedToday: currentCount + 1,
                filesRemainingToday: Math.max(0, maxFilesPerDay - currentCount - 1),
                operation,
                fileSize
            })
        };

    } catch (error) {
        console.error('Error tracking usage:', error);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST,OPTIONS'
            },
            body: JSON.stringify({ error: error.message })
        };
    }
};
