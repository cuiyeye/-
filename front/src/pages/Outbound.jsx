import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { fgNeedQty, fgOf, fgOutedQty, nameOf, outCanCancel, outDocStatus, outDocStatusLabel, useStore } from '../store'
import { Btn, DocStatus, Field, Filters, FormCard, OpsLinks, Page, Pager, ProgressCell, Section, Table, Tabs, useDialog, slicePage } from '../ui'

function outStatus(out) {
  if (!out) return '未生成'
  const k = outDocStatus(out)
  return k === 'cancelled' ? '已取消' : outDocStatusLabel(k)
}
function outTag(out) {
  return <DocStatus value={outDocStatusLabel(outDocStatus(out))} />
}

export { outStatus }

function aboRows(abo) {
  return (abo?.remarks || (abo?.remark ? [{ at: abo.at, text: abo.remark }] : [])).map((n, i) => ({ ...n, id: i }))
}

function projectMats(state, soId) {
  const bom = state.boms.find((b) => b.soId === soId)
  return (bom?.lines || []).map((l) => {
    const p = state.products.find((x) => x.id === l.productId)
    return {
      productId: l.productId || '',
      name: p?.name || l.name || '',
      qty: Number(l.per || 0) * Number(bom?.qty || 1),
      unit: p?.unit || l.unit || '',
    }
  }).filter((m) => m.productId || m.name)
}

function emptyAbnLine() {
  return { productId: '', name: '', qty: '', note: '' }
}

function soSnap(state, soId) {
  const so = state.salesOrders.find((s) => s.id === soId)
  const bom = state.boms.find((b) => b.soId === soId)
  const need = bom ? Number(bom.qty || 1) : 0
  const out = state.outboundOrders.find((o) => o.soId === soId)
  const outed = fgOutedQty(state, soId)
  const lack = Math.max(0, (need || 0) - outed)
  return {
    so,
    bom,
    need,
    out,
    outed,
    lack,
    productName: so?.productName || '',
    fg: fgOf(state, so),
  }
}

export function OutList() {
  const { state, actions } = useStore()
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const { ask, node } = useDialog()
  const [tab, setTab] = useState(sp.get('tab') || 'all')
  const [q, setQ] = useState('')
  const [soId, setSoId] = useState('')
  const [page, setPage] = useState(1)

  const counts = useMemo(() => {
    const all = state.outboundOrders
    return {
      all: all.length,
      pending: all.filter((r) => outDocStatus(r) === 'pending').length,
      way: all.filter((r) => outDocStatus(r) === 'way').length,
      signed: all.filter((r) => outDocStatus(r) === 'signed').length,
      cancelled: all.filter((r) => outDocStatus(r) === 'cancelled').length,
    }
  }, [state.outboundOrders])

  const rows = state.outboundOrders.filter((r) => {
    if (tab !== 'all' && outDocStatus(r) !== tab) return false
    if (q && !r.id.includes(q) && !(state.salesOrders.find((s) => s.id === r.soId)?.projectName || '').includes(q)) return false
    if (soId && r.soId !== soId) return false
    return true
  })
  return (
    <Page crumb={<>销售管理 / 销售出库单</>}>
      {node}
      <div className="card">
        <Tabs
          value={tab}
          onChange={(k) => { setTab(k); setPage(1) }}
          items={[
            { key: 'all', label: '全部', count: counts.all },
            { key: 'pending', label: '待出库', count: counts.pending },
            { key: 'way', label: '在途', count: counts.way },
            { key: 'signed', label: '已签收', count: counts.signed },
            { key: 'cancelled', label: '已取消', count: counts.cancelled },
          ]}
        />
        <Filters onQuery={() => setPage(1)} onReset={() => { setQ(''); setSoId(''); setPage(1) }}>
          <Field label="出库单号 / 项目"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="出库单号或项目名" /></Field>
          <Field label="项目">
            <select value={soId} onChange={(e) => setSoId(e.target.value)}>
              <option value="">全部项目</option>
              {state.salesOrders.map((s) => <option key={s.id} value={s.id}>{s.projectName}</option>)}
            </select>
          </Field>
        </Filters>
        <div className="list-toolbar">
          <Btn kind="primary" onClick={() => nav('/sales/out/new')}>新增</Btn>
        </div>
        <Table
          onRow={(r) => nav(`/sales/out/${r.id}`)}
          columns={[
            { key: 'id', title: '销售出库单', link: true },
            { key: 'st', title: '单据状态', render: (r) => outTag(r) },
            { key: 'soId', title: '销售订单' },
            { key: 'proj', title: '项目', render: (r) => state.salesOrders.find((s) => s.id === r.soId)?.projectName || r.soId },
            { key: 'product', title: '产品', render: (r) => state.salesOrders.find((s) => s.id === r.soId)?.productName || '—' },
            { key: 'qty', title: '台数' },
            {
              key: 'act',
              title: '操作',
              render: (r) => (
                <OpsLinks
                  items={[
                    { label: '查看', onClick: () => nav(`/sales/out/${r.id}`) },
                    outCanCancel(r) && {
                      label: '取消',
                      onClick: () => ask('取消销售出库单', '只有没有出库过的单据才能取消。取消后不能再确认出库，可在列表「已取消」里回退。', () => actions.cancelOut(r.id)),
                    },
                    r.closeStatus === 'closed' && {
                      label: '回退',
                      onClick: () => ask('回退销售出库单', '取消只是打了作废标记，单据内容没动过；回退后回到取消前的状态。', () => actions.reopenOut(r.id)),
                    },
                  ]}
                />
              ),
            },
          ]}
          rows={slicePage(rows, page)}
        />
        <Pager total={rows.length} page={page} onChange={setPage} />
      </div>
    </Page>
  )
}

