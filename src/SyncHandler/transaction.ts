import { v4 as uuidv4 } from 'uuid';

export interface TransactionMessage {
    id: string
    type: 'requesting' | 'approved' | 'rejected' | 'error' | 'ready' | 'not-ready'
    actions?: any
    namedParams?: any
    dapp?: string
    result?: any
}

export class TransactionHandler {
    /**
     * Generates a unique transaction message
     * @param actions Array of transaction actions
     * @param namedParams Named parameters for the transaction
     * @param origin Origin of the dapp
     * @returns TransactionMessage object
     */
    public static generateTransactionMessage(
        actions: any[],
        namedParams: any,
        origin: string
    ): TransactionMessage {
        return {
            id: uuidv4(),
            type: 'requesting',
            actions,
            namedParams,
            dapp: origin,
        };
    }

    /**
     * Validates if a transaction message is valid
     * @param message Transaction message to validate
     * @returns boolean indicating if the message is valid
     */
    public static isValidTransactionMessage(message: any): message is TransactionMessage {
        return (
            message &&
            typeof message === 'object' &&
            typeof message.id === 'string' &&
            typeof message.type === 'string' &&
            ['requesting', 'approved', 'rejected', 'error', 'ready', 'not-ready'].includes(message.type)
        );
    }

    /**
     * Checks if a transaction message matches a specific transaction ID
     * @param message Transaction message to check
     * @param transactionId Transaction ID to match against
     * @returns boolean indicating if the message matches the transaction ID
     */
    public static isMatchingTransaction(message: TransactionMessage, transactionId: string): boolean {
        return message.id === transactionId;
    }

    /**
     * Processes transaction result and extracts signatures
     * @param result Transaction result object
     * @returns Array of decoded signatures
     */
    public static processTransactionResult(result: any): string[] {
        if (!result?.signatures) {
            return [];
        }

        return result.signatures.map((sig: string) => {
            try {
                // Check if the signature is base64 encoded
                if (/^[A-Za-z0-9+/=]+$/.test(sig)) {
                    return atob(sig);
                }
                return sig;
            } catch (e) {
                console.warn('Failed to decode signature:', e);
                return sig;
            }
        });
    }
} 