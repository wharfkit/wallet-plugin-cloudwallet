import {Amplify} from 'aws-amplify'
import {generateClient} from 'aws-amplify/api'
import {events} from 'aws-amplify/data'
import {GraphQLResult} from '@aws-amplify/api'
import {TransactionHandler, TransactionMessage} from './transaction'

const publish2channel = /* GraphQL */ `
    mutation Publish2channel($data: AWSJSON!, $name: String!) {
        publish2channel(data: $data, name: $name) {
            data
            name
            __typename
        }
    }
`

export interface SyncHandlerConfig {
    graphQLRelayEndpoint: string
    graphQLRelayRegion: string
    eventRelayEndpoint: string
    eventRelayRegion: string
    account?: string
    token?: string
    svc?: string
}

export class SyncHandlerConfig {
    constructor(config: SyncHandlerConfig) {
        Amplify.configure({
            API: {
                GraphQL: {
                    endpoint: config.graphQLRelayEndpoint,
                    region: config.graphQLRelayRegion,
                    defaultAuthMode: 'lambda',
                },
                Events: {
                    endpoint: config.eventRelayEndpoint,
                    region: config.eventRelayRegion,
                    defaultAuthMode: 'lambda',
                },
            },
        })
    }
}

export abstract class GraphQLSyncHandler {
    private client = generateClient()

    public async publishToChannel(
        channelName: string,
        data: any,
        authHeaders: string
    ): Promise<void> {
        await this.client.graphql<GraphQLResult<any>>({
            query: publish2channel,
            variables: {
                name: channelName,
                data: JSON.stringify(data),
            },
            authToken: authHeaders,
        })
    }

    public async subscribeToChannel<T>(
        channelName: string,
        messageHandler: (message: T) => void,
        errorHandler: (error: any) => void,
        authHeaders: string,
        timeoutMs = 180000 // 3 minutes default timeout
    ): Promise<{unsubscribe: () => void}> {
        // Use the Event API for subscriptions if you want real-time pub/sub
        // Otherwise, use GraphQL subscriptions as before (if your backend supports it)
        try {
            const channel = await events.connect(channelName)
            const subscription = channel.subscribe({
                next: (data: any) => {
                    this.handleMessage(data, messageHandler, errorHandler)
                },
                error: (error: any) => {
                    errorHandler(error)
                },
            })

            // Set up timeout
            const timeoutId = setTimeout(() => {
                subscription.unsubscribe()
                errorHandler(new Error('Subscription timeout after ' + timeoutMs + 'ms'))
            }, timeoutMs)

            return {
                unsubscribe: () => {
                    clearTimeout(timeoutId)
                    subscription.unsubscribe()
                },
            }
        } catch (error) {
            errorHandler(error)
            return {
                unsubscribe: () => {
                    // Empty cleanup function for error case
                },
            }
        }
    }

    protected abstract handleMessage<T>(
        rawMessage: any,
        messageHandler: (message: T) => void,
        errorHandler: (error: any) => void
    ): void
}

export class TransactionSyncHandler extends GraphQLSyncHandler {
    static parseAuthHeaders(account: string, token: string, svc: string): string {
        // Ensure token is properly parsed if it's a string
        if (typeof token === 'string') {
            try {
                // If token is a JSON string, parse it
                if (token.startsWith('{')) {
                    token = JSON.parse(token)
                }
            } catch (e) {
                console.warn('Failed to parse token:', e)
            }
        }

        return JSON.stringify({
            account,
            token,
            svc,
            mode: 'dapp',
        })
    }

    protected handleMessage<T>(
        rawMessage: any,
        messageHandler: (message: T) => void,
        errorHandler: (error: any) => void
    ): void {
        if (TransactionHandler.isValidTransactionMessage(rawMessage)) {
            messageHandler(rawMessage as T)
            return
        }
        errorHandler(new Error('Invalid transaction message received'))
    }

    public generateChannelName(origin: string, account?: string): string {
        return `transact:${origin}:${account || ''}`
    }

    public generateTransactionMessage(
        actions: any[],
        namedParams: any,
        origin: string
    ): TransactionMessage {
        return TransactionHandler.generateTransactionMessage(actions, namedParams, origin)
    }

    public processTransactionResult(message: TransactionMessage): {signatures: string[]} {
        if (message.type !== 'approved') {
            throw new Error('Transaction not approved')
        }
        return {
            signatures: TransactionHandler.processTransactionResult(message.result),
        }
    }
}
