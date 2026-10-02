import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeWslBuffer, buildWslArgs } from './wsl-command-runner';

test('buildWslArgs - monta argumentos com distro e sh -c', () => {
    const args = buildWslArgs('Ubuntu', 'docker ps', 'ricardo');
    assert.deepEqual(args, ['-d', 'Ubuntu', '-u', 'ricardo', '--', 'sh', '-c', 'docker ps']);
});

test('buildWslArgs - monta argumentos sem usuario quando omitido', () => {
    const args = buildWslArgs('Ubuntu', 'docker ps');
    assert.deepEqual(args, ['-d', 'Ubuntu', '--', 'sh', '-c', 'docker ps']);
});

test('decodeWslBuffer - decodifica saída UTF-16LE com null bytes', () => {
    const buf = Buffer.from('Ubuntu\0\r\0\n\0docker-desktop\0\r\0\n\0', 'utf16le');
    const result = decodeWslBuffer(buf);
    assert.equal(result.includes('Ubuntu'), true);
    assert.equal(result.includes('docker-desktop'), true);
    assert.equal(result.includes('\0'), false);
});

test('decodeWslBuffer - decodifica saída UTF-8 padrão', () => {
    const buf = Buffer.from('CONTAINER ID   IMAGE\n123   nginx\n', 'utf8');
    const result = decodeWslBuffer(buf);
    assert.equal(result.includes('CONTAINER ID'), true);
    assert.equal(result.includes('nginx'), true);
});
