import {ResolvedSigningRequest, WalletPluginData} from '@wharfkit/session'

import {WAXCloudWalletSigningResponse} from './types'
import {getCurrentTime, isValidEvent, registerCloseListener} from './utils'

export async function allowAutosign(
    request: ResolvedSigningRequest,
    data: WalletPluginData
): Promise<boolean> {
    const ua = navigator.userAgent.toLowerCase()
    if (ua.search('chrome') === -1 && ua.search('safari') >= 0) {
        return false
    }

    try {
        if (!data) return false
        const whitelist = data.whitelist
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

    const popup = await window.open(url, 'WalletPluginCloudWalletPopup', 'height=800,width=600')
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
