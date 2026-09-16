import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store'
import { Btn, Field, Filters, FormCard, OpsLinks, Page, Section, Table, useDialog } from '../ui'

export default function Master() {
  const { tab } = useParams()
  const { state, actions } = useStore()
  const nav = useNavigate()
  const { ask, flash, node } = useDialog()
  const titles = { product: '商品/物料', customer: '客户档案', supplier: '供应商', employee: '员工账号' }
  const [form, setForm] = useState({})
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const [pq, setPq] = useState('')
  const [ptype, setPtype] = useState('')
  const [proll, setProll] = useState('')
  const [pst, setPst] = useState('')
  const products = state.products.filter((r) => {
    if (pq && !r.name.includes(pq) && !r.id.includes(pq)) return false
    if (ptype && r.type !== ptype) return false
    if (proll === 'yes' && !r.roll) return false
    if (proll === 'no' && r.roll) return false
    if (pst === 'off' && r.status !== 'off') return false
    if (pst === 'on' && r.status === 'off') return false
    return true
  })

  return (
    <Page crumb={<>基础资料 / {titles[tab]}</>}>
      {node}
      {tab === 'product' && (
        <div className="card">
          <Filters onQuery={() => {}} onReset={() => { setPq(''); setPtype(''); setProll(''); setPst('') }}>
            <Field label="名称 / 编号"><input value={pq} onChange={(e) => setPq(e.target.value)} /></Field>
            <Field label="分类">
              <select value={ptype} onChange={(e) => setPtype(e.target.value)}>
                <option value="">全部</option>
                <option>项目料</option>
                <option>常备料</option>
                <option>成品</option>
              </select>
            </Field>
            <Field label="卷材">
              <select value={proll} onChange={(e) => setProll(e.target.value)}>
                <option value="">全部</option>
                <option value="yes">是</option>
                <option value="no">否</option>
              </select>
            </Field>
            <Field label="状态">
              <select value={pst} onChange={(e) => setPst(e.target.value)}>
                <option value="">全部</option>
                <option value="on">启用</option>
                <option value="off">停用</option>
              </select>
            </Field>
          </Filters>
          <div className="list-toolbar">
            <Btn kind="primary" onClick={() => nav('/master/product/new')}>新增</Btn>
          </div>
          <Table
            columns={[
              { key: 'id', title: '编号', link: true },
              { key: 'name', title: '名称' },
              { key: 'unit', title: '单位' },
              { key: 'type', title: '分类' },
              { key: 'roll', title: '卷材', render: (r) => (r.roll ? `是 · 每卷 ${r.rollInit || 1}${r.unit} = 100%` : '否') },
              { key: 'safety', title: '安全库存' },
              { key: 'status', title: '状态', render: (r) => (r.status === 'off' ? '停用' : '启用') },
              {
                key: 'act',
                title: '操作',
                render: (r) => (
                  <OpsLinks
                    items={[
                      { label: '编辑', onClick: () => nav(`/master/product/${r.id}`) },
                      { label: r.status === 'off' ? '启用' : '停用', onClick: () => ask(r.status === 'off' ? '启用档案' : '停用档案', '主数据不删除，只用停用。', () => actions.toggleProduct(r.id)) },
                    ]}
                  />
                ),
              },
            ]}
            onRow={(r) => nav(`/master/product/${r.id}`)}
            rows={products}
          />
        </div>
      )}
      {tab === 'customer' && (
        <div className="card">
          <div className="filters">
            <Field label="客户"><input value={form.name || ''} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="联系人"><input value={form.contact || ''} onChange={(e) => set('contact', e.target.value)} /></Field>
            <Field label="电话"><input value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} /></Field>
          </div>
          <Btn kind="primary" onClick={() => {
            if (form.id) ask('保存客户', '确认保存客户档案。', () => { const r = actions.saveMaster('customers', form); if (r.ok) setForm({}); return r })
            else { flash(actions.saveMaster('customers', form)); setForm({}) }
          }}>{form.id ? '保存' : '新增'}</Btn>
          {form.id && <Btn onClick={() => setForm({})}>取消编辑</Btn>}
          <Table
            columns={[
              { key: 'id', title: '编号' },
              { key: 'name', title: '客户' },
              { key: 'contact', title: '联系人' },
              { key: 'phone', title: '电话' },
              { key: 'status', title: '状态', render: (r) => (r.status === 'off' ? '停用' : '启用') },
              { key: 'act', title: '操作', render: (r) => (
                <OpsLinks
                  items={[
                    { label: '编辑', onClick: () => setForm(r) },
                    { label: r.status === 'off' ? '启用' : '停用', onClick: () => ask(r.status === 'off' ? '启用客户' : '停用客户', '主数据不删除，只用停用。', () => actions.toggleRow('customers', r.id)) },
                  ]}
                />
              ) },
            ]}
            rows={state.customers}
          />
        </div>
      )}
      {tab === 'supplier' && (
        <div className="card">
          <div className="filters">
            <Field label="名称"><input value={form.name || ''} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="类型">
              <select value={form.type || '加工商'} onChange={(e) => set('type', e.target.value)}>
                <option>加工商</option>
                <option>网购</option>
              </select>
            </Field>
            <Field label="联系人"><input value={form.contact || ''} onChange={(e) => set('contact', e.target.value)} /></Field>
          </div>
          <div className="row-actions" style={{ marginBottom: 12 }}>
            <Btn kind="primary" onClick={() => { const r = actions.saveMaster('suppliers', { ...form, type: form.type || '加工商' }); flash(r); if (r.ok) setForm({}) }}>{form.id ? '保存修改' : '新增'}</Btn>
            {form.id && <Btn onClick={() => setForm({})}>取消编辑</Btn>}
          </div>
          <Table
            columns={[
              { key: 'id', title: '编号' },
              { key: 'name', title: '名称' },
              { key: 'type', title: '类型' },
              { key: 'contact', title: '联系人' },
              { key: 'status', title: '状态', render: (r) => (r.status === 'off' ? '停用' : '启用') },
              { key: 'act', title: '操作', render: (r) => (
                <OpsLinks
                  items={[
                    { label: '编辑', onClick: () => setForm(r) },
                    {
                      label: r.status === 'off' ? '启用' : '停用',
                      onClick: () => ask(
                        r.status === 'off' ? '启用供应商' : '停用供应商',
                        r.status === 'off'
                          ? '启用后可在下单时选用。'
                          : '停用前会检查有没有涉及的单据（采购订单、BOM、采购建议）；只要有一份就不让停。',
                        () => actions.toggleSupplier(r.id),
                      ),
                    },
                  ]}
                />
              ) },
            ]}
            rows={state.suppliers}
          />
        </div>
      )}
      {tab === 'employee' && (
        <div className="card">
          <div className="filters">
            <Field label="姓名"><input value={form.name || ''} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="角色"><input value={form.role || '生产'} onChange={(e) => set('role', e.target.value)} /></Field>
          </div>
          <div className="row-actions" style={{ marginBottom: 12 }}>
            <Btn kind="primary" onClick={() => { const r = actions.saveMaster('employees', { ...form, role: form.role || '生产', pad: form.pad !== undefined ? form.pad : true }); flash(r); if (r.ok) setForm({}) }}>{form.id ? '保存修改' : '新增'}</Btn>
            {form.id && <Btn onClick={() => setForm({})}>取消编辑</Btn>}
          </div>
          <Table
            columns={[
              { key: 'id', title: '工号' },
              { key: 'name', title: '姓名' },
              { key: 'role', title: '角色' },
              { key: 'pad', title: '平板打卡', render: (r) => (r.pad ? '已授权' : '未授权') },
              { key: 'status', title: '状态', render: (r) => (r.status === 'off' ? '停用' : '启用') },
              {
                key: 'act',
                title: '操作',
                render: (r) => (
                  <OpsLinks
                    items={[
                      { label: '编辑', onClick: () => setForm(r) },
                      { label: r.pad ? '取消授权' : '授权平板', onClick: () => ask(r.pad ? '取消平板授权' : '授权平板打卡', '平板打卡授权可随时开、关。', () => actions.saveMaster('employees', { ...r, pad: !r.pad })) },
                      {
                        label: r.status === 'off' ? '启用' : '停用',
                        onClick: () => ask(
                          r.status === 'off' ? '启用账号' : '停用账号',
                          r.status === 'off'
                            ? '启用后可在授权 / 分配里选用。'
                            : '停用前会检查：还是不是提醒人、有没有未完结异常、在未完工项目上有没有打卡；有就不让停。',
                          () => actions.toggleEmployee(r.id),
                        ),
                      },
                    ]}
                  />
                ),
              },
            ]}
            rows={state.employees}
          />
        </div>
      )}
    </Page>
  )
}

