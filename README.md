# @wharfkit/wallet-plugin-cloudwallet

A Session Kit wallet plugin for the [CloudWallet](https://mycloudwallet.com).

## Usage

Include this wallet plugin while initializing the SessionKit.

**NOTE**: This wallet plugin will only work with the SessionKit and requires a browser-based environment.

```ts
import {WalletPluginCloudWallet} from '@wharfkit/wallet-plugin-cloudwallet'

const kit = new SessionKit({
    // ... your other options
    walletPlugins: [new WalletPluginCloudWallet()],
})
```

If you need to modify which chains are supported, modify the URLs being used, or alter the timeout, you can specify one or more of these paramaters during plugin initialization.

```ts
import {WalletPluginCloudWallet} from '@wharfkit/wallet-plugin-cloudwallet'

const kit = new SessionKit({
    // ... your other options
    walletPlugins: [
        new WalletPluginCloudWallet({
            supportedChains: [
                '1064487b3cd1a897ce03ae5b6a865651747e2e152090f99c1d19d44e01aea5a4', // WAX (Mainnet)
            ],
            url: 'https://www.mycloudwallet.com',
            autoUrl: 'https://idm-api.mycloudwallet.com/v1/accounts/auto-accept',
            loginTimeout: 300000, // 5 minutes
        }),
    ],
})
```

## Direct Connect Feature

The CloudWallet plugin supports a direct connect feature that allows mobile dapp users to seamlessly login by connecting with the MyCloudWallet app installed on the same device. This eliminates the need for manual account entry and provides a smoother user experience on mobile platforms.

To enable this feature, configure the `mobileAppConnectConfig` parameter with your dapp's information during plugin initialization:

```ts
import {WalletPluginCloudWallet} from '@wharfkit/wallet-plugin-cloudwallet'

const kit = new SessionKit({
    // ... your other options
    walletPlugins: [
        new WalletPluginCloudWallet({
            mobileAppConnectConfig: {
                dappInfo: {
                    name: 'My Awesome DApp',
                    description: 'A revolutionary blockchain application',
                    schema: 'myawesomeapp://',
                    logoUrl: 'https://myapp.com/logo.png',
                },
            },
            // ... other plugin options
        }),
    ],
})
```

### Configuration Options

The `mobileAppConnectConfig.dappInfo` follows the `IDappInfo` interface structure:

- **name** *(optional)*: The display name of your dapp that will be shown to users
- **logoUrl** *(optional)*: URL to your dapp's logo image that will be displayed during the connection process
- **schema** *(optional)*: The deep link schema for your dapp (used for redirecting back to your app)
- **description** *(optional)*: A brief description of your dapp's purpose or functionality

**Note**: All properties in the `IDappInfo` interface are optional and can be omitted if not needed for your use case.

When properly configured, users on mobile devices will be able to authenticate directly through the MyCloudWallet app without needing to manually enter their credentials or navigate through web-based login flows. The MyCloudWallet app will display your dapp's information during the authentication process, providing users with clear context about the connection request.

**Note**: The direct connect feature is only available on supported mobile environments. When users are accessing your dapp via web browsers or unsupported mobile browsers, they will automatically fall back to login via the MyCloudWallet web interface.

## Developing

You need [Make](https://www.gnu.org/software/make/), [node.js](https://nodejs.org/en/) and [yarn](https://classic.yarnpkg.com/en/docs/install) installed.

Clone the repository and run `make` to checkout all dependencies and build the project. See the [Makefile](./Makefile) for other useful targets. Before submitting a pull request make sure to run `make lint`.

---

Made with ☕️ & ❤️ by [Greymass](https://greymass.com), if you find this useful please consider [supporting us](https://greymass.com/support-us).
