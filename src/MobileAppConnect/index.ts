/** @format */

import {IDappInfo, ILoginResponse} from '../interfaces'
import {v4 as uuidv4} from 'uuid'
import {
    LoginContext,
    PromptElement,
    Serializer,
    Transaction,
    ResolvedSigningRequest,
    SigningRequest,
    TransactContext,
    ChainId,
    WalletPluginSignResponse
} from '@wharfkit/session'
import { MobileAppConnectConfig } from '../interfaces';
import { decodeSignatureFromWallet, generateReturnUrl } from '../helpers';
import { TransactionSyncHandler, SyncHandlerConfig } from '../SyncHandler';
import { TransactionMessage } from '../SyncHandler/transaction';
import {events} from 'aws-amplify/data'
import {validateModifications} from '../utils'

const MCW_CONNECT_UNIVERSAL_LINK = 'https://mycloudwallet.com/connect';
const MCW_TRANSACT_UNIVERSAL_LINK = 'https://mycloudwallet.com/transact';

declare global {
    interface Window {
        closeCustomPopup?: () => void
    }
}

const publish2channel = /* GraphQL */ `
    mutation Publish2channel($data: AWSJSON!, $name: String!) {
        publish2channel(data: $data, name: $name) {
            data
            name
            __typename
        }
    }
`

type Subscribe2channelSubscription = {
    subscribe2channel?: {
        __typename: 'Channel'
        data: string
        name: string
    } | null
}

export interface RequisitionInfo {
    code: string
    qrCodeContent: string
    expire: number
}

interface ActivatedData {
    account: string
    keys: string[]
    isTemp?: boolean
    createData?: any
    avatarUrl?: string
    trustScore?: number
    isProofVerified?: any
    token: string
    userAccount?: string
}

class ActivationFetchError extends Error {
    constructor(message = '') {
        super(message)
        this.name = 'ActivationFetchError'
    }
}

class ActivationExpiredError extends Error {
    constructor(message = '') {
        super(message)
        this.name = 'ActivationExpiredError'
    }
}

class ActivationCancelledError extends Error {
    constructor(message = '') {
        super(message)
        this.name = 'ActivationCancelledError'
    }
}

class ActivationDeepLinkError extends Error {
    constructor(message = '') {
        super(message)
        this.name = 'ActivationDeepLinkError'
    }
}

class InvalidCodeError extends Error {
    constructor(message = '') {
        super(message)
        this.name = 'InvalidCodeError'
    }
}

export class MobileAppConnect {
    private user?: ILoginResponse
    private isCanceled: boolean = false;
    private connectedType: 'direct' | 'remote' | 'web' | null = null;
    private WAX_SCHEME_DEEPLINK = 'mycloudwallet';
    private activationEndpoint = 'https://login-api.mycloudwallet.com'    
    private transactionSyncHandler: TransactionSyncHandler;
    private dAppInfo: IDappInfo
    private origin: string;
    private uuid: string;

    constructor(
        readonly mobileAppConnectConfig: MobileAppConnectConfig
    ) {
        if (!mobileAppConnectConfig || !mobileAppConnectConfig.dappInfo) {
            throw new Error('MobileAppConnect is required');
        }
        this.mobileAppConnectConfig = mobileAppConnectConfig
        this.dAppInfo = mobileAppConnectConfig.dappInfo
        this.origin = location.origin;
        new SyncHandlerConfig({
            graphQLRelayEndpoint: 'https://queue-relay.mycloudwallet.com/graphql',
            graphQLRelayRegion: 'us-east-2',
            eventRelayEndpoint: 'https://direct-connect-api.mycloudwallet.com/event',
            eventRelayRegion: 'eu-east-2'
        })
        // Initialize transaction SyncHandler
        this.transactionSyncHandler = new TransactionSyncHandler();
        this.uuid = uuidv4();
        const connectedType = localStorage.getItem('connectedType');
        if (connectedType === 'direct' || connectedType === 'remote' || connectedType === 'web') {
            this.connectedType = connectedType;
        }
    }

