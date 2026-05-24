export interface WalletPluginCloudWalletOptions {
    supportedChains?: string[]
    url?: string
    loginTimeout?: number
    /**
     * @deprecated Mobile app connection support has been discontinued.
     * This option is accepted for backwards compatibility and ignored.
     */
    mobileAppConnectConfig?: any
}
