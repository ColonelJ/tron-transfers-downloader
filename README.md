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

### Additional features

#### Koinly

There is an additional script that can convert the output of the main script into [Koinly's CSV universal format](https://help.koinly.io/en/articles/3662999-how-to-create-a-custom-csv-file-with-your-data).

To use it change to the directory of the script and run:

```bash
yarn koinly TRON-ADDRESS input.csv output.csv
```

Where `input.csv` is the output file from the main script and `output.csv` is the file to be written in Koinly format.

After generating the file, you should manually go through the CSV, looking for any pairs of records (sending and receiving) that form a trade of one token for another.  For these you should cut and paste the received amount and received currency to the sending record, delete the receiving record, and edit the description of the sending record as appropriate.

The currencies written in the CSV include a description (so that you can detect fakes).  You may need to delete the records involving fake/spam tokens, and change the currency fields for the real tokens to a simpler format (using find/replace) so that Koinly can recognize it and assign it a USD value.  E.g. instead of `BTT (BitTorrent; 1002000)`, which can be verified as authentic due to its ID of 1002000, you can just have `BTT` as the currency in the CSV, and any other records containing BTT (with other fake IDs) should be deleted.  In case of token migrations, you may wish to have both the old and new tokens listed as the same currency, and if you missed the swap, add a record to the CSV transferring the balance out of your account with a `Label` of `lost`.

Finally, labels are not added automatically to any transfers, except for withdrawing TRX rewards (which are labelled as `staking`) so you may wish to add labels.  See the [link](https://help.koinly.io/en/articles/3662999-how-to-create-a-custom-csv-file-with-your-data) to see which labels are valid.