    public getConnectedType(): 'direct' | 'remote' | 'web' | null {
        return this.connectedType;
    }

    public async showAppConnectPrompt(context: LoginContext) {
        const elements: PromptElement[] = []
        let requisitionInfo: RequisitionInfo | undefined
        let directConnectPromiseResolve: (value: any) => void;
        let directConnectPromiseReject: (reason?: any) => void;
        let checkActivationPromise: Promise<ILoginResponse | void> | undefined = undefined;
        const directConnectPromise = new Promise((resolve, reject) => {
            directConnectPromiseResolve = resolve;
            directConnectPromiseReject = reject;
        });

        if (this.mobileAppConnectConfig.remote) {
            requisitionInfo = await this.fetchActivationInfo(this.getActivationPayload(context))
            elements.unshift({
                type: 'qr',
                data: requisitionInfo.qrCodeContent,
            })
        }
        if (this.mobileAppConnectConfig.direct) {
            elements.unshift({
                type: 'button',
                data: {
                    label: 'Open in My Cloud Wallet',
                    variant: 'primary',
                    onClick: async () => {
                        try {
                            const result = await this.directConnect(context); // Wait for deeplink response
                            directConnectPromiseResolve(result);       // Resolve outer promise
                        } catch (error) {
                            directConnectPromiseReject(error);
                        }
                    }
                },
            })
        }
        // Show the prompt UI
        const currentPromptResponse = context.ui.prompt({
            title: 'Connect with My Cloud Wallet!!!',
            body: 'Connect My Cloud Wallet on your mobile device',
            elements,
        })
        currentPromptResponse.catch((error:any) => {
            console.info('User cancelled modal::', error.message)
            directConnectPromiseReject(error)
            this.isCanceled = true;
        })
        // No longer waiting for prompt — go straight to activation
        if (requisitionInfo) {
            checkActivationPromise = this.checkActivation(
                context,
                requisitionInfo
            )
        }
        try {
            if (checkActivationPromise) {
                return await Promise.race([
                    directConnectPromise,
                    checkActivationPromise])
            } else {
                return await directConnectPromise;
            }
        } catch (error) {
            console.log('showAppConnectPrompt::directConnectPromise::error', error);
            if (error instanceof ActivationCancelledError) {
                console.log('currentPromptResponse', typeof currentPromptResponse);
                //context.ui.onLoginComplete;
                this.isCanceled = true;
                this.connectedType = null;
            }
            throw error;
        }
    }

    public remoteTransact(resolved: ResolvedSigningRequest, context: TransactContext, namedParams: any): Promise<{signatures: any[]}> {
        if (!this.user?.account || !this.user?.token) {
            throw new Error('User not authenticated');
        }

        const channelName = this.transactionSyncHandler.generateChannelName(this.origin, this.user.account);
        const txInfo = this.transactionSyncHandler.generateTransactionMessage(resolved.request.getRawActions(), namedParams, this.origin);
        
        const authHeaders: string = TransactionSyncHandler.parseAuthHeaders(this.user.account, this.user.token, this.origin)
        
        return new Promise((resolve, reject) => {
            let subscription;
            const currentTxInfo = txInfo;
            console.log(
                `start listening on ${channelName} with transaction ID = ${currentTxInfo.id}...`
            );

            // Publish transaction request
            this.transactionSyncHandler.publishToChannel(channelName, txInfo, authHeaders)
                .catch(error => {
                    console.error('Failed to publish to channel:', error);
                    reject(error);
                });

            // Subscribe to channel for response
            subscription = this.transactionSyncHandler.subscribeToChannel<TransactionMessage>(
                channelName,
                (message) => {
                    if (message.id !== currentTxInfo.id) {
                        return;
                    }

                    switch (message.type) {
                        case 'requesting':
                            console.log('tx requesting...');
                            break;
                        case 'approved':
                            try {
                                const result = this.transactionSyncHandler.processTransactionResult(message);
                                resolve(result);
                            } catch (error) {
                                console.error('Failed to process transaction result:', error);
                                reject(error);
                            }
                            break;
                        case 'rejected':
                            reject(new Error('User rejected the transaction'));
                            break;
                        case 'error':
                            reject(new Error(message.result));
                            break;
                        default:
                            console.log(`Unknown status: ${JSON.stringify(message)}`);
                            break;
                    }
                },
                (error) => {
                    console.error('Subscription error:', error);
                    reject(error);
                },
                authHeaders
            );

            // Cleanup subscription on completion
            return {
                unsubscribe: () => {
                    subscription?.unsubscribe();
                }
            };
        });
    }
    

