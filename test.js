import test from 'ava';
import axios from 'axios';
import execa from 'execa';
import semver from 'semver';

import modules from './modules';
import fn from '.';

const moduleNames = Object.keys(modules);

test('basic', t => {
    t.deepEqual(fn('react', '15.0.0', {env: 'development'}), {
        name: 'react',
        var: 'React',
        url: 'https://unpkg.com/react@15.0.0/dist/react.js',
        version: '15.0.0'
    });
});

test('unknown module', t => {
    t.is(fn('qwerty', '1.0.0'), null);
});

test('default to development', t => {
    t.deepEqual(fn('react', '15.0.0', {env: 'development'}), fn('react', '15.0.0'));
    t.notDeepEqual(fn('react', '15.0.0', {env: 'production'}), fn('react', '15.0.0'));
});

test('out of range module', t => {
    t.is(fn('react', '0.10.0'), null);
});

for (const moduleName of moduleNames) {
    const versionRanges = Object.keys(modules[moduleName].versions);

    test.serial(`prod: ${moduleName}@next`, testNextModule, moduleName, 'production');
    test.serial(`dev: ${moduleName}@next`, testNextModule, moduleName, 'development');

    getAllVersions(moduleName)
    .filter(version => {
        return versionRanges.some(range => semver.satisfies(version, range));
    })
    .forEach(version => {
        test.serial(`prod: ${moduleName}@${version}`, testModule, moduleName, version, 'production');
        test.serial(`dev: ${moduleName}@${version}`, testModule, moduleName, version, 'development');
    });
}

async function testModule(t, moduleName, version, env) {
    const cdnConfig = fn(moduleName, version, {env});

    await testCdnConfig(t, cdnConfig, moduleName, version);
}

async function testNextModule(t, moduleName, env) {
    const tags = getModuleInfo(moduleName)['dist-tags'];

    if (!tags.next) {
        return;
    }

    const nextVersion = tags.next;
    const futureVersion = removePrereleaseItentifiers(nextVersion);

    const cdnConfig = fn(moduleName, futureVersion, {env});

    cdnConfig.url = cdnConfig.url.replace(futureVersion, nextVersion);

    await testCdnConfig(t, cdnConfig, moduleName, nextVersion);
}

async function testCdnConfig(t, cdnConfig, moduleName, version) {
    t.notDeepEqual(cdnConfig, null);

    t.is(cdnConfig.name, moduleName);
    t.truthy(cdnConfig.url);
    t.true(cdnConfig.url.includes(version));

    let content = await t.notThrows(axios.get(cdnConfig.url).then(x => x.data), cdnConfig.url);

    if (cdnConfig.var != null) {
        content = content.replace(/ /g, '');

        t.true(
            content.includes(`.${cdnConfig.var}=`) ||
            content.includes(`["${cdnConfig.var}"]=`) ||
            content.includes(`['${cdnConfig.var}']=`)
        );

        t.true(isValidVarName(cdnConfig.var));
    }
}

function getModuleInfo(moduleName) {
    return JSON.parse(execa.sync('npm', ['info', '--json', `${moduleName}`]).stdout);
}

function getAllVersions(moduleName) {
    return getModuleInfo(moduleName).versions;
}

// https://stackoverflow.com/a/31625466/3052444
function isValidVarName(name) {
    try {
        if (name.indexOf('.') > -1) {
            // e.g. ng.core would cause errors otherwise:
            name = name.split('.').join('_');
        }

        // eslint-disable-next-line no-eval
        return name.indexOf('}') === -1 && eval('(function() { a = {' + name + ':1}; a.' + name + '; var ' + name + '; }); true');
    } catch (err) {
        return false;
    }
}

function removePrereleaseItentifiers(version) {
    return `${semver.major(version)}.${semver.minor(version)}.${semver.patch(version)}`;
}
