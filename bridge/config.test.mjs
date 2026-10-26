import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {parseConfiguration,storageKeyFor} from './config.mjs';
import {installExpression} from './controller.mjs';

const root = path.resolve('.');
const parse = input => parseConfiguration(input,{repositoryRoot:root});
test('configuration uses a supplied pet ID and independent storage namespace',()=>{
  const c=parse({petId:'pet_example',port:46874});
  assert.equal(c.port,46874);assert.equal(c.petId,'pet_example');
  assert.equal(c.assetRoot,path.join(root,'examples/deepseek-v2/assets'));
  assert.notEqual(storageKeyFor('pet_example'),storageKeyFor('pet_other'));
});
test('configuration rejects placeholder IDs, invalid ports and paths escaping the repository',()=>{
  for(const petId of ['', '../id','replace-with-native-pet-id']) assert.throws(()=>parse({petId}));
  for(const port of [80,65536,46873.5,'46873']) assert.throws(()=>parse({petId:'pet_example',port}));
  for(const assetDir of ['../private','/private','C:\\private','\\\\server\\private']) assert.throws(()=>parse({petId:'pet_example',assetDir}));
});
test('the renderer injection remains valid JavaScript after serialization',()=>{
  const expression=installExpression({version:'test',petId:'pet_example',storageKey:storageKeyFor('pet_example'),assets:{},data:{}});
  assert.doesNotThrow(()=>new Function(expression));
  assert.ok(expression.includes('pet_example'));
});
