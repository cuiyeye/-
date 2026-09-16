import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { installStage, installStageLabel, nameOf, trainStage, trainStageLabel, useStore } from '../store'
import { Btn, DocStatus, Field, Filters, Page, Table, Tabs, useDialog } from '../ui'
import { useExReport } from '../exReport'
import { outStatus } from './Outbound'

/** 安装调试页签 = 单据状态的取值（与列表「单据状态」列同一套说法） */
const INSTALL_TABS = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待出库' },
  { key: 'way', label: '在途' },
  { key: 'ready', label: '待安装' },
  { key: 'done', label: '已完成' },
]

/** 培训页签 = 单据状态的取值 */
const TRAIN_TABS = [
  { key: 'all', label: '全部' },
  { key: 'waitInstall', label: '待安装' },
  { key: 'ready', label: '待培训' },
  { key: 'done', label: '已交付' },
]

function doneLabel(on, at) {
  if (on) return at ? `已完成 ${String(at).slice(0, 10)}` : '已完成'
  return '未完成'
}

function installHint(out) {
  if (!out) return '生产确认完成后会生成销售出库单。办公室在出库并签收后，可代点确认安装调试。'
  if (out.status !== 'done') return '请先确认销售出库。出库在销售管理「销售出库单」。'
  if (!out.signed) return '请先成品签收（办公室可代点）。签收后才能确认安装调试。'
  if (!out.installed) return '安装调试确认后，才能做培训。办公室可代点。'
  return '安装调试已完成。培训在本模块「培训」。'
}

function trainHint(out) {
  if (!out) return '还没有销售出库单。请先出库、签收并完成安装调试。'
  if (!out.installed) return '请先确认安装调试。安装在本模块「安装调试」。'
  if (!out.trained) return '确认培训完成 = 交付完成，并记录当天为交付完成日。办公室可代点。'
  return '已交付。回退培训后，项目会重新出现在首页进行中瀑布。'
}