    public async signTransaction(resolved: ResolvedSigningRequest, context: TransactContext, namedParams: any) : Promise<any> {
        if (!this.connectedType || this.connectedType === 'web') {
            throw new Error('Activation_NotActivated!!!');
        }
        if (this.connectedType === 'direct') {
            return await this.directTransact(resolved, context, namedParams);
        } else {
            return this.remoteTransact(resolved, context, namedParams);
        }
    }

    private async checkActivation(
        context: LoginContext,
        requisitionInfo: RequisitionInfo
    ) {
        try {
            const activatedData = await this.checkIfActivated(
                requisitionInfo,
                this.origin
            )
            if (!!activatedData) {
                this.user = activatedData
                this.connectedType = 'remote';
                context.ui.onLoginComplete();
                return this.user
            }
        } catch (error) {
            throw error
        }
    }

    private async fetchActivationInfo({
        origin,
        dAppName,
        logourl,
        schema,
        description,
    }: {
        origin: string
        dAppName: string
        logourl?: string
        schema?: string
        description?: string
    }): Promise<RequisitionInfo> {
        try {
            if (!this.mobileAppConnectConfig.remote) {
                throw new Error('mobileAppConnectConfig remote is required')
            }
            const sut = await this.mobileAppConnectConfig.remote.getDappSingleUsedToken()
            const response = await fetch(`${this.activationEndpoint}/v1/wcw/dapp/code`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-dapp-sdk-sut': sut.toString(),
                    'X-dapp-sdk-client-id': this.mobileAppConnectConfig.remote.dappClientId.toString(),
                },
                body: JSON.stringify({
                    dapp: origin,
                    dAppName: dAppName,
                    logourl,
                    schema,
                    description,
                    origin,
                }),
            })

            if (!response.ok) {
                throw new Error(`Network response was not ok: ${response.status}`)
            }

