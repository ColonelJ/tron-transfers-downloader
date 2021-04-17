require('dotenv').config();
const fsPromises = require('fs').promises;
const BigNumber = require('bignumber.js');
const axios = require('axios');
const stringify = require('csv-stringify/lib/sync');
const TronWeb = require('tronweb');

if (process.argv.length < 3) {
  console.error('Usage: node index.js TRON-ADDRESS [output.csv]');
  return;
}
const address = process.argv[2];
let outputFile = 'output.csv';
if (process.argv.length >= 4) {
  outputFile = process.argv[3];
}
console.log(`Writing to file ${outputFile}...`);
let csvFile;

const headers = {};

if (process.env.TRONGRID_API_KEY) {
  headers['TRON-PRO-API-KEY'] = process.env.TRONGRID_API_KEY;
} else {
  console.warn('WARNING: TRONGRID_API_KEY is not set, it is highly recommended to set it, please check the README for instructions!');
}

const tronweb = new TronWeb({
  fullHost: 'https://api.trongrid.io',
});

const trongrid = axios.create({
  baseURL: 'https://api.trongrid.io/v1/',
  headers,
});

async function queryTronGrid(url, params) {
  for (let retries = 0; retries <= 10; ++retries) {
    if (retries > 0) console.log(`Query TronGrid retry #${retries}`);
    try {
      const response = (await trongrid.get(url, { params })).data;
      if (!response || !response.success || !response.data) {
        console.error('Failed response from API:', response);
        throw new Error('Received failed response from API');
      }
      for (let i = 0; i < response.data.length; ++i) {
        if (!response.data[i]) {
          console.error('Missing object at index', i);
          throw new Error('Received invalid response from API');
        }
      }
      return response;
    } catch (e) {
      console.error('Error querying TronGrid:', e.message);
    }
  }
  throw new Error('Multiple attempts to query TronGrid failed!');
}

async function downloadAllTransactions(url) {
  const limit = 200;
  const params = { limit };
  let response = await queryTronGrid(url, params);
  let page_txs = response.data;
  let txs = page_txs;
  if (!txs.length) {
    console.error(`No transactions found for address ${address}`);
    return txs;
  }
  while (page_txs.length === limit) {
    let i = page_txs.length - 1;
    const timestamp = page_txs[i].block_timestamp;
    console.log(`Downloading at timestamp ${timestamp} [${new Date(timestamp)}]`);
    while (i > 0 && page_txs[i - 1].block_timestamp == timestamp) --i;
    if (i === 0) {
      throw new Error('Too many transactions with same timestamp');
    }
    const txs_from_last_page = page_txs.slice(i);
    params.max_timestamp = timestamp;
    response = await queryTronGrid(url, params);
    // Hack to deal with TronGrid cutting off early
    if (response.data.length < limit) {
      console.log('Received end of data, requesting again to confirm');
      for (let j = 0; j < 4; ++j) {
        response = await queryTronGrid(url, params);
        if (response.data.length === limit) {
          console.log('End of data not confirmed, continuing download!');
          break;
        }
      }
    }
    page_txs = response.data;
    for (let j = 0; j < txs_from_last_page.length; ++j) {
      const tx_from_last_page = JSON.stringify(txs_from_last_page[j]);
      const tx_from_this_page = JSON.stringify(page_txs[j]);
      if (tx_from_last_page !== tx_from_this_page) {
        console.error(
          'Transactions from previous page not matching at index',
          j,
          tx_from_last_page,
          tx_from_this_page
        );
        throw new Error('Transactions from previous page not matching');
      }
    }
    txs = txs.concat(page_txs.slice(txs_from_last_page.length));
  }
  console.log(`Downloading completed! (Got ${txs.length} transactions)`);
  return txs;
}

