import {NameType, PublicKeyType, ResolvedSigningRequest, Signature} from '@wharfkit/session'

interface WAXCloudWalletResponse {
    verified: boolean
    whitelistedContracts: []
}

export interface WAXCloudWalletLoginResponse extends WAXCloudWalletResponse {
    autoLogin: boolean
    isTemp?: boolean
    pubKeys: PublicKeyType[]
    userAccount: NameType
}

export interface WAXCloudWalletSigningResponse extends WAXCloudWalletResponse {
    cpu?: number
    estimatorWorking?: boolean
    net?: number
    ram?: number
    ramFee?: number
    serializedTransaction?: Uint8Array
    signatures: Signature[]
    type: string
    waxFee?: number
}

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
        const handleEvent = (event: MessageEvent) => {
            if (!isValidEvent(event, url, popup)) {
                return
            }
            popup?.postMessage(
                {
                    startTime: getCurrentTime(),
                    feeFallback: true,
                    freeBandwidth: true,
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

function getCurrentTime() {
    return Math.floor(new Date().getTime())
}

function isValidEvent(event: MessageEvent, url: URL, window: Window): boolean {
    // Message source validation
    const eventOrigin = new URL(event.origin)
    const validOrigin = eventOrigin.origin === url.origin
    const validSource = event.source === window
    const validObject = typeof event.data === 'object'
    if (!validObject || !validOrigin || !validSource) {
        return false
    }
    return true
}
