import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDistroList } from './wsl-detector';

test('parseDistroList - filtra nomes vazios e remove caracteres especiais', () => {
    const raw = 'Ubuntu\r\n\0docker-desktop\r\narchlinux\r\n';
    const list = parseDistroList(raw);
    assert.deepEqual(list, ['Ubuntu', 'docker-desktop', 'archlinux']);
});

test('parseDistroList - remove indicador default * se presente', () => {
    const raw = '* Ubuntu\r\n  docker-desktop\r\n';
    const list = parseDistroList(raw);
    assert.deepEqual(list, ['Ubuntu', 'docker-desktop']);
});
