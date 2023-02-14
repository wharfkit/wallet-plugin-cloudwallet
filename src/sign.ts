import {ResolvedSigningRequest} from '@wharfkit/session'

import {storage} from '.'
import {WAXCloudWalletSigningResponse} from './types'
import {getCurrentTime, isValidEvent, registerCloseListener} from './utils'

export async function allowAutosign(request: ResolvedSigningRequest): Promise<boolean> {
    try {
        const data = await storage.read('whitelist')
        if (!data) return false
        const whitelist = JSON.parse(data)
        const {actions} = request.resolvedTransaction
        return actions.every((action) => {
            return whitelist.find((entry) => {
                if (action.account.equals(entry.contract)) {
                    if (
                        action.account.equals('eosio.token') &&
                        action.name &&
                        action.name.equals('transfer')
                    ) {
                        return entry.recipients.includes(String(action.data.to))
                    }
                    return true
                }
            })
        })
    } catch (e) {
        // console.log('error in canAutoSign', e)
    }

    return false
}

export async function autoSign(
    urlString: URL | string,
    request: ResolvedSigningRequest
): Promise<WAXCloudWalletSigningResponse> {
    const url = new URL(urlString)
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 5000)
    const response: any = await fetch(url, {
        body: JSON.stringify({
            feeFallback: true,
            freeBandwidth: true,
            transaction: request.serializedTransaction,
        }),
        credentials: 'include',
        headers: {'Content-Type': 'application/json'},
        method: 'POST',
        signal: controller.signal,
    })
    if (!response.ok) {
        throw new Error('autosign api call failure: ' + JSON.stringify(response))
    }
    const data: any = await response.json()
    if (data.processed && data.processed.except) {
        throw new Error('autosign transaction failure: ' + JSON.stringify(data))
    }
    return data
}

export async function popupTransact(
    urlString: URL | string,
    request: ResolvedSigningRequest,
    timeout = 300000
): Promise<WAXCloudWalletSigningResponse> {
    const url = new URL(urlString)

    const popup = await window.open(url, 'WalletPluginWAXPopup', 'height=800,width=600')
    if (!popup) {
        throw new Error('Unable to open popup window')
    }

    return new Promise<WAXCloudWalletSigningResponse>((resolve, reject) => {
        const closeListener = registerCloseListener(popup, reject)
        const handleEvent = (event: MessageEvent) => {
            if (!isValidEvent(event, url, popup)) {
                return
            }
            popup?.postMessage(
                {
                    feeFallback: true,
                    freeBandwidth: true,
                    startTime: getCurrentTime(),
                    transaction: request.serializedTransaction,
                    type: 'TRANSACTION',
                },
                String(urlString)
            )
            const handleSigning = (signingEvent: MessageEvent) => {
                if (!isValidEvent(signingEvent, url, popup)) {
                    return
                }
                try {
                    resolve(signingEvent.data)
                } catch (e) {
                    reject(e)
                } finally {
                    window.removeEventListener('message', handleEvent)
                    window.removeEventListener('message', handleSigning)
                    clearTimeout(autoCancel)
                    clearInterval(closeListener)
                }
            }
            window.addEventListener('message', handleSigning)
        }
        // Automatically cancel request after 5 minutes to cleanup windows/promises
        const autoCancel = setTimeout(() => {
            popup.close()
            window.removeEventListener('message', handleEvent)
            reject(
                new Error(
                    `Transaction signing request has timed out after ${timeout / 1000} seconds.`
                )
            )
        }, timeout)
        // Add event listener awaiting WCW Response
        window.addEventListener('message', handleEvent)
    })
}

// function canAutoSign(transaction: Transaction): boolean {
//     const ua = navigator.userAgent.toLowerCase()

//     if (ua.search('chrome') === -1 && ua.search('safari') >= 0) {
//         return false
//     }

//     return !transaction.actions.find((action) => !this.isWhitelisted(action))
// }

// function isWhitelisted(action: Action): boolean {
//     return !!(
//         this.whitelistedContracts &&
//         !!this.whitelistedContracts.find((w: any) => {
//             if (w.contract === action.account) {
//                 if (action.account === 'eosio.token' && action.name === 'transfer') {
//                     return w.recipients.includes(action.data.to)
//                 }

//                 return true
//             }

//             return false
//         })
//     )
// }

// export function verify(user: ILoginResponse, original: Transaction, modified: Transaction): void {
//     const {actions: originalActions} = original
//     const {actions: augmentedActions} = modified

//     if (
//         JSON.stringify(originalActions) !==
//         JSON.stringify(augmentedActions.slice(augmentedActions.length - originalActions.length))
//     ) {
//         throw new Error(
//             `Augmented transaction actions has modified actions from the original.\nOriginal: ${JSON.stringify(
//                 originalActions,
//                 undefined,
//                 2
//             )}\nAugmented: ${JSON.stringify(augmentedActions, undefined, 2)}`
//         )
//     }

//     for (const extraAction of augmentedActions.slice(
//         0,
//         augmentedActions.length - originalActions.length
//     )) {
//         const userAuthedAction = extraAction.authorization.find((auth: any) => {
//             return auth.actor === user.account
//         })

//         if (userAuthedAction) {
//             if (extraAction.account.equals('eosio.token') && extraAction.name.equals('transfer')) {
//                 const noopAction = augmentedActions[0]
//                 if (
//                     extraAction.data.to === 'txfee.wax' &&
//                     extraAction.data.memo.startsWith('WAX fee for ') &&
//                     JSON.stringify(noopAction) ===
//                         JSON.stringify({
//                             account: 'boost.wax',
//                             name: 'noop',
//                             authorization: [
//                                 {
//                                     actor: 'boost.wax',
//                                     permission: 'paybw',
//                                 },
//                             ],
//                             data: {},
//                         })
//                 ) {
//                     continue
//                 }
//             }

//             if (extraAction.account.equals('eosio') && extraAction.name.equals('buyrambytes')) {
//                 if (extraAction.data.receiver.equals(user.account)) {
//                     continue
//                 }
//             }

//             throw new Error(
//                 `Augmented transaction actions has an extra action from the original authorizing the user.\nOriginal: ${JSON.stringify(
//                     originalActions,
//                     undefined,
//                     2
//                 )}\nAugmented: ${JSON.stringify(augmentedActions, undefined, 2)}`
//             )
//         }
//     }
// }
