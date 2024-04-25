# Notcoin Jetton

Jetton forked from https://github.com/ton-blockchain/stablecoin-contract but with removed governance functionality.


# Details


Notcoin represents a [standard TON jetton smart contracts](https://github.com/ton-blockchain/token-contract/tree/369ae089255edbd807eb499792a0a838c2e1b272/ft) with additional functionality:


- Admin of jetton can change jetton-minter code and it's full data.

__⚠️ It is critically important for issuer to carefully manage the admin's account private key to avoid any potential risks of being hacked. It is highly recommend to use multi-signature wallet as admin account with private keys stored on different air-gapped hosts / hardware wallets.__

__⚠️ The contract does not check the code and data on `upgrade` message, so it is possible to brick the contract if you send invalid data or code. Therefore you should always check the upgrade in the testnet.__

# Local Development

## Install Dependencies

`npm install`

## Compile Contracts

`npm run build`

## Run Tests

`npm run test`

### Deploy or run another script

`npx blueprint run` or `yarn blueprint run`

use Toncenter API:

`npx blueprint run --custom https://testnet.toncenter.com/api/v2/ --custom-version v2 --custom-type testnet --custom-key <API_KEY> `

API_KEY can be obtained on https://toncenter.com or https://testnet.toncenter.com

## Notes

- The jetton-wallet contract does not include functionality that allows the owner to withdraw Toncoin funds from jetton-wallet Toncoin balance.

- The contract prices gas based on the *current* blockchain configuration. 
   It is worth keeping in mind the situation when the configuration has changed at the moment when the message goes from one jetton-wallet to another.
   Reducing fees in a blockchain configuration does not require additional actions.
   However, increasing fees in a blockchain configuration requires preliminary preparation - e.g. wallets and services must start sending Toncoins for gas in advance based on future parameters.

