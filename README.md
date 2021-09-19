# Aave rewards accumulator

**Important: If you use this software, you do so at your own risk. The software could contain bugs or possible security vulnerabilities that could lead to losses or a complete loss of assets used in the operation of this software. This software does not contain any investment advice and nothing related to this software should be considered as such.**  

## What is it?

This node js app can be used to automatically accumulate your [Aave](https://aave.com) loan deposits with the incentive tokens that Aave rewards to depositors/loaners through their [liquidity mining](https://docs.aave.com/developers/guides/liquidity-mining) programs. The software is mainly intended to be used in the [polygon](https://polygon.technology/) side chain, but it could be used in the main Ethereum chain as well.

### Why?

To automatically put the mined award tokens from Aave back to "work" gaining interest and turbocharge your APY. The award tokens are easily just left standing unclaimed, but the cheap transaction costs of the polygon chain allow for very frequent claiming and re-depositing of assets in the Aave protocl. 

## How does it work

Every given time interval the software:

- Claims your accrued aave incentive tokens (WMATIC in polygon)
- Swaps these award tokens to the tokens you want to automatically deposit back to Aave (like USDT)
- Deposits the swapped tokens (like USDT) to Aave lending pool

The faster you accrue the Aave awards tokens, the more frequently this sequence should happen and this frequency can be configured for this reason.

[Quickswap](https://quickswap.exchange/) is used for doing the token swap, it is a Uniswap fork, so the API is compatible: https://uniswap.org/docs/v2/smart-contracts/router02/.

### Prerequisites
 
- Eth wallet (and private key for the wallet)
- You want to have frequent deposits to a loan pool in Aave
- You have either deposits or loans in Aave that gives you award tokens like WMATIC
- You have some amount of the chains native tokens (MATIC in polygon) for gas
- Access to an ethereum network provider like [Infura](https://infura.io/)

## Running

You will need [npm](https://docs.npmjs.com/) to run the project. Create a `.env` file in the root of the project and fill it with your configuration values. You can use the `.env.example` as an example. The frequency at which the script is ran is controlled with a [cron](https://cron.help/every-12-hours) pattern which defaults to every 12 hours.

#### Dev

1. run `npm install`
2. use `npm run dev` to make the program start with the cron  
Or use `npm run dev:single` to make the program execute a single pass of the sequence

#### "Prod"

Easiest way to run the software is with docker.

1. Build the image with `docker build -t aave-accumulator .`
2. Start the program `docker run -d aave-accumulator`


## Notes

The script is intended to be used in Polygon, but it works similarly in the Ethereum main network, you just need to do some tweaking in the code. Also you should consider that Ethereum transaction fees will eat profitability so the frequency needs to be thought very carefully.