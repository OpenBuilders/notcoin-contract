import { checkJettonMinter } from '../wrappers/JettonMinterChecker';
import { Address, beginCell, Cell, fromNano, OpenedContract, toNano } from '@ton/core';
import { compile, NetworkProvider, UIProvider} from '@ton/blueprint';
import { JettonMinter, jettonMinterConfigCellToConfig, JettonMinterConfigFull, jettonMinterConfigFullToCell } from '../wrappers/JettonMinter';
import { promptBool, promptAmount, promptAddress, displayContentCell, getLastBlock, waitForTransaction, getAccountLastTx, promptToncoin, promptUrl, jettonWalletCodeFromLibrary } from '../wrappers/ui-utils';
import {TonClient4} from "@ton/ton";
import { fromUnits } from '../wrappers/units';
let jettonMinterContract:OpenedContract<JettonMinter>;

const adminActions  = ['Mint', 'Change admin', 'Drop admin', 'Change metadata', 'Upgrade' ];
const userActions   = ['Info', 'Top up', 'Claim admin', 'Quit'];
let minterCode: Cell;
let walletCode: Cell;
let adminAddress: Address | null;
let decimals: number;


const failedTransMessage = (ui:UIProvider) => {
    ui.write("Failed to get indication of transaction completion from API!\nCheck result manually, or try again\n");

};

const infoAction = async (provider:NetworkProvider, ui:UIProvider) => {
    const jettonData = await jettonMinterContract.getJettonData();
    ui.write("Jetton info:\n\n");
    ui.write(`Admin:${jettonData.adminAddress}\n`);
    ui.write(`Total supply:${fromNano(jettonData.totalSupply)}\n`);
    ui.write(`Mintable:${jettonData.mintable}\n`);
    const displayContent = await ui.choose('Display content?', ['Yes', 'No'], (c: string) => c);
    if(displayContent == 'Yes') {
        await displayContentCell(jettonData.content, ui);
    }
};
const topUpAction = async (provider: NetworkProvider, ui: UIProvider) => {
    const topUpAmount = await promptToncoin("How much would you like to top up:", ui);
    if(!await promptBool(`Send ${fromNano(topUpAmount)} ton to minter?`, ['yes', 'no'], ui)){
        ui.write('Top up aborted!');
        return;
    }
    ui.write(`Sending ${fromNano(topUpAmount)} to minter`);
    await jettonMinterContract.sendTopUp(provider.sender(), topUpAmount);
}
const updateMetadataAction = async (provider: NetworkProvider, ui: UIProvider) => {
       const jettonMetadataUri = await promptUrl("Enter jetton metadata uri (https://jettonowner.com/jetton.json)", ui)

        if (!(await promptBool(`Change metadata url to "${jettonMetadataUri}"?`, ['yes', 'no'], ui))) {
            ui.write('Update metadata aborted!');
            return;
        }

        await jettonMinterContract.sendChangeContent(provider.sender(), {
            uri: jettonMetadataUri
        });

        ui.write('Transaction sent');

}
const changeAdminAction = async(provider:NetworkProvider, ui:UIProvider) => {
    let retry:boolean;
    let newAdmin:Address;
    let curAdmin = await jettonMinterContract.getAdminAddress();
    if(curAdmin == null) {
        throw new Error("Current admin address is addr_none. No way to change it");
    }
    do {
        retry = false;
        newAdmin = await promptAddress('Please specify new admin address:', ui);
        if(newAdmin.equals(curAdmin)) {
            retry = true;
            ui.write("Address specified matched current admin address!\nPlease pick another one.\n");
        }
        else {
            ui.write(`New admin address is going to be:${newAdmin}\nKindly double check it!\n`);
            retry = !(await promptBool('Is it ok?', ['yes', 'no'], ui));
        }
    } while(retry);

    const lastTx   = await getAccountLastTx(provider, jettonMinterContract.address);

    await jettonMinterContract.sendChangeAdmin(provider.sender(), newAdmin);
    const transDone = await waitForTransaction(provider,
                                               jettonMinterContract.address,
                                               lastTx,
                                               10);
    if(transDone) {
        ui.write(`Admin change to address:${newAdmin} requested\nNext you need to claim admin from that address`);
    }
    else {
        failedTransMessage(ui);
    }
};

const dropAdminAction = async (provider: NetworkProvider, ui: UIProvider) => {
    let curAdmin = await jettonMinterContract.getAdminAddress();
    let retry : boolean;

    if(curAdmin == null) {
        throw new Error("Current admin address is addr_none. No way to change it");
    }
    ui.write('This action is NOT REVERSIBLE!');
    ui.write('Are you absolutely sure, you want to drop admin?');

    const sure = await promptBool('Are you absolutely sure, you want to drop admin?', ['yes', 'no'], ui);

    if(sure) {
        await jettonMinterContract.sendDropAdmin(provider.sender());
    }
    else {
        ui.write('Operation abort');
    }
}

