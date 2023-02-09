import {
    LoginContext,
    NameType,
    PermissionLevel,
    PublicKeyType,
    ResolvedSigningRequest,
    Signature,
    TransactContext,
    WalletPlugin,
    WalletPluginConfig,
    WalletPluginLoginOptions,
    WalletPluginLoginResponse,
    WalletPluginMetadata,
} from '@wharfkit/session'

interface WAXCloudWalletResponse {
    autoLogin: boolean
    pubKeys: PublicKeyType[]
    userAccount: NameType
    verified: boolean
    whitelistedContracts: []
}

export async function doLogin(
    urlString: URL | string,
    timeout = 300000
): Promise<WAXCloudWalletResponse> {
    const url = new URL(urlString)

    const popup = await window.open(url, 'WalletPluginWAXPopup', 'height=800,width=600')
    if (!popup) {
        throw new Error('Unable to open popup window')
    }

    return new Promise<WAXCloudWalletResponse>((resolve, reject) => {
        // Automatically cancel request after 5 minutes to cleanup windows/promises
        const autoCancel = setTimeout(() => {
            popup.close()
            window.removeEventListener('message', eventListener)
            reject(new Error(`Login request has timed out after ${timeout / 1000} seconds.`))
        }, timeout)

        // Event listener for WCW Response
        async function eventListener(event: MessageEvent) {
            // Message source validation
            const eventOrigin = new URL(event.origin)
            const validOrigin = eventOrigin.origin === url.origin
            const validSource = event.source === popup
            const validObject = typeof event.data === 'object'
            if (!validObject || !validOrigin || !validSource) {
                return
            }

            // Process incoming message
            try {
                resolve(event.data)
            } catch (e) {
                reject(e)
            } finally {
                // Cleanup
                window.removeEventListener('message', eventListener)
                clearTimeout(autoCancel)
            }
        }

        // Add event listener awaiting WCW Response
        window.addEventListener('message', eventListener)
    })
}

export class WalletPluginWAX implements WalletPlugin {
    /**
     * The logic configuration for the wallet plugin.
     */
    readonly config: WalletPluginConfig = {
        // Should the user interface display a chain selector?
        requiresChainSelect: true,
        // Should the user interface display a permission selector?
        requiresPermissionSelect: false,
        // The blockchains this WalletPlugin supports
        supportedChains: [
            '1064487b3cd1a897ce03ae5b6a865651747e2e152090f99c1d19d44e01aea5a4', // WAX (Mainnet)
            // 'f16b1833c747c43682f4386fca9cbb327929334a762755ebec17f6f23c9b8a12', // WAX (Testnet)
        ],
    }

    /**
     * The metadata for the wallet plugin to be displayed in the user interface.
     */
    readonly metadata: WalletPluginMetadata = {
        name: 'WAX Cloud Wallet',
        description: '',
        logo: 'base_64_encoded_image',
        homepage: 'https://all-access.wax.io',
        download: 'https://all-access.wax.io',
    }

    /**
     * WAX Cloud Wallet Configuration
     */
    public url = 'https://all-access.wax.io'
    public loginTimeout = 300000 // 5 minutes

    /**
     * Performs the wallet logic required to login and return the chain and permission level to use.
     *
     * @param options WalletPluginLoginOptions
     * @returns Promise<WalletPluginLoginResponse>
     */
    async login(
        context: LoginContext,
        options: WalletPluginLoginOptions
    ): Promise<WalletPluginLoginResponse> {
        if (!context.chain) {
            throw new Error('A chain must be selected to login with.')
        }

        const response = await doLogin(`${this.url}/cloud-wallet/login/`)

        if (!response) {
            throw new Error('No response received.')
        }

        if (!response.verified) {
            throw new Error('User did not complete the request')
        }

        return {
            chain: context.chain.id,
            permissionLevel: PermissionLevel.from({
                actor: response.userAccount,
                permission: 'active',
            }),
        }
    }
    /**
     * Performs the wallet logic required to sign a transaction and return the signature.
     *
     * @param chain ChainDefinition
     * @param resolved ResolvedSigningRequest
     * @returns Promise<Signature>
     */
    async sign(resolved: ResolvedSigningRequest, context: TransactContext): Promise<Signature> {
        // Example response...
        return Signature.from(
            'SIG_K1_KfqBXGdSRnVgZbAXyL9hEYbAvrZjcaxUCenD7Z3aX6yzf6MEyc4Cy3ywToD4j3SKkzSg7L1uvRUirEPHwAwrbg5c9z27Z3'
        )
    }
}
