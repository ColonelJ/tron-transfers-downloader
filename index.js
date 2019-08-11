const rpn = require('request-promise-native');
const stringify = require('csv-stringify/lib/sync');
const fsPromises = require('fs').promises;
const TronWeb = require('tronweb');
const TronGrid = require('trongrid');

const tronWeb = new TronWeb({
    fullHost: 'https://api.trongrid.io'
});
const tronGrid = new TronGrid(tronWeb);

let asset_cache = {};
async function lookup_trc10(asset) {
    if (asset_cache[asset]) {
        return asset_cache[asset];
    }
    if (/^\d+$/.test(asset)) {
        let asset_reply = await tronGrid.asset.get(asset);
        if (!asset_reply.success || !asset_reply.data.length) {
            throw new Error('Failed to obtain information for asset ID ' + asset);
        }
        asset_cache[asset] = asset_reply.data[0];
        return asset_cache[asset];
    } else {
        let asset_options = {order_by: 'id,asc'};
        let asset_reply = await tronGrid.asset.getList(asset, asset_options);
        while (true) {
            if (!asset_reply.success || !asset_reply.data.length) {
                throw new Error('Failed to obtain information for asset name ' + asset);
            }
            for (let j = 0; j < asset_reply.data.length; ++j) {
                if (asset_reply.data[j].name == asset) {
                    asset_cache[asset] = asset_reply.data[j];
                    return asset_cache[asset];
                }
            }
            if (asset_reply.meta.fingerprint) {
                asset_options.fingerprint = asset_reply.meta.fingerprint;
                asset_reply = await tronGrid.asset.getList(asset, asset_options);
            } else {
                throw new Error('Failed to find exact match for asset name ' + asset);
            }
        }
    }
}

