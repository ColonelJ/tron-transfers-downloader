# tron-transfers-downloader

Node.js script to download all TRX, TRC10 and TRC20 transfers for an account using TronGrid and write them to a CSV file.

For a script that dumps CSV data for all transactions (not including internal transactions nor TRC20) please see [tron-transaction-downloader](https://github.com/ColonelJ/tron-transaction-downloader).

## Usage

### Software requirements

You may need the following software installed in order to use this tool:

- Git
- Node.js (version 12 or above)
- [Yarn Classic](https://classic.yarnpkg.com/en/docs/install) (i.e. version 1.x.x, NOT version 2 or above)

### Installing the script

Please ensure Git is installed on your machine, go to an appropriate directory and use the `git clone` command with the clone URL provided by GitHub to get a copy of the code.

### Obtaining an API key from TronGrid

You may need a TronGrid API key to use TronGrid according to the documentation.  This key should be kept secret and not shared with others!  If you share it by accident, you should delete it and create a new one.

1. If you don't have one already, create an account at [TronGrid](https://www.trongrid.io/) and activate it using the link sent to your email.
2. Log in to your TronGrid account.
3. Click the Create API Key button.
4. Enter any name you want for the API key.
5. On the API keys page click the Check button under View API Key.  You should see your API Key and several security settings for the key (please don't change these).
6. Create a file called `.env` in the directory you have this code cloned to.
7. Copy the API key from the TronGrid website into your `.env` file preceded by the text `TRONGRID_API_KEY=`.  Your `.env` file contents should look like the following:

```
TRONGRID_API_KEY=12345678-1234-1234-1234-12345678abcd
```

### Running the app

In a terminal:

1. Change to the directory of the script.
2. Run `yarn` on its own to install the dependencies.
3. Run the following command substituting in your TRON wallet address (square brackets indicate optional parameters - don't enter the brackets!):

```bash
yarn start TRON-ADDRESS [output.csv]
```
