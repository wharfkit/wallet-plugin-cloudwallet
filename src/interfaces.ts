export interface IWhitelistedContract {
    contract: string
    domain: string
    recipients: string[]
}

export interface ISigningResponse {
    serializedTransaction: Uint8Array
    signatures: string[]
}

export interface ILoginResponse {
    account: string
    permission?: string
    keys: string[]
    createData?: any
    avatarUrl?: string
    trustScore?: number
    isProofVerified?: any
    token?: string
    proof?: any
}

export interface IDappInfo {
    name?: string
    logoUrl?: string
    schema?: string
    description?: string
}

export interface MobileAppConnectConfig {
    remote?: {
        dappClientId: string
        getDappSingleUsedToken: () => Promise<string>
    }
    direct?: {
        callbackUri: string
        broadcastChannel: string
    }
    dappInfo: IDappInfo
}

export interface WalletPluginCloudWalletOptions {
    supportedChains?: string[]
    url?: string
    loginTimeout?: number
    mobileAppConnectConfig?: MobileAppConnectConfig
}