const trc10_cache = {};
async function lookup_trc10(id) {
  id = id.toString();
  if (trc10_cache[id]) {
    return trc10_cache[id];
  }
  if (/^\d+$/.test(id)) {
    console.log(`Looking up TRC10 ID ${id}...`);
    const response = await queryTronGrid(`assets/${id}`);
    if (!response.data.length) {
      throw new Error(`Failed to obtain information for asset ID ${id}`);
    }
    const info = {
      symbol: response.data[0].abbr,
      name: response.data[0].name,
      id: response.data[0].id,
      decimals: response.data[0].precision,
    };
    trc10_cache[id] = info;
    return info;
  } else {
    const url = `assets/${id}/list`;
    const params = { order_by: 'id,asc', limit: 200 };
    console.log(`Looking up TRC10 name ${id}`);
    let response = await queryTronGrid(url, params);
    while (true) {
      if (!response.data.length) {
        throw new Error(`Failed to obtain information for asset name ${id}...`);
      }
      for (let i = 0; i < response.data.length; ++i) {
        if (response.data[i].name === id) {
          const info = {
            symbol: response.data[i].abbr,
            name: response.data[i].name,
            id: response.data[i].id,
            decimals: response.data[i].precision,
          };
          trc10_cache[id] = info;
          return info;
        }
      }
      if (response.meta && response.meta.fingerprint) {
        params.fingerprint = response.meta.fingerprint;
        console.log(`Continuing to look up TRC10 name ${id}...`);
        response = await queryTronGrid(url, params);
      } else {
        throw new Error(`Failed to find exact match for asset name ${id}`);
      }
    }
  }
}

function convertToDecimals(amount, decimals) {
  decimals = decimals || 0;
  return new BigNumber(amount)
    .div(new BigNumber(10).pow(decimals))
    .toFixed(decimals);
}

function fromHex(address) {
  return address && tronweb.address.fromHex(address);
}

async function process_tx(tx) {
  if (tx.internal_tx_id) {
    if (!tx.data) return null;
    if (tx.data.rejected) return null;
    if (!tx.data.call_value) return null;
    const asset_ids = Object.keys(tx.data.call_value);
    if (!asset_ids.length) return null;
    if (asset_ids.length > 1) {
      throw new Error('Unhandled number of call value assets for internal transaction');
    }
    if (asset_ids[0] === '_') {
      return {
        transaction_id: tx.tx_id,
        timestamp: tx.block_timestamp,
        transaction_type: 'Internal',
        transfer_type: 'TRX',
        from_address: fromHex(tx.from_address),
        to_address: fromHex(tx.to_address),
        amount: convertToDecimals(tx.data.call_value['_'], 6),
        asset_symbol: 'TRX',
        asset_name: 'Tronix',
        asset_id: '_',
      };
    } else {
      const asset_details = await lookup_trc10(asset_ids[0]);
      return {
        transaction_id: tx.tx_id,
        timestamp: tx.block_timestamp,
        transaction_type: 'Internal',
        transfer_type: 'TRC10',
        from_address: fromHex(tx.from_address),
        to_address: fromHex(tx.to_address),
        amount: convertToDecimals(tx.data.call_value[asset_ids[0]], asset_details.decimals),
        asset_symbol: asset_details.symbol,
        asset_name: asset_details.name,
        asset_id: asset_details.id,
      };
    }
  } else {
    if (tx.ret && tx.ret.length > 0 && tx.ret[0].contractRet && tx.ret[0].contractRet != 'SUCCESS') return null;
    if (!tx.raw_data || !tx.raw_data.contract || !tx.raw_data.contract.length) return null;
    const parameter_values_present = !!(tx.raw_data.contract[0].parameter && tx.raw_data.contract[0].parameter.value);
    let amount;
    let asset_id;
    let asset_details;
    switch (tx.raw_data.contract[0].type) {
      case 'TransferContract':
        if (!parameter_values_present) return null;
        amount = tx.raw_data.contract[0].parameter.value.amount;
        if (!amount) return null;
        return {
          transaction_id: tx.txID,
          timestamp: tx.block_timestamp,
          transaction_type: 'Transfer',
          transfer_type: 'TRX',
          from_address: fromHex(tx.raw_data.contract[0].parameter.value.owner_address),
          to_address: fromHex(tx.raw_data.contract[0].parameter.value.to_address),
          amount: convertToDecimals(amount, 6),
          asset_symbol: 'TRX',
          asset_name: 'Tronix',
          asset_id: '_',
        };
      case 'TransferAssetContract':
        if (!parameter_values_present) return null;
        amount = tx.raw_data.contract[0].parameter.value.amount;
        if (!amount) return null;
        asset_id = tx.raw_data.contract[0].parameter.value.asset_name;
        if (!asset_id) return null;
        asset_details = await lookup_trc10(asset_id);
        return {
          transaction_id: tx.txID,
          timestamp: tx.block_timestamp,
          transaction_type: 'Transfer',
          transfer_type: 'TRC10',
          from_address: fromHex(tx.raw_data.contract[0].parameter.value.owner_address),
          to_address: fromHex(tx.raw_data.contract[0].parameter.value.to_address),
          amount: convertToDecimals(amount, asset_details.decimals),
          asset_symbol: asset_details.symbol,
          asset_name: asset_details.name,
          asset_id: asset_details.id,
        };
      case 'TriggerSmartContract':
        if (!parameter_values_present) return null;
        if (tx.raw_data.contract[0].parameter.value.call_value) {
          amount = tx.raw_data.contract[0].parameter.value.call_value;
          return {
            transaction_id: tx.txID,
            timestamp: tx.block_timestamp,
            transaction_type: 'Trigger',
            transfer_type: 'TRX',
            from_address: fromHex(tx.raw_data.contract[0].parameter.value.owner_address),
            to_address: fromHex(tx.raw_data.contract[0].parameter.value.contract_address),
            amount: convertToDecimals(amount, 6),
            asset_symbol: 'TRX',
            asset_name: 'Tronix',
            asset_id: '_',
          };
        } else if (tx.raw_data.contract[0].parameter.value.call_token_value) {
          amount = tx.raw_data.contract[0].parameter.value.call_token_value;
          asset_id = tx.raw_data.contract[0].parameter.value.token_id;
          if (!asset_id) return null;
          asset_details = await lookup_trc10(asset_id);
          return {
            transaction_id: tx.txID,
            timestamp: tx.block_timestamp,
            transaction_type: 'Trigger',
            transfer_type: 'TRC10',
            from_address: fromHex(tx.raw_data.contract[0].parameter.value.owner_address),
            to_address: fromHex(tx.raw_data.contract[0].parameter.value.contract_address),
            amount: convertToDecimals(amount, asset_details.decimals),
            asset_symbol: asset_details.symbol,
            asset_name: asset_details.name,
            asset_id: asset_details.id,
          };
        } else {
          return null;
        }
      case 'WithdrawBalanceContract':
        if (!tx.withdraw_amount) return null;
        amount = tx.withdraw_amount;
        return {
          transaction_id: tx.txID,
          timestamp: tx.block_timestamp,
          transaction_type: 'Withdraw',
          transfer_type: 'TRX',
          from_address: null,
          to_address: fromHex(tx.raw_data.contract[0].parameter.value.owner_address),
          amount: convertToDecimals(amount, 6),
          asset_symbol: 'TRX',
          asset_name: 'Tronix',
          asset_id: '_',
        };
      default:
        return null;
    }
  }
}