const claimAdminAction = async (provider: NetworkProvider, ui: UIProvider) => {
    const prevAdmin = await jettonMinterContract.getAdminAddress();
    if(prevAdmin == null) {
        throw new Error("Current admin address is addr_none. No way to change it");
    }

    const lastTx   = await getAccountLastTx(provider, jettonMinterContract.address);

    await jettonMinterContract.sendClaimAdmin(provider.sender());

    const transDone = await waitForTransaction(provider,
                                               jettonMinterContract.address,
                                               lastTx,
                                               10);
    if(transDone) {
        const newAdmin = await jettonMinterContract.getAdminAddress()!;
        if(newAdmin == null || newAdmin.equals(prevAdmin)) {
            ui.write("Something went wrong!\nAdmin address didn't change");
        }
        else {
            ui.write(`Admin address changed successfully to:${newAdmin}`);
        }
    }
    else {
        failedTransMessage(ui);
    }
}

const mintAction = async (provider:NetworkProvider, ui:UIProvider) => {
    const sender = provider.sender();
    let retry:boolean;
    let mintAddress:Address;
    let mintAmount: bigint;

    do {
        retry = false;
        const fallbackAddr = sender.address ?? (await jettonMinterContract.getAdminAddress() || undefined);
        mintAddress = await promptAddress(`Please specify address to mint to`, ui, fallbackAddr);
        mintAmount  = await promptAmount('Please provide mint amount in decimal form:', decimals, ui);
        ui.write(`Mint ${fromUnits(mintAmount, decimals)} tokens to ${mintAddress}\n`);
        retry = !(await promptBool('Is it ok?', ['yes', 'no'], ui));
    } while(retry);

    ui.write(`Minting ${fromUnits(mintAmount, decimals)} to ${mintAddress}\n`);
    const supplyBefore = await jettonMinterContract.getTotalSupply();
    const lastTx       = await getAccountLastTx(provider, jettonMinterContract.address);

    await jettonMinterContract.sendMint(sender,
                                  mintAddress,
                                  mintAmount);
    const gotTrans = await waitForTransaction(provider,
                                              jettonMinterContract.address,
                                              lastTx,
                                              10);
    if(gotTrans) {
        const supplyAfter = await jettonMinterContract.getTotalSupply();

        if(supplyAfter == supplyBefore + mintAmount) {
            ui.write("Mint successfull!\nCurrent supply:" + fromUnits(supplyAfter, decimals));
        }
        else {
            ui.write("Mint failed!");
        }
    }
    else {
        failedTransMessage(ui);
    }
}

const updateData = async (oldData: Cell, ui: UIProvider) => {
    const curConfig   = jettonMinterConfigCellToConfig(oldData);
    let   newConfig: JettonMinterConfigFull;
    let   retry: boolean;
    do {
        newConfig   = {...curConfig};
        let   updateWallet = false;
        const updateSupply = await promptBool(`Current supply:${fromNano(curConfig.supply)}\nWant to change?`, ['Yes', 'No'], ui, true);
        if(updateSupply)
            newConfig.supply   = await promptAmount('Enter new supply amount:', decimals, ui);
        const updateAdmin  = await promptBool(`Current admin:${curConfig.admin}\nWant to change?`, ['Yes', 'No'], ui, true);
        if(updateAdmin)
            newConfig.admin = await promptAddress('Enter new admin address:', ui);
        if(newConfig.transfer_admin !== null){
            if(!(await promptBool(`Currently admin rights can be transfered to:${curConfig.transfer_admin}\nPreserve?`,['Yes', 'No'], ui))){
                // Drop the transfer rights
                newConfig.transfer_admin = null;
            }
        }
        // If different from contract code
        if(!curConfig.wallet_code.equals(walletCode)) {
            // Demand written answer
            updateWallet = await promptBool("Update wallet code from jetton-wallet.fc?\n(CAUTION:This will break compatability with deployed wallets)", ['Yes', 'No'], ui);
            if(updateWallet) {
                newConfig.wallet_code = walletCode;
            }
        }
        retry = !(await promptBool(`New config:${JSON.stringify({
            supply: newConfig.supply.toString(),
            admin: newConfig.admin?.toString(),
            transfer_admin: newConfig.transfer_admin?.toString(),
            wallet_code: updateWallet ? "updated" : "preserved"
        }, null, 2)}\nIs it okay?`, ['Yes', 'No'], ui));
    } while(retry);
    return jettonMinterConfigFullToCell(newConfig);
}
const upgradeAction = async (provider: NetworkProvider, ui: UIProvider) => {
    const api = provider.api() as TonClient4;
    let upgradeCode = await promptBool(`Would you like to upgrade code?\nSource from jetton-minter.fc will be used.`, ['Yes', 'No'], ui, true);
    let upgradeData = await promptBool(`Would you like to upgrade data?`, ['Yes', 'No'], ui, true);

    const contractState = await api.getAccount(await getLastBlock(provider), jettonMinterContract.address);

    if(contractState.account.state.type !== 'active')
        throw(Error("Upgrade is only possible for active contract"));

    if(contractState.account.state.code === null)
        throw(Error(`Something is wrong!\nActive contract has to have code`));

    const dataBefore =  contractState.account.state.data ? Cell.fromBase64(contractState.account.state.data) : beginCell().endCell();
    if(upgradeCode || upgradeData) {
        const newCode = upgradeCode ? minterCode : Cell.fromBase64(contractState.account.state.code);
        const newData = upgradeData ? await updateData(dataBefore, ui) : dataBefore;
        await jettonMinterContract.sendUpgrade(provider.sender(), newCode, newData, toNano('0.05'));
        const gotTrans = await waitForTransaction(provider,
                                                  jettonMinterContract.address,
                                                  contractState.account.last!.lt,
                                                  10);
        if(gotTrans){
            ui.write("Contract upgraded successfully!");
        }
        else {
            failedTransMessage(ui);
        }

    }
    else {
        ui.write('Nothing to do then!');
    }
}

