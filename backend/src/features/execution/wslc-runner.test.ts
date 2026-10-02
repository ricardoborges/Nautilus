import test from 'node:test';
import assert from 'node:assert/strict';
import {
    parseWslcLabels,
    parseWslcContainers,
    parseWslcImages,
    parseWslcVolumes,
    parseWslcNetworks,
    parseWslcStats,
} from './wslc-runner';

test('parseWslcLabels - extrai projeto e servico do compose', () => {
    const raw = 'com.docker.compose.project=painkiller,com.docker.compose.service=coolify,other=123';
    const parsed = parseWslcLabels(raw);
    assert.equal(parsed.stack, 'painkiller');
    assert.equal(parsed.service, 'coolify');
});

test('parseWslcLabels - retorna strings vazias quando nao ha labels', () => {
    const parsed = parseWslcLabels('');
    assert.equal(parsed.stack, '');
    assert.equal(parsed.service, '');
});

test('parseWslcContainers - decodifica linhas JSON em objetos de container', () => {
    const ndjson = [
        JSON.stringify({
            ID: '27568de804b7',
            Names: '/painkiller-coolify',
            Image: 'ghcr.io/coollabsio/coolify:latest',
            Status: 'Up 53 minutes (healthy)',
            State: 'running',
            Ports: '127.0.0.1:8008->8080/tcp',
            CreatedAt: '2026-10-02 15:57:20 -0300 BRT',
            Labels: 'com.docker.compose.project=painkiller,com.docker.compose.service=coolify',
        }),
        JSON.stringify({
            ID: '52d379107581',
            Names: 'painkiller-api',
            Image: 'painkiller-api:latest',
            Status: 'Up 53 minutes',
            State: 'running',
            Ports: '127.0.0.1:8000->8000/tcp',
            CreatedAt: '2026-10-02 15:57:08 -0300 BRT',
        }),
    ].join('\n');

    const containers = parseWslcContainers(ndjson);
    assert.equal(containers.length, 2);

    assert.equal(containers[0].id, '27568de804b7');
    assert.equal(containers[0].name, 'painkiller-coolify');
    assert.equal(containers[0].image, 'ghcr.io/coollabsio/coolify:latest');
    assert.equal(containers[0].state, 'running');
    assert.equal(containers[0].stack, 'painkiller');
    assert.equal(containers[0].service, 'coolify');

    assert.equal(containers[1].id, '52d379107581');
    assert.equal(containers[1].name, 'painkiller-api');
    assert.equal(containers[1].stack, '');
});

test('parseWslcImages - mapeia campos de imagens wslc', () => {
    const ndjson = [
        JSON.stringify({
            ID: '7ee22cc63a00',
            Repository: 'painkiller-coolify-host',
            Tag: 'latest',
            Size: '240MB',
            CreatedAt: '2026-10-02 15:54:52 -0300 BRT',
            Containers: '1',
        }),
        JSON.stringify({
            ID: 'bf00e3aa9d09',
            Repository: 'unused-image',
            Tag: 'latest',
            Size: '100MB',
            CreatedAt: '2026-10-02 15:54:52 -0300 BRT',
            Containers: '0',
        }),
    ].join('\n');

    const images = parseWslcImages(ndjson);
    assert.equal(images.length, 2);
    assert.equal(images[0].id, '7ee22cc63a00');
    assert.equal(images[0].repository, 'painkiller-coolify-host');
    assert.equal(images[0].tag, 'latest');
    assert.equal(images[0].size, '240MB');
    assert.equal(images[0].inUse, true);
    assert.equal(images[0].containersCount, 1);

    assert.equal(images[1].id, 'bf00e3aa9d09');
    assert.equal(images[1].inUse, false);
    assert.equal(images[1].containersCount, 0);
});

test('parseWslcVolumes - mapeia campos de volumes wslc', () => {
    const ndjson = JSON.stringify({
        Name: 'painkiller_coolify-data',
        Driver: 'guest',
        Mountpoint: '/var/lib/docker/volumes/painkiller_coolify-data/_data',
        Size: '150MB',
    });

    const volumes = parseWslcVolumes(ndjson);
    assert.equal(volumes.length, 1);
    assert.equal(volumes[0].name, 'painkiller_coolify-data');
    assert.equal(volumes[0].driver, 'guest');
    assert.equal(volumes[0].mountpoint, '/var/lib/docker/volumes/painkiller_coolify-data/_data');
    assert.equal(volumes[0].size, '150MB');
});

test('parseWslcNetworks - mapeia redes e identifica redes de sistema', () => {
    const ndjson = [
        JSON.stringify({
            ID: 'd606f0099a68',
            Name: 'bridge',
            Driver: 'bridge',
            Scope: 'local',
            Internal: 'false',
        }),
        JSON.stringify({
            ID: '81a8376c87d2',
            Name: 'painkiller_default',
            Driver: 'bridge',
            Scope: 'local',
            Labels: 'com.docker.compose.project=painkiller',
            Internal: 'true',
        }),
    ].join('\n');

    const networks = parseWslcNetworks(ndjson);
    assert.equal(networks.length, 2);
    assert.equal(networks[0].isSystem, true);
    assert.equal(networks[1].isSystem, false);
    assert.equal(networks[1].stack, 'painkiller');
    assert.equal(networks[1].internal, true);
});

test('parseWslcStats - mapeia metricas de CPU e Memoria', () => {
    const ndjson = JSON.stringify({
        ID: '27568de804b769e56f9361038e525ac793b3554baada7156320ee9e086c17275',
        Name: 'painkiller-coolify',
        CPUPerc: '12.5%',
        MemUsage: '342.6MiB / 7.602GiB',
        MemPerc: '4.40%',
        NetIO: '12.2MB / 25.5MB',
        BlockIO: '67.8MB / 13.5MB',
    });

    const stats = parseWslcStats(ndjson);
    assert.equal(stats.length, 1);
    assert.equal(stats[0].id, '27568de804b7');
    assert.equal(stats[0].name, 'painkiller-coolify');
    assert.equal(stats[0].cpu, '12.5%');
    assert.equal(stats[0].memUsage, '342.6MiB / 7.602GiB');
    assert.equal(stats[0].memPerc, '4.40%');
});
