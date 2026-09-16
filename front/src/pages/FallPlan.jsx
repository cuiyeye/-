import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { nameOf, useStore } from '../store'
import { Btn, Field, Filters, Modal, Page, Table, useDialog } from '../ui'
import { usePlanNotice } from '../planNotice'
import { FallProject } from './Home'

const FALL_NODES = [
  { key: 'design', label: '设计' },
  { key: 'bom', label: 'BOM' },
  { key: 'purchase', label: '采购' },
  { key: 'inbound', label: '入库' },
  { key: 'structure', label: '结构' },
  { key: 'circuit', label: '电路' },
  { key: 'robot', label: '机器人' },
  { key: 'assemble', label: '装配' },
  { key: 'outbound', label: '成品出库' },
  { key: 'install', label: '安装调试' },
  { key: 'train', label: '培训' },
]

export default function FallPlan({ mode }) {
  const { soId } = useParams()
  if (mode === 'done') return <FallDone />
  if (mode === 'logs') return <FallLogs />
  if (mode === 'edit') return <FallPick kind="edit" />
  if (mode === 'new' || !soId) return <FallPick kind="new" />
  return <FallEdit soId={soId} />
}

function trainedOf(state, soId) {
  return !!state.outboundOrders.find((o) => o.soId === soId)?.trained
}

