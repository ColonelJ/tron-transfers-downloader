require('dotenv').config();
const fsPromises = require('fs').promises;
const parse = require('csv-parse/lib/sync');
const stringify = require('csv-stringify/lib/sync');

if (process.argv.length < 5) {
  console.error('Usage: node koinly.js TRON-ADDRESS input.csv output.csv');
  return;
}
const address = process.argv[2];
const inputFile = process.argv[3];
const outputFile = process.argv[4];

function formatDate(date) {
  const YYYY = date.getUTCFullYear().toString().padStart(4, '0');
  const MM = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const DD = date.getUTCDate().toString().padStart(2, '0');
  const HH = date.getUTCHours().toString().padStart(2, '0');
  const mm = date.getUTCMinutes().toString().padStart(2, '0');
  const ss = date.getUTCSeconds().toString().padStart(2, '0');
  return `${YYYY}-${MM}-${DD} ${HH}:${mm}:${ss} UTC`;
}

function processRecord(record, index) {
  if (record.length !== 10) throw new Error(`Record ${index + 1} has wrong length`);
  const transaction_id = record[0];
  const timestamp = record[1];
  const transaction_type = record[2];
  const transfer_type = record[3];
  const from_address = record[4];
  const to_address = record[5];
  const amount = record[6];
  const asset_symbol = record[7];
  const asset_name = record[8];
  const asset_id = record[9];

  let date;
  if (timestamp) {
    const match = timestamp.match(/^\d+/);
    if (!match) throw new Error(`Record ${index + 1} has invalid timestamp`);
    date = formatDate(new Date(parseInt(match[0])));
  }
  const currency = `${asset_symbol} (${asset_name}; ${asset_id})`;
  const label = transaction_type === 'Withdraw' ? 'staking' : '';
  let description;
  if (from_address && to_address) {
    description = `${transaction_type} ${transfer_type} from ${from_address} to ${to_address}`;
  } else if (from_address) {
    description = `${transaction_type} ${transfer_type} from ${from_address}`;
  } else if (to_address) {
    description = `${transaction_type} ${transfer_type} to ${to_address}`;
  } else {
    description = `${transaction_type} ${transfer_type}`;
  }

  if (from_address === address) {
    return {
      date,
      sent_amount: amount,
      sent_currency: currency,
      label,
      description,
      tx_hash: transaction_id,
    };
  } else if (to_address === address) {
    return {
      date,
      received_amount: amount,
      received_currency: currency,
      label,
      description,
      tx_hash: transaction_id,
    };
  } else {
    return null;
  }
}

async function main() {
  const input = await fsPromises.readFile(inputFile);
  const records = parse(input);
  const processed = records.map(processRecord).filter(r => !!r);
  const output = stringify(processed, {
    header: true,
    columns: [
      { key: 'date', header: 'Date' },
      { key: 'sent_amount', header: 'Sent Amount' },
      { key: 'sent_currency', header: 'Sent Currency' },
      { key: 'received_amount', header: 'Received Amount' },
      { key: 'received_currency', header: 'Received Currency' },
      { key: 'label', header: 'Label' },
      { key: 'description', header: 'Description' },
      { key: 'tx_hash', header: 'TxHash' },
    ],
  });
  let koinlyFile;
  try {
    koinlyFile = await fsPromises.open(outputFile, 'w');
    await koinlyFile.write(output);
  } finally {
    if (koinlyFile !== undefined) {
      await koinlyFile.close();
    }
  }
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
