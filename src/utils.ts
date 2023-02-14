export function registerCloseListener(popup: Window, reject) {
    const closeListener = setInterval(() => {
        if (popup.closed) {
            clearInterval(closeListener)
            reject('The window was closed before the request was completed.')
        }
    }, 500)
    return closeListener
}

export function getCurrentTime() {
    return Math.floor(new Date().getTime())
}

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
