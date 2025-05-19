export interface IWhitelistedContract {
  contract: string;
  domain: string;
  recipients: string[];
}

export interface ISigningResponse {
  serializedTransaction: Uint8Array;
  signatures: string[];
}

export interface ILoginResponse {
  account: string;
  keys: string[];
  isTemp?: boolean;
  createData?: any;
  avatarUrl?: string;
  trustScore?: number;
  isProofVerified?: any;
  token?: string;
}

export interface IDappInfo {
  name: string;
  logoUrl?: string;
  schema?: string;
  description?: string;
  origin?: string;
}

export interface MobileAppConnectConfig {
  remote?: {
      dappClientId: string,
      getDappSingleUsedToken: () => Promise<string>,
      
  },
  direct?: {
      callbackUri: string,
      broadcastChannel: string,
  },
  dappInfo: IDappInfo,
}

export interface WalletPluginCloudWalletOptions {
  supportedChains?: string[]
  url?: string
  autoUrl?: string
  loginTimeout?: number
  allowTemp?: boolean
  mobileAppConnectConfig?: MobileAppConnectConfig
}