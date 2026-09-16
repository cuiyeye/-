import { useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { SO_TABS, billStatus, fgNeedQty, fgOf, nameOf, payBillOf, poDue, poLineKinds, rcvBillDue, rcvBillOf, receivedOf, unpaidOf, soCanCancel, soFlow, useStore } from '../store'
import { Btn, DocStatus, Field, Filters, FormCard, Modal, OpsLinks, Page, Pager, ProgressCell, Section, Table, Tabs, slicePage, statusTag, useDialog } from '../ui'
import { BillTag, RemarkInput, useSettleDialog } from '../bill'
import { FallProject } from './Home'

const PLAN_KEYS = [
  ['design', '设计'],
  ['bom', 'BOM 确认'],
  ['purchase', '采购'],
  ['structure', '结构'],
  ['circuit', '电路'],
  ['robot', '机器人'],
  ['assemble', '装配'],
  ['outbound', '成品出库'],
  ['install', '安装调试'],
  ['train', '培训'],
]

/** 单据状态标签：取值与顶部页签完全一致（口径统一在 store 的 soFlow 里） */
function soTabTag(state, so) {
  return <DocStatus value={soFlow(state, so).label} />
}

/**
 * 老单据兜底：真实留档为空时（历史导入 / 示例数据），按单据现状把已完成的里程碑还原成时间线。
 * 只读不改数据，类型固定标「系统补录」、事件里写明「按单据现状还原」，避免详情页一片空白让人以为丢了记录。
 */
function backfillLogs(state, so) {
  if (!so) return []
  const day = (v) => (v ? String(v).slice(0, 10) : '')
  const due = so.fallDue || so.plan || {}
  const des = state.designTasks.find((d) => d.soId === so.id)
  const bom = state.boms.find((b) => b.soId === so.id)
  const pos = state.purchaseOrders.filter((p) => p.soId === so.id && !p.part)
  const pp = state.productionPlans.find((p) => p.soId === so.id)
  const out = state.outboundOrders.find((o) => o.soId === so.id)
  const inAll = pos.length > 0 && pos.every((p) => p.inboundStatus === 'all')
  const firstPoAt = pos.map((p) => p.confirmedAt || p.createdAt).filter(Boolean).sort()[0]
  const ms = [
    ['创建销售订单', true, so.createdAt],
    ['确认销售订单', so.confirmStatus === 'confirmed', so.confirmedAt || so.createdAt],
    [`设计完成${des?.owner ? `（${des.owner}）` : ''}`, !!des?.done, des?.doneAt || due.design],
    ['确认 BOM', !!bom?.confirmed, bom?.confirmedAt || due.bom],
    [`采购下单${pos.length ? ` ${pos.map((p) => p.id).join('、')}` : ''}`, pos.length > 0, firstPoAt || due.purchase],
    ['采购全部入库', inAll, due.inbound],
    ['确认生产完工（成品入库）', !!pp?.done, pp?.doneAt || due.assemble],
    ['确认销售出库', out?.status === 'done', out?.doneAt || due.outbound],
    ['成品签收', !!out?.signed, out?.signedAt],
    ['确认安装调试完成', !!out?.installed, out?.installedAt],
    ['确认培训完成（= 交付完成）', !!out?.trained, out?.trainedAt],
    ['取消销售订单', so.closeStatus === 'closed', so.cancelledAt],
  ]
  return ms
    .filter(([, done]) => done)
    .map(([title, , at], i) => ({
      id: `BF-${i}`,
      at: day(at) || '—',
      by: '系统',
      type: '系统补录',
      title: `${title}（按单据现状还原）`,
    }))
    .reverse()
}

function fgOutReady(state, soId) {
  const so = state.salesOrders.find((s) => s.id === soId)
  if (!so) return { ok: false, message: '请选择项目' }
  if (so.confirmStatus !== 'confirmed') return { ok: false, message: '请先确认销售订单' }
  if (so.closeStatus === 'closed') return { ok: false, message: '订单已取消' }
  const qty = fgNeedQty(state, soId) || 1
  const fg = fgOf(state, so)
  if (!fg) return { ok: false, message: '成品档案里没有这个成品，不能出库' }
  if (Number(fg.stock || 0) < qty) {
    return { ok: false, message: `成品库存不足（可用 ${fg.stock ?? 0}，需要 ${qty}）。请先完成生产入库后再出库` }
  }
  return { ok: true, qty, fg }
}

function fmtSize(n) {
  if (typeof n === 'string') return n
  if (!n) return '—'
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`
  return `${(n / 1e3).toFixed(1)} KB`
}

function isImageFile(f) {
  if (!f) return false
  if (String(f.type || '').startsWith('image/')) return true
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(f.name || '')
}

function isPdfFile(f) {
  if (!f) return false
  if (String(f.type || '') === 'application/pdf') return true
  return /\.pdf$/i.test(f.name || '')
}

function fileSrc(f) {
  return f?.dataUrl || f?.url || ''
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(new Error('读不出来'))
    r.readAsDataURL(file)
  })
}

function downloadFile(f) {
  const src = fileSrc(f)
  if (!src) return false
  const a = document.createElement('a')
  a.href = src
  a.download = f.name
  a.click()
  return true
}

function AttachList({ files, onRemove, onPreview, onMissing }) {
  const list = files || []
  const images = list.filter((f) => isImageFile(f) && fileSrc(f))
  const docs = list.filter((f) => !isImageFile(f) || !fileSrc(f))

  function open(f, mode) {
    if (!fileSrc(f)) {
      onMissing?.(f)
      return
    }
    if (mode === 'download') {
      downloadFile(f)
      return
    }
    onPreview?.(f)
  }

  return (
    <>
      {images.length > 0 && (
        <div className="thumb-grid">
          {images.map((f, i) => (
            <div key={`${f.name}-${i}`} className="thumb-card">
              <button type="button" className="thumb-pic" onClick={() => open(f, 'preview')}>
                <img src={fileSrc(f)} alt={f.name} />
              </button>
              <div className="thumb-meta">
                <b>{f.name}</b>
                <span>{f.size || '—'}</span>
              </div>
              <div className="row-actions">
                <Btn onClick={() => open(f, 'preview')}>预览</Btn>
                <Btn onClick={() => open(f, 'download')}>下载</Btn>
                {onRemove && <Btn onClick={() => onRemove(list.indexOf(f))}>删除</Btn>}
              </div>
            </div>
          ))}
        </div>
      )}
      {docs.map((f, i) => (
        <div key={`${f.name}-doc-${i}`} className="file-row">
          <b>{f.name}</b>
          <span>{f.size || '—'}</span>
          {isPdfFile(f) && fileSrc(f) && <Btn onClick={() => open(f, 'preview')}>预览</Btn>}
          {fileSrc(f)
            ? <Btn onClick={() => open(f, 'download')}>下载</Btn>
            : null}
          {onRemove && <Btn onClick={() => onRemove(list.indexOf(f))}>删除</Btn>}
        </div>
      ))}
      {list.length === 0 && <p className="hint">还没有附件</p>}
    </>
  )
}

export function OrderList() {
  const { state, actions } = useStore()
  const nav = useNavigate()
  const { ask, flash, node } = useDialog()
  const [tab, setTab] = useState('all')
  const [soId, setSoId] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [dueFrom, setDueFrom] = useState('')
  const [dueTo, setDueTo] = useState('')
  const [paySt, setPaySt] = useState('')
  const [deliver, setDeliver] = useState('')
  const [page, setPage] = useState(1)

  const counts = useMemo(() => {
    const all = state.salesOrders
    const out = { all: all.length }
    SO_TABS.forEach((t) => { out[t.key] = all.filter((s) => soFlow(state, s).key === t.key).length })
    return out
  }, [state])

  const filtered = state.salesOrders.filter((s) => {
    if (tab !== 'all' && soFlow(state, s).key !== tab) return false
    return true
  }).filter((s) => {
    if (soId && s.id !== soId) return false
    if (customerId && s.customerId !== customerId) return false
    if (dueFrom && (!s.dueDate || s.dueDate < dueFrom)) return false
    if (dueTo && (!s.dueDate || s.dueDate > dueTo)) return false
    const rec = receivedOf(s)
    if (paySt === 'clear' && rec < s.amount) return false
    if (paySt === 'open' && rec >= s.amount) return false
    const out = state.outboundOrders.find((o) => o.soId === s.id)
    if (deliver === 'done' && !out?.trained) return false
    if (deliver === 'open' && out?.trained) return false
    return true
  })

  function makeOut(r) {
    const need = fgNeedQty(state, r.id)
    const fg = fgOf(state, r)
    const ready = fgOutReady(state, r.id)
    if (!ready.ok) return flash(ready)
    ask(
      '创建销售出库单',
      `项目「${r.projectName}」（${r.id}）。产品「${r.productName}」${need} 台（= 项目台数，不可改）。成品可用 ${fg?.stock ?? 0}。确认后创建出库单并绑定本销售订单。`,
      () => {
        const res = actions.createSalesOut(r.id)
        if (res.ok && res.id) nav(`/sales/out/${res.id}`)
        return res
      },
    )
  }

  return (
    <Page crumb={<>销售管理 / 销售订单</>}>
      {node}
      <div className="card">
        <Tabs
          value={tab}
          onChange={(k) => { setTab(k); setPage(1) }}
          items={[
            { key: 'all', label: '全部', count: counts.all },
            ...SO_TABS.map((t) => ({ key: t.key, label: t.label, count: counts[t.key] })),
          ]}
        />
        <Filters onQuery={() => setPage(1)} onReset={() => { setSoId(''); setCustomerId(''); setDueFrom(''); setDueTo(''); setPaySt(''); setDeliver(''); setPage(1) }}>
          <Field label="项目">
            <select value={soId} onChange={(e) => setSoId(e.target.value)}>
              <option value="">全部项目</option>
              {state.salesOrders.map((s) => <option key={s.id} value={s.id}>{s.projectName}</option>)}
            </select>
          </Field>
          <Field label="客户">
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">全部</option>
              {state.customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="收款">
            <select value={paySt} onChange={(e) => setPaySt(e.target.value)}>
              <option value="">全部</option>
              <option value="open">有未收</option>
              <option value="clear">已收清</option>
            </select>
          </Field>
          <Field label="预计交付从">
            <input type="date" value={dueFrom} onChange={(e) => setDueFrom(e.target.value)} />
          </Field>
          <Field label="预计交付到">
            <input type="date" value={dueTo} onChange={(e) => setDueTo(e.target.value)} />
          </Field>
          <Field label="交付">
            <select value={deliver} onChange={(e) => setDeliver(e.target.value)}>
              <option value="">全部</option>
              <option value="open">未交付</option>
              <option value="done">已交付</option>
            </select>
          </Field>
        </Filters>
        <div className="list-toolbar">
          <Btn kind="primary" onClick={() => nav('/sales/new')}>新增</Btn>
        </div>
        <Table
          onRow={(r) => nav(`/sales/${r.id}`)}
          columns={[
            { key: 'projectName', title: '项目', link: true },
            {
              key: 'progress',
              title: '进度',
              render: (r) => {
                const f = soFlow(state, r)
                // 草稿、已取消、已交付：没有"在推进"的节点，不给灯
                const settled = f.key === 'draft' || f.key === 'cancelled' || f.key === 'delivered'
                return <ProgressCell stage={f.step} tone={f.tone} hideLamp={settled} />
              },
            },
            { key: 'doc', title: '单据状态', render: (r) => soTabTag(state, r) },
            { key: 'id', title: '单号' },
            { key: 'productName', title: '成品名称' },
            { key: 'customer', title: '客户', render: (r) => nameOf(state.customers, r.customerId) },
            { key: 'amount', title: '合同额', render: (r) => `¥ ${r.amount.toLocaleString()}` },
            { key: 'got', title: '已收', render: (r) => `¥ ${receivedOf(r).toLocaleString()}` },
            { key: 'dueDate', title: '预计交付日' },
            {
              key: 'act',
              title: '操作',
              render: (r) => (
                <OpsLinks
                  items={[
                    { label: '查看', onClick: () => nav(`/sales/${r.id}`) },
                    r.confirmStatus === 'draft' && r.closeStatus === 'open' && { label: '编辑', onClick: () => nav(`/sales/${r.id}/edit`) },
                    r.confirmStatus === 'draft' && r.closeStatus === 'open' && {
                      label: '删除',
                      onClick: () => ask('删除草稿', '无下游且无收款才可删。', () => actions.deleteSO(r.id)),
                    },
                    r.confirmStatus === 'confirmed' && r.closeStatus === 'open' && !state.outboundOrders.some((o) => o.soId === r.id) && {
                      label: '创建出库单',
                      onClick: () => makeOut(r),
                    },
                    soCanCancel(state, r) && {
                      label: '取消',
                      onClick: () => ask(
                        '取消销售订单',
                        `确认取消「${r.projectName}」？仅草稿/已确认、且下游一份单据都没有（连 BOM 草稿也没有）时可取消。若已有 BOM 草稿，请先到设计管理删除草稿再取消。`,
                        () => actions.closeSO(r.id),
                      ),
                    },
                  ]}
                />
              ),
            },
          ]}
          rows={slicePage(filtered, page)}
        />
        <Pager total={filtered.length} page={page} onChange={setPage} />
      </div>
    </Page>
  )
}

export function OrderForm() {
  const { id } = useParams()
  const { state, actions } = useStore()
  const nav = useNavigate()
  const { ask, flash, node } = useDialog()
  const fileRef = useRef(null)
  const cur = state.salesOrders.find((s) => s.id === id)
  const customers = state.customers.filter((c) => c.status !== 'off')
  const [form, setForm] = useState(() => ({
    id: cur?.id,
    customerId: cur?.customerId || state.customers.find((c) => c.status !== 'off')?.id || state.customers[0]?.id || '',
    projectName: cur?.projectName || '',
    productName: cur?.productName || '',
    amount: cur?.amount || '',
    dueDate: cur?.dueDate || '',
    files: cur?.files ? cur.files.map((f) => ({ ...f })) : [],
  }))
  const [preview, setPreview] = useState(null)
  const [custOpen, setCustOpen] = useState(false)
  const [cust, setCust] = useState({ name: '', contact: '', phone: '' })
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  async function onPick(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const dataUrl = await readAsDataUrl(file)
      setForm((f) => ({
        ...f,
        files: [...(f.files || []), { name: file.name, size: fmtSize(file.size), type: file.type, dataUrl }],
      }))
    } catch {
      flash({ ok: false, message: '文件读不出来' })
    }
  }

  function openNewCustomer() {
    setCust({ name: '', contact: '', phone: '' })
    setCustOpen(true)
  }

  function saveNewCustomer() {
    const r = actions.saveMaster('customers', cust)
    flash(r)
    if (!r.ok) return
    if (r.id) set('customerId', r.id)
    setCustOpen(false)
  }

  return (
    <Page crumb={<>销售管理 / 销售订单 / {id ? '编辑销售订单' : '新增销售订单'}</>}>
      {node}
      <FormCard
        title={id ? '编辑销售订单' : '新增销售订单'}
        extra={
          <>
            <Btn kind="ghost" onClick={() => nav('/sales')}>← 返回列表</Btn>
            <Btn onClick={() => ask('保存草稿', '保存后仍是草稿，确认后才能做设计、BOM 和生产。', () => {
              const r = actions.saveSO(form, false)
              if (r.ok) nav('/sales')
              return r
            })}>保存</Btn>
            <Btn kind="primary" onClick={() => ask('确认销售订单', '确认后才能做设计、BOM 和生产。销售订单就是项目。', () => {
              const r = actions.saveSO(form, true)
              if (r.ok) nav(r.id ? `/sales/${r.id}` : '/sales')
              return r
            })}>
              确认
            </Btn>
          </>
        }
      >
        <Section title="基本信息" hint="销售订单就是新项目，项目名称请手输。预计交付日按培训完成来填。">
          <div className="form-stack">
            <Field label="客户" required>
              <div className="row-actions" style={{ width: '100%' }}>
                <select style={{ flex: 1, minWidth: 0 }} value={form.customerId} onChange={(e) => set('customerId', e.target.value)}>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <Btn title="新增客户" onClick={openNewCustomer}>+</Btn>
              </div>
            </Field>
            <Field label="项目名称" required>
              <input value={form.projectName} onChange={(e) => set('projectName', e.target.value)} placeholder="手输本项目名称" />
            </Field>
            <Field label="成品名称（手输）" required>
              <input value={form.productName} onChange={(e) => set('productName', e.target.value)} placeholder="例如教学机器人" />
            </Field>
            <Field label="合同额" required>
              <input type="number" value={form.amount} onChange={(e) => set('amount', e.target.value)} />
            </Field>
            <Field label="预计交付日" required>
              <input type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
            </Field>
          </div>
        </Section>
        <Section title="附件" hint="图片可在线预览，其他文件可下载。">
          <div className="upload-box">
            <Btn onClick={() => fileRef.current?.click()}>上传附件</Btn>
            <input ref={fileRef} type="file" hidden onChange={onPick} />
            <p className="hint" style={{ marginTop: 8 }}>选本地文件后会出现在下面。图片点预览，PDF / 压缩包等点下载。</p>
          </div>
          <AttachList
            files={form.files}
            onPreview={setPreview}
            onMissing={() => flash({ ok: false, message: '示例附件没有文件内容，请重新上传后再预览或下载' })}
            onRemove={(i) => setForm((f) => ({ ...f, files: f.files.filter((_, idx) => idx !== i) }))}
          />
        </Section>
      </FormCard>
      {custOpen && (
        <Modal title="新增客户" okText="确认新增" onCancel={() => setCustOpen(false)} onOk={saveNewCustomer}>
          <p className="hint">新增后会同步到基础资料 · 客户管理，并自动选中。</p>
          <div className="form-stack">
            <Field label="客户" required>
              <input value={cust.name} onChange={(e) => setCust({ ...cust, name: e.target.value })} placeholder="学校 / 单位名称" />
            </Field>
            <Field label="联系人">
              <input value={cust.contact} onChange={(e) => setCust({ ...cust, contact: e.target.value })} />
            </Field>
            <Field label="电话">
              <input value={cust.phone} onChange={(e) => setCust({ ...cust, phone: e.target.value })} />
            </Field>
          </div>
        </Modal>
      )}
      {preview && (
        <Modal title={preview.name} okText="关闭" wide onCancel={() => setPreview(null)} onOk={() => setPreview(null)}>
          {isImageFile(preview) && fileSrc(preview) && (
            <img className="attach-preview" src={fileSrc(preview)} alt={preview.name} />
          )}
          {isPdfFile(preview) && fileSrc(preview) && (
            <iframe className="pdf-preview" title={preview.name} src={fileSrc(preview)} />
          )}
          <div className="row-actions" style={{ marginTop: 12 }}>
            <Btn onClick={() => downloadFile(preview)}>下载</Btn>
          </div>
        </Modal>
      )}
    </Page>
  )
}

export function OrderDetail() {
  const { id } = useParams()
  const { state, actions } = useStore()
  const nav = useNavigate()
  const { ask, flash, node } = useDialog()
  const so = state.salesOrders.find((s) => s.id === id)
  const [view, setView] = useState('detail')
  const sd = useSettleDialog()
  const [plan, setPlan] = useState(() => so?.fallDue || so?.plan || {})
  const [planEdit, setPlanEdit] = useState(false)
  const [planAsk, setPlanAsk] = useState(false)
  const [remindOn, setRemindOn] = useState(true)
  const [remindPeople, setRemindPeople] = useState(() => (state.employees[0] ? [state.employees[0].id] : []))
  const [remindNote, setRemindNote] = useState('项目计划已改期，请对照新日期。')
  const [preview, setPreview] = useState(null)
  if (!so) return <p>订单不存在</p>
  const rec = receivedOf(so)
  const rb = rcvBillOf(state, id)
  const rd = rb ? rcvBillDue(rb, state) : { base: 0, adjust: 0, paid: 0, total: 0, unpaid: 0 }
  const pos = state.purchaseOrders.filter((p) => p.soId === id)
  const pp = state.productionPlans.find((p) => p.soId === id)

  /** 收款：弹出登记窗，可改本次金额、也可以调整应收（+增加 / −让价抹零） */
  function receiveNow() {
    if (!rb) return
    sd.open({
      kind: 'rcv',
      title: `收款 · ${rb.id}`,
      summary: `收款单 ${rb.id}（项目 ${so.projectName}，客户 ${nameOf(state.customers, so.customerId)}）`,
      total: rd.total,
      paid: rd.paid,
      left: rd.unpaid,
      submit: (v) => {
        const r = actions.rcvBillSettle(rb.id, v)
        flash(r)
        return r
      },
    })
  }
  const out = state.outboundOrders.find((o) => o.soId === id)
  const des = state.designTasks.find((d) => d.soId === id)
  const attachFiles = [...(so.files || []), ...(des?.files || [])]
  const fg = fgOf(state, so)
  // 与首页「项目料未付」同一口径：只算这张采购订单里**项目料**那一部分（一单两料不能按整单算）
  const projectPos = pos
    .map((p) => ({ p, d: poDue(p, state), kinds: poLineKinds(state, p) }))
    .filter(({ d, kinds }) => kinds.has('项目料') && d.projUnpaid > 0)
  const unpaidRows = projectPos.map(({ p, d }) => ({
    id: p.id,
    poId: p.id,
    supplier: nameOf(state.suppliers, p.supplierId) || '—',
    mat: (p.lines || [])
      .filter((l) => state.products.find((x) => x.id === l.productId)?.type === '项目料')
      .map((l) => `${nameOf(state.products, l.productId)}${l.qty ? ` ×${l.qty}` : ''}`)
      .join('、'),
    recv: d.proj,
    unpaid: d.projUnpaid,
  }))
  const unpaid = unpaidRows.reduce((s, r) => s + r.unpaid, 0)
  const logs = state.logs.filter((l) => l.soId === id)
  // 真实留档为空的老单据，用「按现状还原」的里程碑顶上，不让页面空白
  const logBackfilled = logs.length === 0
  const logRows = logBackfilled ? backfillLogs(state, so) : logs
  const planLocked = !!so.planConfirmed && !planEdit
  const canOut = so.confirmStatus === 'confirmed' && so.closeStatus === 'open' && !out

  function togglePerson(empId) {
    setRemindPeople((ids) => (ids.includes(empId) ? ids.filter((x) => x !== empId) : [...ids, empId]))
  }

  function savePlan() {
    if (!so.planConfirmed) {
      ask('确认项目计划', '确认后不能随意改。以后改期须点「项目计划」旁的「变更」。', () => actions.confirmPlan(id, plan))
      return
    }
    setPlanAsk(true)
  }

  return (
    <Page
      crumb={<>销售管理 / 销售订单 / {so.projectName}</>}
      title={so.projectName}
      extra={
        <>
          <Btn onClick={() => nav('/sales')}>返回列表</Btn>
          <Btn onClick={() => {
            const ready = fgOutReady(state, id)
            if (!ready.ok) return flash(ready)
            nav(`/sales/abn/new?so=${id}`)
          }}>创建销售异常出库单</Btn>
          <Btn onClick={() => nav(`/purchase/part?so=${id}`)}>补件采购</Btn>
          {canOut && (
            <Btn onClick={() => {
              const ready = fgOutReady(state, id)
              if (!ready.ok) return flash(ready)
              const need = fgNeedQty(state, id)
              ask(
                '创建销售出库单',
                `项目「${so.projectName}」（${id}）。产品「${so.productName}」${need} 台（= 项目台数，不可改）。成品「${fg?.name || so.productName}」可用 ${fg?.stock ?? 0}。确认后创建出库单并绑定本销售订单。`,
                () => {
                  const r = actions.createSalesOut(id)
                  if (r.ok && r.id) nav(`/sales/out/${r.id}`)
                  return r
                },
              )
            }}>创建销售出库单</Btn>
          )}
          {so.confirmStatus === 'draft' && so.closeStatus === 'open' && (
            <>
              <Btn onClick={() => nav(`/sales/${id}/edit`)}>编辑</Btn>
              <Btn kind="primary" onClick={() => ask('确认', '确认后成为正式销售订单。', () => actions.confirmSO(id))}>确认</Btn>
              <Btn kind="danger" onClick={() => ask('删除草稿', '无下游且无收款才可删。', () => actions.deleteSO(id))}>删除</Btn>
            </>
          )}
          {so.confirmStatus === 'confirmed' && so.closeStatus === 'open' && (
            <Btn onClick={() => ask('回退确认', '无下游（设计 / BOM / 采购订单 / 生产 / 出库 / 收款）才允许。有则必须先回退下游。', () => actions.rollbackSO(id))}>回退确认</Btn>
          )}
          {soCanCancel(state, so) && (
            <Btn
              kind="danger"
              onClick={() => ask(
                '取消销售订单',
                `确认取消「${so.projectName}」？仅草稿/已确认、且下游一份单据都没有（连 BOM 草稿也没有）时可取消。若已有 BOM 草稿，请先到设计管理删除草稿再取消。`,
                () => actions.closeSO(id),
              )}
            >
              取消
            </Btn>
          )}
          {so.closeStatus === 'closed' && (
            <Btn onClick={() => ask('回退订单', '取消只是打了作废标记，单据内容没动过；回退后回到取消前的状态。', () => actions.reopenSO(id))}>回退</Btn>
          )}
        </>
      }
    >
      {node}
      <div className="card">
        <div className="row-actions" style={{ marginBottom: 12 }}>
          {statusTag(so.confirmStatus, so.closeStatus)}
          <span className="tag tag-orange">未收 ¥{(so.amount - rec).toLocaleString()}</span>
          <Btn onClick={() => setView(view === 'detail' ? 'fall' : 'detail')}>{view === 'detail' ? '瀑布流视图' : '传统详情'}</Btn>
        </div>
        {view === 'fall' ? (
          <FallProject index={1} so={so} state={state} nav={nav} hideHead />
        ) : (
          <div className="so-info">
            <div className="so-kv"><div className="k">项目</div><div>{so.projectName}</div></div>
            <div className="so-kv"><div className="k">单号</div><div>{so.id}</div></div>
            <div className="so-kv"><div className="k">客户</div><div>{nameOf(state.customers, so.customerId)}</div></div>
            <div className="so-kv"><div className="k">成品名称</div><div>{so.productName}</div></div>
            <div className="so-kv"><div className="k">合同额</div><div>¥ {so.amount.toLocaleString()}</div></div>
            <div className="so-kv"><div className="k">预计交付日</div><div>{so.dueDate}（= 培训完成）</div></div>
            <div className="so-kv"><div className="k">交付完成日</div><div>{out?.trainedAt || '未确认'}</div></div>
            <div className="so-kv"><div className="k">成品库存</div><div>{fg ? `${fg.name} 可用 ${fg.stock}` : '档案里没有对应成品'}</div></div>
          </div>
        )}
      </div>

      <div className="card">
        <h3>关联单据</h3>
        <div className="row-actions">
          <Btn onClick={() => nav(`/design/${id}`)}>设计任务</Btn>
          <Btn onClick={() => nav(`/design/bom/${id}`)}>BOM</Btn>
          <Btn onClick={() => nav('/purchase/po')}>采购订单</Btn>
          {pp && <Btn onClick={() => nav(`/production/${pp.id}`)}>生产计划</Btn>}
          {out && <Btn onClick={() => nav(`/sales/out/${out.id}`)}>销售出库单</Btn>}
          <Btn onClick={() => nav(`/sales/abn?soId=${id}`)}>销售异常出库单</Btn>
          <Btn onClick={() => nav(`/install/${id}`)}>安装调试</Btn>
          <Btn onClick={() => nav(`/install/train/${id}`)}>培训</Btn>
          <Btn onClick={() => nav('/sales/receipts')}>收款单</Btn>
        </div>
      </div>

      <div className="card">
        <h3>附件</h3>
        <p className="hint">含销售订单附件与设计任务上传的资料。图片可小图预览，PDF 可预览，其他文件可下载。</p>
        <AttachList
          files={attachFiles}
          onPreview={setPreview}
          onMissing={() => flash({ ok: false, message: '示例附件没有文件内容，请重新上传后再预览或下载' })}
        />
      </div>

      <div className="card">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          项目计划
          {so.planConfirmed && so.closeStatus === 'open' && (
            planEdit
              ? <Btn onClick={() => { setPlanEdit(false); setPlan(so.fallDue || so.plan || {}) }}>取消变更</Btn>
              : <Btn kind="primary" onClick={() => setPlanEdit(true)}>变更</Btn>
          )}
        </h3>
        <p className="hint">
          {so.planConfirmed
            ? (planEdit ? '变更中：改完后保存，会同步瀑布对应节点，并问是否按异常提醒相关的人。' : '已确认，不能直接改。要改请点旁边的「变更」。保存后会同步本页和首页瀑布。')
            : '第一次填写后点确认。确认后不能随意改。确认时会写入瀑布对应节点日期。'}
        </p>
        <div className="filters">
          {PLAN_KEYS.map(([k, label]) => (
            <Field key={k} label={label}>
              <input
                type="date"
                value={plan[k] || ''}
                disabled={planLocked}
                onChange={(e) => setPlan((p) => ({ ...p, [k]: e.target.value }))}
              />
            </Field>
          ))}
        </div>
        {(!so.planConfirmed || planEdit) && (
          <Btn kind="primary" onClick={savePlan}>{so.planConfirmed ? '保存变更' : '确认计划'}</Btn>
        )}
        <PlanShifts soId={id} state={state} />
      </div>

      <div className="card">
        <div className="card-head">
          <h3>收款单{rb && ` · ${rb.id}`}</h3>
          {rb && <BillTag due={rd} kind="rcv" />}
        </div>
        <div className="hint">
          每个销售订单由系统自动生成一张收款单（编号形如 RC-2026-001）。应收 = 合同额 + 应收调整（让价抹零可以写成负数），收款在收款单上登记。
        </div>
        {rb ? (
          <>
            <div className="detail-grid">
              <div className="k">应收合计</div><div>¥ {Math.round(rd.total).toLocaleString()}</div>
              <div className="k">已收 / 未收</div><div>¥ {Math.round(rd.paid).toLocaleString()} / <b>¥ {Math.round(rd.unpaid).toLocaleString()}</b></div>
            </div>
            <Table
              columns={[
                { key: 'date', title: '收款日期' },
                { key: 'amount', title: '本次收款', render: (r) => <b>¥ {Number(r.amount).toLocaleString()}</b> },
                { key: 'adjust', title: '应收调整', render: (r) => (Number(r.adjust || 0) ? `${r.adjust > 0 ? '+' : '−'}¥ ${Math.abs(Math.round(r.adjust)).toLocaleString()}（${r.adjustReason || '—'}）` : '—') },
                { key: 'method', title: '结算方式', render: (r) => r.method || '—' },
                { key: 'note', title: '备注', render: (r) => r.note || '—' },
                {
                  key: 'act',
                  title: '操作',
                  render: (r) => (
                    <OpsLinks items={[{ label: '回退', onClick: () => ask('回退收款', `回退本笔 ¥${Number(r.amount).toLocaleString()}。`, () => actions.rollbackRcvSettle(rb.id, r.id)) }]} />
                  ),
                },
              ]}
              rows={rb.settles || []}
            />
            <div className="row-actions" style={{ marginTop: 12 }}>
              {rd.unpaid > 0 && <Btn kind="primary" onClick={() => receiveNow()}>收款</Btn>}
              <Btn onClick={() => nav(`/sales/receipts/${rb.id}`)}>打开收款单</Btn>
            </div>
          </>
        ) : (
          <p className="hint">订单取消后不再生成收款单。</p>
        )}
      </div>

      <div className="card">
        <h3>本项目原料未付</h3>
        <p className="hint">
          口径与首页「项目料未付」一致：只算挂本项目、**含项目料**的采购订单里**项目料那一部分**（一单两料的单子不按整单算）。
          常备料未付在采购的付款单里。
        </p>
        <p>未付合计 ¥ {unpaid.toLocaleString()}</p>
        <Table
          columns={[
            { key: 'poId', title: '采购订单', link: true },
            { key: 'supplier', title: '供应商' },
            { key: 'mat', title: '项目料' },
            { key: 'recv', title: '已入库应付', render: (r) => `¥ ${Math.round(r.recv).toLocaleString()}` },
            { key: 'unpaid', title: '未付', render: (r) => <b>¥ {Math.round(r.unpaid).toLocaleString()}</b> },
            { key: 'act', title: '操作', render: (r) => (
              <OpsLinks items={[{ label: '去付款', onClick: () => nav(`/purchase/payable/${payBillOf(state, r.poId)?.id || ''}`) }]} />
            ) },
          ]}
          rows={unpaidRows}
          onRow={(r) => nav(`/purchase/po/${r.poId}`)}
        />
        {unpaid > 0 && (
          <div className="row-actions" style={{ marginTop: 12 }}>
            <Btn onClick={() => nav(`/purchase/payable?soId=${id}&from=${encodeURIComponent(`/sales/${id}`)}`)}>去本项目应付</Btn>
          </div>
        )}
      </div>

      <div className="card">
        <h3>项目操作记录</h3>
        <p className="hint">
          {logBackfilled
            ? '本单没有人工留档（历史 / 示例数据），下面是按单据现状还原的里程碑，仅供参考；此后每一步操作都会实时记录。'
            : '本项目留档。全部人工操作、系统触发和当前提醒在「操作记录」。'}
        </p>
        <Table
          columns={[
            { key: 'at', title: '时间' },
            { key: 'by', title: '操作人', render: (r) => r.by || '—' },
            { key: 'type', title: '类型' },
            { key: 'title', title: '事件' },
          ]}
          rows={logRows}
        />
        <Btn onClick={() => nav('/logs')}>打开操作记录</Btn>
      </div>
      {sd.node}
      {planAsk && (
        <Modal
          wide
          title="是否需要提醒"
          okText="保存变更"
          onCancel={() => setPlanAsk(false)}
          onOk={() => {
            const r = actions.changePlan(id, plan, { on: remindOn, people: remindPeople, note: remindNote })
            flash(r)
            if (r.ok) {
              setPlanAsk(false)
              setPlanEdit(false)
            }
          }}
        >
          <p>项目计划已改。要不要按异常提醒相关的人？</p>
          <Field label="是否提醒">
            <select value={remindOn ? '1' : '0'} onChange={(e) => setRemindOn(e.target.value === '1')}>
              <option value="1">需要提醒</option>
              <option value="0">不需要</option>
            </select>
          </Field>
          {remindOn && (
            <>
              <Field label="提醒谁" required>
                <div className="people-picks">
                  {state.employees.filter((emp) => emp.status !== 'off').map((emp) => (
                    <label key={emp.id}>
                      <input type="checkbox" checked={remindPeople.includes(emp.id)} onChange={() => togglePerson(emp.id)} />
                      {emp.name}（{emp.role}）
                    </label>
                  ))}
                </div>
              </Field>
              <Field label="说明">
                <input value={remindNote} onChange={(e) => setRemindNote(e.target.value)} />
              </Field>
            </>
          )}
        </Modal>
      )}
      {preview && (
        <Modal title={preview.name} okText="关闭" wide onCancel={() => setPreview(null)} onOk={() => setPreview(null)}>
          {isImageFile(preview) && fileSrc(preview) && (
            <img className="attach-preview" src={fileSrc(preview)} alt={preview.name} />
          )}
          {isPdfFile(preview) && fileSrc(preview) && (
            <iframe className="pdf-preview" title={preview.name} src={fileSrc(preview)} />
          )}
          {!fileSrc(preview) && <p className="hint">这个文件不能预览，请下载。</p>}
          <div className="row-actions" style={{ marginTop: 12 }}>
            {fileSrc(preview) && <Btn onClick={() => downloadFile(preview)}>下载</Btn>}
          </div>
        </Modal>
      )}
    </Page>
  )
}

/** 项目计划的调期记录（谁、什么时候、把哪个节点从哪天改到哪天）—— 与首页瀑布同一份数据 */
function PlanShifts({ soId, state }) {
  const rows = (state.fallAdjusts || []).filter((a) => a.soId === soId).slice(0, 8)
  if (!rows.length) return null
  return (
    <div className="shift-list">
      <b className="shift-title">调期记录 {rows.length}</b>
      {rows.map((a) => (
        <div key={a.id} className="shift-row">
          <span className="shift-node">{a.nodeLabel || a.nodeKey}</span>
          <span className="shift-dates">
            {String(a.from || '').slice(0, 10) || '—'} → {String(a.to || '').slice(0, 10)}
          </span>
          <span className="cell-mute">
            {String(a.at || '').replace('T', ' ').slice(0, 16)}　{a.by || ''}　{a.reason || ''}
          </span>
        </div>
      ))}
    </div>
  )
}

export function ReceiptList() {
  const { state, actions } = useStore()
  const nav = useNavigate()
  const { flash, node } = useDialog()
  const sd = useSettleDialog()
  const [q, setQ] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [soId, setSoId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [tab, setTab] = useState('all')
  const [page, setPage] = useState(1)

  // 每张收款单 = 一个销售订单
  const all = state.rcvBills
    .map((b) => {
      const so = state.salesOrders.find((s) => s.id === b.soId)
      const d = rcvBillDue(b, state)
      return { b, so, d, k: billStatus(d) }
    })
    .sort((x, y) => String(y.b.id).localeCompare(String(x.b.id)))
  const cnt = (fn) => all.filter(fn).length
  const TABS = [
    { key: 'all', label: '全部', count: all.length },
    { key: 'open', label: '待收款', count: cnt((x) => x.k === 'open') },
    { key: 'part', label: '部分收款', count: cnt((x) => x.k === 'part') },
    { key: 'done', label: '已收清', count: cnt((x) => x.k === 'all') },
  ]
  const rows = all.filter(({ b, so, k }) => {
    if (tab !== 'all' && k !== (tab === 'done' ? 'all' : tab)) return false
    if (q && !b.id.includes(q) && !(b.soId || '').includes(q)) return false
    if (customerId && so?.customerId !== customerId) return false
    if (soId && b.soId !== soId) return false
    if (from && b.date < from) return false
    if (to && b.date > to) return false
    return true
  })
  const sum = rows.reduce((a, { d }) => {
    a.total += d.total
    a.paid += d.paid
    a.unpaid += d.unpaid
    return a
  }, { total: 0, paid: 0, unpaid: 0 })

  /** 收款：弹出登记窗，可改本次金额、也可以调整应收（+增加 / −让价抹零） */
  function receiveNow(b, d, so) {
    sd.open({
      kind: 'rcv',
      title: `收款 · ${b.id}`,
      summary: `收款单 ${b.id}（项目 ${so?.projectName || b.soId}，客户 ${nameOf(state.customers, so?.customerId)}）`,
      total: d.total,
      paid: d.paid,
      left: d.unpaid,
      submit: (v) => {
        const r = actions.rcvBillSettle(b.id, v)
        flash(r)
        return r
      },
    })
  }

  return (
    <Page crumb={<>销售管理 / 收款单</>}>
      {node}
      {sd.node}
      <div className="card">
        <Tabs value={tab} onChange={(k) => { setTab(k); setPage(1) }} items={TABS} />
        <Filters onQuery={() => setPage(1)} onReset={() => { setQ(''); setCustomerId(''); setSoId(''); setFrom(''); setTo(''); setPage(1) }}>
          <Field label="收款单号 / 销售订单"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="RC- / SO-" /></Field>
          <Field label="客户">
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">全部客户</option>
              {state.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="项目">
            <select value={soId} onChange={(e) => setSoId(e.target.value)}>
              <option value="">全部项目</option>
              {state.salesOrders.map((s) => <option key={s.id} value={s.id}>{s.projectName}</option>)}
            </select>
          </Field>
          <Field label="业务日期从"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="业务日期到"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </Filters>
        <Table
          columns={[
            { key: 'id', title: '收款单号', link: true, render: (r) => r.b.id },
            { key: 'st', title: '单据状态', render: (r) => <BillTag due={r.d} kind="rcv" /> },
            { key: 'date', title: '业务日期', render: (r) => r.b.date || '—' },
            { key: 'cust', title: '客户', render: (r) => nameOf(state.customers, r.so?.customerId) },
            { key: 'proj', title: '项目', render: (r) => r.so?.projectName || r.b.soId },
            { key: 'so', title: '销售订单', render: (r) => r.b.soId },
            { key: 'base', title: '合同额', render: (r) => `¥ ${Math.round(r.d.base).toLocaleString()}` },
            { key: 'adj', title: '应收调整', render: (r) => (r.d.adjust ? `${r.d.adjust > 0 ? '+' : '−'}¥ ${Math.abs(Math.round(r.d.adjust)).toLocaleString()}` : '—') },
            { key: 'total', title: '应收合计', render: (r) => <b>¥ {Math.round(r.d.total).toLocaleString()}</b> },
            { key: 'paid', title: '已收', render: (r) => `¥ ${Math.round(r.d.paid).toLocaleString()}` },
            { key: 'left', title: '未收', render: (r) => `¥ ${Math.round(r.d.unpaid).toLocaleString()}` },
            {
              key: 'act',
              title: '操作',
              render: (r) => (
                <OpsLinks
                  items={[
                    { label: '查看', onClick: () => nav(`/sales/receipts/${r.b.id}`) },
                    r.d.unpaid > 0 && { label: '收款', onClick: () => receiveNow(r.b, r.d, r.so) },
                  ]}
                />
              ),
            },
          ]}
          rows={slicePage(rows, page)}
          onRow={(r) => nav(`/sales/receipts/${r.b.id}`)}
        />
        <Pager total={rows.length} page={page} onChange={setPage} />
        <p>
          当前筛选：应收合计 ¥ {Math.round(sum.total).toLocaleString()}
          　已收 ¥ {Math.round(sum.paid).toLocaleString()}
          　未收 <b>¥ {Math.round(sum.unpaid).toLocaleString()}</b>
        </p>
        <p className="hint">
          收款单**由系统按销售订单自动生成**（每个销售订单一张，编号形如 RC-2026-001），不用手工建。
          应收 = 合同额 + 应收调整；收款只能在收款单上登记，可一次也可多次。
        </p>
      </div>
    </Page>
  )
}

/** 收款单详情（金蝶式单据页：单据头 + 应收构成 + 收款明细） */
export function RcvBillDetail() {
  const { state, actions } = useStore()
  const { id } = useParams()
  const nav = useNavigate()
  const { ask, flash, node } = useDialog()
  const sd = useSettleDialog()
  const bill = state.rcvBills.find((b) => b.id === id)
  if (!bill) {
    return (
      <Page crumb={<>销售管理 / 收款单</>}>
        <div className="card">收款单 {id} 不存在。<Btn onClick={() => nav('/sales/receipts')}>返回列表</Btn></div>
      </Page>
    )
  }
  const so = state.salesOrders.find((s) => s.id === bill.soId)
  const d = rcvBillDue(bill, state)

  function receiveNow() {
    sd.open({
      kind: 'rcv',
      title: `收款 · ${bill.id}`,
      summary: `收款单 ${bill.id}（项目 ${so?.projectName || bill.soId}，客户 ${nameOf(state.customers, so?.customerId)}）`,
      total: d.total,
      paid: d.paid,
      left: d.unpaid,
      submit: (v) => {
        const r = actions.rcvBillSettle(bill.id, v)
        flash(r)
        return r
      },
    })
  }

  return (
    <Page
      crumb={<>销售管理 / 收款单 / {bill.id}</>}
      title={bill.id}
      extra={(
        <>
          <BillTag due={d} kind="rcv" />
          <Btn onClick={() => nav('/sales/receipts')}>返回列表</Btn>
          <Btn onClick={() => nav(`/sales/${bill.soId}`)}>看销售订单</Btn>
          {d.unpaid > 0 && <Btn kind="primary" onClick={receiveNow}>收款</Btn>}
        </>
      )}
    >
      {node}
      {sd.node}
      <div className="card">
        <div className="detail-grid">
          <div className="k">收款单号</div><div>{bill.id}</div>
          <div className="k">关联销售订单</div>
          <div><a className="link" onClick={() => nav(`/sales/${bill.soId}`)}>{bill.soId}</a></div>
          <div className="k">客户</div><div>{nameOf(state.customers, so?.customerId)}</div>
          <div className="k">项目</div><div>{so?.projectName || '—'}</div>
          <div className="k">业务日期</div>
          <div>
            <input type="date" value={bill.date || ''} onChange={(e) => actions.saveRcvBill(bill.id, { date: e.target.value })} />
          </div>
          <div className="k">应收合计</div>
          <div>
            ¥ {Math.round(d.total).toLocaleString()}
            {d.adjust !== 0 && <>（合同额 ¥ {Math.round(d.base).toLocaleString()} {d.adjust > 0 ? '+' : '−'} 调整 ¥ {Math.abs(Math.round(d.adjust)).toLocaleString()}）</>}
          </div>
          <div className="k">已收 / 未收</div>
          <div>¥ {Math.round(d.paid).toLocaleString()} / <b>¥ {Math.round(d.unpaid).toLocaleString()}</b></div>
          <div className="k">备注</div>
          <div>
            <RemarkInput value={bill.remark} onSave={(v) => actions.saveRcvBill(bill.id, { remark: v })} placeholder="收款单备注，例如：含运费 / 分期" />
          </div>
        </div>
      </div>

      <div className="card">
        <h3>应收构成</h3>
        <Table
          columns={[
            { key: 'item', title: '项目' },
            { key: 'val', title: '金额' },
          ]}
          rows={[
            { id: 'base', item: `合同额（${so?.productName || '产品'}）`, val: `¥ ${Math.round(d.base).toLocaleString()}` },
            { id: 'adj', item: '应收调整合计', val: d.adjust ? `${d.adjust > 0 ? '+' : '−'}¥ ${Math.abs(Math.round(d.adjust)).toLocaleString()}` : '—' },
            { id: 'total', item: '应收合计', val: `¥ ${Math.round(d.total).toLocaleString()}` },
          ]}
        />
        {d.adjust !== 0 && (
          <>
            <h3 style={{ marginTop: 14 }}>应收调整明细</h3>
            <Table
              columns={[
                { key: 'date', title: '日期' },
                { key: 'amount', title: '调整金额', render: (r) => `${r.adjust > 0 ? '+' : '−'}¥ ${Math.abs(Math.round(r.adjust)).toLocaleString()}` },
                { key: 'reason', title: '调整原因', render: (r) => r.adjustReason || '—' },
                { key: 'note', title: '对应收款', render: (r) => `¥ ${Number(r.amount).toLocaleString()}` },
              ]}
              rows={(bill.settles || []).filter((s) => Number(s.adjust || 0) !== 0)}
            />
          </>
        )}
        <p className="hint">
          合同额改不了就体现在这里：客户让价、抹零、加配置，都在收款时用「应收调整」加减，并写清原因。
        </p>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>收款明细 {d.paid > 0 && `（已收 ¥${Math.round(d.paid).toLocaleString()}）`}</h3>
          {d.unpaid > 0 && <Btn kind="primary" onClick={receiveNow}>收款</Btn>}
        </div>
        <Table
          columns={[
            { key: 'id', title: '序号', render: (r, i) => i + 1 },
            { key: 'date', title: '收款日期' },
            { key: 'amount', title: '本次收款', render: (r) => <b>¥ {Number(r.amount).toLocaleString()}</b> },
            { key: 'adjust', title: '应收调整', render: (r) => (Number(r.adjust || 0) ? `${r.adjust > 0 ? '+' : '−'}¥ ${Math.abs(Math.round(r.adjust)).toLocaleString()}（${r.adjustReason || '—'}）` : '—') },
            { key: 'method', title: '结算方式', render: (r) => r.method || '—' },
            { key: 'note', title: '备注', render: (r) => r.note || '—' },
            {
              key: 'act',
              title: '操作',
              render: (r) => (
                <OpsLinks items={[{ label: '回退', onClick: () => ask('回退本笔收款', `回退 ¥${Number(r.amount).toLocaleString()}，回退后本单未收会变多。`, () => actions.rollbackRcvSettle(bill.id, r.id)) }]} />
              ),
            },
          ]}
          rows={bill.settles || []}
        />
        {(bill.settles || []).length === 0 && <p className="hint">还没收过款。点右上角「收款」登记第一笔。</p>}
      </div>
    </Page>
  )
}