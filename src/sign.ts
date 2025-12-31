import {ResolvedSigningRequest, UserInterfaceTranslateOptions} from '@wharfkit/session'

import {WAXCloudWalletSigningResponse} from './types'
import {getCurrentTime, isValidEvent, registerCloseListener} from './utils'
import {version} from './version'

export async function popupTransact(
    t: (key: string, options?: UserInterfaceTranslateOptions) => string,
    urlString: URL | string,
    request: ResolvedSigningRequest,
    timeout = 300000
): Promise<WAXCloudWalletSigningResponse> {
    const url = new URL(urlString)

    const popup = await window.open(url, 'WalletPluginCloudWalletPopup', 'height=800,width=600')
    if (!popup) {
        throw new Error(
            t('error.popup', {
                default:
                    'Unable to open the popup window. Check your browser settings and try again.',
            })
        )
    }

    return new Promise<WAXCloudWalletSigningResponse>((resolve, reject) => {
        const closeListener = registerCloseListener(t, popup, reject)
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
                    version,
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
                    t('error.timeout', {
                        default:
                            'The request has timed out after {{timeout}} seconds. Please try again.',
                        timeout: timeout / 1000,
                    })
                )
            )
        }, timeout)
        // Add event listener awaiting Cloud Wallet Response
        window.addEventListener('message', handleEvent)
    })
}