function process_trc20(tx) {
  if (tx.type !== 'Transfer') return null;
  if (!tx.token_info) return null;
  return {
    transaction_id: tx.transaction_id,
    timestamp: tx.block_timestamp,
    transaction_type: 'Transfer',
    transfer_type: 'TRC20',
    from_address: tx.from,
    to_address: tx.to,
    amount: convertToDecimals(tx.value, tx.token_info.decimals),
    asset_symbol: tx.token_info.symbol,
    asset_name: tx.token_info.name,
    asset_id: tx.token_info.address,
  };
}

function process_record(r) {
  return [
    r.transaction_id || '',
    r.timestamp && `${r.timestamp} [${new Date(r.timestamp)}]` || '',
    r.transaction_type || '',
    r.transfer_type || '',
    r.from_address || '',
    r.to_address || '',
    r.amount || '',
    r.asset_symbol || '',
    r.asset_name || '',
    r.asset_id || '',
  ];
}

async function mapAsync(arr, fn) {
  const result = new Array(arr.length);
  for (let i = 0; i < arr.length; ++i) {
    result[i] = await fn(arr[i], i, arr);
  }
  return result;
}

async function main() {
  try {
    csvFile = await fsPromises.open(outputFile, 'w');
    console.log('Starting download of transactions');
    const txs = await downloadAllTransactions(
      `accounts/${address}/transactions`
    );
    const trc20_txs = await downloadAllTransactions(
      `accounts/${address}/transactions/trc20`
    );
    await csvFile.write(stringify(
      trc20_txs.map(process_trc20).concat(await mapAsync(txs, process_tx))
      .filter(record => !!record)
      .sort((fst, snd) => {
        if (fst.timestamp > snd.timestamp) return -1;
        if (fst.timestamp < snd.timestamp) return 1;
        if (fst.transaction_id > snd.transaction_id) return -1;
        if (fst.transaction_id < snd.transaction_id) return 1;
        if (fst.transaction_type !== 'Trigger' && snd.transaction_type === 'Trigger') return -1;
        if (fst.transaction_type === 'Trigger' && snd.transaction_type !== 'Trigger') return 1;
        return 0;
      })
      .map(process_record)
    ));
  } finally {
    if (csvFile !== undefined) {
      await csvFile.close();
    }
  }
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