export function OutForm() {
  const { state, actions } = useStore()
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const { flash, node } = useDialog()
  const lockedSo = sp.get('so') || ''
  const [soId, setSoId] = useState(lockedSo)
  const ready = state.salesOrders.filter(
    (s) => s.confirmStatus === 'confirmed'
      && s.closeStatus !== 'closed'
      && !state.outboundOrders.some((o) => o.soId === s.id),
  )
  const so = state.salesOrders.find((s) => s.id === soId)
  const hasBom = state.boms.some((b) => b.soId === soId)
  const need = soId ? fgNeedQty(state, soId) : 0
  const fg = fgOf(state, so)
  const lockPick = !!lockedSo && ready.some((s) => s.id === lockedSo)

  function pickSo(id) {
    if (lockPick) return
    setSoId(id)
  }

  function save() {
    if (!soId) return flash({ ok: false, message: '请选择关联的销售订单' })
    const res = actions.createSalesOut(soId)
    if (res.ok && res.id) return nav(`/sales/out/${res.id}`)
    return flash(res)
  }

  return (
    <Page crumb={<>销售管理 / 销售出库单 / 新建</>}>
      {node}
      <FormCard
        title="创建销售出库单"
        extra={
          <>
            <Btn onClick={() => nav(lockedSo ? `/sales/${lockedSo}` : '/sales/out')}>返回</Btn>
            <Btn kind="primary" onClick={save}>创建</Btn>
          </>
        }
      >
        <Section title="关联销售订单" hint="出库单绑定销售订单（项目）。出库台数固定为项目台数，不能改。只能选已确认、未取消、且还没有出库单的订单。">
          <div className="filters">
            <Field label="销售订单" required>
              {lockPick ? (
                <input value={`${so?.id || lockedSo} · ${so?.projectName || ''}`} disabled />
              ) : (
                <select value={soId} onChange={(e) => pickSo(e.target.value)}>
                  <option value="">请选择</option>
                  {ready.map((s) => <option key={s.id} value={s.id}>{s.id} · {s.projectName}</option>)}
                </select>
              )}
            </Field>
            <Field label="项目">
              <input value={so?.projectName || ''} disabled />
            </Field>
            <Field label="产品名称">
              <input value={so?.productName || ''} disabled />
            </Field>
            <Field label="出库台数（= 项目台数）">
              <input value={soId ? (hasBom ? `${need} 台` : '未建 BOM') : ''} disabled />
            </Field>
            <Field label="成品可用库存">
              <input value={soId ? String(fg?.stock ?? '—') : ''} disabled />
            </Field>
          </div>
          {ready.length === 0 && <p className="hint">没有可出库的销售订单：订单需先确认，且不能已有销售出库单。</p>}
        </Section>
      </FormCard>
    </Page>
  )
}