async function main() {
    if (process.argv.length < 3) {
        console.error('Usage: node index.js TRON-ADDRESS [output.csv]');
        return;
    }
    const address = process.argv[2];
    const addressHex = '0x' + tronWeb.address.toHex(address).slice(2);
    let outputFile = 'output.csv';
    if (process.argv.length >= 4) {
        outputFile = process.argv[3];
    }
    console.log('Writing to file ' + outputFile + '...');
    let csvFile;
    try {
        csvFile = await fsPromises.open(outputFile, 'w');
        let options = {
            uri: 'https://apilist.tronscan.org/api/token_trc20',
            qs: {
                limit: 20,
                start: 0
            },
            headers: {
                'User-Agent': 'Request-Promise-Native'
            },
            json: true
        };
        let reply;
        let trc20_tokens = [];
        console.log('Downloading details of TRC20 tokens from Tronscan...');
        do {
            reply = await rpn(options);
            for (let i = 0; i < reply.trc20_tokens.length; ++i) {
                trc20_tokens.push({
                    contract_address: reply.trc20_tokens[i].contract_address,
                    symbol: reply.trc20_tokens[i].symbol,
                    name: reply.trc20_tokens[i].name,
                    decimals: reply.trc20_tokens[i].decimals
                });
            }
            options.qs.start += options.qs.limit;
        } while(reply.trc20_tokens.length == options.qs.limit);
        console.log('Found ' + trc20_tokens.length + ' tokens, now processing them...');
        let record_sets = [];
        for (let i = 0; i < trc20_tokens.length; ++i) {
            reply = await tronWeb.getEventResult(trc20_tokens[i].contract_address, {eventName: 'Transfer', size: 1});
            if (!reply.length) {
                console.log(trc20_tokens[i].contract_address + ': Token ' + trc20_tokens[i].symbol + ' (' + trc20_tokens[i].name + ') does not emit Transfer events, skipping...');
                continue;
            }
            let paramFrom;
            let paramTo;
            let paramValue;
            let keys = Object.keys(reply[0].result);
            if (keys.length != 3) {
                console.log(trc20_tokens[i].contract_address + ': Token ' + trc20_tokens[i].symbol + ' (' + trc20_tokens[i].name + ') has wrong number of parameters to Transfer event, skipping...');
                continue;
            }
            let index = keys.indexOf('from');
            if (index > -1) {
                paramFrom = 'from';
                keys.splice(index, 1);
            } else {
                index = keys.indexOf('_from');
                if (index > -1) {
                    paramFrom = '_from';
                    keys.splice(index, 1);
                } else {
                    console.log(trc20_tokens[i].contract_address + ": Couldn't find 'from' Transfer parameter for token " + trc20_tokens[i].symbol + ' (' + trc20_tokens[i].name + '), have', Object.keys(reply[0].result), 'skipping...');
                    continue;
                }
            }
            index = keys.indexOf('to');
            if (index > -1) {
                paramTo = 'to';
                keys.splice(index, 1);
            } else {
                index = keys.indexOf('_to');
                if (index > -1) {
                    paramTo = '_to';
                    keys.splice(index, 1);
                } else {
                    console.log(trc20_tokens[i].contract_address + ": Couldn't find 'to' Transfer parameter for token " + trc20_tokens[i].symbol + ' (' + trc20_tokens[i].name + '), have', Object.keys(reply[0].result), 'skipping...');
                    continue;
                }
            }
            paramValue = keys[0];
            //console.log(trc20_tokens[i].contract_address + ': Token ' + trc20_tokens[i].symbol + ' (' + trc20_tokens[i].name + ') has Transfer parameters', [paramFrom, paramTo, paramValue]);
            let transfersOut = [];
            let transfersIn = [];
            options = {
                eventName: 'Transfer',
                filters: {[paramFrom]: addressHex}
            };
            reply = await tronWeb.getEventResult(trc20_tokens[i].contract_address, options);
            while (reply.length) {
                for (let j = 0; j < reply.length; ++j) {
                    transfersOut.push({
                        transaction_id: reply[j].transaction,
                        timestamp: reply[j].timestamp,
                        transaction_type: 'Event',
                        transfer_type: 'TRC20',
                        from_address: tronWeb.address.fromHex('41' + reply[j].result[paramFrom].slice(2)),
                        to_address: tronWeb.address.fromHex('41' + reply[j].result[paramTo].slice(2)),
                        amount: reply[j].result[paramValue] / 10**trc20_tokens[i].decimals,
                        token_abbr: trc20_tokens[i].symbol,
                        token_name: trc20_tokens[i].name,
                        token_id: trc20_tokens[i].contract_address
                    });
                }
                if (!reply[reply.length - 1].fingerprint) {
                    break;
                }
                options.previousLastEventFingerprint = reply[reply.length - 1].fingerprint;
                reply = await tronWeb.getEventResult(trc20_tokens[i].contract_address, options);
            }
            options = {
                eventName: 'Transfer',
                filters: {[paramTo]: addressHex}
            };
            reply = await tronWeb.getEventResult(trc20_tokens[i].contract_address, options);
            while (reply.length) {
                for (let j = 0; j < reply.length; ++j) {
                    transfersIn.push({
                        transaction_id: reply[j].transaction,
                        timestamp: reply[j].timestamp,
                        transaction_type: 'Event',
                        transfer_type: 'TRC20',
                        from_address: tronWeb.address.fromHex('41' + reply[j].result[paramFrom].slice(2)),
                        to_address: tronWeb.address.fromHex('41' + reply[j].result[paramTo].slice(2)),
                        amount: reply[j].result[paramValue] / 10**trc20_tokens[i].decimals,
                        token_abbr: trc20_tokens[i].symbol,
                        token_name: trc20_tokens[i].name,
                        token_id: trc20_tokens[i].contract_address
                    });
                }
                if (!reply[reply.length - 1].fingerprint) {
                    break;
                }
                options.previousLastEventFingerprint = reply[reply.length - 1].fingerprint;
                reply = await tronWeb.getEventResult(trc20_tokens[i].contract_address, options);
            }
            if (transfersOut.length) {
                record_sets.push(transfersOut);
            }
            if (transfersIn.length) {
                record_sets.push(transfersIn);
            }
            console.log(trc20_tokens[i].contract_address + ': Found ' + (transfersOut.length + transfersIn.length) + ' events for token ' + trc20_tokens[i].symbol + ' (' + trc20_tokens[i].name + ')');
        }
        console.log('Downloading all transactions for address ' + address + '...');
        let transactions = [];
        options = {limit: 200};
        reply = await tronGrid.account.getTransactions(address, options);
        while (true) {
            if (!reply.success) {
                throw new Error('Received unsuccessful response from TronGrid API');
            }
            for (let i = 0; i < reply.data.length; ++i) {
                if (reply.data[i].internal_tx_id) {
                    if (!reply.data[i].data.rejected) {
                        if (Object.keys(reply.data[i].data.call_value).length != 1) {
                            throw new Error('Unhandled number of assets in call value ' + Object.keys(reply.data[i].data.call_value).length + ' for internal transaction');
                        }
                        if (Object.keys(reply.data[i].data.call_value)[0] == '_') {
                            transactions.push({
                                transaction_id: reply.data[i].tx_id,
                                timestamp: reply.data[i].block_timestamp,
                                transaction_type: 'Internal',
                                transfer_type: 'TRX',
                                from_address: tronWeb.address.fromHex(reply.data[i].from_address),
                                to_address: tronWeb.address.fromHex(reply.data[i].to_address),
                                amount: reply.data[i].data.call_value['_'] / 10**6,
                                token_abbr: 'TRX',
                                token_name: 'Tronix',
                                token_id: ''
                            });
                        } else {
                            let asset_details = await lookup_trc10(Object.keys(reply.data[i].data.call_value)[0]);
                            transactions.push({
                                transaction_id: reply.data[i].tx_id,
                                timestamp: reply.data[i].block_timestamp,
                                transaction_type: 'Internal',
                                transfer_type: 'TRC10',
                                from_address: tronWeb.address.fromHex(reply.data[i].from_address),
                                to_address: tronWeb.address.fromHex(reply.data[i].to_address),
                                amount: Object.values(reply.data[i].data.call_value)[0] / 10**(asset_details.precision || 0),
                                token_abbr: asset_details.abbr,
                                token_name: asset_details.name,
                                token_id: asset_details.id
                            });
                        }
                    }
                } else if (reply.data[i].raw_data.contract[0].type == 'TransferContract') {
                    transactions.push({
                        transaction_id: reply.data[i].txID,
                        timestamp: reply.data[i].block_timestamp,
                        transaction_type: 'Transaction',
                        transfer_type: 'TRX',
                        from_address: tronWeb.address.fromHex(reply.data[i].raw_data.contract[0].parameter.value.owner_address),
                        to_address: tronWeb.address.fromHex(reply.data[i].raw_data.contract[0].parameter.value.to_address),
                        amount: reply.data[i].raw_data.contract[0].parameter.value.amount / 10**6,
                        token_abbr: 'TRX',
                        token_name: 'Tronix',
                        token_id: ''
                    });
                } else if (reply.data[i].raw_data.contract[0].type == 'TransferAssetContract') {
                    let asset_details = await lookup_trc10(reply.data[i].raw_data.contract[0].parameter.value.asset_name);
                    transactions.push({
                        transaction_id: reply.data[i].txID,
                        timestamp: reply.data[i].block_timestamp,
                        transaction_type: 'Transaction',
                        transfer_type: 'TRC10',
                        from_address: tronWeb.address.fromHex(reply.data[i].raw_data.contract[0].parameter.value.owner_address),
                        to_address: tronWeb.address.fromHex(reply.data[i].raw_data.contract[0].parameter.value.to_address),
                        amount: reply.data[i].raw_data.contract[0].parameter.value.amount / 10**(asset_details.precision || 0),
                        token_abbr: asset_details.abbr,
                        token_name: asset_details.name,
                        token_id: asset_details.id
                    });
                }
            }
            if (reply.data.length) {
                console.log('Reached timestamp ' + reply.data[reply.data.length - 1].block_timestamp);
            }
            if (reply.meta.fingerprint) {
                options.fingerprint = reply.meta.fingerprint;
                reply = await tronGrid.account.getTransactions(address, options);
            } else {
                break;
            }
        }
        if (transactions.length) {
            record_sets.push(transactions);
        }
        console.log('Found ' + transactions.length + ' transfers in the downloaded transactions');
        while (record_sets.length) {
            let max_timestamp = 0;
            let max_timestamp_index;
            for (let i = 0; i < record_sets.length; ++i) {
                if (record_sets[i][0].timestamp > max_timestamp) {
                    max_timestamp = record_sets[i][0].timestamp;
                    max_timestamp_index = i;
                }
            }
            let record = record_sets[max_timestamp_index].shift();
            if (!record_sets[max_timestamp_index].length) {
                record_sets.splice(max_timestamp_index, 1);
            }
            await csvFile.write(stringify([[record.transaction_id, record.timestamp, record.transaction_type, record.transfer_type, record.from_address, record.to_address, record.amount, record.token_abbr, record.token_name, record.token_id]]));
        }
        console.log('Successfully written all records to ' + outputFile + '!');
    } finally {
        if (csvFile !== undefined) {
            await csvFile.close();
        }
    }
}

main();
