# tron-transfers-downloader
Node.js script to download all TRX, TRC10 and TRC20 transfers to/from an account to a CSV file, using TronGrid and Tronscan APIs.

For a simpler script that just dumps CSV data for all transactions (no TRC20) please see [tron-transaction-downloader](https://github.com/ColonelJ/tron-transaction-downloader).

## Usage
```bash
yarn
yarn start <tron-address> <output-csv-file>
```
