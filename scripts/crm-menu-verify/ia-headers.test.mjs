import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkHeaderLabels, normalizeHeaderLabel } from './ia-headers.mjs'

const expected = [
  { id: 'home', label: '工作台' },
  { id: 'customers', label: '客户' },
  { id: 'sales', label: '销售' },
]
const extras = ['管理中心']

const run = (observed, { expectedList = expected, extraLabels = extras } = {}) =>
  checkHeaderLabels({ observedLabels: observed, expected: expectedList, allowedExtraLabels: extraLabels })

test('normalizeHeaderLabel trims and collapses whitespace only', () => {
  assert.equal(normalizeHeaderLabel('  客户 \n\t  '), '客户')
  assert.equal(normalizeHeaderLabel('业务合规（欧盟零毁林专项）'), '业务合规（欧盟零毁林专项）')
  assert.equal(normalizeHeaderLabel(' Customer  names '), 'Customer names')
})

test('all declared headers present exactly once -> ok, details state the matched labels', () => {
  const result = run(['工作台', '客户', '销售', '管理中心'])
  assert.equal(result.ok, true)
  assert.deepEqual(result.missing, [])
  assert.deepEqual(result.duplicated, [])
  assert.deepEqual(result.unexpected, [])
  for (const entry of expected) {
    const check = result.checks.find((item) => item.id === `ia.shell.${entry.id}.header`)
    assert.equal(check.ok, true)
    assert.match(check.detail, new RegExp(`matched header: "${entry.label}"`))
    assert.doesNotMatch(check.detail, /missing|observed headers/)
  }
  assert.equal(result.aggregate.ok, true)
  assert.match(result.aggregate.detail, /all 3 declared container headers matched exactly once/)
})

test('whitespace differences still match (trim + collapse only)', () => {
  const result = run(['  工作台 ', '客户\n', ' 销 售 ', '管理中心'])
  assert.equal(result.ok, false, 'internal whitespace is not collapsed into a different label')
  const whitespaceCollapsed = run([' 工作台 ', '客户', '销售', '管理中心'])
  assert.equal(whitespaceCollapsed.ok, true)
})

test('one label deleted -> that id fails and its detail lists the observed headers', () => {
  const result = run(['工作台', '销售', '管理中心'])
  assert.equal(result.ok, false)
  assert.deepEqual(result.missing.map((entry) => entry.id), ['customers'])
  const check = result.checks.find((item) => item.id === 'ia.shell.customers.header')
  assert.equal(check.ok, false)
  assert.match(check.detail, /expected header "客户" missing/)
  assert.match(check.detail, /observed headers: \["工作台","销售","管理中心"\]/)
  assert.equal(result.aggregate.ok, false)
  assert.match(result.aggregate.detail, /missing/)
})

test('label duplicated -> that id fails with the observed count', () => {
  const result = run(['工作台', '客户', '客户', '销售', '管理中心'])
  assert.equal(result.ok, false)
  assert.deepEqual(result.duplicated.map((entry) => `${entry.id}x${entry.count}`), ['customersx2'])
  const check = result.checks.find((item) => item.id === 'ia.shell.customers.header')
  assert.equal(check.ok, false)
  assert.match(check.detail, /expected header "客户" exactly once, observed 2/)
  assert.equal(result.aggregate.ok, false)
})

test('renamed/truncated label -> expected missing + unexpected observed', () => {
  for (const mutated of ['客户中心', '客', '客户 ']) {
    const result = run(['工作台', mutated, '销售', '管理中心'])
    if (mutated.trim() === '客户') {
      assert.equal(result.ok, true)
      continue
    }
    assert.equal(result.ok, false, `mutation ${JSON.stringify(mutated)} must fail`)
    assert.deepEqual(result.missing.map((entry) => entry.id), ['customers'])
    assert.ok(result.unexpected.includes(mutated.trim()), `unexpected should list ${mutated}`)
    const check = result.checks.find((item) => item.id === 'ia.shell.customers.header')
    assert.equal(check.ok, false)
    assert.match(check.detail, /observed headers:/)
  }
})

test('unexpected extra header -> aggregate and unexpected check fail', () => {
  const result = run(['工作台', '客户', '销售', '管理中心', '全新菜单'])
  assert.equal(result.ok, false)
  assert.deepEqual(result.unexpected, ['全新菜单'])
  const unexpectedCheck = result.checks.find((item) => item.id === 'ia.shell.headers.unexpected')
  assert.equal(unexpectedCheck.ok, false)
  assert.match(unexpectedCheck.detail, /unexpected headers \["全新菜单"\]/)
  assert.equal(result.aggregate.ok, false)
})

test('manage hub is allowed exactly once and is not treated as a container', () => {
  const once = run(['工作台', '客户', '销售', '管理中心'])
  assert.equal(once.ok, true)
  assert.equal(once.expected.length, 3)
  const twice = run(['工作台', '客户', '销售', '管理中心', '管理中心'])
  assert.equal(twice.ok, false)
  assert.deepEqual(twice.duplicatedExtras.map((entry) => `${entry.label}x${entry.count}`), ['管理中心x2'])
  assert.equal(twice.checks.find((item) => item.id === 'ia.shell.headers.unexpected').ok, false)
})

test('a narrower role expects only the containers it can see', () => {
  const employeeExpected = [
    { id: 'home', label: '工作台' },
    { id: 'customers', label: '客户' },
  ]
  const result = run(['工作台', '客户', '管理中心'], { expectedList: employeeExpected })
  assert.equal(result.ok, true)
  assert.equal(result.expected.length, 2)
  assert.equal(result.checks.some((item) => item.id === 'ia.shell.sales.header'), false)
})

test('missing manage hub is allowed; a container label rendered as the manage label is not', () => {
  const withoutHub = run(['工作台', '客户', '销售'])
  assert.equal(withoutHub.ok, true)
  assert.equal(withoutHub.observed.length, 3)
  const containerAsHub = run(['工作台', '客户', '销售', '管理中心', '管理中心', '管理中心'])
  assert.equal(containerAsHub.ok, false)
})
