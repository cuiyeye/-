import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { EX_PROCESS, exOpen, exProcess, handlePath, useStore } from '../store'
import { Btn, Field, OpsLinks, Page, Table, Tabs, Tag, useDialog } from '../ui'

const TABS = ['open', 'done', 'closed', 'all']

/** 这条异常提醒谁：直接取异常自己带的 people（安全库存这类就是设置页里勾的人） */
function notifyNames(state, row) {
  const ids = (row.people || []).filter(Boolean)
  return ids.map((eid) => state.employees.find((e) => e.id === eid)?.name || eid).join('、') || '—'
}

function exTag(r) {
  if (r.closeStatus === 'closed' && r.doneStatus !== 'done') return <Tag>已关闭</Tag>
  if (r.doneStatus === 'done') return <Tag color="green">已完结</Tag>
  return <Tag color="orange">待处理</Tag>
}

function matchSo(e, soId) {
  if (!soId) return true
  if (soId === '__stock__') return !e.soId
  return e.soId === soId
}

function matchTab(e, tab) {
  if (tab === 'all') return true
  if (tab === 'open') return exOpen(e)
  if (tab === 'done') return e.doneStatus === 'done'
  return e.closeStatus === 'closed'
}

function listBack(row) {
  if (row.soId) return `/exception?soId=${row.soId}`
  return '/exception?soId=__stock__'
}

