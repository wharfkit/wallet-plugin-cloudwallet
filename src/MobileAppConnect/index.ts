/** @format */

// import { WaxJS } from "..";
import {IDappInfo, ILoginResponse, IWhitelistedContract} from '../interfaces'
import { API, Amplify, graphqlOperation } from 'aws-amplify';
import {GraphQLSubscription} from '@aws-amplify/api'
import {v4 as uuidv4} from 'uuid'
import {LoginContext, PromptElement, Cancelable, PromptResponse} from '@wharfkit/session'
import { MobileAppConnectConfig } from '../interfaces';
import { ActivationHandler } from '../ActivationManager';
// export const LS_ACTIVATION_KEY = 'dapp_activated';

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

export interface TransactionMessage {
    id: string
    type: 'requesting' | 'approved' | 'rejected' | 'error' | 'ready' | 'not-ready'
    actions?: any
    namedParams?: any
    dapp?: string
    result?: any
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
    private _isConnected: boolean = false;
    private connectedType: 'direct' | 'remote' | null = null;
    private listenDirectConnect: boolean = false;
    private listenDirectTransact: boolean = false;
    private WAX_SCHEME_DEEPLINK = 'mycloudwallet';
    private transactionResult?: { transaction_id: string };
    private broadcastChannel?: BroadcastChannel;
    private activationEndpoint = 'https://login-api.mycloudwallet.com'    
    private relayEndpoint = 'https://ljk5ki565rcivky4sqi5rqg6bi.appsync-api.us-east-2.amazonaws.com/graphql'
    private relayRegion = 'us-east-2'
    private dAppInfo: IDappInfo
    private activationHandler: ActivationHandler;
    constructor(
        readonly mobileAppConnectConfig: MobileAppConnectConfig
    ) {
        if (!mobileAppConnectConfig || !mobileAppConnectConfig.dappInfo) {
            throw new Error('MobileAppConnect is required');
        }
        this.mobileAppConnectConfig = mobileAppConnectConfig
        this.dAppInfo = mobileAppConnectConfig.dappInfo
        this.activationHandler = new ActivationHandler(this.activationEndpoint, this.dAppInfo);
        const myAppConfig = {
            aws_appsync_graphqlEndpoint: this.relayEndpoint,
            aws_appsync_region: this.relayRegion,
            aws_appsync_authenticationType: 'AWS_LAMBDA',
        }
        Amplify.configure(myAppConfig)
        this.handleDirectConnectResponse = this.handleDirectConnectResponse.bind(this);
        this.handleDirectTransactResponse = this.handleDirectTransactResponse.bind(this);
    }

    public deactivate(): void {
        this.user = undefined
        //this._isConnected = false;
        this.connectedType = null;
        this.listenDirectConnect = false;
        this.listenDirectTransact = false;
        this.removeEventListener();
    }

