# tron-transfers-downloader
Node.js script to download all TRX and TRC10 transfers to/from an account to a CSV file, using TronGrid APIs.

For a simpler script that just dumps CSV data for all transactions please see [tron-transaction-downloader](https://github.com/ColonelJ/tron-transaction-downloader).  For a script that uses Tronscan APIs instead and supports TRC20 see [tronscan-transfers-downloader](https://github.com/ColonelJ/tronscan-transfers-downloader).

## Usage
```bash
yarn
yarn start <tron-address> <output-csv-file>
```