export default function Exception() {
  const { state } = useStore()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const soId = params.get('soId') || ''
  const proc = params.get('proc') || ''
  const lv = params.get('lv') || ''
  const raw = params.get('st') || 'open'
  const tab = TABS.includes(raw) ? raw : 'open'

  function setQuery(patch) {
    const next = new URLSearchParams(params)
    Object.entries(patch).forEach(([k, v]) => {
      if (v) next.set(k, v)
      else next.delete(k)
    })
    setParams(next)
  }

  const scoped = state.exceptions.filter((e) => matchSo(e, soId)).filter((e) => {
    // 环节按「归并后的环节名」比对，采购在途 / 采购下单 / 付款 都算「采购」
    if (proc && exProcess(e) !== proc) return false
    if (lv && e.level !== lv) return false
    return true
  })
  const rows = scoped.filter((e) => matchTab(e, tab))
  const hasStock = state.exceptions.some((e) => !e.soId)
  // 筛选口径 = 标准环节表 ∪ 归并后仍多出来的（如「计划」通知），别名不再单独出现
  const procOpts = [...new Set([...EX_PROCESS, ...state.exceptions.map((e) => exProcess(e)).filter(Boolean)])]

  return (
    <Page crumb={<>异常中心</>}>
      <div className="card">
        <div className="filters">
          <Field label="项目">
            <select value={soId} onChange={(e) => setQuery({ soId: e.target.value })}>
              <option value="">全部项目</option>
              {state.salesOrders.map((s) => (
                <option key={s.id} value={s.id}>{s.projectName}</option>
              ))}
              {hasStock ? <option value="__stock__">库存及其他</option> : null}
            </select>
          </Field>
          <Field label="环节">
            <select value={proc} onChange={(e) => setQuery({ proc: e.target.value })}>
              <option value="">全部</option>
              {procOpts.map((p) => <option key={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="灯">
            <select value={lv} onChange={(e) => setQuery({ lv: e.target.value })}>
              <option value="">全部</option>
              <option value="red">红灯</option>
              <option value="yellow">黄灯</option>
            </select>
          </Field>
        </div>
        <Tabs
          value={tab}
          onChange={(k) => setQuery({ st: k === 'open' ? '' : k })}
          items={[
            { key: 'open', label: '待处理', count: scoped.filter(exOpen).length },
            { key: 'done', label: '已完结', count: scoped.filter((e) => e.doneStatus === 'done').length },
            { key: 'closed', label: '已关闭', count: scoped.filter((e) => e.closeStatus === 'closed').length },
            { key: 'all', label: '全部', count: scoped.length },
          ]}
        />
        <Table
          onRow={(r) => nav(`/exception/${r.id}`)}
          columns={[
            { key: 'id', title: '异常单号', link: true },
            { key: 'process', title: '环节', render: (r) => exProcess(r) },
            { key: 'category', title: '类别', render: (r) => r.category || '—' },
            { key: 'proj', title: '项目', render: (r) => state.salesOrders.find((s) => s.id === r.soId)?.projectName || '库存及其他' },
            { key: 'title', title: '内容' },
            { key: 'createdAt', title: '创建时间', render: (r) => r.createdAt || '—' },
            { key: 'createdBy', title: '创建人', render: (r) => r.createdBy || '—' },
            { key: 'level', title: '等级', render: (r) => <Tag color={r.level === 'red' ? 'red' : 'orange'}>{r.level === 'red' ? '红' : '黄'}</Tag> },
            { key: 'st', title: '状态', render: (r) => exTag(r) },
            {
              key: 'act',
              title: '操作',
              render: (r) => <OpsLinks items={[{ label: '进入', onClick: () => nav(`/exception/${r.id}`) }]} />,
            },
          ]}
          rows={rows}
        />
      </div>
    </Page>
  )
}

export function ExceptionDetail() {
  const { id } = useParams()
  const { state, actions } = useStore()
  const nav = useNavigate()
  const { ask, flash, node } = useDialog()
  const row = state.exceptions.find((e) => e.id === id)
  const [form, setForm] = useState(() => ({
    title: row?.title || '',
    content: row?.content || '',
    process: row?.process || '生产',
    level: row?.level || 'yellow',
  }))
  const [note, setNote] = useState('')
  if (!row) return <p>异常单不存在</p>
  const so = state.salesOrders.find((s) => s.id === row.soId)

  return (
    <Page
      crumb={<>异常中心 / {id}</>}
      title={id}
      extra={<Btn onClick={() => nav(listBack(row))}>返回列表</Btn>}
    >
      {node}
      <div className="card">
        <div className="detail-grid">
          <div className="k">异常单号</div><div>{row.id}</div>
          <div className="k">创建</div><div>{row.createdAt || '—'} · {row.createdBy || '—'}</div>
          <div className="k">项目</div><div>{so?.projectName || '库存及其他'}</div>
          <div className="k">销售订单</div><div>{row.soId || '—'}</div>
          <div className="k">采购订单</div><div>{row.poId || '—'}</div>
          <div className="k">提醒谁</div><div>{notifyNames(state, row)}</div>
          <div className="k">当前状态</div><div>{exTag(row)}</div>
        </div>
        <div className="form-stack">
          <Field label="环节">
            <select value={form.process} onChange={(e) => setForm({ ...form, process: e.target.value })}>
              {EX_PROCESS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="标题" required>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="异常说明">
            <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
          </Field>
          <Field label="等级">
            <select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>
              <option value="yellow">黄灯</option>
              <option value="red">红灯</option>
            </select>
          </Field>
        </div>
        <div className="row-actions" style={{ marginTop: 16 }}>
          <Btn onClick={() => ask('保存异常记录', '确认保存标题、说明和等级。', () => actions.saveEx(id, form))}>保存记录</Btn>
          {row.doneStatus !== 'done' && (
            <Btn kind="primary" onClick={() => {
              const to = handlePath(row)
              nav(`${to}${to.includes('?') ? '&' : '?'}back=${encodeURIComponent(`/exception/${id}`)}`)
            }}>去处理</Btn>
          )}
          {row.doneStatus !== 'done' && row.closeStatus !== 'closed' && (
            <Btn kind="primary" onClick={() => ask('完结异常', '确认业务已经处理完成。完结不等于关闭。记录仍保留。', () => actions.finishEx(id))}>完结</Btn>
          )}
          {row.closeStatus !== 'closed' && (
            <Btn onClick={() => ask('关闭异常', '关掉提醒，不等于已经处理完。记录仍保留。', () => actions.closeEx(id))}>关闭</Btn>
          )}
          {row.doneStatus === 'done' && (
            <Btn onClick={() => ask('回退完结', '完结撤掉，回到待处理。', () => actions.rollbackFinishEx(id))}>回退完结</Btn>
          )}
          {row.closeStatus === 'closed' && (
            <Btn onClick={() => ask('回退关闭', '关闭撤掉，提醒重新打开。', () => actions.rollbackCloseEx(id))}>回退关闭</Btn>
          )}
          {row.soId && (
            <Btn onClick={() => nav(`/exception?soId=${row.soId}&st=all`)}>本项目全部异常</Btn>
          )}
        </div>
      </div>
      <div className="card">
        <h3>处理记录</h3>
        <p className="hint">
          「去处理」只是带你到对应环节的页面看一眼，需要的话当场调整；看完点页面上的「← 返回异常处理」就回到这条异常。
          真正要留档的是下面的处理意见：做了什么、跟谁沟通、结果如何。
        </p>
        <Field label="追加记录">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="必填：做了什么、跟谁沟通、结果如何" />
        </Field>
        <Btn onClick={() => ask('追加处理记录', '确认写入本条处理内容。', () => {
          const r = actions.addExNote(id, note)
          if (r.ok) setNote('')
          return r
        })}>追加</Btn>
        <Table
          columns={[
            { key: 'at', title: '时间' },
            { key: 'by', title: '人' },
            { key: 'text', title: '内容' },
          ]}
          rows={(row.notes || []).map((n, i) => ({ ...n, id: i }))}
        />
      </div>
    </Page>
  )
}