export function OutDetail() {
  const { id } = useParams()
  const { state, actions } = useStore()
  const nav = useNavigate()
  const { ask, node } = useDialog()
  const out = state.outboundOrders.find((o) => o.id === id)
  if (!out) return <p>不存在</p>
  const so = state.salesOrders.find((s) => s.id === out.soId)
  const snap = soSnap(state, out.soId)
  const need = snap.need || out.qty
  return (
    <Page crumb={<>销售管理 / 销售出库单 / {id}</>} title={id} extra={<Btn onClick={() => nav('/sales/out')}>返回</Btn>}>
      {node}
      <div className="card">
        <div className="detail-grid">
          <div className="k">项目</div><div>{so?.projectName}（{out.soId}）</div>
          <div className="k">产品</div><div>{so?.productName || '—'}</div>
          <div className="k">出库台数</div><div>{need} 台（= 项目台数，不可改）</div>
          <div className="k">出库状态</div><div>{outDocStatus(out) === 'cancelled' ? '已取消' : outDocStatusLabel(outDocStatus(out))}</div>
          <div className="k">在途</div><div>{outDocStatus(out) === 'way' ? '成品在途' : out.signed ? '已签收，在途完结' : '尚未出库'}</div>
          <div className="k">安装调试</div><div>{out.installed ? `已完成 ${out.installedAt}` : '未确认'}</div>
          <div className="k">培训</div><div>{out.trained ? `已完成 ${out.trainedAt}` : '未确认'}</div>
          <div className="k">备注</div><div>{out.remark || '—'}</div>
        </div>
        <div className="row-actions">
          {outCanCancel(out) && (
            <Btn kind="primary" onClick={() => ask('确认出库', `「${so?.productName || '成品'}」${need} 台（项目台数）视作成品全部出库，扣成品库存。成品库存不够不允许负库存。`, () => actions.confirmOut(id))}>确认出库</Btn>
          )}
          {out.status === 'done' && !out.signed && <Btn kind="primary" onClick={() => ask('签收', '办公室代点。不形成客户应收。', () => actions.signOut(id))}>签收</Btn>}
          {out.signed && <Btn onClick={() => ask('回退签收', '已确认安装调试须先回退。', () => actions.rollbackSign(id))}>回退签收</Btn>}
          {out.status === 'done' && <Btn onClick={() => ask('回退出库', '未签收，或下游已回退。', () => actions.rollbackOut(id))}>回退出库</Btn>}
          {outCanCancel(out) && <Btn kind="danger" onClick={() => ask('取消销售出库单', '还没出库就能取消。取消后可在列表「已取消」里回退。', () => actions.cancelOut(id))}>取消</Btn>}
          {out.closeStatus === 'closed' && <Btn onClick={() => ask('回退销售出库单', '取消只是打了作废标记，单据内容没动过；回退后回到取消前的状态。', () => actions.reopenOut(id))}>回退</Btn>}
          {so && <Btn onClick={() => nav(`/install/${so.id}`)}>安装调试</Btn>}
          {so && <Btn onClick={() => nav(`/install/train/${so.id}`)}>培训</Btn>}
        </div>
      </div>
    </Page>
  )
}

