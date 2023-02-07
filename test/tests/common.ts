import {assert} from 'chai'
import {PermissionLevel, SessionKit} from '@wharfkit/session'

import {WalletPluginTEMPLATE} from '$lib'
import {mockFetch} from '$test/utils/mock-fetch'

const mockChainDefinition = {
    id: '73e4385a2708e6d7048834fbc1079f2fabb17b3c125b146af438971e90716c4d',
    url: 'https://jungle4.greymass.com',
}

const mockPermissionLevel = PermissionLevel.from('wharfkit1115@test')

const mockSessionKitOptions = {
    appName: 'unittests',
    chains: [mockChainDefinition],
    fetch: mockFetch, // Required for unit tests
    walletPlugins: [new WalletPluginTEMPLATE()],
}

suite('wallet plugin', function () {
    test('login and sign', async function () {
        const kit = new SessionKit(mockSessionKitOptions)
        const {session} = await kit.login({
            chain: mockChainDefinition.id,
            permissionLevel: mockPermissionLevel,
        })
        assert.isTrue(session.chain.equals(mockChainDefinition))
        assert.isTrue(session.actor.equals(mockPermissionLevel.actor))
        assert.isTrue(session.permission.equals(mockPermissionLevel.permission))
        const result = await session.transact(
            {
                action: {
                    authorization: [mockPermissionLevel],
                    account: 'eosio.token',
                    name: 'transfer',
                    data: {
                        from: mockPermissionLevel.actor,
                        to: 'wharfkittest',
                        quantity: '0.0001 EOS',
                        memo: 'wharfkit/session wallet plugin template',
                    },
                },
            },
            {
                broadcast: false,
            }
        )
        assert.isTrue(result.signer.equals(mockPermissionLevel))
        assert.equal(result.signatures.length, 1)
    })
})
