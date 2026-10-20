import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { seedChromeProfileFromTemplate } from './app.mjs';

const roboFormExtensionId = 'pnlccmojcmeohlpggmfnbbiapkmbliob';

/** Create isolated template and target profile paths for one test. @param {object} options Fixture options. @return {Promise<object>} Temporary profile paths. @author ductv <ductv@getflycrm.com> @since 2026-10-21 */
async function createProfileFixture({ chromeVersion = '155.0.1.2', includeRoboForm = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'autoleadpc-profile-test-'));
  const template = join(root, 'template');
  const target = join(root, 'target');
  await mkdir(join(template, 'Default'), { recursive: true });
  await writeFile(join(template, 'Local State'), 'template-local-state');
  await writeFile(join(template, 'autoleadpc-template.json'), JSON.stringify({ chromeVersion }));
  await writeFile(join(template, 'Default', 'Preferences'), 'template-preferences');
  await mkdir(join(template, 'Default', 'Cache'), { recursive: true });
  await writeFile(join(template, 'Default', 'Cache', 'cached-file'), 'cache');
  await writeFile(join(template, 'SingletonLock'), 'lock');
  if (includeRoboForm) {
    const extensionManifest = join(template, 'Default', 'Extensions', roboFormExtensionId, '1.0', 'manifest.json');
    await mkdir(join(extensionManifest, '..'), { recursive: true });
    await writeFile(extensionManifest, JSON.stringify({ name: 'RoboForm' }));
  }
  return { root, template, target };
}

test('copies RoboForm profile files and skips caches, locks, and template metadata', async (t) => {
  const fixture = await createProfileFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));

  const result = await seedChromeProfileFromTemplate(fixture.target, { version: '155.0.9.9' }, fixture.template);

  assert.equal(result, null);
  assert.equal(await readFile(join(fixture.target, 'Local State'), 'utf8'), 'template-local-state');
  assert.equal(await readFile(join(fixture.target, 'Default', 'Preferences'), 'utf8'), 'template-preferences');
  assert.equal(await readFile(join(fixture.target, 'Default', 'Extensions', roboFormExtensionId, '1.0', 'manifest.json'), 'utf8').then((raw) => JSON.parse(raw).name), 'RoboForm');
  await assert.rejects(readFile(join(fixture.target, 'Default', 'Cache', 'cached-file')));
  await assert.rejects(readFile(join(fixture.target, 'SingletonLock')));
  await assert.rejects(readFile(join(fixture.target, 'autoleadpc-template.json')));
});

test('does not overwrite a profile Chrome has already initialized', async (t) => {
  const fixture = await createProfileFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  await mkdir(fixture.target, { recursive: true });
  await writeFile(join(fixture.target, 'Local State'), 'existing-local-state');

  const result = await seedChromeProfileFromTemplate(fixture.target, { version: '155.0.9.9' }, fixture.template);

  assert.match(result, /tạo trước/);
  assert.equal(await readFile(join(fixture.target, 'Local State'), 'utf8'), 'existing-local-state');
});

test('does not copy when the template is missing or does not contain RoboForm', async (t) => {
  const fixture = await createProfileFixture({ includeRoboForm: false });
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const missingTemplate = join(fixture.root, 'missing-template');

  const missingResult = await seedChromeProfileFromTemplate(join(fixture.root, 'missing-target'), { version: '155.0.9.9' }, missingTemplate);
  const noRoboFormResult = await seedChromeProfileFromTemplate(join(fixture.root, 'no-extension-target'), { version: '155.0.9.9' }, fixture.template);

  assert.match(missingResult, /chưa có profile mẫu/);
  assert.match(noRoboFormResult, /chưa cài RoboForm/);
});

test('does not copy a template created by a newer Chrome version', async (t) => {
  const fixture = await createProfileFixture({ chromeVersion: '156.0.1.2' });
  t.after(() => rm(fixture.root, { recursive: true, force: true }));

  const result = await seedChromeProfileFromTemplate(fixture.target, { version: '155.0.9.9' }, fixture.template);

  assert.match(result, /mới hơn Chrome/);
  await assert.rejects(readFile(join(fixture.target, 'Local State')));
});