export function ProductForm() {
  const { id } = useParams()
  const { state, actions } = useStore()
  const nav = useNavigate()
  const { ask, node } = useDialog()
  const cur = state.products.find((p) => p.id === id)
  const isNew = !id || id === 'new'
  const [form, setForm] = useState(() => ({
    id: isNew ? undefined : cur?.id,
    code: '',
    name: cur?.name || '',
    unit: cur?.unit || '件',
    type: cur?.type || '项目料',
    safety: cur?.safety || 0,
    spec: cur?.spec || '',
    roll: !!cur?.roll,
    rollInit: cur?.rollInit || 1,
  }))
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  if (!isNew && !cur) return <p>物料不存在</p>
  const isMat = form.type === '项目料' || form.type === '常备料'

  return (
    <Page crumb={<>基础资料 / 商品物料 / {isNew ? '新增' : '编辑'}</>}>
      {node}
      <FormCard
        title={isNew ? '新增商品/物料' : `编辑 ${cur.name}`}
        extra={
          <>
            <Btn kind="ghost" onClick={() => nav('/master/product')}>← 返回列表</Btn>
            <Btn kind="primary" onClick={() => ask('保存商品物料', isNew ? '分类选定后不能互改。' : '确认保存档案。', () => {
              const r = actions.saveMaster('products', { ...form, unit: form.unit || '件', type: form.type || '项目料' })
              if (r.ok) nav('/master/product')
              return r
            })}>保存</Btn>
          </>
        }
      >
        <Section title="分类" hint="物料只分两类：常备料（备库存）、项目料（按项目买）。成品不是料，单独一类。选定后不能互改。">
          <div className="form-stack">
            <Field label="档案分类" required>
              <select value={form.type} onChange={(e) => set('type', e.target.value)} disabled={!isNew}>
                <option value="项目料">项目料</option>
                <option value="常备料">常备料</option>
                <option value="成品">成品（非物料）</option>
              </select>
            </Field>
          </div>
        </Section>
        <Section title="基本信息">
          <div className="form-stack">
            {isNew && (
              <Field label="编号"><input value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="空则自动" /></Field>
            )}
            <Field label="名称" required><input value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="规格"><input value={form.spec} onChange={(e) => set('spec', e.target.value)} placeholder="可空" /></Field>
            <Field label="单位"><input value={form.unit} onChange={(e) => set('unit', e.target.value)} /></Field>
            {form.type === '常备料' && <Field label="安全库存"><input type="number" value={form.safety} onChange={(e) => set('safety', e.target.value)} /></Field>}
          </div>
        </Section>
        {isMat && (
          <Section title="卷材" hint="勾选后，厂内打卡按百分比填用量。整卷 = 100%。系统按「百分比 × 每卷数量 / 100」立刻原料出库。">
            <div className="form-stack">
              <Field label="是否卷材">
                <select value={form.roll ? '1' : '0'} onChange={(e) => set('roll', e.target.value === '1')}>
                  <option value="0">否</option>
                  <option value="1">是</option>
                </select>
              </Field>
              {form.roll && (
                <Field label="每卷数量（库存单位）" required>
                  <input type="number" min="0.01" step="0.01" value={form.rollInit} onChange={(e) => set('rollInit', e.target.value)} />
                </Field>
              )}
              {form.roll && <p className="hint">例如每卷 1 卷：打卡填 10，扣 0.1；填 100，扣一整卷。</p>}
            </div>
          </Section>
        )}
      </FormCard>
    </Page>
  )
}