function FallPick({ kind }) {
  const { state } = useStore()
  const nav = useNavigate()
  const isEdit = kind === 'edit'
  const rows = state.salesOrders.filter((s) => {
    if (s.confirmStatus !== 'confirmed' || s.closeStatus !== 'open') return false
    if (trainedOf(state, s.id)) return false
    return isEdit ? s.fallConfirmed : !s.fallConfirmed
  })
  const title = isEdit ? '编辑瀑布计划' : '新增瀑布计划'
  const back = '/'
  return (
    <Page crumb={<>首页 / {title}</>}>
      <div className="card">
        <div className="list-toolbar">
          <Btn onClick={() => nav(back)}>返回首页</Btn>
        </div>
        {rows.length === 0 && (
          <p className="hint">
            {isEdit ? '当前没有可调整的在做项目。' : '没有可新增的项目。请先确认销售订单，且尚未做过瀑布计划。'}
          </p>
        )}
        {rows.length > 0 && (
          <table className="data">
            <thead>
              <tr>
                <th>销售订单</th>
                <th>项目</th>
                <th>客户</th>
                <th>预计交付</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td>{s.id}</td>
                  <td>{s.projectName}</td>
                  <td>{nameOf(state.customers, s.customerId)}</td>
                  <td>{s.dueDate}</td>
                  <td>
                    <Btn kind="primary" onClick={() => nav(`/fall/${s.id}`)}>
                      {isEdit ? '调整' : '填写'}
                    </Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Page>
  )
}

function FallLogs() {
  const { state } = useStore()
  const nav = useNavigate()
  const blank = { soId: '', nodeKey: '', from: '', to: '' }
  const [form, setForm] = useState(blank)
  const [applied, setApplied] = useState(blank)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const projects = state.salesOrders.filter((s) => s.fallConfirmed)
  let rows = state.fallAdjusts || []
  if (applied.soId) rows = rows.filter((r) => r.soId === applied.soId)
  if (applied.nodeKey) rows = rows.filter((r) => r.nodeKey === applied.nodeKey)
  if (applied.from) rows = rows.filter((r) => String(r.at).slice(0, 10) >= applied.from)
  if (applied.to) rows = rows.filter((r) => String(r.at).slice(0, 10) <= applied.to)
  return (
    <Page crumb={<>首页 / 瀑布计划调整记录</>}>
      <div className="card">
        <Filters onQuery={() => setApplied(form)} onReset={() => { setForm(blank); setApplied(blank) }}>
          <Field label="项目">
            <select value={form.soId} onChange={(e) => set('soId', e.target.value)}>
              <option value="">全部</option>
              {projects.map((s) => (
                <option key={s.id} value={s.id}>{s.projectName}</option>
              ))}
            </select>
          </Field>
          <Field label="节点">
            <select value={form.nodeKey} onChange={(e) => set('nodeKey', e.target.value)}>
              <option value="">全部</option>
              {FALL_NODES.map((n) => (
                <option key={n.key} value={n.key}>{n.label}</option>
              ))}
            </select>
          </Field>
          <Field label="从">
            <input type="date" value={form.from} onChange={(e) => set('from', e.target.value)} />
          </Field>
          <Field label="到">
            <input type="date" value={form.to} onChange={(e) => set('to', e.target.value)} />
          </Field>
        </Filters>
        <div className="list-toolbar">
          <Btn onClick={() => nav('/')}>返回首页</Btn>
        </div>
        <Table
          columns={[
            { key: 'at', title: '调整时间' },
            { key: 'projectName', title: '项目' },
            { key: 'nodeLabel', title: '节点' },
            { key: 'from', title: '原预计', render: (r) => dayOf(r.from) },
            { key: 'to', title: '新预计', render: (r) => dayOf(r.to) },
            { key: 'reason', title: '原因', wrap: true },
            { key: 'by', title: '操作人' },
          ]}
          rows={rows}
        />
      </div>
    </Page>
  )
}

function FallDone() {
  const { state } = useStore()
  const nav = useNavigate()
  const rows = state.salesOrders.filter((s) => s.fallConfirmed && trainedOf(state, s.id))
  return (
    <Page crumb={<>首页 / 已完成的瀑布计划</>}>
      <div className="card">
        <div className="list-toolbar">
          <Btn onClick={() => nav('/')}>返回首页</Btn>
        </div>
        {rows.length === 0 && <p className="hint">还没有已交付的瀑布计划。</p>}
        <div className="fall-grid">
          {rows.map((so, i) => (
            <FallProject key={so.id} index={i + 1} so={so} state={state} nav={nav} />
          ))}
        </div>
      </div>
    </Page>
  )
}

function FallEdit({ soId }) {
  const { state, actions } = useStore()
  const nav = useNavigate()
  const { ask, flash, node } = useDialog()
  const notice = usePlanNotice()
  const so = state.salesOrders.find((s) => s.id === soId)
  const pp = state.productionPlans.find((p) => p.soId === soId)
  const [due, setDue] = useState(() => initDue(so))
  const [skipRobot, setSkipRobot] = useState(() => pp?.robot === false)
  const [reason, setReason] = useState('')
  const [syncOpen, setSyncOpen] = useState(false)
  const [syncProd, setSyncProd] = useState(false)
  const editing = !!so?.fallConfirmed
  const back = editing ? '/fall/edit' : '/fall/new'

  if (!so) return <p>订单不存在</p>
  if (so.confirmStatus !== 'confirmed') {
    return (
      <Page crumb={<>首页 / 瀑布计划</>} extra={<Btn onClick={() => nav(back)}>返回</Btn>}>
        <p className="hint">请先确认销售订单，再做瀑布计划。</p>
      </Page>
    )
  }
  if (trainedOf(state, soId)) {
    return (
      <Page crumb={<>首页 / 瀑布计划</>} extra={<Btn onClick={() => nav('/fall/done')}>查看已完成</Btn>}>
        <p className="hint">该项目已经交付，请到「已完成的瀑布计划」查看节点和打卡。</p>
      </Page>
    )
  }

  const nodes = skipRobot ? FALL_NODES.filter((n) => n.key !== 'robot') : FALL_NODES
  const title = editing ? '编辑瀑布计划' : '新增瀑布计划'

  function stepDiffs() {
    if (!pp) return []
    const map = { 结构: 'structure', 电路: 'circuit', 机器人: 'robot', 装配: 'assemble' }
    return (pp.steps || [])
      .map((s) => ({ name: s.name, from: dayOf(s.date) || '—', to: dayOf(fromInput(due[map[s.name]])) || '—' }))
      .filter((x) => x.from !== x.to)
  }

  function confirm() {
    const payload = {}
    FALL_NODES.forEach((n) => { payload[n.key] = fromInput(due[n.key]) })
    const r = actions.saveFallPlan(so.id, payload, skipRobot, reason, { syncProd })
    if (r.ok) {
      notice.open({
        desc: `${editing ? '已更新' : '已制定'}「${so.projectName}」的里程碑计划（${so.id}），要不要把这次变更通知相关同事？`,
        employees: state.employees,
        onSend: (ids) => actions.sendPlanNotice(ids, {
          scope: '里程碑计划',
          soId: so.id,
          title: `${editing ? '里程碑计划调整' : '里程碑计划制定'} · ${so.projectName}`,
          detail: editing && reason ? `调整原因：${reason}` : '',
        }),
        onDone: () => nav('/'),
      })
    }
    return r
  }

  function submit() {
    if (editing) {
      const old = so.fallDue || {}
      const changed = FALL_NODES.some((n) => dayOf(fromInput(due[n.key])) !== dayOf(old[n.key] || ''))
      if (changed && !reason.trim()) {
        flash({ ok: false, message: '请填写调整原因' })
        return
      }
    }
    // 改里程碑计划会牵动生产四步：先把差异摆出来问一句，默认不自动改车间排产
    if (editing && stepDiffs().length) {
      setSyncProd(false)
      setSyncOpen(true)
      return
    }
    ask(
      editing ? '确认调整' : '确认瀑布计划',
      editing ? '确认后主线仍是当前日期。只改了哪些节点，会记成一次排期调整。' : '确认后，该项目会出现在首页项目瀑布。',
      confirm,
    )
  }

  return (
    <Page
      crumb={<>首页 / {title} / {so.projectName}</>}
      title={so.projectName}
      extra={<Btn onClick={() => nav(back)}>返回</Btn>}
    >
      {node}
      {notice.node}
      {syncOpen && (
        <Modal
          wide
          title="这次调整会牵动生产计划"
          okText={syncProd ? '同步生产计划并保存' : '只改里程碑计划'}
          onCancel={() => setSyncOpen(false)}
          onOk={() => { setSyncOpen(false); confirm() }}
        >
          <p>本次调整里，下面这些生产步骤的日期会跟着变。生产计划由车间排产，系统<b>默认不自动改</b>，请确认要不要一起同步。</p>
          <Table
            columns={[
              { key: 'name', title: '步骤' },
              { key: 'from', title: '生产计划 · 原日期' },
              { key: 'to', title: '里程碑计划 · 新日期' },
            ]}
            rows={stepDiffs().map((d, i) => ({ ...d, id: i }))}
          />
          <label className="check-row" style={{ marginTop: 12 }}>
            <input type="checkbox" checked={syncProd} onChange={(e) => setSyncProd(e.target.checked)} />
            勾选后，生产四步的计划完成日会按上表一起改（默认不勾，车间排产保持不变）
          </label>
        </Modal>
      )}
      <div className="card">
        <div className="detail-grid">
          <div className="k">销售订单</div><div>{so.id}</div>
          <div className="k">项目</div><div>{so.projectName}</div>
          <div className="k">客户</div><div>{nameOf(state.customers, so.customerId)}</div>
          <div className="k">预计交付</div><div>{so.dueDate}</div>
        </div>
      </div>
      <div className="card">
        <h3>各节点预计完成日期</h3>
        <p className="hint">
          {editing
            ? '改哪个节点的日期就填哪个。只改生产、出库不动也可以；客户同意延后时，把后面节点一起改。主线仍是当前日期，改过的会标「已调期」。打卡、在途采购订单仍挂在当前节点，不会因为改期丢掉。'
            : '每个节点都要填预计完成日期。BOM 可填计划完成日，用于黄灯。确认后会出现在首页项目瀑布。'}
        </p>
        <label className="check-row" style={{ marginBottom: 16 }}>
          <input type="checkbox" checked={skipRobot} onChange={(e) => setSkipRobot(e.target.checked)} />
          跳过机器人
        </label>
        {editing && (
          <Field label="调整原因" required>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例如：结构超期，往后延两天" />
          </Field>
        )}
        <div className="fall-due-list">
          {nodes.map((n) => (
            <div key={n.key} className="fall-due-item">
              <div className="fall-due-title">{n.label}</div>
              <Field label="预计完成日期" required>
                <input
                  type="date"
                  value={due[n.key] || ''}
                  onChange={(e) => setDue((d) => ({ ...d, [n.key]: e.target.value }))}
                />
              </Field>
            </div>
          ))}
        </div>
        <div className="row-actions" style={{ marginTop: 16 }}>
          <Btn kind="primary" onClick={submit}>
            确认
          </Btn>
          <Btn onClick={() => nav(back)}>取消</Btn>
        </div>
      </div>
    </Page>
  )
}

function dayOf(s) {
  return String(s || '').replace('T', ' ').slice(0, 10)
}

function toInput(s) {
  return dayOf(s)
}

function fromInput(s) {
  return dayOf(s)
}

function initDue(so) {
  const f = so?.fallDue || {}
  const p = so?.plan || {}
  return {
    design: toInput(f.design || p.design),
    bom: toInput(f.bom),
    purchase: toInput(f.purchase || p.purchase),
    transit: toInput(f.transit || p.purchase),
    inbound: toInput(f.inbound || p.purchase),
    structure: toInput(f.structure || p.structure),
    circuit: toInput(f.circuit || p.circuit),
    robot: toInput(f.robot || p.robot),
    assemble: toInput(f.assemble || p.assemble),
    outbound: toInput(f.outbound || p.outbound),
    install: toInput(f.install || p.install),
    train: toInput(f.train || p.train || so?.dueDate),
  }
}
