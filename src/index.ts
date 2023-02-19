import {
    AbstractWalletPlugin,
    BrowserLocalStorage,
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

import {autoLogin, popupLogin} from './login'
import {allowAutosign, autoSign, popupTransact} from './sign'
import {WAXCloudWalletLoginResponse, WAXCloudWalletSigningResponse} from './types'
import {validateModifications} from './utils'

export const storage = new BrowserLocalStorage('wallet-plugin-wax')

export class WalletPluginWAX extends AbstractWalletPlugin implements WalletPlugin {
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
            // 'f16b1833c747c43682f4386fca9cbb327929334a762755ebec17f6f23c9b8a12', // NYI - WAX (Testnet)
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

    public get id(): string {
        return 'wcw'
    }

    public get data() {
        return {}
    }

    /**
     * WAX Cloud Wallet Configuration
     */
    public url = 'https://all-access.wax.io'
    public autoUrl = 'https://api-idm.wax.io/v1/accounts/auto-accept'
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

        let response: WAXCloudWalletLoginResponse
        try {
            // Attempt automatic login
            context.ui.status('Establishing connection...')
            response = await autoLogin(`${this.autoUrl}/login`)
        } catch (e) {
            // Fallback to popup login
            context.ui.status('Complete the login using the WAX Cloud Wallet popup window.')
            response = await popupLogin(`${this.url}/cloud-wallet/login/`)
        }

        // If failed due to no response or no verified response, throw error
        if (!response) {
            throw new Error('No response received.')
        }

        if (!response.verified) {
            throw new Error('User cancelled login request.')
        }

        // Save our whitelisted contracts
        storage.write('whitelist', JSON.stringify(response.whitelistedContracts))

        // Return to session's transact call
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
        // Perform WAX Cloud Wallet signing
        const response = await this.waxSign(resolved)

        // Determine if there are any fees to accept
        const hasFees = response.waxFee || response.ramFee
        if (hasFees) {
            throw new Error('NYI: Prompt user with fee for acceptance')
        }

        // The response to return to the Session Kit
        const result: WalletPluginSignResponse = {
            signatures: response.signatures,
        }

        // If a transaction was returned by the WCW
        if (response.serializedTransaction) {
            // Convert the serialized transaction from the WCW to a Transaction object
            const responseTransaction = Serializer.decode({
                data: response.serializedTransaction,
                type: Transaction,
            })

            // Determine if the transaction changed from the requested transaction
            if (!responseTransaction.equals(resolved.transaction)) {
                // Evalutate whether modifications are valid, if not throw error
                validateModifications(resolved.transaction, responseTransaction)
                // If changed, add the modified request returned by WCW to the response
                result.request = await SigningRequest.create(
                    {
                        transaction: responseTransaction,
                    },
                    context.esrOptions
                )
            }
        }

        // Return modified request and signatures to Wharf
        return result
    }

    async waxSign(resolved: ResolvedSigningRequest): Promise<WAXCloudWalletSigningResponse> {
        let response: WAXCloudWalletSigningResponse
        // Check if automatic signing is allowed
        if (await allowAutosign(resolved)) {
            try {
                // Try automatic signing
                // console.log('attempting autoSign')
                response = await autoSign(`${this.autoUrl}/signing`, resolved)
            } catch (e) {
                // Fallback to poup signing
                // console.log('autoSign failed, popping up')
                response = await popupTransact(`${this.url}/cloud-wallet/signing/`, resolved)
            }
        } else {
            // If automatic is not allowed use the popup
            // console.log('autoSign not allowed, using popup')
            response = await popupTransact(`${this.url}/cloud-wallet/signing/`, resolved)
        }

        // Catch unknown errors where no response is returned
        if (!response) {
            throw new Error('No response received.')
        }

        // Ensure the response is verified, if not the user most likely cancelled the request
        if (!response.verified) {
            throw new Error('User cancelled signing request.')
        }

        // Save our whitelisted contracts
        storage.write('whitelist', JSON.stringify(response.whitelistedContracts))

        // Return the response from the API
        return response
    }
}
