import path from 'node:path';

export const storageKeyFor = petId => 'codex-native-pet-bridge:v1:' + petId;

export function parseConfiguration(raw, {repositoryRoot}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('Invalid bridge configuration');
  if (typeof raw.petId !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(raw.petId) || raw.petId.startsWith('replace-'))
    throw Error('Configure the actual data-codex-pet-id of your selected native pet.');
  const port = raw.port ?? 46873;
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid local debugging port');
  const assetDir = raw.assetDir ?? 'examples/deepseek-v2/assets';
  if (typeof assetDir !== 'string' || !assetDir || path.isAbsolute(assetDir) || /^[A-Za-z]:|^[/\\]/.test(assetDir))
    throw Error('Asset directory must be relative to the repository');
  const root = path.resolve(repositoryRoot), assetRoot = path.resolve(root,assetDir);
  if (!assetRoot.startsWith(root+path.sep)) throw Error('Asset directory must stay inside the repository');
  return {petId:raw.petId,port,assetRoot,assetDir,updateStartMenu:raw.updateStartMenu === true};
}
