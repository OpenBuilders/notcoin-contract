import { CompilerConfig } from '@ton/blueprint';

export const compile: CompilerConfig = {
    lang: 'func',
    targets: ['contracts/stdlib.fc', 'contracts/vanity_contract.fc'],
};