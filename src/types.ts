import {NameType, PublicKeyType, Signature} from '@wharfkit/session'

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
