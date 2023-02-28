import {UserInterfaceTranslateOptions} from '@wharfkit/session'
import {WAXCloudWalletLoginResponse} from './types'
import {isValidEvent, registerCloseListener} from './utils'

export async function autoLogin(
    t: (key: string, options?: UserInterfaceTranslateOptions) => string,
    urlString: URL | string
): Promise<WAXCloudWalletLoginResponse> {
    // TODO: Figure out what temp accounts are
    //
    // if (this.returnTempAccount) {
    //   url.search = "returnTemp=true";
    // } else {
    //   url.search = "";
    // }
    const url = new URL(urlString)
    const response = await fetch(String(url), {
        credentials: 'include',
        method: 'get',
    })
    if (!response.ok) {
        throw new Error(
            t('error.endpoint', {
                default: `Login Endpoint Error {{status}} - {{statusText}}`,
                status: response.status,
                statusText: response.statusText,
            })
        )
    }
    const data = await response.json()
    return data
}

export async function popupLogin(
    t: (key: string, options?: UserInterfaceTranslateOptions) => string,
    urlString: URL | string,
    timeout = 300000
): Promise<WAXCloudWalletLoginResponse> {
    // Open the popup window
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
    // Return a promise that either times out or resolves when the popup resolves
    return new Promise<WAXCloudWalletLoginResponse>((resolve, reject) => {
        const closeListener = registerCloseListener(t, popup, reject)
        // Event handler awaiting response from WCW
        const handleEvent = (event: MessageEvent) => {
            if (!isValidEvent(event, url, popup)) {
                return
            }
            try {
                resolve(event.data)
            } catch (e) {
                reject(e)
            } finally {
                window.removeEventListener('message', handleEvent)
                clearTimeout(autoCancel)
                clearInterval(closeListener)
            }
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
        // Add event listener awaiting WCW Response
        window.addEventListener('message', handleEvent)
    })
}
