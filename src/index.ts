import {
    LoginContext,
    PermissionLevel,
    ResolvedSigningRequest,
    Serializer,
    SigningRequest,
    TransactContext,
    Transaction,
    WalletPlugin,
    WalletPluginConfig,
    WalletPluginLoginResponse,
    WalletPluginMetadata,
    WalletPluginSignResponse,
} from '@wharfkit/session'
import {
    loginPopup,
    transactPopup,
    WAXCloudWalletLoginResponse,
    WAXCloudWalletSigningResponse,
} from './wcw'

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
    async login(context: LoginContext): Promise<WalletPluginLoginResponse> {
        if (!context.chain) {
            throw new Error('A chain must be selected to login with.')
        }

        // TODO: check if we can auto login and modify the way it acts (no popup)
        const response: WAXCloudWalletLoginResponse = await loginPopup(
            `${this.url}/cloud-wallet/login/`
        )

        if (!response) {
            throw new Error('No response received.')
        }

        if (!response.verified) {
            throw new Error('User cancelled login request.')
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
    async sign(
        resolved: ResolvedSigningRequest,
        context: TransactContext
    ): Promise<WalletPluginSignResponse> {
        // TODO: check if can auto sign and modify the way it acts
        // https://github.com/worldwide-asset-exchange/waxjs/blob/develop/src/WaxSigningApi.ts#L93

        const response: WAXCloudWalletSigningResponse = await transactPopup(
            `${this.url}/cloud-wallet/signing/`,
            resolved
        )

        if (!response) {
            throw new Error('No response received.')
        }

        if (!response.verified) {
            throw new Error('User cancelled signing request.')
        }

        // Determine if there are any fees to accept
        const hasFees = response.waxFee || response.ramFee
        if (hasFees) {
            throw new Error('NYI: Prompt user with fee for acceptance')
        }

        // Create a modified signing request based on the WAX Cloud Wallet response
        const request = await SigningRequest.create(
            {
                transaction: Serializer.decode({
                    data: response.serializedTransaction,
                    type: Transaction,
                }),
            },
            context.esrOptions
        )

        // Return modified request and signatures to Wharf
        return {
            request,
            signatures: response.signatures,
        }
    }
}