type AccountStateLite = any;
type AccountStateFull = any;

const matchCodeLite = (contractState: AccountStateLite, code: Cell) => {
    let equals = false;

    if(contractState.account.state.type === 'active') {
        const codeHash = code.hash()
        equals = codeHash.equals(Buffer.from(contractState.account.state.codeHash, 'base64'));
    }

    return equals;
}

const matchCodeFull = (contractState: AccountStateFull, code: Cell) => {
    let equals = false;
    if(contractState.account.state.type === 'active') {
        if(contractState.account.state.code !== null) {
            equals = code.equals(Cell.fromBase64(contractState.account.state.code));
        }
    }
    return equals;
}

export async function run(provider: NetworkProvider) {
    const ui = provider.ui();
    const sender = provider.sender();
    const hasSender = sender.address !== undefined;
    minterCode = await compile('JettonMinter');
    walletCode = jettonWalletCodeFromLibrary(await compile('JettonWallet'));
    let   done   = false;
    let   retry:boolean;
    let   minterAddress:Address;

    do {
        retry = false;
        minterAddress = await promptAddress('Please enter minter address:', ui);
        try {
            const verifyRes = await checkJettonMinter({isBounceable: true, isTestOnly: false, address: minterAddress},
                                                      minterCode, walletCode, provider, ui, provider.network() == 'testnet', true); 
            jettonMinterContract = verifyRes.jettonMinterContract;
            adminAddress = verifyRes.adminAddress;
            decimals     = verifyRes.decimals;
        }
        catch(e) {
            ui.write(`Doesn't look like minter:${e}`);
            if(!(await promptBool("Are you sure it is the one", ['Yes', 'No'], ui, true))) {
                return;
            }

            jettonMinterContract = provider.open(
                JettonMinter.createFromAddress(minterAddress)
            );
            adminAddress = await jettonMinterContract.getAdminAddress();
            ui.write("Ok, boss!");
            decimals = Number(
                await promptAmount("Please specify contract decimals:", 0, ui)
            );
        }
    } while(retry);

    const isAdmin  = hasSender ? (adminAddress == null ? false : adminAddress.equals(sender.address)) : true;
    let actionList:string[];
    if(isAdmin) {
        actionList = [...adminActions, ...userActions];
        ui.write("Current wallet is minter admin!\n");
    }
    else {
        actionList = userActions;
        ui.write("Current wallet is not admin!\nAvaliable actions restricted\n");
    }

    do {
        ui.clearActionPrompt();
        const action = await ui.choose("Pick action:", actionList, (c: string) => c);
        switch(action) {
            case 'Mint':
                await mintAction(provider, ui);
                break;
            case 'Change admin':
                await changeAdminAction(provider, ui);
                break;
            case 'Change metadata':
                await updateMetadataAction(provider, ui);
                break;
            case 'Claim admin':
                await claimAdminAction(provider, ui);
                break;
            case 'Drop admin':
                await dropAdminAction(provider, ui);
                break;
            case 'Upgrade':
                await upgradeAction(provider, ui);
                break;
            case 'Info':
                await infoAction(provider, ui);
                break;
            case 'Top up':
                await topUpAction(provider, ui);
                break;
            case 'Quit':
                done = true;
                break;
            default:
                ui.write('Operation is not yet supported!');
        }
    } while(!done);
}