            const data = await response.json()
            return data
        } catch (error) {
            console.error('Fetch error:', error)
            throw new ActivationFetchError()
        }
    }

    private async checkIfActivated(
        requisitionInfo: RequisitionInfo,
        origin: string
    ): Promise<ActivatedData> {
        return new Promise<ActivatedData>((resolve, reject) => {
            const intervalId = setInterval(async () => {
                const currentTimestamp = Math.floor(Date.now() / 1000)
                if(this.user || this.isCanceled) {
                    clearInterval(intervalId)
                }
                if (currentTimestamp > requisitionInfo.expire) {
                    console.log(
                        'Current time is greater than expiration. Stopping pulling checkActivation.',
                        currentTimestamp,
                        requisitionInfo.expire
                    )
                    clearInterval(intervalId)
                    reject(new ActivationExpiredError())
                }

                try {
                    const response = await fetch(
                        `${this.activationEndpoint}/v1/wcw/dapp/code/check?dapp=${origin}`,
                        {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                code: requisitionInfo.code,
                            }),
                        }
                    )

                    if (response.status === 422) {
                        reject(new InvalidCodeError())
                        return
                    }

                    if (!response.ok) {
                        throw new Error(`Network response was not ok: ${response.status}`)
                    }

                    const data = await response.json()      

                    if (response.status === 202) {
                        console.log('Continuing pulling checkActivation')
                    } else if (response.status === 200) {
                        console.log('Stopping pulling checkActivation')
                        clearInterval(intervalId)
                        resolve(data)
                        // Do something with the data, e.g., update state or trigger some action
                        // Example: return a promise that resolves with the data
                        // return Promise.resolve(data);
                    }
                } catch (error) {
                    console.error('Error checking activation:', error)

                    clearInterval(intervalId)
                    reject(error)
                }
            }, 5_000)
        })
    }

    private getActivationPayload(context: LoginContext) {
        return {
            origin: this.origin,
            dAppName: `${this.dAppInfo.name ||context.appName}`,
            logourl: this.dAppInfo.logoUrl,
            schema: this.dAppInfo.schema,
            description: this.dAppInfo.description,
        }
    }

    private openDeepLinkWithFallback(link: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
            reject(new ActivationDeepLinkError('App likely not installed, fallback triggered.'));
            }, 4000);
            const clear = () => {
                clearTimeout(timeoutId);
                resolve();
            };
            window.addEventListener('pagehide', clear, { once: true });
            window.addEventListener('blur', clear, { once: true });
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'hidden') {
                  clear();
                }
              }, { once: true });
            
            window.location.href = link;
        });
    }

    public async directConnect(context: LoginContext): Promise<ILoginResponse | void> {
        const callbackUrl = btoa(generateReturnUrl() || '');
        const deviceHash = encodeURIComponent('1234567890');
        this.uuid = uuidv4();
    
        // Build the deep link URL with organized parameters
        const linkParams = new URLSearchParams({
            schema: this.dAppInfo.schema || 'none',
            dapp: this.dAppInfo.name || context.appName || '',
            origin: this.origin,
            logourl: this.dAppInfo.logoUrl || '',
            description: this.dAppInfo.description || '',
            antelope: 'antelope-1',
            callbackHttp: callbackUrl,
            uuid: this.uuid,
            deviceHash: deviceHash,
        });

        const nonce = context.arbitrary['nonce']
        // conditionally add non-falsy nonce to the link
        if (nonce) {
            const base64Nonce = btoa(nonce)
            linkParams.set('n', base64Nonce);
        }

        const link = `${this.WAX_SCHEME_DEEPLINK}://connect?${linkParams.toString()}`;
    
        try {
            await this.openDeepLinkWithFallback(link);
        } catch (error) {
            console.error('Failed to open deeplink:', error);
            throw error;
        }
    
        return new Promise(async (resolve, reject) => {
            const timeout = setTimeout(() => {
                this.isCanceled = true;
                cleanup();
                reject(new Error('Connection timeout'));
            }, 180000); // 3 min
    
            let subscription: any;
            let interval: any;
            const cleanup = () => {
                clearTimeout(timeout);
                clearInterval(interval);
                subscription?.unsubscribe?.();
            };
    
            const connectToDevice = async () => {
                try {
                    const re = await events.connect(`/device-connect/${this.uuid}`, { authToken: this.uuid });
                    subscription = re.subscribe({
                        next: (data) => {
                            if (data?.type === 'data' && data?.event?.accountName) {
                                this.user = {
                                    account: data.event.accountName,
                                    keys: [],
                                    isTemp: false,
                                    createData: {},
                                    token: '',
                                    proof: data.event.proof
                                };
                                this.connectedType = 'direct';
                                localStorage.setItem('connectedType', this.connectedType);
                                cleanup();
                                resolve(this.user);
                                re.close();
                                return;
                            } else if (data?.event?.error) {
                                const msg = data.event.error === 'ConnectRejected'
                                    ? 'User rejected the connection'
                                    : 'Direct connection error';
                                cleanup();
                                reject(new ActivationCancelledError(msg));
                                re.close();
                                return;
                            } else {
                                cleanup();
                                reject(new Error('Invalid account'));
                                re.close();
                                return;
                            }
                        },
                        error: (err) => {
                            console.error('Subscription error:', err);
                            cleanup();
                            reject(err);
                            re.close();
                            return;
                        }
                    });
                } catch (err) {
                    cleanup();
                    reject(err);
                }
            };
            interval = setInterval(() => {
                if (document.hasFocus()) {
                    connectToDevice();
                }
            }, 500);
        });
    }    

    public async directTransact(resolved: ResolvedSigningRequest, context: TransactContext, namedParams: any): Promise<{signatures: any[]}> {
        if (!this.connectedType || this.connectedType === 'remote') {
            throw new Error('Invalid connection type, expect direct connection');
        }

        const encodeTransactions = btoa(JSON.stringify(resolved.request.getRawActions()));
        const callbackUrl = btoa(generateReturnUrl() || '');
        const deviceHash = encodeURIComponent('1234567890');
        this.uuid = uuidv4();

        // Build the deep link URL with organized parameters
        const linkParams = new URLSearchParams({
            transaction: encodeTransactions,
            schema: this.dAppInfo.schema || 'none',
            callbackHttp: callbackUrl,
            redirect: 'true',
            deviceHash: deviceHash,
            uuid: this.uuid,
            broadcast: 'false'
        });

        const link = `${this.WAX_SCHEME_DEEPLINK}://transact?${linkParams.toString()}`;
        
        try {
            await this.openDeepLinkWithFallback(link);
        } catch (error) {
            console.error('Failed to open deeplink:', error);
            throw error;
        }

        return new Promise(async (resolve, reject) => {
            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error('Transaction timeout'));
            }, 180000); // 3 min

            let subscription: any;
            let interval: any;
            const cleanup = () => {
                clearTimeout(timeout);
                clearInterval(interval);
                subscription?.unsubscribe?.();
            };

            const transact = async () => {
                try {
                    const re = await events.connect(`/device-transact/${this.uuid}`, { authToken: this.uuid });
                    subscription = re.subscribe({
                        next: (data) => {
                            if (data?.type === 'data' && data?.event?.signatures) {                                                                
                                const signatures = decodeSignatureFromWallet(data.event.signatures);
                                            // If a transaction was returned by the WCW
                                if (data.event.serializedTransaction) {
                                    // Convert the serialized transaction from the WCW to a Transaction object
                                    const responseTransaction = Serializer.decode({
                                        data: data.event.serializedTransaction,
                                        type: Transaction,
                                    })
                                    const result: WalletPluginSignResponse = {
                                        signatures,
                                    }
                                    // Determine if the transaction changed from the requested transaction
                                    if (!responseTransaction.equals(resolved.transaction)) {
                                        // Evalutate whether modifications are valid, if not throw error
                                        validateModifications(resolved.transaction, responseTransaction)
                                        // If transaction modified, return a new resolved request to Wharf
                                        SigningRequest.create(
                                            {
                                                transaction: responseTransaction,
                                            },
                                            context.esrOptions
                                        ).then((request) => {
                                            result.resolved = new ResolvedSigningRequest(
                                                request,
                                                context.permissionLevel,
                                                Transaction.from(responseTransaction),
                                                Serializer.objectify(Transaction.from(responseTransaction)),
                                                ChainId.from(context.chain.id)
                                            )
                                            resolve(result);
                                            re.close();
                                        }).catch((err) => {
                                            cleanup();
                                            reject(err);
                                            re.close();
                                        })
                                    }
                                }
                                return;
                            } else if (data?.event?.error) {
                                const msg = data.event.error === 'TransactionDeclined'
                                    ? 'User rejected the transaction'
                                    : data.event.error;
                                cleanup();
                                reject(new Error(msg));
                                re.close()
                                return;
                            } else {
                                cleanup();
                                reject(new Error('Transaction unknown error'));
                                re.close();
                                return;
                            }
                        },
                        error: (err) => {
                            alert('subscription error::' + err?.message);
                            console.error('Subscription error:', err);
                            cleanup();
                            reject(err);
                            re.close();
                            return;
                        }
                    });
                } catch (err) {
                    cleanup();
                    reject(err);
                    return;
                }
            };
            interval = setInterval(() => {
                if (document.hasFocus()) {
                    transact();
                }
            }, 350);
            return;
        });
    }

    public async cleanup(): Promise<void> {
        // Reset connection state
        this.connectedType = null;
        this.user = undefined;
        this.isCanceled = false;
        
        // Clear stored connection type
        localStorage.removeItem('connectedType');
        
        // Close all event connections
        await events.closeAll();
    }
}