export function AbnOutList() {
  const { state, actions } = useStore()
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const { ask, node } = useDialog()
  const [tab, setTab] = useState(sp.get('tab') || 'all')
  const [q, setQ] = useState('')
  const [soId, setSoId] = useState(sp.get('soId') || '')
  const [page, setPage] = useState(1)

  const counts = useMemo(() => {
    const all = state.abnormals
    return {
      all: all.length,
      pending: all.filter((r) => outDocStatus(r) === 'pending').length,
      way: all.filter((r) => outDocStatus(r) === 'way').length,
      signed: all.filter((r) => outDocStatus(r) === 'signed').length,
      cancelled: all.filter((r) => outDocStatus(r) === 'cancelled').length,
    }
  }, [state.abnormals])

  const rows = state.abnormals.filter((r) => {
    const so = state.salesOrders.find((s) => s.id === r.soId)
    if (tab !== 'all' && outDocStatus(r) !== tab) return false
    if (q && !r.id.includes(q) && !(so?.projectName || '').includes(q) && !(r.remark || '').includes(q)) return false
    if (soId && r.soId !== soId) return false
    return true
  })
  return (
    <Page crumb={<>销售管理 / 销售异常出库单</>}>
      {node}
      <div className="card">
        <Tabs
          value={tab}
          onChange={(k) => { setTab(k); setPage(1) }}
          items={[
            { key: 'all', label: '全部', count: counts.all },
            { key: 'pending', label: '待出库', count: counts.pending },
            { key: 'way', label: '在途', count: counts.way },
            { key: 'signed', label: '已签收', count: counts.signed },
            { key: 'cancelled', label: '已取消', count: counts.cancelled },
          ]}
        />
        <Filters onQuery={() => setPage(1)} onReset={() => { setQ(''); setSoId(''); setPage(1) }}>
          <Field label="异常出库单号"><input value={q} onChange={(e) => setQ(e.target.value)} /></Field>
          <Field label="项目">
            <select value={soId} onChange={(e) => setSoId(e.target.value)}>
              <option value="">全部项目</option>
              {state.salesOrders.map((s) => <option key={s.id} value={s.id}>{s.projectName}</option>)}
            </select>
          </Field>
        </Filters>
        <div className="list-toolbar">
          <Btn kind="primary" onClick={() => nav('/sales/abn/new')}>新增</Btn>
        </div>
        <Table
          onRow={(r) => nav(`/sales/abn/${r.id}`)}
          columns={[
            { key: 'id', title: '异常出库单', link: true },
            { key: 'st', title: '单据状态', render: (r) => outTag(r) },
            { key: 'proj', title: '项目', render: (r) => state.salesOrders.find((s) => s.id === r.soId)?.projectName || r.soId },
            { key: 'product', title: '产品', render: (r) => r.productName || state.salesOrders.find((s) => s.id === r.soId)?.productName || '—' },
            { key: 'qty', title: '台数', render: (r) => r.qty || '—' },
            { key: 'outId', title: '销售出库单' },
            { key: 'mat', title: '未发物料', render: (r) => (r.lines || []).map((l) => `${l.name || nameOf(state.products, l.productId)}×${l.qty}`).join('、') || '—' },
            { key: 'at', title: '时间' },
            { key: 'remark', title: '说明' },
            {
              key: 'act',
              title: '操作',
              render: (r) => (
                <OpsLinks
                  items={[
                    { label: '查看', onClick: () => nav(`/sales/abn/${r.id}`) },
                    r.confirmStatus !== 'confirmed' && r.closeStatus !== 'closed' && {
                      label: '删除',
                      onClick: () => ask('删除异常出库草稿', '草稿删除后不再出现在列表，并记入操作记录。', () => actions.rollbackSalesAbn(r.id)),
                    },
                    outCanCancel(r) && {
                      label: '取消',
                      onClick: () => ask('取消销售异常出库单', '只有还没出库的才能取消，取消后可在「已取消」里回退。', () => actions.cancelAbn(r.id)),
                    },
                    r.closeStatus === 'closed' && {
                      label: '回退',
                      onClick: () => ask('回退销售异常出库单', '取消只是打了作废标记，单据内容没动过；回退后回到取消前的状态。', () => actions.reopenAbn(r.id)),
                    },
                  ]}
                />
              ),
            },
          ]}
          rows={slicePage(rows, page)}
        />
        <Pager total={rows.length} page={page} onChange={setPage} />
      </div>
    </Page>
  )
}

