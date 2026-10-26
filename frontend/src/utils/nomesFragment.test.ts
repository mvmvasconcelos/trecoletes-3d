import { describe, expect, it } from 'vitest';
import { parseNomesFragment } from './nomesFragment';

const hashFor = (json: string) => '#nomes=' + encodeURIComponent(json);

describe('parseNomesFragment', () => {
    it('lê a lista de nomes na ordem, intacta', () => {
        expect(parseNomesFragment(hashFor('["Ana","Heloísa M.","joão@x"]'))).toEqual(['Ana', 'Heloísa M.', 'joão@x']);
    });
});

describe('parseNomesFragment — repetidos', () => {
    it('mantém nomes repetidos', () => {
        expect(parseNomesFragment(hashFor('["Ana","Ana"]'))).toEqual(['Ana', 'Ana']);
    });
});

describe('parseNomesFragment — sem lista utilizável', () => {
    it.each([
        ['ausente', ''],
        ['outro fragmento', '#topo'],
        ['vazio', '#nomes='],
        ['JSON quebrado', hashFor('["Ana"')],
        ['não é array', hashFor('{"nome":"Ana"}')],
        ['array vazio', hashFor('[]')],
        ['item não-string', hashFor('["Ana",3]')],
        ['encoding quebrado', '#nomes=%E0%A4%A'],
    ])('%s → null', (_, hash) => {
        expect(parseNomesFragment(hash)).toBeNull();
    });
});
