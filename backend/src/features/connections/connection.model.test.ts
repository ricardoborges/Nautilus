import test from 'node:test';
import assert from 'node:assert/strict';
import { ConnectionModel } from './connection.model';

test('ConnectionModel - deve instanciar conexão WSL2 com defaults apropriados', () => {
    const model = new ConnectionModel({
        name: 'Local Ubuntu',
        host: 'localhost',
        user: 'default',
        connectionType: 'wsl',
        wslDistro: 'Ubuntu',
        wslUser: 'ricardo',
        authMethod: 'password',
    });

    assert.equal(model.connectionType, 'wsl');
    assert.equal(model.wslDistro, 'Ubuntu');
    assert.equal(model.wslUser, 'ricardo');
    assert.ok(model.id);
});