export function InstallList() {
  const { state } = useStore()
  const nav = useNavigate()
  const [tab, setTab] = useState('all')
  const [soId, setSoId] = useState('')
  const [customerId, setCustomerId] = useState('')
  const projects = state.salesOrders.filter((s) => s.confirmStatus === 'confirmed' && s.closeStatus === 'open')
  const all = projects.map((so) => {
    const out = state.outboundOrders.find((o) => o.soId === so.id)
    return { ...so, out, stage: installStage(out) }
  })
  const counts = INSTALL_TABS.reduce((a, t) => {
    a[t.key] = t.key === 'all' ? all.length : all.filter((r) => r.stage === t.key).length
    return a
  }, {})
  const rows = all.filter((r) => {
    if (tab !== 'all' && r.stage !== tab) return false
    if (soId && r.id !== soId) return false
    if (customerId && r.customerId !== customerId) return false
    return true
  })
  return (
    <Page crumb={<>安装调试 / 安装调试</>}>
      <div className="card">
        <Tabs value={tab} onChange={setTab} items={INSTALL_TABS.map((t) => ({ ...t, count: counts[t.key] }))} />
        <Filters onQuery={() => {}} onReset={() => { setSoId(''); setCustomerId('') }}>
          <Field label="项目">
            <select value={soId} onChange={(e) => setSoId(e.target.value)}>
              <option value="">全部项目</option>
              {projects.map((s) => <option key={s.id} value={s.id}>{s.projectName}</option>)}
            </select>
          </Field>
          <Field label="客户">
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">全部</option>
              {state.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </Filters>
        <Table
          onRow={(r) => nav(`/install/${r.id}`)}
          columns={[
            { key: 'projectName', title: '项目', link: true },
            { key: 'st', title: '单据状态', render: (r) => <DocStatus value={installStageLabel(r.stage)} /> },
            { key: 'customer', title: '客户', render: (r) => nameOf(state.customers, r.customerId) },
            { key: 'planAt', title: '预计装完', render: (r) => r.fallDue?.install || '—' },
            { key: 'insAt', title: '安装完成日', render: (r) => (r.out?.installedAt ? String(r.out.installedAt).slice(0, 10) : '—') },
            { key: 'doneAt', title: '交付完成日', render: (r) => (r.out?.trainedAt ? String(r.out.trainedAt).slice(0, 10) : '—') },
          ]}
          rows={rows}
        />
      </div>
    </Page>
  )
}

export function InstallDetail() {
  const { id } = useParams()
  const { state, actions } = useStore()
  const nav = useNavigate()
  const { ask, flash, node } = useDialog()
  const ex = useExReport()
  const so = state.salesOrders.find((s) => s.id === id)
  const out = state.outboundOrders.find((o) => o.soId === id)
  if (!so) return <p>不存在</p>
  return (
    <Page
      crumb={<>安装调试 / 安装调试 / {so.projectName}</>}
      title={so.projectName}
      extra={<Btn onClick={() => nav('/install')}>返回</Btn>}
    >
      {node}
      <div className="card">
        <div className="detail-grid">
          <div className="k">销售订单</div><div>{so.id}</div>
          <div className="k">项目</div><div>{so.projectName}</div>
          <div className="k">出库状态</div><div>{outStatus(out)}</div>
          <div className="k">安装调试</div><div>{doneLabel(out?.installed, out?.installedAt)}</div>
          <div className="k">培训</div><div>{doneLabel(out?.trained, out?.trainedAt)}</div>
        </div>
        <p className="hint">{installHint(out)}</p>
        <div className="row-actions">
          {out?.id && <Btn onClick={() => nav(`/sales/out/${out.id}`)}>看销售出库单</Btn>}
          {out?.status === 'done' && !out.signed && (
            <Btn kind="primary" onClick={() => ask('成品签收', '货到客户现场、确认收到后点这里。签收后才能确认安装调试。', () => actions.signOut(out.id))}>
              成品签收
            </Btn>
          )}
          {out?.signed && !out.installed && (
            <Btn kind="primary" onClick={() => ask('确认安装调试', '办公室可代点。确认后才能做培训。', () => actions.confirmInstall(out.id))}>
              确认安装调试
            </Btn>
          )}
          {out?.installed && (
            <Btn onClick={() => ask('回退安装调试', '已确认培训时须先回退培训。', () => actions.rollbackInstall(out.id))}>回退安装调试</Btn>
          )}
          {out?.status === 'done' && <Btn onClick={() => nav(`/purchase/part?so=${id}`)}>补件采购</Btn>}
          {out?.installed && !out.trained && <Btn onClick={() => nav(`/install/train/${id}`)}>去培训</Btn>}
          <Btn onClick={() => ex.open({ process: '安装调试', soId: id, hint: '运输损坏、缺货、客户现场条件不具备等。提交后进入异常中心，可再走补件采购。', onDone: flash })}>提交异常</Btn>
        </div>
      </div>
      {ex.node}
    </Page>
  )
}

export function TrainList() {
  const { state } = useStore()
  const nav = useNavigate()
  const [tab, setTab] = useState('all')
  const [soId, setSoId] = useState('')
  const [customerId, setCustomerId] = useState('')
  const projects = state.salesOrders.filter((s) => s.confirmStatus === 'confirmed' && s.closeStatus === 'open')
  const all = projects.map((so) => {
    const out = state.outboundOrders.find((o) => o.soId === so.id)
    return { ...so, out, stage: trainStage(out) }
  })
  const counts = TRAIN_TABS.reduce((a, t) => {
    a[t.key] = t.key === 'all' ? all.length : all.filter((r) => r.stage === t.key).length
    return a
  }, {})
  const rows = all.filter((r) => {
    if (tab !== 'all' && r.stage !== tab) return false
    if (soId && r.id !== soId) return false
    if (customerId && r.customerId !== customerId) return false
    return true
  })
  return (
    <Page crumb={<>安装调试 / 培训</>}>
      <div className="card">
        <Tabs value={tab} onChange={setTab} items={TRAIN_TABS.map((t) => ({ ...t, count: counts[t.key] }))} />
        <Filters onQuery={() => {}} onReset={() => { setSoId(''); setCustomerId('') }}>
          <Field label="项目">
            <select value={soId} onChange={(e) => setSoId(e.target.value)}>
              <option value="">全部项目</option>
              {projects.map((s) => <option key={s.id} value={s.id}>{s.projectName}</option>)}
            </select>
          </Field>
          <Field label="客户">
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">全部</option>
              {state.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </Filters>
        <Table
          onRow={(r) => nav(`/install/train/${r.id}`)}
          columns={[
            { key: 'projectName', title: '项目', link: true },
            { key: 'st', title: '单据状态', render: (r) => <DocStatus value={trainStageLabel(r.stage)} /> },
            { key: 'customer', title: '客户', render: (r) => nameOf(state.customers, r.customerId) },
            { key: 'planAt', title: '预计交付', render: (r) => r.fallDue?.train || '—' },
            { key: 'doneAt', title: '交付完成日', render: (r) => (r.out?.trainedAt ? String(r.out.trainedAt).slice(0, 10) : '—') },
          ]}
          rows={rows}
        />
      </div>
    </Page>
  )
}

export function TrainDetail() {
  const { id } = useParams()
  const { state, actions } = useStore()
  const nav = useNavigate()
  const { ask, flash, node } = useDialog()
  const ex = useExReport()
  const so = state.salesOrders.find((s) => s.id === id)
  const out = state.outboundOrders.find((o) => o.soId === id)
  if (!so) return <p>不存在</p>
  return (
    <Page
      crumb={<>安装调试 / 培训 / {so.projectName}</>}
      title={so.projectName}
      extra={<Btn onClick={() => nav('/install/train')}>返回</Btn>}
    >
      {node}
      <div className="card">
        <div className="detail-grid">
          <div className="k">销售订单</div><div>{so.id}</div>
          <div className="k">项目</div><div>{so.projectName}</div>
          <div className="k">安装调试</div><div>{doneLabel(out?.installed, out?.installedAt)}</div>
          <div className="k">培训</div><div>{doneLabel(out?.trained, out?.trainedAt)}</div>
          <div className="k">交付完成日</div><div>{out?.trainedAt || '—'}</div>
          <div className="k">预计交付</div><div>{so.fallDue?.train || so.dueDate || '—'}</div>
        </div>
        <p className="hint">{trainHint(out)}</p>
        <div className="row-actions">
          <Btn onClick={() => nav(`/install/${id}`)}>看安装调试</Btn>
          {out?.installed && !out.trained && (
            <Btn kind="primary" onClick={() => ask('确认培训完成', '一次确认 = 交付完成，并记录当天为交付完成日。办公室可代点。', () => actions.confirmTrain(out.id))}>
              确认培训完成
            </Btn>
          )}
          {out?.trained && (
            <Btn onClick={() => ask('回退培训', '首页瀑布会重新出现本项目。', () => actions.rollbackTrain(out.id))}>回退培训</Btn>
          )}
          <Btn onClick={() => ex.open({ process: '培训', soId: id, hint: '培训现场问题，办公室代录。提交后进入异常中心。', onDone: flash })}>提交异常</Btn>
        </div>
      </div>
      {ex.node}
    </Page>
  )
}
