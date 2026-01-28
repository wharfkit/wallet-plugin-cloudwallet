import {v4 as uuidv4} from 'uuid'

export interface ConnectionMessage {
    id: string
    type: 'requesting' | 'approved' | 'rejected' | 'error' | 'connected'
    account?: string
    dapp?: string
    error?: string
    token?: string
    keys?: string[]
    isTemp?: boolean
    createData?: any
    avatarUrl?: string
    trustScore?: number
    isProofVerified?: any
}

export interface ConnectionResult {
    success: boolean
    account: string
    keys?: string[]
    isTemp?: boolean
    createData?: any
    token?: string
    avatarUrl?: string
    trustScore?: number
    isProofVerified?: any
    error?: string
}

export class ConnectionHandler {
    /**
     * Generates a connection request message
     * @param dapp Dapp identifier
     * @returns ConnectionMessage object
     */
    public static generateConnectionRequest(dapp: string): ConnectionMessage {
        return {
            id: uuidv4(),
            type: 'requesting',
            dapp,
        }
    }

    /**
     * Validates if a connection message is valid
     * @param message Connection message to validate
     * @returns boolean indicating if the message is valid
     */
    public static isValidConnectionMessage(message: any): message is ConnectionMessage {
        return (
            message &&
            typeof message === 'object' &&
            typeof message.id === 'string' &&
            typeof message.type === 'string' &&
            ['requesting', 'approved', 'rejected', 'error', 'connected'].includes(message.type)
        )
    }

    /**
     * Checks if a connection message matches a specific request ID
     * @param message Connection message to check
     * @param requestId Request ID to match against
     * @returns boolean indicating if the message matches the request ID
     */
    public static isMatchingConnection(message: ConnectionMessage, requestId: string): boolean {
        return message.id === requestId
    }

    /**
     * Processes connection result
     * @param message Connection message
     * @returns ConnectionResult or throws error
     */
    public static processConnectionResult(message: ConnectionMessage): ConnectionResult {
        if (message.type !== 'connected' || !message.account) {
            return {
                success: false,
                account: '',
                error: 'Connection not successful',
            }
        }

        return {
            success: true,
            account: message.account,
            token: message.token,
            keys: message.keys,
            isTemp: message.isTemp,
            createData: message.createData,
            avatarUrl: message.avatarUrl,
            trustScore: message.trustScore,
            isProofVerified: message.isProofVerified,
        }
    }
}
