import {
    AbstractWalletPlugin,
    cancelable,
    Cancelable,
    LoginContext,
    PermissionLevel,
    PromptResponse,
    ResolvedSigningRequest,
    Serializer,
    SigningRequest,
    TransactContext,
    Transaction,
    UserInterfaceTranslateOptions,
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
import defaultTranslations from './translations'

export interface WalletPluginCloudWalletOptions {
    supportedChains?: string[]
    url?: string
    autoUrl?: string
    loginTimeout?: number
}

export class WalletPluginCloudWallet extends AbstractWalletPlugin implements WalletPlugin {
    /**
     * The unique identifier for the wallet plugin.
     */
    id = 'cloudwallet'

    /**
     * The translations for this plugin
     */
    translations = defaultTranslations

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
    readonly metadata: WalletPluginMetadata = WalletPluginMetadata.from({
        name: 'Cloud Wallet',
        description: '',
        logo: 'PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTcuOTQ5NDMgMTkuMjU4MkM2LjE0OTM2IDE3LjQ1ODIgNi4xNDkzNiAxNC41NDE4IDcuOTQ5NDMgMTIuNzQxOEwxMi43NDE2IDcuOTVDMTQuNTQxNyA2LjE1MDA2IDE3LjQ1ODMgNi4xNTAwNiAxOS4yNTg0IDcuOTVMMjAuOTQ2NSA5LjYzNzk0TDI1LjYxNDEgNC45NzA2OEwyMy45MjYgMy4yODI3NEMxOS41NDg3IC0xLjA5NDI1IDEyLjQ1MTMgLTEuMDk0MjUgOC4wNzQgMy4yODI3NEwzLjI4Mjk3IDguMDc0NTdDLTEuMDk0MzIgMTIuNDUxNiAtMS4wOTQzMiAxOS41NDg0IDMuMjgyOTcgMjMuOTI1NEw0Ljk2MzAzIDI1LjYwNTRMOS42MzA2MyAyMC45MzgxTDcuOTUwNTcgMTkuMjU4Mkg3Ljk0OTQzWiIgZmlsbD0idXJsKCNwYWludDBfcmFkaWFsXzE4NDRfNTA4MikiLz4KPHBhdGggZD0iTTI4LjcxNjcgOC4wNzQ1N0wyNy4wMjg2IDYuMzg2NjNMMjIuMzYxIDExLjA1MzlMMjQuMDQ5MSAxMi43NDE4QzI1Ljg0OTIgMTQuNTQxOCAyNS44NDkyIDE3LjQ1ODIgMjQuMDQ5MSAxOS4yNTgyTDE4LjI3NzUgMTMuNDg2OUMxNi45ODgzIDEyLjE5NzggMTQuODk5MSAxMi4xOTc4IDEzLjYwOTkgMTMuNDg2OUMxMi4zMjA3IDE0Ljc3NiAxMi4zMjA3IDE2Ljg2NTEgMTMuNjA5OSAxOC4xNTQyTDE5LjM4MTUgMjMuOTI1NEwxOS4yNTY5IDI0LjA1QzE3LjQ1NjkgMjUuODQ5OSAxNC41NDAyIDI1Ljg0OTkgMTIuNzQwMSAyNC4wNUwxMS4wNDQxIDIyLjM1NDFMNi4zNzY0NiAyNy4wMjEzTDguMDcyNTMgMjguNzE3MkMxMi40NDk4IDMzLjA5NDIgMTkuNTQ3MiAzMy4wOTQyIDIzLjkyNDUgMjguNzE3MkwyNC4wNDkxIDI4LjU5MjdMMjguNzE2NyAyMy45MjU0QzMzLjA5NCAxOS41NDg0IDMzLjA5NCAxMi40NTE2IDI4LjcxNjcgOC4wNzQ1N1oiIGZpbGw9InVybCgjcGFpbnQxX3JhZGlhbF8xODQ0XzUwODIpIi8+CjxkZWZzPgo8cmFkaWFsR3JhZGllbnQgaWQ9InBhaW50MF9yYWRpYWxfMTg0NF81MDgyIiBjeD0iMCIgY3k9IjAiIHI9IjEiIGdyYWRpZW50VW5pdHM9InVzZXJTcGFjZU9uVXNlIiBncmFkaWVudFRyYW5zZm9ybT0idHJhbnNsYXRlKDEyLjc5OTkgNC4yMjg5OSkgcm90YXRlKDkwKSBzY2FsZSgxNy44ODUxIDE3Ljg5MTEpIj4KPHN0b3Agc3RvcC1jb2xvcj0iIzY2RkVGMiIvPgo8c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiMwMENGREMiLz4KPC9yYWRpYWxHcmFkaWVudD4KPHJhZGlhbEdyYWRpZW50IGlkPSJwYWludDFfcmFkaWFsXzE4NDRfNTA4MiIgY3g9IjAiIGN5PSIwIiByPSIxIiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSIgZ3JhZGllbnRUcmFuc2Zvcm09InRyYW5zbGF0ZSgxOS4xODgxIDE5LjE5MzMpIHJvdGF0ZSg5MCkgc2NhbGUoMTIuODA2NyAxMi44MTE2KSI+CjxzdG9wIHN0b3AtY29sb3I9IiNDN0E1RUEiLz4KPHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjN0Q0QkEzIi8+CjwvcmFkaWFsR3JhZGllbnQ+CjwvZGVmcz4KPC9zdmc+Cg==',
        homepage: 'https://www.mycloudwallet.com',
        download: 'https://www.mycloudwallet.com',
    })

    /**
     * WAX Cloud Wallet Configuration
     */
    public url = 'https://www.mycloudwallet.com'
    public autoUrl = 'https://idm-api.mycloudwallet.com/v1/accounts/auto-accept'
    public loginTimeout = 300000 // 5 minutes

    /**
     * Constructor to allow overriding of plugin configuration.
     */
    constructor(options?: WalletPluginCloudWalletOptions) {
        super()
        if (options?.supportedChains) {
            this.config.supportedChains = options.supportedChains
        }
        if (options?.url) {
            this.url = options.url
        }
        if (options?.autoUrl) {
            this.autoUrl = options.autoUrl
        }
        if (options?.loginTimeout) {
            this.loginTimeout = options.loginTimeout
        }
    }

    /**
     * Performs the wallet logic required to login and return the chain and permission level to use.
     *
     * @param options WalletPluginLoginOptions
     * @returns Promise<WalletPluginLoginResponse>
     */
    login(context: LoginContext): Cancelable<WalletPluginLoginResponse> {
        const promise = this.waxLogin(context)
        return cancelable(promise, (canceled) => {
            throw canceled
        })
    }
    async waxLogin(context: LoginContext): Promise<WalletPluginLoginResponse> {
        if (!context.chain) {
            throw new Error('A chain must be selected to login with.')
        }

        // Retrieve translation helper from the UI, passing the app ID
        const t = context.ui.getTranslate(this.id)

        let response: WAXCloudWalletLoginResponse
        try {
            // Attempt automatic login
            context.ui.status(t('connecting', {default: 'Connecting to Cloud Wallet'}))
            response = await autoLogin(t, `${this.autoUrl}/login`)
        } catch (e) {
            // Fallback to popup login
            context.ui.status(
                t('login.popup', {default: 'Login with the Cloud Wallet popup window'})
            )
            response = await popupLogin(t, `${this.url}/cloud-wallet/login/`)
        }

        // If failed due to no response or no verified response, throw error
        if (!response) {
            throw new Error(t('login.error.response', {default: 'Cloud Wallet failed to respond'}))
        }

        if (!response.verified) {
            throw new Error(
                t('error.closed', {
                    default: 'Cloud Wallet closed before the login was completed',
                })
            )
        }

        // Save our whitelisted contracts
        this.data.whitelist = response.whitelistedContracts

        return new Promise((resolve) => {
            if (!context.chain) {
                throw new Error('A chain must be selected to login with.')
            }
            // Return to session's transact call
            resolve({
                chain: context.chain.id,
                permissionLevel: PermissionLevel.from({
                    actor: response.userAccount,
                    permission: 'active',
                }),
            })
        })
    }
    /**
     * Performs the wallet logic required to sign a transaction and return the signature.
     *
     * @param chain ChainDefinition
     * @param resolved ResolvedSigningRequest
     * @returns Promise<Signature>
     */
    sign(
        resolved: ResolvedSigningRequest,
        context: TransactContext
    ): Cancelable<WalletPluginSignResponse> {
        const promise = this.waxSign(resolved, context)
        return cancelable(promise, (canceled) => {
            throw canceled
        })
    }

    async waxSign(
        resolved: ResolvedSigningRequest,
        context: TransactContext
    ): Promise<WalletPluginSignResponse> {
        if (!context.ui) {
            throw new Error('A UserInterface must be defined to sign transactions.')
        }

        // Retrieve translation helper from the UI, passing the app ID
        const t = context.ui.getTranslate(this.id)

        // Set expiration time frames for the request
        const expiration = resolved.transaction.expiration.toDate()
        const now = new Date()
        const timeout = Math.floor(expiration.getTime() - now.getTime())

        // Perform WAX Cloud Wallet signing
        const callbackPromise = this.getWalletResponse(resolved, context, t, timeout)

        // Tell Wharf we need to prompt the user with a countdown
        const promptPromise: Cancelable<PromptResponse> = context.ui.prompt({
            title: 'Sign',
            body: `Please complete the transaction using the Cloud Wallet popup window.`,
            elements: [
                {
                    type: 'countdown',
                    data: expiration.toISOString(),
                },
            ],
        })

        // Create a timer to test the external cancelation of the prompt, if defined
        const timer = setTimeout(() => {
            if (!context.ui) {
                throw new Error('No UI defined')
            }
            promptPromise.cancel('The request expired, please try again.')
        }, timeout)

        // Clear the timeout if the UI throws (which generally means it closed)
        promptPromise.catch(() => clearTimeout(timer))

        // Wait for either the callback or the prompt to resolve
        const callbackResponse = await Promise.race([callbackPromise, promptPromise]).finally(
            () => {
                // Clear the automatic timeout once the race resolves
                clearTimeout(timer)
            }
        )

        if (isCallback(callbackResponse)) {
            // Determine if there are any fees to accept
            const hasFees = callbackResponse.waxFee || callbackResponse.ramFee
            if (hasFees) {
                throw new Error(
                    'The transaction requires a fee, and the fee interface is not yet implemented.'
                )
            }

            // The response to return to the Session Kit
            const result: WalletPluginSignResponse = {
                signatures: callbackResponse.signatures,
            }

            // If a transaction was returned by the WCW
            if (callbackResponse.serializedTransaction) {
                // Convert the serialized transaction from the WCW to a Transaction object
                const responseTransaction = Serializer.decode({
                    data: callbackResponse.serializedTransaction,
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

            return new Promise((resolve) => resolve(result))
        }

        throw new Error('The Cloud Wallet failed to respond')
    }

    async getWalletResponse(
        resolved: ResolvedSigningRequest,
        context: TransactContext,
        t: (key: string, options?: UserInterfaceTranslateOptions) => string,
        timeout = 300000
    ): Promise<WAXCloudWalletSigningResponse> {
        let response: WAXCloudWalletSigningResponse
        if (!context.ui) {
            throw new Error('The Cloud Wallet requires a UI to sign transactions.')
        }

        // Check if automatic signing is allowed
        if (allowAutosign(resolved, this.data)) {
            try {
                // Try automatic signing
                context.ui.status(t('connecting', {default: 'Connecting to Cloud Wallet'}))
                response = await autoSign(t, `${this.autoUrl}/signing`, resolved)
            } catch (e) {
                // Fallback to poup signing
                context.ui.status(
                    t('transact.popup', {default: 'Sign with the Cloud Wallet popup window'})
                )
                response = await popupTransact(
                    t,
                    `${this.url}/cloud-wallet/signing/`,
                    resolved,
                    timeout
                )
            }
        } else {
            // If automatic is not allowed use the popup
            context.ui.status(
                t('transact.popup', {default: 'Sign with the Cloud Wallet popup window'})
            )
            response = await popupTransact(
                t,
                `${this.url}/cloud-wallet/signing/`,
                resolved,
                timeout
            )
        }

        // Catch unknown errors where no response is returned
        if (!response) {
            throw new Error(t('login.error.response', {default: 'Cloud Wallet failed to respond'}))
        }

        // Ensure the response is verified, if not the user most likely cancelled the request
        if (!response.verified) {
            throw new Error(
                t('error.closed', {
                    default: 'The Cloud Wallet was closed before the request was completed',
                })
            )
        }

        // Save our whitelisted contracts
        this.data.whitelist = response.whitelistedContracts

        // Return the response from the API
        return response
    }
}

function isCallback(object: any): object is WAXCloudWalletSigningResponse {
    return 'serializedTransaction' in object
}
