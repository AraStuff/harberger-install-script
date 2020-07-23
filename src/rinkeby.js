const {encodeCallScript} = require('@aragon/test-helpers/evmScript');
const {encodeActCall, execAppMethod} = require('mathew-aragon-toolkit');
const ethers = require('ethers');
const utils = require('ethers/utils');
const {keccak256} = require('web3-utils');
const {RLP} = utils;
const provider = ethers.getDefaultProvider('rinkeby');


// DAO addresses
const { dao, acl, tokenManager, voting, environment } = require('./settings.json')
const ANY_ADDRESS = '0xffffffffffffffffffffffffffffffffffffffff';


// new apps ***Note these addresses are different on Rinkeby and Mainnet***
const harbergerAppId = '0xe2998d9700224635282e9c2da41222441463aa25bcf3bb5252b716e3c6045f95';
const harbergerBase = '0x2f0920E5A09F5bc05Fd5320E96E9F4912CD646d0';
let harberger;


// signatures
const newAppInstanceSignature = 'newAppInstance(bytes32,address,bytes,bool)';
const createPermissionSignature = 'createPermission(address,address,bytes32,address)';
const grantPermissionSignature = 'grantPermission(address,address,bytes32)';
const harbergerInitSignature = 'initialize(address)';


// functions for counterfactual addresses
async function buildNonceForAddress(_address, _index, _provider) {
    const txCount = await _provider.getTransactionCount(_address);
    return `0x${(txCount + _index).toString(16)}`;
}

async function calculateNewProxyAddress(_daoAddress, _nonce) {
    const rlpEncoded = RLP.encode([_daoAddress, _nonce]);
    const contractAddressLong = keccak256(rlpEncoded);
    const contractAddress = `0x${contractAddressLong.substr(-40)}`;

    return contractAddress;
}

async function firstTx() {
    // counterfactual addresses
    const nonce = await buildNonceForAddress(dao, 0, provider);
    harberger = await calculateNewProxyAddress(dao, nonce);
    

    // app initialisation payloads
    const harbergerInitPayload = await encodeActCall(harbergerInitSignature, [tokenManager]);

    // package first transaction
    const calldatum = await Promise.all([
        encodeActCall(newAppInstanceSignature, [
            harbergerAppId,
            harbergerBase,
            harbergerInitPayload,
            true,
        ]),
        encodeActCall(createPermissionSignature, [
            ANY_ADDRESS,
            harberger,
            keccak256('PURCHASE_ROLE'),
            voting,
        ]),
        encodeActCall(createPermissionSignature, [
            voting,
            harberger,
            keccak256('MINT_ROLE'),
            voting,
        ]),
        encodeActCall(createPermissionSignature, [
            voting,
            harberger,
            keccak256('BURN_ROLE'),
            voting,
        ]),
        encodeActCall(createPermissionSignature, [
            voting,
            harberger,
            keccak256('MODIFY_ROLE'),
            voting,
        ])
    ]);

    const actions = [
        {
            to: dao,
            calldata: calldatum[0],
        },
        {
            to: acl,
            calldata: calldatum[1],
        },
        {
            to: acl,
            calldata: calldatum[2],
        },
        {
            to: acl,
            calldata: calldatum[3],
        }
    ];
    const script = encodeCallScript(actions);

    await execAppMethod(
        dao,
        voting,
        'newVote',
        [
            script,
            `
            Installing harberger
            `,
        ],
        () => {},
        environment,
    );
}

const main = async () => {
    console.log('Generating vote');
    await firstTx();
};

main()
    .then(() => {
        console.log('Script finished.');
        process.exit();
    })
    .catch((e) => {
        console.error(e);
        process.exit();
    });
