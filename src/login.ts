import {WAXCloudWalletLoginResponse} from './types'
import {isValidEvent} from './utils'

export async function autoLogin(urlString: URL | string): Promise<WAXCloudWalletLoginResponse> {
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
        throw new Error(`Login Endpoint Error ${response.status} ${response.statusText}`)
    }
    const data = await response.json()
    return data
}

export async function popupLogin(
    urlString: URL | string,
    timeout = 300000
): Promise<WAXCloudWalletLoginResponse> {
    // Open the popup window
    const url = new URL(urlString)
    const popup = await window.open(url, 'WalletPluginWAXPopup', 'height=800,width=600')
    if (!popup) {
        throw new Error('Unable to open popup window')
    }
    // Return a promise that either times out or resolves when the popup resolves
    return new Promise<WAXCloudWalletLoginResponse>((resolve, reject) => {
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
            }
        }
        // Automatically cancel request after 5 minutes to cleanup windows/promises
        const autoCancel = setTimeout(() => {
            popup.close()
            window.removeEventListener('message', handleEvent)
            reject(new Error(`Login request has timed out after ${timeout / 1000} seconds.`))
        }, timeout)
        // Add event listener awaiting WCW Response
        window.addEventListener('message', handleEvent)
    })
}