export function AbnOutForm() {
  const { state, actions } = useStore()
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const { ask, flash, node } = useDialog()
  const lockedSo = sp.get('so') || ''
  const ready = state.salesOrders.filter((s) => s.confirmStatus === 'confirmed')
  const [soId, setSoId] = useState(lockedSo)
  const [lines, setLines] = useState(() => (
    lockedSo ? (projectMats(state, lockedSo).length ? projectMats(state, lockedSo) : [emptyAbnLine()]) : []
  ))
  const [notes, setNotes] = useState([])
  const [noteDraft, setNoteDraft] = useState('')
  const snap = soSnap(state, soId)
  const mats = state.products.filter((p) => p.type !== '成品' && p.status !== 'off')
  const lockPick = !!lockedSo && ready.some((s) => s.id === lockedSo)

  function pickSo(id) {
    if (lockPick) return
    setSoId(id)
    setLines(id ? (projectMats(state, id).length ? projectMats(state, id) : [emptyAbnLine()]) : [])
  }

  function setLine(i, k, v) {
    const n = [...lines]
    n[i] = { ...n[i], [k]: v }
    if (k === 'productId') {
      const p = mats.find((x) => x.id === v)
      n[i].name = p?.name || ''
      if (p?.unit && !n[i].unit) n[i].unit = p.unit
    }
    setLines(n)
  }

  function addAfter(i) {
    const n = [...lines]
    n.splice(i + 1, 0, emptyAbnLine())
    setLines(n)
  }

  function removeRow(i) {
    setLines(lines.length <= 1 ? [emptyAbnLine()] : lines.filter((_, j) => j !== i))
  }

  function addNote() {
    const t = String(noteDraft || '').trim()
    if (!t) return
    const d = new Date()
    const p = (n) => String(n).padStart(2, '0')
    const at = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
    setNotes((list) => [{ at, text: t }, ...list])
    setNoteDraft('')
  }

  function save(confirm) {
    if (!soId) return flash({ ok: false, message: '请选择项目' })
    const qty = snap.need || fgNeedQty(state, soId)
    const fg = snap.fg
    if (!fg) return flash({ ok: false, message: '成品档案里没有这个成品，不能出库' })
    if (Number(fg.stock || 0) < qty) {
      return flash({ ok: false, message: `成品库存不足（可用 ${fg.stock ?? 0}，需要 ${qty}）。请先完成生产入库后再创建异常出库单` })
    }
    const filled = lines.filter((l) => (l.productId || l.name) && Number(l.qty) > 0)
    if (!filled.length) return flash({ ok: false, message: '请在表格里填写未发物料' })
    ask(
      confirm ? '确认销售异常出库单' : '保存草稿',
      confirm
        ? `项目「${snap.so?.projectName || ''}」（${soId}）。「${snap.productName || '成品'}」${qty} 台（= 项目台数）按成品全部出库，扣成品库存。未发物料只登记，不改物料库存。`
        : '草稿不扣库存。确认后才按项目台数扣成品库存。成品库存须足够才能保存。',
      () => {
        const r = actions.createSalesAbn({
          soId,
          qty,
          lines: filled,
          remarks: notes,
          confirm,
        })
        if (r.ok) nav(r.id ? `/sales/abn/${r.id}` : '/sales/abn')
        return r
      },
    )
  }

  return (
    <Page crumb={<>销售管理 / 销售异常出库单 / 新增</>}>
      {node}
      <FormCard
        title="新增销售异常出库单"
        extra={
          <>
            <Btn onClick={() => nav(lockedSo ? `/sales/${lockedSo}` : '/sales/abn')}>返回</Btn>
            <Btn onClick={() => save(false)}>保存</Btn>
            <Btn kind="primary" onClick={() => save(true)}>确认</Btn>
          </>
        }
      >
        <Section title="项目" hint="异常出库单绑定销售订单（项目）。出库台数固定为项目台数，不能改。须先有成品库存。表格里只登记这次没发出去的物料。">
          <div className="filters">
            <Field label="销售订单" required>
              {lockPick ? (
                <input value={`${snap.so?.id || lockedSo} · ${snap.so?.projectName || ''}`} disabled />
              ) : (
                <select value={soId} onChange={(e) => pickSo(e.target.value)}>
                  <option value="">请选择</option>
                  {ready.map((s) => <option key={s.id} value={s.id}>{s.id} · {s.projectName}</option>)}
                </select>
              )}
            </Field>
            <Field label="项目">
              <input value={snap.so?.projectName || ''} disabled />
            </Field>
            <Field label="产品名称">
              <input value={snap.productName} disabled />
            </Field>
            <Field label="出库台数（= 项目台数）">
              <input value={snap.so ? (snap.bom ? `${snap.need} 台` : '未建 BOM') : ''} disabled />
            </Field>
            <Field label="成品可用库存">
              <input value={snap.so ? String(snap.fg?.stock ?? '—') : ''} disabled />
            </Field>
          </div>
          {ready.length === 0 && <p className="hint">请先确认销售订单。</p>}
          {soId && snap.fg && Number(snap.fg.stock || 0) < (snap.need || 1) && (
            <p className="hint">成品库存不足，请先完成生产入库后再创建异常出库单。</p>
          )}
        </Section>
        <Section title="未发物料" hint={soId ? '默认带出本项目物料。指针移到表格上会显示加行、减行。' : '请先选择项目。'}>
          {soId ? (
            <div className="excel-wrap">
              <table className="excel">
                <thead>
                  <tr>
                    <th>行</th>
                    <th>物料</th>
                    <th>未发数量</th>
                    <th>备注</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((r, i) => {
                    const p = mats.find((x) => x.id === r.productId)
                    return (
                      <tr key={i}>
                        <td className="idx">
                          <span className="row-n">{i + 1}</span>
                          <span className="row-ops">
                            <button type="button" className="row-op" title="加行" onClick={() => addAfter(i)}>+</button>
                            <button type="button" className="row-op" title="减行" onClick={() => removeRow(i)}>−</button>
                          </span>
                        </td>
                        <td>
                          <select value={r.productId || ''} onChange={(e) => setLine(i, 'productId', e.target.value)}>
                            <option value="">请选择</option>
                            {mats.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                          </select>
                        </td>
                        <td>
                          <input type="number" value={r.qty} onChange={(e) => setLine(i, 'qty', e.target.value)} />
                        </td>
                        <td>
                          <input value={r.note || ''} onChange={(e) => setLine(i, 'note', e.target.value)} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : <p className="hint">请先选择项目。</p>}
        </Section>
        <Section title="说明" hint="任何时候都可以添加，不限条数。">
          <div className="row-actions" style={{ marginBottom: notes.length ? 8 : 0 }}>
            <input value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder="可随时添加，不限条数" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNote() } }} />
            <Btn onClick={addNote}>添加</Btn>
          </div>
          {notes.length > 0 && (
            <Table
              columns={[
                { key: 'at', title: '时间' },
                { key: 'text', title: '说明' },
                { key: 'act', title: '操作', render: (r) => <Btn onClick={() => setNotes(notes.filter((_, i) => i !== r.id))}>删</Btn> },
              ]}
              rows={notes.map((n, i) => ({ ...n, id: i }))}
            />
          )}
        </Section>
      </FormCard>
    </Page>
  )
}

export function AbnOutDetail() {
  const { id } = useParams()
  const { state, actions } = useStore()
  const nav = useNavigate()
  const { ask, flash, node } = useDialog()
  const [note, setNote] = useState('')
  const row = state.abnormals.find((a) => a.id === id)
  if (!row) return <p>不存在</p>
  const so = state.salesOrders.find((s) => s.id === row.soId)
  return (
    <Page
      crumb={<>销售管理 / 销售异常出库单 / {id}</>}
      title={id}
      extra={<Btn onClick={() => nav('/sales/abn')}>返回</Btn>}
    >
      {node}
      <div className="card">
        <div className="detail-grid">
          <div className="k">项目</div><div>{so?.projectName}（{row.soId}）</div>
          <div className="k">产品</div><div>{row.productName || so?.productName || '—'}</div>
          <div className="k">出库台数</div><div>{row.qty ? `${row.qty} 台（成品全部出库）` : '—'}</div>
          <div className="k">销售出库单</div><div>{row.outId || '—'}</div>
          <div className="k">单据状态</div><div>{outDocStatus(row) === 'cancelled' ? '已取消' : outDocStatusLabel(outDocStatus(row))}</div>
          <div className="k">签收</div><div>{row.signed ? `已签收 ${row.signedAt || ''}` : '未签收'}</div>
        </div>
        <Table
          columns={[
            { key: 'name', title: '未发物料', render: (r) => r.name || nameOf(state.products, r.productId) },
            { key: 'qty', title: '未发数量' },
            { key: 'note', title: '备注' },
          ]}
          rows={(row.lines || []).map((l, i) => ({ ...l, id: i }))}
        />
        <div className="row-actions" style={{ marginTop: 12 }}>
          {row.closeStatus !== 'closed' && row.status !== 'done' && <Btn kind="primary" onClick={() => ask('确认', `「${row.productName || so?.productName || '成品'}」${row.qty || ''} 台按成品全部出库，扣成品库存。未发物料只登记，不改物料库存。`, () => actions.confirmSalesAbn(id))}>确认出库</Btn>}
          {row.status === 'done' && !row.signed && <Btn kind="primary" onClick={() => ask('签收', '客户已收到货，标记在途完结。', () => actions.signAbn(id))}>签收</Btn>}
          {row.signed && <Btn onClick={() => ask('回退签收', '回到在途状态。', () => actions.rollbackSignAbn(id))}>回退签收</Btn>}
          {row.status === 'done' && <Btn onClick={() => ask('回退', row.status === 'done' ? '回退确认，回到草稿（待出库）。' : '草稿将被删除。', () => { const r = actions.rollbackSalesAbn(id); if (r.ok && row.confirmStatus !== 'confirmed') nav('/sales/abn'); return r })}>回退出库</Btn>}
          {row.closeStatus !== 'closed' && row.status !== 'done' && <Btn kind="danger" onClick={() => ask('取消销售异常出库单', '还没出库就能取消，取消后可在列表「已取消」里回退。', () => actions.cancelAbn(id))}>取消</Btn>}
          {row.closeStatus === 'closed' && <Btn onClick={() => ask('回退销售异常出库单', '取消只是打了作废标记，单据内容没动过；回退后回到取消前的状态。', () => actions.reopenAbn(id))}>回退</Btn>}
          {so && <Btn onClick={() => nav(`/sales/${so.id}`)}>回销售订单</Btn>}
          {row.outId && <Btn onClick={() => nav(`/sales/out/${row.outId}`)}>看出库单</Btn>}
        </div>
      </div>
      <div className="card">
        <h3>说明</h3>
        <p className="hint">任何时候都可以添加，不限条数。</p>
        <div className="row-actions">
          <input style={{ flex: 1, height: 32, border: '1px solid #e5e6eb', borderRadius: 6, padding: '0 8px' }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="填写说明后点添加" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const r = actions.addAboNote(id, note); flash(r); if (r.ok) setNote('') } }} />
          <Btn onClick={() => { const r = actions.addAboNote(id, note); flash(r); if (r.ok) setNote('') }}>添加</Btn>
        </div>
        <Table
          columns={[{ key: 'at', title: '时间' }, { key: 'text', title: '说明' }]}
          rows={aboRows(row)}
        />
      </div>
    </Page>
  )
}
