import {
    AbstractWalletPlugin,
    cancelable,
    Cancelable,
    ChainId,
    IdentityProof,
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
    Name,
    TimePointSec,
    Signature,
    PromptElement,
    LogoutContext,
} from '@wharfkit/session'

import {autoLogin, popupLogin} from './login'
import {allowAutosign, autoSign, popupTransact} from './sign'
import {WAXCloudWalletLoginResponse, WAXCloudWalletSigningResponse} from './types'
import {validateModifications} from './utils'
import defaultTranslations from './translations'
import {MobileAppConnect} from './MobileAppConnect'
import {WalletPluginCloudWalletOptions} from './interfaces'
import {isAndroid, isIos} from './helpers'

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
        requiresChainSelect: false,
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
        logo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAAAXNSR0IArs4c6QAAAIRlWElmTU0AKgAAAAgABQESAAMAAAABAAEAAAEaAAUAAAABAAAASgEbAAUAAAABAAAAUgEoAAMAAAABAAIAAIdpAAQAAAABAAAAWgAAAAAAAABIAAAAAQAAAEgAAAABAAOgAQADAAAAAQABAACgAgAEAAAAAQAAAGCgAwAEAAAAAQAAAGAAAAAAWgkyTQAAAAlwSFlzAAALEwAACxMBAJqcGAAAAVlpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IlhNUCBDb3JlIDYuMC4wIj4KICAgPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4KICAgICAgPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIKICAgICAgICAgICAgeG1sbnM6dGlmZj0iaHR0cDovL25zLmFkb2JlLmNvbS90aWZmLzEuMC8iPgogICAgICAgICA8dGlmZjpPcmllbnRhdGlvbj4xPC90aWZmOk9yaWVudGF0aW9uPgogICAgICA8L3JkZjpEZXNjcmlwdGlvbj4KICAgPC9yZGY6UkRGPgo8L3g6eG1wbWV0YT4KGV7hBwAAJUlJREFUeNrlfXmUZFWZ5++7977YM7MsgQZEWtm0CkcQEBFkyLLP6RlBUMGsKkXRnm7EXQsdzsw0DoFLnzmoxcy0fRy7VaTwYGUWiILgQe2TiY6jjRQNDmArAm0BUgJCZUZmbO/e75s/3nbfi4iCzMrCZRLixJqVEb/fty83CL8nP1Mi+lhAmkScPPY+kecHWDwuBB1PzMc5oiNBchgzXsiAciIQAAyARdgJHnaQR5yTB5zI3SB9Fyrq7hto/LfJv9kUUfcCtIPI/T58bvpdv4Hm7Kxpbthgk/sfks7hAnumgjqTRU4j0msNKhAAFg4WIRyHcBHoEABOBAxAjIHAQBDAAej3WwhD9xRDfsgitzijb/lede2u5G9Nzs6aOe9v/39FwJSI3gEwiAQAPixLZxHkAgGdVUKtLgBC9OAkBADLAARQDCEWEAOQGHgnEhHCIgyIFbATAbMY1hooV8EQdOdbSxZys2Xa9n/WHngzAECEpgD1u9KI55wAEaGN3ge+WNrnicglhqonKxD66ILhHCQCXCAkEfiRlEPAEpud5LYInAAuvu9YYCW+LSKOI0IcKS21Gmw/RNhu3+4cX3HHnxx6faoNk5MuEYg/SgKmRLQH/CkifEVA9dMBIJQ2C0QAKAAp6BKDPkhARkRighxLpA2C+BLf5+gxKyKOha2AUKkqB0J/cfEHInTJTw8++MexhGg8h9rwnBHQFDFNItsUKc3z0qdJ6Q8aVBBK2wEEAetUS7zrPPjRfZcjIJZ0CCwjkfqMCBZYloyQ5DbgLAukWtPh0hIcy5V14NKdhx7ahogBkf3jIMCzsR+W/gmQcFuFasd2pQ0ADoD2Yc+Djxh+T/qBAeAz0BOQo8dTyY9NkuM8CZYFLOKcQMv4BMKn99wHTW//5aGH3gkRDc9H/UESICIEAEQkH7CLFyiFfwioXrLStjHwlEHu39qL+YkJKGpCTuILZKQESKQlziMjIgHiGJYrlcC12/3QuQsfPeJPtyF+//uTBLX/TE5TEZEQkXzALV1a0rWriXQplCUnEAMI5SEvAo+hxOyVrDgsze5noaqkxCF13NE1wCLkIIFttx0rVaJa/epDHtx1KYgERIJmU/1BaUBTRCUJ1Qfc4mfLqn5xzy0JEQQEtbc/KjkzlAeUE22IJd8lEVCcE0SSnpmZRNpt/JxjxKYofh17ZinTIGYRwtgEhQvzW5888vCPRB+qqdBs8u+9Bvjgvzdc3Bqo+sVdXnKxvCuRQQkfJfnDJD4xP1KQ/ES6RbxLmiVnUi9x5CR+KIvMfLFAsQDh/LyT2tjFa37+r1tjAnh/aILan+CXTH1L17WdSBZaIv7wewNdhkh/5o6zf2OQiOx1SaImMegp4Fl+kBGSPJ+ZJmIW5VotJ2NjW8Z+tv9IUKtp8xPw3xUubDWmvqXnlpxAlPjg5wAcfsGIx32pTl5UfL0Pck76U2edSLrktSJmyfMbJCKKW4tOGmNbqvc9tF9IUKsHfmQfL+wvbC2ZsS09u+hERCV+ZhjgkFHgD+pELiqSzB+k5sez4yLZ43mHK6lTZgF4SH6QJ0ZIWJRbbDlpjG0p37P6JKjVBP8v+wtbgyAGH1CxFHlgDUqrj/Uw01OUfogf4fhRTfaPsK8J3t/OzEz+tmPfT/hmKoqQwKKk1XLSaGwJVpkEtVrg/0V/YasJxrb0wkXHgtTsZKBJKr0DpkYG7XzR3o/MksXTivg250xMQkQCaKYJnFZUJY2y2H9PmY9IzRHXG1vKdz2QktDcRxLUaoD/9m4CfstxbHZY8pKe2e/IMWZhZkLMKMkXjygZiPeziCYjwU/WWKJSqmNJIx5PuiNnzANOGM6LmOLfIYEovdByvYnxLfhpREJzH0nQ+wr+29rzW0uV8S1hr+UAKIptPhEgSZpBIzIP2kvISaMctYBjXgQkLBCv+EbOMx/Or5TGpsZ5ERBz9liqFbFvSAVGstuGhfoKCr2+vfA7vzrtnIUzJuYe+eatc3Nz0kRTzWFO9jsBPvib2/NbS9XxLf3ugosSrDhnpyLABCkAL8+ChIIPEAKcgABSiowh6IDEaBIicizkRJiFnBMhjrUwATwtT6fOFjkzxF7+wL7Gxa8NRNBTBAjJX9348/4Lv/owmRc/77RTj3j9xPfvv+HWOayMBL1S8Dcuzm8t1ca3hN0Fl5SQkYh+doVMCSi9LUOAJxpWZhAkgY7SWhnVUKIUOdcPnXOPW2d3udA+Ya1zVqSCSsWgWlNhGJJz7KwIWRFKnW2aNSPvE1CMlDIzx/DBh/zljT/vHX797kp4REm7fugqpnbqa446e+K2FZLw7EsRXip+3uL81nJ9bIvtLDgCKYrxoxjjyA5R4X4CNKV/mHwLRcMyX3FQSmvU0XMLewS40QLfdhY7G+WlR4FDQgB4DI8FsmBe0Aed2GN5XSg4R+qNNb2FRYTOOceiw7j8wHF52nqlCh7IDbJum2FBP3qjMfiPlcMXlYn6SXgBLpua7tulKz9+89svBoAmmqqJZ1e2oOWC/4aFp7eWxya2uHbLEUQRYgZiwFVKBMEnJb0ukOApRvFdWa2qxnKnx8yfcb3e577SOGj3s3m7r3z88YMF/H4r+KgtV8r9pbZ1LMZyvgrqV0X9zlqSQxgW9FPJ/0UMfikB35cVrpi67tn2lR+/+fxlkUDLAf/shae3lsfGt9jFliOCUjGWvtQrD1QVI6w8SU9v+8AT5X0zwQaqYfq8cCcr9Y4v0dg9SUftCczRJCa5OVjBoMm5OXXg5KQkXbeX7979spD5aldrnNBbaFlOSIiBZ8n6BCKSc9rBUPDLRP1hmJIQEVdMVXfD5ZFAz9RMSfzqmfO/3VoaX7PFtSLJVwQiygD3JX/wsYgpQl4bkDNNqa+wJd0wPdu6Tpmxt/49UdgUMcDlnPifZyM0k5ddpuaI7IkiwVO7Hr2Wx8ffHD69YK2w4bgqykPKEm6k5A+CT7kojyJNCGq6219KSRAIEUb3E2iv4MfNiH8///Rng/Gxi91CJPmJzVcxyIiJGDBB6fPZ44lG+MB7/tqWzJjpu8XpL5qxzQAwKWLmVtge9MdODn3oke0yNrYp3LNgmdk4eBERZ+1Nw4IeKUBkKPhEBJFhfotSc1Q1Nd213a2Xf2vzR2ICRrU1RidiU4ACkfz5009eqsfHL+7PLzgnoliEsoTIqzrCS1z87BTFEkA+G/Zu28CMmZ4H/pSIntuH3uzchg0WMzMaAH794sM22z3z0xgbMwyyfg0pQSeKdlTscCPwbQx+zndRPsROA8Dof9VzHVcp1S5uvv5rlxJIZqZm1LI0IJG6DU8/eUFQrV/NnbZEEk9ptJNJPOUcrYrf5KjnabiTtqUgkvyrYvD90vYq9EYV4n/reffv2s6NsU12z7xlEZOEoYYFXUUQhvzVN3/RO/zrQx3uUNh8+CMySRSAQJcptL13NL+1eVtzctY05waHwGjU6Mhr9+w5Qdj+iLQpkXMcm57UlisfdA9MVQA3fV1CBGVJQyxRtlIaM2G4OH1VaT+AP4SExs9/tZ0bY5t4zx7LIKM5ivM5BX932b6oRBjucAeBIxriG4QVacUifcf21E/cfP7OmakZvXHHRjeagNjpnvjrX9dq5dJPTK22XtptR0Q6F8EUpFuNIIZie5/8nu8vIjZhK6Vx0w8Xp7ftT/CHkFC976HtPDaxSe3ZY3uKDEsM/vVF8Gm4xBINJYf8VxLZki6b0PXulTJOaO7Y2C865Zxtmpyb0wBQKQefVBMT6227EzKgk9qJK9juYmEr69NmHatc+dcrpLHABqVx0+svPDfgR6AxomIhOutfvFktzE93nrfGsEiYgB+m4FMKaC5/SS4e5Nl/SJ+PBdKErmcrQeNYdOnTALBjaocaSmhiel61+7enKCM/gggUkSSWTRVDTS96UZRPulThNVHYFN+XKM4vVyeM7S5MX1udeG7AH6EJ+OmD0xd97+GNh335wbB/TCVIbD6NStELch5XHXMvy+sBiQCkSIEYr770pvN+PDU1o3fEpihlY0fSH1HuCqrVEDWJhNjrq2b1E0mzR0G+kiiFwSkujoEA1lQnTL87/7sBP9aEZqwJePkRmw755q4Z/dK1AfXFpiWSfKhTlPNM0nNBhfc8KMlSiQguMGWwkisAYMeOKc6ZoMnZWQMiOek3vzmP6o3T7eKiY0Cz33VCBnoSWrrksWIv1uvD5jtXYnVtwnQ789Pbq2t+N+AnuRoRN5sRCc3b3r6p212crpbq8UjiEKeayyJpmIFKQU8u3uM6tF1XNtXTP/nG684DSJqTTTOgX6/Y/Zt/MrX6yeh2XDyal3O2fjlhsNg2JBKKzVZsgmy5scbYpfnpbzR+t+Dnk2ZRzWb0Hppnf217Oahv6oZtC4gpZLqD7piKERGhaI8oLRKTM7qsQ9e7/WPfOPdVqQZMxUAf/9gTZ1GlenLYXmLHotmbqXGSl/6ciSk4Yb8NiMz5Wt0YN73Fp3+vwI8I8DThprds7oVL09WgbojIJhKVmhYiEKn4QvkUrGB6Ui2ILwLo0PW4pMsnf+rc688CgJmpGa12xCmyg1wgJoCAOBp4lSFjfZFJyTc0MjPkvBlNb2zcqrEJ01uYn75pbO0+gy8iNDMjenZWzB1fuCO44wt3BLOzYqQpCvm2z4pJ6IZL09WgYQjKpjDToA5kYGOU6fHoIRCItTaAqAsA4L5jp6I3fOyvnzqc0L8PWtfBLMrz/+QnUoVsVhHlml/Keyy+bYM1E4bn56e/s+b5+wR+s9lUl62/jGjj3mf3ZUb0M73m2Zijy98ws72amiOYYVXbvOQ/U55AIECIFAlkSWu1/j/tOHsXAcD6R37zbjXe+LwsthwATZ71GqznU6G2nz2uKPMZSpENxseNW1iYnl27b+D7oN47I42umT9Z2P0bAGsZcAQ8QpbvOmnzgXfGv0HSBFFzJURnJHziDddtLwe1TT2bJyHpqRKKNaERoWr+GVcJaroTtt9z6Q1v+F8EAC99dPeNqjF2Ni+2nIrblD6wGEIEMNiESes+RDYYaxhuLV73gwMOmFoN8O+ceexACcofFZa3am0Oq5ZqMMZABOj1umh3lwDBnWD87clvOeArADAzI3rjCrQhR8Kbduwo6/qbe7ZrQTA0rCRBw52vDCVEXDmo637Yvuk/f/2cc+iljyw8X7D4C+hgrTgrqbXzAIfkS8xF6VexjYwiHnKqVtXodO7sH3DAKTuJQn81aTk/CYD//I2nzhShL4/V1/xJu9OCtaGwgAHiyNGzBqDKQRVGG7SW5r/rQn7baRcc/Phsc9ZsaC5/EzJJlr7wrjuCJ57Y9eOSqZwQul68UELPUB8ir1k2oBlCpIiFn4JUj6EjH9n9WqXUP8K5aBFBhPyQ0wcdhVp/QoyXIYvSiuBcHwhOvOPgtfesdBU0kfyd1/92kwlK24kU+v1eCIiBxMUUv5wc6ZaDgMfqa4L51tP3sXMbIhLEbGguv6ydVDA/9aavvwxEO4lUCSICHyEZMmAASofJiHwqKJ62ESLSEMKfKWE+HvU6okWSaCPRr90wsjoQA2Bvxp69GlEcATFqdTDk03ccvPaeSZEVgT8Tg3/HN558ldJ6OzOj3+86QAIf/LTHIWmEpEUkWFjc069VGuuJ1NwPt+0+aEOT7GxTzLIJmNtgm5Oz5q9vOPceCH26EtRApJj8UDNqDUKRSi8ohqEgqLgGLJHI2oqpgViOVyI4josje8niczHOj/MB8fMCSZvc4pTSvfmFPT2lPgcAc5dfvoJQU2jjRnIzM6JJ9OfLpQocO5sboZFsZFG8YVxkt0vtzmJYqzTWQeCRMLtsEjB5GwNAYILP9W13j9JGEymJ+lVJ0a2QDfsEZSWJtI7nPXaccsCRrtdH1O0qjnhLru7jCiPfVrLdKwYc6g1Y8I33HnTQ7ikRvZKNktlmVJE9sjT/5lql/oqlzpKDiEkSkmy8XQbGrNOBx0hIgqX2Ylgtj61zVmISNiybhGazyTNTM/qSHWfthlI3VoI6iJSLwm0VXWKph58DUJ6MXDBPUI4tiOhIJSwvdGEIiQtvjrNp4cS0SDLOl+7hyuB4H4uy3R6cpW8DwBNzcytKim7DZFQUdO7N8ZsXeCVw+NKeAp6OcGWj6SwQSBBpwtg625e5H35+ZSTc98SBsZdV32axIAWVZsOUmKDoQoqgFMURIWWZNOXuE8MBwAsVEx3GoY2HT5O5e8mbo0zKc/3ddFcLIhakwqV2aEntBIC5225bfsgpQs0m8R03/boG4NRurwOIaPEk3e/hwtt+SW4nKpztCEjQbi+G1XJjXV/z3K0rISE2Q0rrnZbDUJFOFhAHbD15GuBnxrlqKRExMwjqMMUiSvzlt8KsvPNKD47z0u+vhrJSsMCTXW0fBQBcdtmyB1UvvzyOJ5b0IRAc4JzLzbKnGhDbwQx8b64z2bcXgXC6phS0O4thtdRYp8Utm4RmM/osE43eo0T0pFYmXxMqaEPO/ntkZJXs9DGl0ppP6nzzki/e/HxSfi6SwoCIUnAsTx1ySDQuuJKfy5IblaAm0Uy+NySbOVl4UxnwnktiP/FMkXC67RKbo/o65ezKNAGHhET6Ka0NSJFEEZBKo6CsSOc736IpUrkqUbq16CS/dTJgaljSbRJfE9L1T47W3vfl53JcDgAIO70WETEReaDml/B8s5NbxuOEkChiSO5HmsGxJtTXodebu/XTv1w2CSon4ZkGZEB7DpnypsfXmDQ8zbZEvGvOdm/9aqc/uu1HRU6EnHVwzGsfe+yxYMUaEJst0fY3IvIEkcrsuifR/vaK8JDHvNBU4iRNON6ccRIsdVphtdxY55RZJgmPBUqptQCgSZNKNMCT+MT5UiEcxdBQNdrb5YFZee9aClFQYqqSRCzJCay1cE4OCDvuBbFBX3YUREQiTVGnbnxhRwQ/rARVxDsXyJ0l4YWgObC9VZxEYxMNEN8ncEZCKHru689AQrMZfZawu+YwUuqAyKwr74JczF/sBSDnG5LPqkBErETkEdEBWCC5JYUhS20O+UW25CQSZiF2jqVSDayVEwEAZ5yxsrWd9fEcn5PpyAnHk3g8GO2It7nnb0bKwIeBD34kSIyg3WmF1VJ9nelj7yTMRZ+FDL2yUqoHIOJoSk3FJqngjItagLzZUqREKwOAHlECeVi0BouIyGD4yV7UI4VM2e+asRBzqQQHeV0Uuk2u6ICLuOxMr3rLATe0u4vfr1UaOs73YmnORztJkyhxXgkJiE0pZ044NlnINMRJsNhpheVSYx06PPf15nAS1h/4RLxTov480EEkuTHYWZdMJxOzkY0flSlHV6KVAYEeVo7lASmVEC+SeOfyDK50usJ1NukgYGFtWy0wcE793ocOBpFb6RpncsqKWPWepU6rrZUxAnGp9eF8lCNOUjufv2RSL55D9l8DRtDutsJqUF9n2Q2Q0Gw21cYdG93fvfP2g7XW5/RdDwpKDw0704saKEVQftKIjS5BCA8oAd3tj5MUz1rIH5RRDFNzO7XE1jmuNdYI0ftjr7oiAoiIZ5uz5pS3Pf8+dtgUyZXSYHC2bCwZoInP8kBPB4FzZEk+Yoq1RBjBUm8prAX1df1+f27bR+8+aENzg202Zw0QmZ9SRd5fLTfWiLCj2PzQiNDTv0YaIWUli+Q/BXU3Nf7lX19L2vyjsEO0Vy1+9OdJZaHMjfxGOyW5kYrK0UL6xP76w+/B7KzBCk8mTGr5P/rq45uUMtudc2DHLIAS5qQEHdn1XAiaABsTgkzi2deUlLT4OSdhyVSDdqf1M8tu8oLPHPc4AHzx3T95GUA7BSixdcKI/BJ8cuHlKX5tystNskEtISIFZv4zRWLuZuueEmX8scGBXEDgSQ+ygy4K5onEsZNKtQRxV+MOCeCNiC/3JzEFr37bQdNhaDfHWwhKnLDvC3zHGwOZNzupiYqlZAj4saYEne5iWAnq65So265+38+eH5cgrimXqiUAkfQXMtx8TuANqnstzET6BYBSBsL8VBBU7iYAqP3Lr25EfexsWWw5AnRua72wpU5eYSxpyvhnPFA042vRqBtZbF1nX3bE1MA44LI1IWqo/O+rH9+koDJNSCq4OdteMD0FE8RD/AMnpImAmSFObCVomKXOwk+csw9XTOPcdq/lWKCj3+Vctp1FZpFg+hKfRmnJ4jPEVYK67vbbN33o2tPPiWy0o1sEvmQXjnjBkEWL3OhK8egXNtxqWWmMv1n/34e2Fwdjl68JUUPlNe84aDp0mSYwC3vONMuUGUPBzyVtKDjjXFhLpt1dcEaXXlkJ6ud2wjYDpLOzF4rFtUJEBP/a66yTN0lBcks6migVcwu3FpeElPbqW5kGeHYuM0Xe8QOSHQ+WZNMAjCwsWBkb26TufnDVSDjjPxw87ZzbHH1AFZHg2XweFg257DlIzuRkOQVyDZ1onND1uRd2XNR19aeeC+MoUugOExXMTzo3Ikpp3bVLS9AqJkBEdY48dJcAN6NWhwg5lrxzSQ/FGBodJTu1mcp5M6VG5udXn4QLD552NtwcJzUpCb5zlWF1Iu+Qpux13nEEScEvTfqgANJSPEFkaHbr+QU/4PRIIJCrmBoI+uYPbXvNrmZTlMoUQ7ZJGELAKl9RHAQdXlImnPkKvzHiVc+MtOYtj41twl2rR8KGd79g2jq7mYSgQIqFeVSsz/EFkmmDeNkxCkneMMkeHL0q1HVy42tIHXNhdEg5cQBkGwCsv7cwvhXc8+A/oVo7WbrddDjXPzYgd2yMFN+j7P3ANxGL8QmDVmsaxx+xzyOKiWO+9b8/ukkp2u6cg3OOwaIkPQGlYG64YD6LzyX1LfZK4Gn9Kx/mZpol2XE8uZK4j5kAAheYiu7bzu0fuObUV+U3ZGajrI+hrmBS3vai5KqMOeH2wRd55lP4iAxa8xZjY5v0nb/cXhwRX5kmzJp/9+EXTDNHmkBCmTnyo55ipZQL4HtmqngGWnTlTcIVjnuhQv83PzHtmSdCNDEh6opk5CX/r8X7YfqeB7+Pav10WVpyoHgSYRi+IqOlfdQT0bGJltesMVjwNMGbRFtpsnbLFQ9tAunt7BwsOxYWJS4v7fD6xRhSRR2InFJt4MLkhQzcTwN3kYL0AxBxZVPTvbD9g/ddc8q/jYaIo153Jn07ot0lp+gS6XYAgvabTT7wQ8EfdeakpzJaBFopg6VW/23f/9Wm5uRXtxenk1earJ15yYunnXWbAQVwlKylvBf8wSDAku8f5LRBvKHreNxQ8rOh6f6w5PvCseMVEOm+64I0LonG0rM9seKWpAaRU3c/+D9kYvyDmJ+3IDLLk3gZ+rgWgVIKoSY+/3sPLbzkyw/XgmOeV+r0Fqc//q3zV00TvvHJX24iUbFPYIZXtkhNNOero7mZojiPSEocftuz2IXzcRli85PQNqyVxoJ2uLj1vV955UdmpkRv3JGNaRaljgGATec/YqF1L2o1IyJ2APyhB37mjOZewT/mmofH7VHlUqe3ZKtBY1Pz7K+tmia88dKjpm0Ybo6lVDnHnJakWcCO0zJ1Cr6vqP6hcX60MXAKlXctwyIlAhHZUlAN2v3WvfY3T/wXAJjagZyAqUIZUiCiceyxfYF7h7TbfShtEmL2bmaGPzcMfPenZYVQQIDp2iVbDuqrSsJ5H3/JtLVuM0AAQzEz52pEfgSD/KGBRcvpT2MMKna2sEfFoXQiVtCmb7t9gN/xwW+f2ZuZEl08uEMNqQU7zM4avPyonYBciFIpMX4y0r6P+BkNPvvv33TDJVsJ6puaZ29fNRI2fuol09bazfCjIxZvrAX52lDOGQsGJvFGCODgWUex3Rcho8sQwYXvvfqUnc3JWeObnpG/X/QHuOuXl2Js4hNYiM6FS3XuGfpdOfC/+9DCMV/1wfePNUtlx1ZKddPrd6Yvu2njZn9EfF98wjUfuectmtS1jh2ERYiI/BLEgP3OPVd4DH44Ll5wl2uNCgCulcb0Yn/hY++96qRPFu3+syUgOzv/rgc+i8bYxVhsOUBUdhziCPBZoLRCqCLJP/qaXeP8okom+f5WOfzz5MjWgobp2c70x7755s3+iPhKSLjlA/eXz/zbo3tf+fDdbwlUcK21oUiyOeGdGugV4QaTKf/A2KGg5+r+IhCuBg3dCVtb3/3lk+LjaqIYaXkEeLkBAOCuB7ai3tiCxcWIhIEIarjZOfqaXePuRWVFYWFfJC/9XgFL2Wqpbnp26bqDDnzxWy/6+5PC5uSsweRt3HyWw77NZlOdgTPUhuYGe9U7ZyvSmPhCoEsXWLYc1b+Qc6C5sntxCg8FbUC+6ZKrOEO4WmroTq915UVXnbiPBzZlnyY7N/+f79+KxnieBBlt84++Zldqdohor9LvF7KIyJaDmunbzp0Eesdf33DuPVH8PKPve+JAisjIjz42m5cT5s5Q6w98QpITSb747p+8jLS6ul4ZP6HdXZSsKlwEnryJa8pXVgaSqkIFIJZuEeFqqa474dKVF33pFRcngvBMQrPsQ/tSElp5TRgFvoScrjANJYCGVw4BsqWgYqzr90D0mUAFn7tkx1nP6tC+v3vn7QebkrxfafXRclAt98OuA5GmwQNN82do+jHFkLpXQeJ948PVYEx3wtaywH/2BAwjoZ5pghahUZKfgTwIflY1LJRx4wU0RcoRKV0J6ujbzh4AN5LW3zGQn7Ta/Ig3hxp0+0sv0KATSanXaaXOqZbH1/RdBxBx8cxIztwNxPAFIopLOANhaDYtxpVSQ3f6i8sGf3kEjCBBtVpOE3RoNJ//vQcHwd+b9OdsPxXNUHy2EAkpYkVGV4I6GA6Ww5CIniSipxRpkFJrlVIHlINqUDJl9GwHIuwUaZUc4TXQSElOORHfFyE/ZjAS/JQBrpYaur1C8JdPQIEEtfP+rTI+sUU6i+H5331w6eivFuL8nPQXqoO5JIa889gKh16AQEqBoAREjghKK6O0MtDaxENQUdOIFDERMUHpaHQka5YjV6/JxeyeraERNURvDVWyClM1lvx3rRD8lRFQ1IS7Hvzs+XMPXXzMl34V2iPLAULJFWuLi8w0zPn6bTtC2mPNzdmoXL9V4gU5IVKIFlYUiGLQSaXLc0l/1tt4HigZD/gEohEZP60q+MMz4WdHQPLlBYTjj/jI0dfu2mqOfl4gYdTuGUUvjeI/5xtH7Zj7u7OSiK6CxN83KUz+981gYJJavPkdGRzsHVV7QKEVuIrgr5yAmIRms0kQoebtf/GRTm/xyoqp6WysqNi4GCxkFSWQRlVZ/WVbycrBmR+kXE2qCKw/QZeRwR7ofkEuP/wr+ZPEVxV8YIXfH5AODc/NSZNIzc3Nyffvv+HW1xz1+omyqZ/q2DLlDOxenO8w8+M9PrDyM7Dqo9LVz6L++NYvH4cNeT9Dul2e+OxztLO6PqCoDN4Zyf/1rGu2VkxjS9e1XTQY6Y/E5D88YdDxZseAZRNlOVtOWcM77xe8wdiBqbU84fCdvg++fyRNli0LCHF5YWlVwd9nDUg1wTs3/7b7b7j1tKPOmaiUaqfGqT9RFv5g4PydgiYUxjhyszhE+ahp8AgdGpD4QgiQi8q8GtRQTYj7XnF5YenKi768uuDvmw8Y1AJuIhpH//jN51/c7bevrASRT8hqITTEJGDkkJOMUlEa0Y6QITXkYm3HHzAAcucn+wsflCZZ9SjDvWr1wV81DRiuCV+/9bQjz56olOqnOrEsqbVGfnOc/PxAefeL4akqmCgM1Zh8TjHsuwqGHDhDxbOtEoc7prt28cqLvnTifgF/1QkYRsJrjjpnvFJqnGbZRh+Mct+hMQRwDJqg1Px4R+EXnLH/ej+/QNERU9EMDuQoDIBqpXGVlJT3F/j7hYABEn5x/XdOP/KNrmTKr408mjiKnLOnCcVCHIb6AKQOdzBj9gHN+ZQh1dacQ845Z3FaaR2YMnXC9sfec9VJl+5P8FctCho9CSSJPEvz9dsvgKJ/KOlKyXIvhJBJ0Bk6WxmdaVEoVQwBf8BR01CHnjldVfg+G0pOt3XloGpC2+2z0IXvu/qV2/z3v78wUvuTAIpT1pmpGd381uZtztlTQ9e7t2IaQWwHHIaVA4aUxkY2lWjUZMLgYIMUphziRM4JhGqlMdO33XsVqVe/7+pXbosa6PsX/P1OQILDxh0bXXNy1nzi5vN3PhnuPrEbtrcSCCVT1RSR4FAoUw8tVQz7qqXCDvFAPV+K3ZX02yodIK5kqppIod1f+J8HLNVPuOiqk+7MGuj7F/z9boKKP/75+Z88+/pTWMkVZVM9XQBY1+Po+97iie1CWXrAIePZPK+8laFkSk2YoKhkqophX6//QPS6pL3fuWUH0fvcXQD/Q+egMQv7JjaoVIi3njdeQJ1SUmXT9baoG97ELCLI5X4SztG+wBgmLP2hsVJRYMoRFCkdTmogdkhdP3bodQVH7j6lOsT4Kd2+DnLHykByU80cjLFiZp/6tzrz4KoC0DqrLKp1okIoetDhAGQjR2pIiRbckOdtkRaFB/0ATJaGZRNBSBCN2wvEehmgLZ98Kun3ZzUmGc8gXiuf35nBKQZ9GTTNOea6djJf5u66XBr+UxNdKYQnaZIrY2OCSNYF0LAYHYYJIBglIFWBkaXQKC4MyZPkcIPIXQLtLrlQ9tesyv72ysfefmjIcD3D/cdOyX+cO7fvOl7zyfTP45YjgfhOCI6kkCHgfDC6Av8chrAROphEjwiRA8o4G5A3xUElbvfv+1Vv82q6KLW3wt6Lu383n7+H45sFZym2mugAAAAAElFTkSuQmCC',
        homepage: 'https://www.mycloudwallet.com',
        download: 'https://www.mycloudwallet.com',
    })

    /**
     * WAX Cloud Wallet Configuration
     */
    public url = 'https://www.mycloudwallet.com'
    public autoUrl = 'https://idm-api.mycloudwallet.com/v1/accounts/auto-accept'
    public loginTimeout = 300000 // 5 minutes
    public allowTemp = false
    private mobileAppConnect: MobileAppConnect | null = null
    private options?: WalletPluginCloudWalletOptions

    /**
     * Constructor to allow overriding of plugin configuration.
     */
    constructor(options?: WalletPluginCloudWalletOptions) {
        super()
        this.options = options
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
        if (options?.allowTemp) {
            this.allowTemp = options.allowTemp
        }
        if (options?.mobileAppConnectConfig) {
            this.mobileAppConnect = new MobileAppConnect(options.mobileAppConnectConfig)
        }
    }

    /**
     * Performs the wallet logic required to login and return the chain and permission level to use.
     *
     * @param options WalletPluginLoginOptions
     * @returns Promise<WalletPluginLoginResponse>
     */
    login(context: LoginContext): Cancelable<WalletPluginLoginResponse> {
        let promise
        // if is android, ipad, ios, show login prompt
        if (isAndroid() || isIos()) {
            promise = this.showLoginPrompt(context)
        } else {
            promise = this.waxLogin(context)
        }

        return cancelable(promise, (canceled) => {
            console.log('[login]canceled', canceled)
            throw canceled
        })
    }

    async showLoginPrompt(context: LoginContext): Promise<any> {
        let directConnectPromiseResolve: (value: any) => void
        let directConnectPromiseReject: (reason?: any) => void
        const directConnectPromise = new Promise((resolve, reject) => {
            directConnectPromiseResolve = resolve
            directConnectPromiseReject = reject
        })
        let webLoginPromiseResolve: (value: any) => void
        let webLoginPromiseReject: (reason?: any) => void
        const webLoginPromise = new Promise((resolve, reject) => {
            webLoginPromiseResolve = resolve
            webLoginPromiseReject = reject
        })

        const elements: PromptElement[] = []
        if (this.mobileAppConnect instanceof MobileAppConnect) {
            elements.push({
                type: 'button',
                data: {
                    label: 'Open My Cloud Wallet app',
                    variant: 'primary',
                    onClick: async () => {
                        try {
                            if (!(this.mobileAppConnect instanceof MobileAppConnect)) {
                                throw new Error('Mobile App Connect is not initialized')
                            }
                            if (!context.chain) {
                                throw new Error('A chain must be selected to login with.')
                            }
                            const user = await this.mobileAppConnect.directConnect(context)
                            // handle proof
                            const signature = (user as any)?.proof?.data?.signature
                            const identityProof =
                                signature &&
                                IdentityProof.from({
                                    chainId: ChainId.from(context?.chain?.id),
                                    scope: Name.from(context.appName || ''),
                                    expiration: TimePointSec.from(
                                        new Date().getTime() / 1000 + 60 * 60
                                    ),
                                    signer: PermissionLevel.from({
                                        actor: `${user?.account}`,
                                        permission: user?.permission || 'active',
                                    }),
                                    signature: Signature.from(signature),
                                })
                            this.data.identityProof = identityProof
                            this.data.proof = user?.proof
                            this.data.isTempAccount = (user as any)?.isTemp
                            this.data.whitelist = (user as any)?.whitelistedContracts
                            directConnectPromiseResolve({
                                chain: context.chain.id,
                                permissionLevel: PermissionLevel.from({
                                    actor: `${user?.account}`,
                                    permission: user?.permission || 'active',
                                }),
                                identityProof,
                            })
                        } catch (error) {
                            directConnectPromiseReject(error)
                        }
                    },
                },
            })
        }
        elements.push({
            type: 'button',
            data: {
                label: 'Login with web',
                variant: 'primary',
                onClick: async () => {
                    try {
                        const result = await this.waxLogin(context)
                        webLoginPromiseResolve(result)
                    } catch (error) {
                        webLoginPromiseReject(error)
                    }
                },
            },
        })
        // Show the prompt UI
        const currentPromptResponse = context.ui.prompt({
            title: 'Connect to My Cloud Wallet',
            body: 'Connect My Cloud Wallet on your mobile device',
            elements,
        })
        currentPromptResponse.catch((error: any) => {
            console.info('User cancelled modal::', error.message)
            directConnectPromiseReject(error)
        })
        return await Promise.race([directConnectPromise, webLoginPromise])
    }

    async waxLogin(context: LoginContext): Promise<WalletPluginLoginResponse> {
        if (!context.chain) {
            throw new Error('A chain must be selected to login with.')
        }

        // Retrieve translation helper from the UI, passing the app ID
        const t = context.ui.getTranslate(this.id)

        let response: WAXCloudWalletLoginResponse

        // Create common search parameters
        const searchParams = new URLSearchParams()
        const nonce = context.arbitrary['nonce']
        if (nonce) {
            const base64Nonce = btoa(nonce)
            searchParams.set('n', base64Nonce)
        }
        searchParams.set('returnTemp', this.allowTemp.toString())

        try {
            // Attempt automatic login
            const autoLoginUrl = new URL('/login', this.autoUrl)
            autoLoginUrl.search = searchParams.toString()

            response = await autoLogin(t, autoLoginUrl.toString())
        } catch (e) {
            // Fallback to popup login
            const popupLoginUrl = new URL('/cloud-wallet/login', this.url)
            popupLoginUrl.search = searchParams.toString()

            response = await popupLogin(t, popupLoginUrl.toString())
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
        this.data.isTempAccount = response.isTemp
        this.data.proof = (response as any)?.proof

        console.log('waxLogin::response proof', (response as any)?.proof)
        const signature = (response as any)?.proof?.data?.signature
        const identityProof =
            signature &&
            IdentityProof.from({
                chainId: ChainId.from(context?.chain?.id),
                scope: Name.from(context.appName || ''),
                expiration: TimePointSec.from(new Date().getTime() / 1000 + 60 * 60),
                signer: PermissionLevel.from({
                    actor: response.userAccount,
                    permission: response.permission || 'active',
                }),
                signature: Signature.from((response as any)?.proof?.data?.signature),
            })
        this.data.identityProof = identityProof
        return new Promise((resolve) => {
            if (!context.chain) {
                throw new Error('A chain must be selected to login with.')
            }
            localStorage.setItem('connectedType', 'web')
            // Return to session's transact call
            resolve({
                chain: context.chain.id,
                permissionLevel: PermissionLevel.from({
                    actor: response.userAccount,
                    permission: response.permission || 'active',
                }),
                identityProof,
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
        let promise: Promise<WalletPluginSignResponse>
        const connectedType = localStorage.getItem('connectedType')
        if (
            this.mobileAppConnect instanceof MobileAppConnect &&
            (connectedType === 'direct' || connectedType === 'remote')
        ) {
            console.log('mobileSign')
            promise = this.mobileSign(resolved, context)
        } else {
            console.log('waxSign')
            promise = this.waxSign(resolved, context)
        }
        return cancelable(promise, (canceled) => {
            throw canceled
        })
    }

    async mobileSign(
        resolved: ResolvedSigningRequest,
        context: TransactContext
    ): Promise<WalletPluginSignResponse> {
        if (!context.ui) {
            throw new Error('A UserInterface must be defined to sign transactions.')
        }
        if (!(this.mobileAppConnect instanceof MobileAppConnect)) {
            throw new Error('MobileAppConnect is not initialized')
        }
        let mobileSignCancelResolve: any
        let mobileSignCancelReject: any
        const mobileSignCancelPromise = new Promise((resolve, reject) => {
            mobileSignCancelResolve = resolve
            mobileSignCancelReject = reject
        })
        const t = context.ui.getTranslate(this.id)

        const expiration = resolved.transaction.expiration.toDate()
        const now = new Date()
        const timeout = Math.floor(expiration.getTime() - now.getTime())
        console.log('timeout', timeout)

        let promptPromise: Cancelable<PromptResponse> = cancelable(new Promise(() => {}))
        if (!allowAutosign(resolved, this.data)) {
            // Tell Wharf we need to prompt the user with a countdown
            promptPromise = context.ui.prompt({
                title: 'Sign',
                body: `Please complete the transaction using the Cloud Wallet app.`,
                optional: true,
                elements: [
                    {
                        type: 'countdown',
                        data: expiration.toISOString(),
                    },
                ],
            })

            // Clear the timeout if the UI throws (which generally means it closed)
            promptPromise.catch((error) => {
                clearTimeout(timer)
                mobileSignCancelReject(error)
            })
        }
        const timer = setTimeout(() => {
            if (!context.ui) {
                throw new Error('No UI defined')
            }
            promptPromise.cancel('The request expired, please try again.')
        }, timeout)

        const signPromise = this.mobileAppConnect.signTransaction(resolved, context, {})
        return Promise.race([
            mobileSignCancelPromise,
            signPromise,
        ]) as Promise<WalletPluginSignResponse>
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

        let promptPromise: Cancelable<PromptResponse> = cancelable(new Promise(() => {}))
        if (!allowAutosign(resolved, this.data)) {
            // Tell Wharf we need to prompt the user with a countdown
            promptPromise = context.ui.prompt({
                title: 'Sign',
                body: `Please complete the transaction using the Cloud Wallet popup window.`,
                optional: true,
                elements: [
                    {
                        type: 'countdown',
                        data: expiration.toISOString(),
                    },
                ],
            })

            // Clear the timeout if the UI throws (which generally means it closed)
            promptPromise.catch(() => clearTimeout(timer))
        }

        // Create a timer to test the external cancelation of the prompt, if defined
        const timer = setTimeout(() => {
            if (!context.ui) {
                throw new Error('No UI defined')
            }
            promptPromise.cancel('The request expired, please try again.')
        }, timeout)

        // Wait for either the callback or the prompt to resolve
        const callbackResponse = await Promise.race([callbackPromise, promptPromise]).finally(
            () => {
                // Clear the automatic timeout once the race resolves
                clearTimeout(timer)
                promptPromise.cancel()
            }
        )

        if (isCallback(callbackResponse)) {
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
                    // If transaction modified, return a new resolved request to Wharf
                    const request = await SigningRequest.create(
                        {
                            transaction: responseTransaction,
                        },
                        context.esrOptions
                    )
                    // Created a resolved request
                    result.resolved = new ResolvedSigningRequest(
                        request,
                        context.permissionLevel,
                        Transaction.from(responseTransaction),
                        Serializer.objectify(Transaction.from(responseTransaction)),
                        ChainId.from(context.chain.id)
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
                response = await autoSign(t, `${this.autoUrl}/signing`, resolved)
            } catch (e) {
                // Fallback to poup signing
                response = await popupTransact(
                    t,
                    `${this.url}/cloud-wallet/signing/`,
                    resolved,
                    timeout
                )
            }
        } else {
            // If automatic is not allowed use the popup
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

    async logout(context: LogoutContext): Promise<void> {
        if (this.mobileAppConnect) {
            await this.mobileAppConnect.cleanup()
        }
        return
    }
}

function isCallback(object: any): object is WAXCloudWalletSigningResponse {
    return 'serializedTransaction' in object
}