    public async showAppConnectPrompt(context: LoginContext) {
        let currentPromptResponse: Cancelable<PromptResponse> | undefined
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
            requisitionInfo = await this.fetchActivationInfo(this.getActivationPayload())
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
                            const result = await this.directConnect(); // Wait for deeplink response
                            directConnectPromiseResolve(result);       // Resolve outer promise
                        } catch (error) {
                            directConnectPromiseReject(error);
                        }
                    }
                },
            })
        }
        // Show the prompt UI
        currentPromptResponse = context.ui?.prompt({
            title: 'Connect with My Cloud Wallet',
            body: 'Connect My Cloud Wallet on your mobile device',
            elements,
        })
        currentPromptResponse.catch((error:any) => {
            console.info('User cancelled modal:', error.message)
            //this._isConnected = false;
            if (error.message !== 'finish-activation') {
                this.connectedType = null;
            }
            this.isCanceled = true
        })
        // No longer waiting for prompt — go straight to activation
        if (requisitionInfo) {
            checkActivationPromise = this.checkActivation(
                context,
                requisitionInfo,
                currentPromptResponse!,
                elements
            )
        }
        if (checkActivationPromise) {
            const result = await Promise.race([
                directConnectPromise,
                checkActivationPromise
            ]);
            return result;
        } else {
            return await directConnectPromise;
        }
    }

    public remoteTransact(transaction: any, namedParams: any) : Promise<{signatures: any[]}> {
        if (!this.connectedType) {
            throw new Error('Activation_NotActivated!!!');
        }
        console.log('remoteTransact::', {transaction, namedParams})
        const origin = this.dAppInfo.origin || 'localhost'
        const channelName = `dapp:${origin}:${this.user?.account}`;
        const txInfo: TransactionMessage = {
            id: uuidv4(),
            type: 'requesting',
            actions: transaction,
            namedParams,
            dapp: origin,
        }
        
        API.graphql(
            graphqlOperation(
            publish2channel,
            {
                name: channelName,
                data: JSON.stringify(txInfo),
            },
            JSON.stringify({
                account: this.user?.account,
                token: this.user?.token,
                svc: origin,
                mode: 'dapp',
            })
            )
        );
        
        return new Promise((resolve, reject) => {
            let subscription
            const currentTxInfo = txInfo
            console.log(
                `start listening on ${channelName} with transaction ID = ${currentTxInfo.id}...`
            )
            // Add timeout promise
            const timeoutPromise = new Promise((_, reject) : any => {
                setTimeout(() => {
                subscription?.unsubscribe();
                reject(new Error('Transaction timeout after 3 minutes'));
                }, 180000); // 3 minutes in milliseconds
            });
            try {
                const query = `
                    subscription Subscribe2channel($name: String!) {
                        subscribe2channel(name: $name) {
                            data
                            name
                            __typename
                        }
                    }
                `
                //Subscribe via WebSockets
                const graphqlOption = graphqlOperation(
                    query,
                    {
                        name: channelName,
                    },
                    JSON.stringify({
                        account: this.user?.account,
                        token: this.user?.token,
                        svc: origin,
                        mode: 'dapp',
                    })
                );

                const subscriptionPromise = new Promise((resolve, reject): any => {
                    subscription = (API.graphql<
                    GraphQLSubscription<Subscribe2channelSubscription>
                    >(graphqlOption) as any).subscribe({
                    next: ({ provider: _, value }) => {
                        console.log('tx!!', value.data?.subscribe2channel?.data);
                        const txRes: TransactionMessage = JSON.parse(
                        value.data?.subscribe2channel?.data || ''
                        );
                        if (txRes.id !== currentTxInfo.id) {
                        return;
                        }
        
                        switch (txRes.type) {
                        case 'requesting':
                            console.log('tx requesting...');
                            break;
                        case 'approved':
                            let signatures;
                            // Decode base64 signatures if they exist
                            if (txRes.result?.signatures) {
                                console.log('txRes.result.signatures', txRes.result.signatures);
                                signatures = txRes.result.signatures.map((sig: string) => {
                                    try {
                                    // Check if the signature is base64 encoded
                                    if (/^[A-Za-z0-9+/=]+$/.test(sig)) {
                                        return atob(sig);
                                    }
                                    return sig;
                                    } catch (e) {
                                    console.warn('Failed to decode signature:', e);
                                    return sig;
                                    }
                                });
                            }
                            console.log('signatures::::', signatures);
                            resolve({
                                signatures
                            });
                            subscription?.unsubscribe();
                            break;
                        case 'rejected':
                            reject(new Error('User rejected the transaction'));
                            subscription?.unsubscribe();
                            break;
                        case 'ready':
                            // ignore
                            break;
                        case 'error':
                            reject(new Error(txRes.result));
                            subscription?.unsubscribe();
                            break;
                        default:
                            console.log(`Unknown status: ${JSON.stringify(txRes)}`);
                            break;
                        }
                    },
                    error: (error) => {
                        subscription?.unsubscribe();
                        reject(error);
                    },
                    });
                });
        
                // Race between the subscription and timeout
                Promise.race([subscriptionPromise, timeoutPromise])
                    .then((value) => resolve(value as {signatures: any[]}))
                    .catch(reject);
            } catch (error) {
                subscription?.unsubscribe()
                reject(error)
            }
        })
        
    }
    

    public async signTransaction(transaction: any, namedParams: any) : Promise<any> {
        if (!this.connectedType) {
            throw new Error('Activation_NotActivated!!!');
        }
        console.log('signTransaction::', {transaction, namedParams})
        if (this.connectedType === 'direct') {
            return await this.directTransact(transaction, namedParams);
        } else {
            return this.remoteTransact(transaction, namedParams);
        }
    }

    private async checkActivation(
        context: LoginContext,
        requisitionInfo: RequisitionInfo,
        promptResponse: Cancelable<PromptResponse>,
        elements: PromptElement[],
    ) {
        try {
            const activatedData = await this.checkIfActivated(
                requisitionInfo,
                this.dAppInfo.origin || 'localhost'
            )
            if (!!activatedData) {
                this.user = activatedData
                this.connectedType = 'remote';
                promptResponse.cancel('finish-activation', true);
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
                console.log('this.isCanceled', this.isCanceled)
                if(!!this.isCanceled) {
                    clearInterval(intervalId)
                    reject(new ActivationCancelledError())
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

    private getActivationPayload() {
        return {
            origin: this.dAppInfo.origin || 'localhost',
            dAppName: this.dAppInfo.name,
            logourl: this.dAppInfo.logoUrl,
            schema: this.dAppInfo.schema,
            description: this.dAppInfo.description,
        }
    }

    private async openDeeplink(link: string): Promise<void> {
        try {
            console.log('openDeeplink::link', link);
            //window.open(link, '_blank');
            window.location.href = link;
        } catch (error) {
            throw new ActivationDeepLinkError();
        }
    }

    public async directConnect(): Promise<ILoginResponse | void> {
        if (this.connectedType) {
            return this.user;
        }
        this.listenDirectConnect = true;
        const callbackUrl = btoa(window.location.origin + '/' + this.mobileAppConnectConfig.direct?.callbackUri);
        const link = `${this.WAX_SCHEME_DEEPLINK}://connect?schema=${this.dAppInfo.schema}&dapp=${this.dAppInfo.origin}&origin=${this.dAppInfo.origin}&logourl=${this.dAppInfo.logoUrl}&description=${this.dAppInfo.description}&antelope=antelope-1&callbackHttp=${callbackUrl}`;
        try {
            await this.openDeeplink(link);
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    this.listenDirectConnect = false;
                    reject(new Error('Connection timeout'));
                }, 180000); // 3 minutes timeout

                this.setupEventListener(this.handleDirectConnectResponse)
                    .then((data) => resolve(data))
                    .catch((error) => reject(error))
                    .finally(() => {
                        this.removeEventListener();
                        clearTimeout(timeout);
                    })
            });
        } catch (error) {
            this.listenDirectConnect = false;
            throw error;
        }
    }

    public async directTransact(actions: any[], namedParams: any) : Promise<{signatures: any[]}>  {
        if (!this.connectedType || this.connectedType === 'remote') {
            throw new Error('Invalid connection type, expect direct connection');
        }
        this.listenDirectTransact = true;
        const enccodeTransactions = btoa(JSON.stringify(actions));
        const callbackUrl = btoa(window.location.origin + '/' + this.mobileAppConnectConfig.direct?.callbackUri);
        const link = `${this.WAX_SCHEME_DEEPLINK}://transact?transaction=${enccodeTransactions}&schema=${this.dAppInfo.schema}&callbackHttp=${callbackUrl}&redirect=true`;
        console.log('[provider] directTransact', link);
        try {
            await this.openDeeplink(link);
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {                    
                    reject(new Error('Transaction timeout'));
                }, 180000); // 3 minutes timeout

                this.setupEventListener(this.handleDirectTransactResponse)
                    .then((data) => resolve(data))
                    .catch((error) => reject(error))
                    .finally(() => {
                        this.listenDirectTransact = false;
                        this.removeEventListener();
                        clearTimeout(timeout);
                    })
            });
        } catch (error) {
            this.listenDirectTransact = false;
            throw error;
        }
    }

    private extractURL(url: string, param: string, shouldDecode: boolean = true): string {
        const regex = new RegExp(`[?&]${param}=([^&]*)`);
        const match = regex.exec(url);
        if (match === null) {
            return '';
        }
        return shouldDecode ? decodeURIComponent(match[1]) : match[1];
    }

    private handleDirectTransactResponse(url: string) {
        console.log('handleDirectTransactResponse::url', url);
        const txid = this.extractURL(url, 'txid', false);
        const encodedSignatures = this.extractURL(url, 'signatures', false);
        console.log('handleDirectTransactResponse::txid', txid);
        console.log('handleDirectTransactResponse::encodedSignatures', encodedSignatures);
        const error = decodeURI(this.extractURL(url, 'error', false));
        
        if (txid) {
            this.listenDirectTransact = false;
            const signatures = this.decodeSignatures(encodedSignatures);
            console.log('handleDirectTransactResponse::signatures', signatures);
            this.transactionResult = { transaction_id: txid };
            return { signatures }
        } 
        
        if (error) {
            this.listenDirectTransact = false;
            throw new Error(error);
        }
    }

    private handleDirectConnectResponse(url: string): ILoginResponse | void {
        console.log('handleDirectConnectResponse::url', url);
        const account = this.extractURL(url, 'account', false);
        const error = decodeURI(this.extractURL(url, 'error', false));
        
        if (account) {
            console.log("[dapp deeplink] account found", account);
            this.listenDirectConnect = false;
            this.connectedType = 'direct';
            this.user = {
                account: account,
                keys: [],
                isTemp: false,
                createData: {},
                token: ''
            };
            return this.user;
        }
        
        if (error) {
            this.listenDirectConnect = false;
            throw new Error(error);
        }
    }

    // private setupConnectEventListener(): Promise<any> {
    //     return new Promise((resolve, reject) => {
    //         try {
    //             if (this.mobileAppConnectConfig?.direct?.broadcastChannel) {
    //                 this.broadcastChannel = new BroadcastChannel(this.mobileAppConnectConfig.direct.broadcastChannel);
    //                 this.broadcastChannel.onmessage = (event: MessageEvent) => {
    //                 if (event.data && typeof event.data === 'string') {
    //                         const url = event.data;
    //                         console.log('handleDeeplinkResponse', url, this.listenDirectTransact, this.listenDirectConnect);
    //                         resolve(this.handleDirectConnectResponse(url))
    //                         return null;
    //                     } else {
    //                         throw new Error('Invalid event data');
    //                     }
                        
    //                 };
    //             } else {
    //                 reject(new Error('Broadcast channel config missing'));
    //             }
    //         } catch (err) {
    //             reject(err);
    //         }
    //     });
    // }

    private setupEventListener(handler: (url: string) => any): Promise<any> {
        return new Promise((resolve, reject) => {
            try {
                if (this.mobileAppConnectConfig?.direct?.broadcastChannel) {
                    this.broadcastChannel = new BroadcastChannel(this.mobileAppConnectConfig.direct.broadcastChannel);
                    this.broadcastChannel.onmessage = (event: MessageEvent) => {
                    if (event.data && typeof event.data === 'string') {
                            const url = event.data;
                            console.log('handleDeeplinkResponse', url, this.listenDirectTransact, this.listenDirectConnect);
                            resolve(handler(url))
                            return null;
                        } else {
                            throw new Error('Invalid event data');
                        }
                        
                    };
                } else {
                    reject(new Error('Broadcast channel config missing'));
                }
            } catch (err) {
                reject(err);
            }
        });
    }

    private removeEventListener() {
        if (this.broadcastChannel) {
            this.broadcastChannel.close();
            this.broadcastChannel = undefined;
        }
    }

    private decodeSignatures(encoded: string): any[] {
        try {
          // Step 1: Replace URL-safe characters
          let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
      
          // Step 2: Pad the base64 string (length should be multiple of 4)
          while (base64.length % 4 !== 0) {
            base64 += '=';
          }
      
          // Step 3: Decode from base64
          const jsonString = atob(base64);
      
          // Step 4: Parse JSON
          const parsed = JSON.parse(jsonString);
      
          // Validate it's an array
          if (!Array.isArray(parsed)) {
            throw new Error('Decoded signatures is not an array');
          }
      
          return parsed;
        } catch (err) {
          console.error('Failed to decode signatures:', err);
          return [];
        }
      }
}
