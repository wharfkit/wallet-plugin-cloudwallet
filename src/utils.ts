import {Action, Transaction} from '@wharfkit/session'

import {Buyrambytes, Transfer} from './types'

export function validateModifications(original: Transaction, modified: Transaction) {
    // Ensure all the original actions exist within the modified transaction
    const originalsExist = original.actions.every((action: Action) =>
        modified.actions.some((modifiedAction: Action) => action.equals(modifiedAction))
    )
    if (!originalsExist) {
        throw new Error('The modified transaction does not contain all the original actions.')
    }

    // Find all new actions added to this transaction
    const newActions = modified.actions.filter((action: Action) => {
        return !original.actions.some((originalAction: Action) => action.equals(originalAction))
    })

    // Iterate and validate each new action
    for (const newAction of newActions) {
        // Determine if a new action has the authorization of the original actor
        const authByUser = newAction.authorization.find((auth: any) => {
            return auth.actor === original.actions[0].authorization[0].actor
        })
        if (authByUser) {
            // Ensure if a transaction fee is being paid by the user, it's going to the correct account
            const isTokenTransfer =
                newAction.account.equals('eosio.token') && newAction.name.equals('transfer')
            if (isTokenTransfer) {
                const data = Transfer.from(newAction.data)
                if (data.to.equals('txfee.wam') && data.memo.startsWith('WAX fee for')) {
                    continue
                }
            }
            // Ensure if a RAM purchase is occurring during a modification, it's going to the user
            const isRAMPurchase =
                newAction.account.equals('eosio') && newAction.name.equals('buyrambytes')
            if (isRAMPurchase) {
                const data = Buyrambytes.from(newAction.data)
                if (data.receiver.equals(original.actions[0].authorization[0].actor)) {
                    continue
                }
            }
            // If not passing the above rules, throw an error
            throw new Error(
                'The modified transaction contains one or more actions that are not allowed.'
            )
        }
    }
}

// Create and return an interval that checks whether or not the window has been closed
export function registerCloseListener(t, popup: Window, reject) {
    const closeListener = setInterval(() => {
        if (popup.closed) {
            clearInterval(closeListener)
            reject(
                t('error.closed', {
                    default: 'The Cloud Wallet was closed before the request was completed',
                })
            )
        }
    }, 500)
    return closeListener
}

// Retrieve current time
export function getCurrentTime() {
    return Math.floor(new Date().getTime())
}

// Ensure the MessageEvent returned from the popup is valid
export function isValidEvent(event: MessageEvent, url: URL, window: Window): boolean {
    const eventOrigin = new URL(event.origin)
    const validOrigin = eventOrigin.origin === url.origin
    const validSource = event.source === window
    const validObject = typeof event.data === 'object'
    if (!validObject || !validOrigin || !validSource) {
        return false
    }
    return true
}
