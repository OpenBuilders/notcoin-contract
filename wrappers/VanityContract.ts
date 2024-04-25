import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type VanityContractConfig = {
    salt: string,
    owner: Address,
};

export function vanityContractConfigToCell(config: VanityContractConfig): Cell {
    return beginCell().storeUint(0, 5)
                      .storeAddress(config.owner)
                      .storeBuffer(Buffer.from(config.salt, 'hex'))
           .endCell();
}

export class VanityContract implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new VanityContract(address);
    }

    static createFromConfig(config: VanityContractConfig, code: Cell, workchain = 0) {
        const data = vanityContractConfigToCell(config);
        const init = { code, data };
        return new VanityContract(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint, code: Cell, data: Cell) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeRef(code).storeRef(data).endCell()
        });
    }
}